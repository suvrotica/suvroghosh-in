import fs from 'node:fs';
import path from 'node:path';
import { compile } from 'mdsvex';
import { parse as parseSvelte } from 'svelte/compiler';
import ts from 'typescript';
import {
	isResourceSlug,
	parseResourceMetadata,
	resourcePath
} from '../src/lib/content/resources.ts';
import { parsePostFrontmatter } from './lib/post-metadata.mjs';
import { scanResourceSources } from './validate-resources.mjs';

const root = process.cwd();
const postsDir = path.join(root, 'src', 'lib', 'posts');
const topicsDir = path.join(root, 'src', 'lib', 'topics');
const routesDir = path.join(root, 'src', 'routes');
const componentsDir = path.join(root, 'src', 'lib', 'components');
const staticDir = path.join(root, 'static');
const siteOrigin = 'https://www.suvroghosh.in';
const siteHosts = new Set(['www.suvroghosh.in', 'suvroghosh.in']);
const navigationKeys = new Set(['href', 'action', 'url', 'path']);
const errors = [];
const references = [];
const markdownPages = [];

function read(file) {
	return fs.readFileSync(file, 'utf8');
}

function walk(directory) {
	if (!fs.existsSync(directory)) return [];

	return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const fullPath = path.join(directory, entry.name);
		return entry.isDirectory() ? walk(fullPath) : [fullPath];
	});
}

function markdownFiles(directory) {
	if (!fs.existsSync(directory)) return [];
	return fs
		.readdirSync(directory, { withFileTypes: true })
		.filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
		.map((entry) => path.join(directory, entry.name));
}

function toPosix(value) {
	return value.split(path.sep).join('/');
}

function relativeFile(file) {
	return toPosix(path.relative(root, file));
}

function lineNumber(text, index) {
	return text.slice(0, index).split('\n').length;
}

function slugifyCategory(category = 'uncategorized') {
	return category
		.toLowerCase()
		.trim()
		.replace(/&/g, 'and')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}

function normalizePathname(value) {
	let pathname;
	try {
		pathname = new URL(value, `${siteOrigin}/`).pathname;
		// Match the decoded route/file, while keeping encoded separators from
		// manufacturing an otherwise valid nested route.
		if (/%(?:2f|5c)/i.test(pathname)) return null;
		pathname = decodeURIComponent(pathname);
	} catch {
		return null;
	}

	return pathname !== '/' ? pathname.replace(/\/+$/, '') : pathname;
}

function readAliases() {
	const file = path.join(root, 'src', 'lib', 'content', 'posts.ts');
	const text = read(file);
	const block = text.match(/export const postPathAliases[\s\S]*?=\s*\{([\s\S]*?)\};/);
	if (!block) {
		errors.push(`${relativeFile(file)}: could not read postPathAliases.`);
		return new Map();
	}

	return new Map(
		Array.from(
			block[1].matchAll(/["']([^"']+)["']\s*:\s*["']([^"']+)["']/g),
			([, source, destination]) => [
				normalizePathname(`/blog/${source}`),
				normalizePathname(destination)
			]
		)
	);
}

function routePaths() {
	const routes = new Set();
	for (const file of walk(routesDir)) {
		if (!/^\+(?:page(?:\.server)?|server)\.(?:js|ts|svelte)$/.test(path.basename(file))) continue;

		const segments = toPosix(path.relative(routesDir, path.dirname(file)))
			.split('/')
			.filter((segment) => segment && !/^\(.*\)$/.test(segment));
		if (segments.some((segment) => segment.startsWith('['))) continue;
		routes.add(segments.length > 0 ? `/${segments.join('/')}` : '/');
	}
	return routes;
}

function canonicalTopicRoutes() {
	const topics = new Set();
	const handler = path.join(routesDir, 'topics', '[slug]', '+page.svelte');
	if (!fs.existsSync(handler) || !fs.statSync(handler).isFile() || !fs.existsSync(topicsDir)) {
		return topics;
	}

	for (const entry of fs.readdirSync(topicsDir, { withFileTypes: true })) {
		if (!entry.isFile() || !entry.name.endsWith('.md') || entry.name === 'README.md') continue;
		const file = path.join(topicsDir, entry.name);
		let metadata;
		try {
			metadata = parsePostFrontmatter(read(file), relativeFile(file));
		} catch (error) {
			errors.push(
				error instanceof Error ? error.message : `${relativeFile(file)} has invalid frontmatter.`
			);
			continue;
		}
		const slug = path.basename(entry.name, '.md');
		if (metadata.slug !== slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
			errors.push(
				`${relativeFile(file)}: topic slug must match its lowercase kebab-case filename.`
			);
			continue;
		}
		if (metadata.published !== false) {
			const publicPath = `/topics/${slug}`;
			topics.add(publicPath);
			markdownPages.push({ file, text: read(file), metadata, publicPath });
		}
	}
	return topics;
}

function canonicalComicRoutes() {
	const comics = new Set();
	const handler = path.join(routesDir, 'comics', '[slug]', '+page.svelte');
	const catalogFile = path.join(root, 'src', 'lib', 'content', 'comics.ts');
	if (
		!fs.existsSync(handler) ||
		!fs.statSync(handler).isFile() ||
		!fs.existsSync(catalogFile) ||
		!fs.statSync(catalogFile).isFile()
	) {
		return comics;
	}

	// Read the selected source tree rather than importing the validator checkout's
	// catalogue. Fixture roots and missing registries must not inherit real routes.
	const source = ts.createSourceFile(catalogFile, read(catalogFile), ts.ScriptTarget.Latest, true);
	const unwrap = (node) => {
		while (
			node &&
			(ts.isAsExpression(node) ||
				ts.isSatisfiesExpression(node) ||
				ts.isParenthesizedExpression(node))
		) {
			node = node.expression;
		}
		return node;
	};
	const declaration = source.statements
		.filter(
			(statement) =>
				ts.isVariableStatement(statement) &&
				statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
		)
		.flatMap((statement) => [...statement.declarationList.declarations])
		.find((item) => ts.isIdentifier(item.name) && item.name.text === 'comicCatalog');
	const catalog = unwrap(declaration?.initializer);
	if (!catalog || !ts.isArrayLiteralExpression(catalog)) {
		errors.push(`${relativeFile(catalogFile)}: comicCatalog must be an exported literal array.`);
		return comics;
	}
	for (const element of catalog.elements) {
		const record = unwrap(element);
		const property =
			record && ts.isObjectLiteralExpression(record)
				? record.properties.find(
						(item) =>
							ts.isPropertyAssignment(item) &&
							item.name.getText(source).replace(/^['"]|['"]$/g, '') === 'slug'
					)
				: null;
		const value = property && unwrap(property.initializer);
		const slug = value && ts.isStringLiteral(value) ? value.text : null;
		if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
			errors.push(
				`${relativeFile(catalogFile)}: every comic must have a literal lowercase kebab-case slug.`
			);
			continue;
		}
		const comicRoute = `/comics/${slug}`;
		if (comics.has(comicRoute)) {
			errors.push(`${relativeFile(catalogFile)}: duplicate comic slug ${slug}.`);
		}
		comics.add(comicRoute);
	}
	return comics;
}

function addReference(file, text, index, target, basePath = null) {
	const trimmed = target.trim();
	if (
		!trimmed ||
		trimmed.startsWith('#') ||
		(/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !/^https?:/i.test(trimmed))
	) {
		return;
	}

	// Shared components have no single public base. Their relative links are
	// verified in the rendered crawl; do not silently resolve them at '/'.
	if (!basePath && !trimmed.startsWith('/') && !/^https?:/i.test(trimmed)) return;
	let url;
	try {
		url = new URL(trimmed, `${siteOrigin}${basePath ?? '/'}`);
	} catch {
		errors.push(`${relativeFile(file)}:${lineNumber(text, index)}: malformed link ${trimmed}.`);
		return;
	}
	if (!siteHosts.has(url.hostname)) return;

	references.push({
		file: relativeFile(file),
		line: lineNumber(text, index),
		target: trimmed,
		pathname: normalizePathname(url.href)
	});
}

async function extractPostReferences(post) {
	const { file, text, publicPath } = post;
	// Use the site's Markdown parser so code examples, escaped text and unused
	// reference definitions do not become fictitious navigational links.
	try {
		await compile(text, {
			filename: file,
			extensions: ['.md', '.txt'],
			highlight: false,
			smartypants: false,
			remarkPlugins: [
				() => (tree) => {
					const definitions = new Map();
					visitChildren(tree, (node) => {
						if (node.type === 'definition' && !definitions.has(node.identifier)) {
							definitions.set(node.identifier, node.url);
						}
					});
					visitChildren(tree, (node) => {
						const index = node.position?.start?.offset ?? 0;
						if (node.type === 'link') addReference(file, text, index, node.url, publicPath);
						if (node.type === 'linkReference' && definitions.has(node.identifier)) {
							addReference(file, text, index, definitions.get(node.identifier), publicPath);
						}
						if (node.type === 'html') {
							extractHtmlReferences(file, text, node.value, index, publicPath);
						}
					});
				}
			]
		});
	} catch (error) {
		errors.push(`${relativeFile(file)}: could not parse Markdown links: ${error.message}`);
	}
}

function visitChildren(node, visitor) {
	visitor(node);
	for (const child of node.children ?? []) visitChildren(child, visitor);
}

function extractHtmlReferences(file, text, html, offset, basePath) {
	// HTML may be split into separate opening/closing Markdown nodes. Mask
	// comments/scripts before extracting literal attributes from opening tags.
	const markup = html
		.replace(/<!--[\s\S]*?-->/g, (match) => ' '.repeat(match.length))
		.replace(/<script\b[\s\S]*?<\/script>/gi, (match) => ' '.repeat(match.length));
	for (const tag of markup.matchAll(/<[A-Za-z][^>]*>/g)) {
		for (const match of tag[0].matchAll(
			/\b(?:href|action)\s*=\s*(?:["']([^"']*)["']|\{\s*["']([^"']*)["']\s*\})/g
		)) {
			addReference(file, text, offset + tag.index + match.index, match[1] ?? match[2], basePath);
		}
	}
}

function staticString(node) {
	if (node?.type === 'Literal' && typeof node.value === 'string') return node.value;
	if (node?.type === 'TemplateLiteral' && node.expressions.length === 0) {
		return node.quasis[0].value.cooked;
	}
	return undefined;
}

function isNavigationProperty(name, value) {
	if (!navigationKeys.has(name)) return false;
	// Command payloads also use `action` (for example { action: 'approve' }).
	// Object properties need an explicit URL/path shape; DOM action attributes
	// remain navigation even when their value is a plain relative destination.
	return (
		name !== 'action' ||
		(typeof value === 'string' && /^(?:\/|\.{1,2}\/|\?|https?:)/i.test(value.trim()))
	);
}

function routeBase(file) {
	if (!file.startsWith(`${routesDir}${path.sep}`)) return null;
	const segments = toPosix(path.relative(routesDir, path.dirname(file)))
		.split('/')
		.filter((segment) => segment && !/^\(.*\)$/.test(segment));
	return segments.some((segment) => segment.includes('[')) ? null : `/${segments.join('/')}`;
}

function extractCodeReferences(file) {
	const text = read(file);
	const basePath = routeBase(file);
	const add = (index, value, routeId = false) => {
		if (typeof value !== 'string' || (routeId && /\[[^\]]+\]/.test(value))) return;
		addReference(file, text, index, value, basePath);
	};
	if (!file.endsWith('.svelte')) {
		const source = ts.createSourceFile(
			file,
			text,
			ts.ScriptTarget.Latest,
			true,
			file.endsWith('.json') ? ts.ScriptKind.JSON : undefined
		);
		const literal = (node) =>
			node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
				? node.text
				: undefined;
		const visit = (node) => {
			if (ts.isPropertyAssignment(node)) {
				const name = node.name.getText(source).replace(/^['"]|['"]$/g, '');
				const value = literal(node.initializer);
				if (isNavigationProperty(name, value)) add(node.initializer.getStart(source), value);
			}
			if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
				const name = node.expression.text;
				if (['resolve', 'goto', 'redirect'].includes(name)) {
					const argument = node.arguments[name === 'redirect' ? 1 : 0];
					if (argument) add(argument.getStart(source), literal(argument), name === 'resolve');
				}
			}
			ts.forEachChild(node, visit);
		};
		visit(source);
		return;
	}

	try {
		const ast = parseSvelte(text, { modern: true });
		const visit = (node) => {
			if (!node || typeof node !== 'object') return;
			if (node.type === 'Attribute' && ['href', 'action'].includes(node.name)) {
				if (Array.isArray(node.value) && node.value.every((value) => value.type === 'Text')) {
					add(node.start, node.value.map((value) => value.data).join(''));
				} else {
					const value = Array.isArray(node.value) ? node.value[0] : node.value;
					add(node.start, staticString(value?.expression));
				}
			}
			if (node.type === 'Property') {
				const name = node.key?.name ?? node.key?.value;
				const value = staticString(node.value);
				if (isNavigationProperty(name, value)) add(node.start, value);
			}
			if (
				node.type === 'CallExpression' &&
				['resolve', 'goto', 'redirect'].includes(node.callee?.name)
			) {
				const name = node.callee.name;
				const argument = node.arguments[name === 'redirect' ? 1 : 0];
				if (argument) add(argument.start, staticString(argument), name === 'resolve');
			}
			for (const [key, value] of Object.entries(node)) {
				if (['loc', 'comments', 'css'].includes(key)) continue;
				if (Array.isArray(value)) value.forEach(visit);
				else if (value && typeof value === 'object') visit(value);
			}
		};
		visit(ast);
	} catch (error) {
		errors.push(`${relativeFile(file)}: could not parse Svelte links: ${error.message}`);
	}
}

function staticFileExists(pathname) {
	const candidate = path.resolve(staticDir, `.${pathname}`);
	return (
		candidate.startsWith(`${path.resolve(staticDir)}${path.sep}`) &&
		knownStaticFiles.has(toPosix(path.relative(staticDir, candidate)))
	);
}

// Deployment filesystems are case-sensitive even when the author's checkout is
// on Windows. Compare against directory-entry spelling, not filesystem lookup.
const knownStaticFiles = new Set(
	walk(staticDir)
		.filter((file) => fs.statSync(file).isFile())
		.map((file) => toPosix(path.relative(staticDir, file)))
);

const aliases = readAliases();
const redirectedSlugs = new Set(
	Array.from(aliases.keys(), (sourcePath) => sourcePath.split('/').at(-1))
);
const posts = [];

// The runtime registry uses /src/lib/posts/*.md, not recursive globbing.
for (const file of markdownFiles(postsDir)) {
	const text = read(file);
	let metadata;
	try {
		metadata = parsePostFrontmatter(text, relativeFile(file));
	} catch (error) {
		errors.push(
			error instanceof Error ? error.message : `${relativeFile(file)} has invalid frontmatter.`
		);
		continue;
	}
	const slug = path.basename(file, '.md');
	if (metadata.published === false || redirectedSlugs.has(slug)) continue;

	const publicPath = `/blog/${slugifyCategory(metadata.category)}/${encodeURIComponent(slug)}`;
	posts.push({ file, text, slug, metadata, publicPath });
}

const canonicalPosts = new Set(posts.map((post) => normalizePathname(post.publicPath)));
const canonicalBySlug = new Map(posts.map((post) => [post.slug, post.publicPath]));
const categoryPaths = new Set(
	posts.map((post) => `/blog/${slugifyCategory(post.metadata.category)}`)
);
const knownRoutes = routePaths();
const knownTopicRoutes = canonicalTopicRoutes();
const knownComicRoutes = canonicalComicRoutes();
const knownResourceRoutes = new Set();

for (const source of scanResourceSources(root)) {
	const { sourcePath: file, rawMarkdown: text, expectedKind: kind } = source;
	try {
		const metadata = parseResourceMetadata(
			parsePostFrontmatter(text, relativeFile(file)),
			relativeFile(file),
			kind
		);
		const slug = path.basename(file, '.md');
		if (!isResourceSlug(slug)) {
			errors.push(`${relativeFile(file)}: resource filename must use lowercase kebab case.`);
			continue;
		}
		if (!metadata.published) continue;
		const publicPath = resourcePath({ kind, slug });
		markdownPages.push({ file, text, metadata, publicPath });
		if (
			fs.existsSync(
				path.join(routesDir, 'resources', '[kind=resourceKind]', '[slug]', '+page.svelte')
			)
		) {
			knownResourceRoutes.add(publicPath);
		}
	} catch (error) {
		errors.push(error.message);
	}
}

for (const [source, destination] of aliases) {
	if (!canonicalPosts.has(destination)) {
		errors.push(
			`src/lib/content/posts.ts: alias ${source} points to unknown canonical post ${destination}.`
		);
	}
}

for (const page of [...posts, ...markdownPages]) await extractPostReferences(page);
// Topic frontmatter contains the paths rendered as reading lists/glossary links.
// Check every authored root/absolute URL there, including values in nested lists.
for (const page of markdownPages.filter((page) => page.file.startsWith(topicsDir))) {
	const visit = (value) => {
		if (typeof value === 'string' && /^(?:\/|https?:)/i.test(value)) {
			addReference(
				page.file,
				page.text,
				Math.max(0, page.text.indexOf(value)),
				value,
				page.publicPath
			);
		} else if (value && typeof value === 'object') {
			Object.values(value).forEach(visit);
		}
	};
	visit(page.metadata);
}
const codeDirectories = [
	routesDir,
	componentsDir,
	...['config', 'content', 'data'].map((directory) => path.join(root, 'src', 'lib', directory))
];
for (const file of codeDirectories.flatMap(walk)) {
	if (
		/\.(?:js|mjs|ts|svelte|json)$/.test(file) &&
		!/\.(?:test|spec)\.[^.]+$/.test(file) &&
		!file.endsWith('.d.ts')
	) {
		extractCodeReferences(file);
	}
}
const llmsFile = path.join(staticDir, 'llms.txt');
if (fs.existsSync(llmsFile)) {
	await extractPostReferences({ file: llmsFile, text: read(llmsFile), publicPath: '/llms.txt' });
}

const uniqueReferences = new Map();
for (const reference of references) {
	uniqueReferences.set(`${reference.file}:${reference.line}:${reference.target}`, reference);
}

for (const reference of uniqueReferences.values()) {
	const { file, line, target, pathname } = reference;
	if (!pathname) {
		errors.push(`${file}:${line}: malformed internal link ${target}.`);
		continue;
	}
	if (aliases.has(pathname)) {
		errors.push(
			`${file}:${line}: internal link ${target} uses a redirect alias; use the canonical destination ${aliases.get(pathname)}.`
		);
		continue;
	}

	if (
		knownRoutes.has(pathname) ||
		knownTopicRoutes.has(pathname) ||
		knownResourceRoutes.has(pathname) ||
		knownComicRoutes.has(pathname) ||
		staticFileExists(pathname) ||
		canonicalPosts.has(pathname)
	) {
		continue;
	}

	const segments = pathname.split('/').filter(Boolean);
	if (segments[0] === 'blog') {
		if (segments.length === 2 && categoryPaths.has(pathname)) continue;
		if (segments.length === 3) {
			let slug;
			try {
				slug = decodeURIComponent(segments[2]);
			} catch {
				errors.push(`${file}:${line}: malformed encoded post path ${target}.`);
				continue;
			}

			const canonical = canonicalBySlug.get(slug);
			if (canonical) {
				errors.push(`${file}:${line}: non-canonical post link ${target}; use ${canonical}.`);
				continue;
			}
		}
	}

	errors.push(`${file}:${line}: internal link ${target} has no matching route or static file.`);
}

if (errors.length > 0) {
	console.error(`Internal-link validation failed with ${errors.length} issue(s):`);
	for (const error of errors) console.error(`- ${error}`);
	process.exit(1);
}

console.log(
	`Internal-link validation passed: ${uniqueReferences.size} references across ${posts.length} published posts; ` +
		`${canonicalPosts.size} canonical posts, ${aliases.size} aliases, ${knownTopicRoutes.size} published topic routes, ` +
		`${knownResourceRoutes.size} published resource routes, ${knownComicRoutes.size} comic routes, and ${knownRoutes.size} static routes recognised. ` +
		'Fragments, computed URLs and shared-component relative links require the rendered navigation audit.'
);
