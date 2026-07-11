import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const postsDir = path.join(root, 'src', 'lib', 'posts');
const routesDir = path.join(root, 'src', 'routes');
const componentsDir = path.join(root, 'src', 'lib', 'components');
const staticDir = path.join(root, 'static');
const errors = [];
const references = [];

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

function toPosix(value) {
	return value.split(path.sep).join('/');
}

function relativeFile(file) {
	return toPosix(path.relative(root, file));
}

function lineNumber(text, index) {
	return text.slice(0, index).split('\n').length;
}

function parseFrontmatter(text) {
	const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	if (!match) return {};

	const metadata = {};
	for (const line of match[1].split(/\r?\n/)) {
		const field = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
		if (!field) continue;

		const value = field[2].trim().replace(/^["']|["']$/g, '');
		metadata[field[1]] = value === 'false' ? false : value === 'true' ? true : value;
	}
	return metadata;
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
		pathname = new URL(value, 'https://www.suvroghosh.in/').pathname;
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

function addReference(file, text, index, target, basePath = null) {
	const trimmed = target.trim();
	if (
		!trimmed ||
		trimmed.startsWith('#') ||
		trimmed.startsWith('//') ||
		/^[a-z][a-z0-9+.-]*:/i.test(trimmed)
	) {
		return;
	}

	let resolved = trimmed;
	if (!trimmed.startsWith('/')) {
		if (!basePath) return;
		resolved = new URL(trimmed, `https://www.suvroghosh.in${basePath}`).pathname;
	}

	references.push({
		file: relativeFile(file),
		line: lineNumber(text, index),
		target: trimmed,
		pathname: normalizePathname(resolved)
	});
}

function extractPostReferences(post) {
	const { file, text, publicPath } = post;
	const markdownLink = /\[[^\]]*\]\(\s*(?:<([^>]+)>|([^\s)"']+))/g;
	const htmlLink = /\b(?:href|action)\s*=\s*["']([^"']+)["']/g;

	for (const match of text.matchAll(markdownLink)) {
		addReference(file, text, match.index, match[1] ?? match[2], publicPath);
	}
	for (const match of text.matchAll(htmlLink)) {
		addReference(file, text, match.index, match[1], publicPath);
	}
}

function extractCodeReferences(file) {
	const text = read(file);
	const patterns = [
		/\b(?:href|action)\s*=\s*["'](\/[^"']*)["']/g,
		/\bhref\s*:\s*["'](\/[^"']*)["']/g,
		/\bresolve\(\s*["'](\/[^"']*)["']/g
	];

	const seen = new Set();
	for (const pattern of patterns) {
		for (const match of text.matchAll(pattern)) {
			const key = `${match.index}:${match[1]}`;
			if (seen.has(key) || match[1].includes('[')) continue;
			seen.add(key);
			addReference(file, text, match.index, match[1]);
		}
	}
}

function staticFileExists(pathname) {
	let decoded;
	try {
		decoded = decodeURIComponent(pathname);
	} catch {
		return false;
	}

	const candidate = path.resolve(staticDir, `.${decoded}`);
	return candidate.startsWith(`${path.resolve(staticDir)}${path.sep}`) && fs.existsSync(candidate);
}

const aliases = readAliases();
const redirectedSlugs = new Set(
	Array.from(aliases.keys(), (sourcePath) => sourcePath.split('/').at(-1))
);
const posts = [];

for (const file of walk(postsDir).filter((candidate) => candidate.endsWith('.md'))) {
	const text = read(file);
	const metadata = parseFrontmatter(text);
	const slug = path.basename(file, '.md');
	if (metadata.published === false || redirectedSlugs.has(slug)) continue;

	const publicPath = `/blog/${slugifyCategory(metadata.category)}/${encodeURIComponent(slug)}`;
	posts.push({ file, text, slug, metadata, publicPath });
}

const canonicalPosts = new Set(posts.map((post) => post.publicPath));
const canonicalBySlug = new Map(posts.map((post) => [post.slug, post.publicPath]));
const categoryPaths = new Set(
	posts.map((post) => `/blog/${slugifyCategory(post.metadata.category)}`)
);
const knownRoutes = routePaths();

for (const [source, destination] of aliases) {
	if (!canonicalPosts.has(destination)) {
		errors.push(
			`src/lib/content/posts.ts: alias ${source} points to unknown canonical post ${destination}.`
		);
	}
}

for (const post of posts) extractPostReferences(post);
for (const file of [...walk(routesDir), ...walk(componentsDir)]) {
	if (/\.(?:js|mjs|ts|svelte)$/.test(file)) extractCodeReferences(file);
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

	if (
		knownRoutes.has(pathname) ||
		staticFileExists(pathname) ||
		canonicalPosts.has(pathname) ||
		aliases.has(pathname)
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
		`${canonicalPosts.size} canonical posts, ${aliases.size} aliases, and ${knownRoutes.size} static routes recognised.`
);
