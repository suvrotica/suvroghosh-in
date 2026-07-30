import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePostFrontmatter } from './lib/post-metadata.mjs';
import {
	extractResourceCopyText,
	isResourceSlug,
	parseResourceMetadata,
	resourceKindSegment,
	resourcePath,
	resourceRef
} from '../src/lib/content/resources.ts';

export const RESOURCE_COPY_BUDGET_BYTES = 400 * 1024;

function toPosix(value) {
	return value.split(path.sep).join('/');
}

function stripFrontmatter(rawMarkdown) {
	return rawMarkdown.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '');
}

function editorialPlaceholder(rawMarkdown) {
	const patterns = [
		{ pattern: /\bTODO\b/i, label: 'TODO' },
		{ pattern: /\bTBD\b/i, label: 'TBD' },
		{ pattern: /\blorem ipsum\b/i, label: 'Lorem ipsum' },
		{ pattern: /\bcoming soon\b/i, label: 'Coming soon' },
		{
			pattern:
				/\[(?:INSERT|ADD|WRITE|REPLACE)(?:\s+(?:CONTENT|COPY|TEXT|HERE|LATER|DETAILS?)){0,3}\]/i,
			label: 'editorial bracket placeholder'
		}
	];
	return patterns.find(({ pattern }) => pattern.test(rawMarkdown))?.label;
}

export function scanResourceSources(rootDirectory = process.cwd()) {
	const sources = [];
	for (const [directory, expectedKind] of [
		['prompts', 'prompt'],
		['lists', 'list']
	]) {
		const sourceDirectory = path.join(rootDirectory, 'src', 'lib', directory);
		if (!fs.existsSync(sourceDirectory)) continue;

		for (const filename of fs
			.readdirSync(sourceDirectory)
			.filter((file) => file.endsWith('.md'))
			.sort()) {
			const sourcePath = path.join(sourceDirectory, filename);
			sources.push({
				sourcePath,
				sourceLabel: toPosix(path.relative(rootDirectory, sourcePath)),
				filename,
				expectedKind,
				rawMarkdown: fs.readFileSync(sourcePath, 'utf8')
			});
		}
	}
	return sources;
}

export function validateResourceSources(
	sources,
	{
		rootDirectory = process.cwd(),
		assetExists = (thumbnail) =>
			fs.existsSync(path.join(rootDirectory, 'static', thumbnail.replace(/^\//, ''))),
		minimumRelated = 2,
		copyBudgetBytes = RESOURCE_COPY_BUDGET_BYTES
	} = {}
) {
	const errors = [];
	const warnings = [];
	const resources = [];
	const byRef = new Map();
	const paths = new Map();
	const titles = new Map();
	let copyPayloadBytes = 0;

	for (const source of sources) {
		const sourceLabel = source.sourceLabel ?? source.sourcePath ?? source.filename;
		const filename = source.filename ?? path.basename(source.sourcePath);
		const slug = filename.replace(/\.md$/, '');

		if (filename !== `${slug}.md` || !isResourceSlug(slug)) {
			errors.push(`${sourceLabel}: filename must use lowercase kebab case.`);
		}

		let rawMetadata;
		try {
			rawMetadata = parsePostFrontmatter(source.rawMarkdown, sourceLabel);
		} catch (error) {
			errors.push(error instanceof Error ? error.message : `${sourceLabel}: invalid frontmatter.`);
			continue;
		}

		let metadata;
		try {
			metadata = parseResourceMetadata(rawMetadata, sourceLabel, source.expectedKind);
		} catch (error) {
			errors.push(error instanceof Error ? error.message : `${sourceLabel}: invalid metadata.`);
			continue;
		}

		let copyText = '';
		try {
			copyText = extractResourceCopyText(source.rawMarkdown);
		} catch (error) {
			errors.push(
				`${sourceLabel}: ${error instanceof Error ? error.message : 'invalid copy region.'}`
			);
		}

		if (!assetExists(metadata.thumbnail)) {
			errors.push(`${sourceLabel}: thumbnail does not exist: ${metadata.thumbnail}.`);
		}

		const body = stripFrontmatter(source.rawMarkdown);
		if (/^#(?!#)\s+\S/m.test(body)) {
			errors.push(`${sourceLabel}: resource Markdown must not contain an H1 heading.`);
		}

		if (metadata.published) {
			const placeholder = editorialPlaceholder(body);
			if (placeholder) {
				errors.push(`${sourceLabel}: published content contains ${placeholder}.`);
			}
			copyPayloadBytes += Buffer.byteLength(copyText, 'utf8');
		}

		const record = {
			...metadata,
			slug,
			kindSegment: resourceKindSegment(metadata.kind),
			path: resourcePath({ kind: metadata.kind, slug }),
			ref: resourceRef({ kind: metadata.kind, slug }),
			copyText,
			sourceLabel
		};
		resources.push(record);

		const previousRef = byRef.get(record.ref);
		if (previousRef) {
			errors.push(
				`${sourceLabel}: duplicate slug within ${record.kindSegment}; already defined by ${previousRef.sourceLabel}.`
			);
		} else {
			byRef.set(record.ref, record);
		}

		const previousPath = paths.get(record.path);
		if (previousPath) {
			errors.push(
				`${sourceLabel}: duplicate canonical URL ${record.path}; already defined by ${previousPath.sourceLabel}.`
			);
		} else {
			paths.set(record.path, record);
		}

		const normalizedTitle = record.title.toLocaleLowerCase('en');
		const previousTitle = titles.get(normalizedTitle);
		if (previousTitle) {
			errors.push(
				`${sourceLabel}: title “${record.title}” duplicates ${previousTitle.sourceLabel}.`
			);
		} else {
			titles.set(normalizedTitle, record);
		}
	}

	for (const resource of resources) {
		if (!resource.published) continue;

		const authoredRelated = resource.related ?? [];
		if (authoredRelated.length < minimumRelated) {
			errors.push(
				`${resource.sourceLabel}: published resources require at least ${minimumRelated} explicit related references.`
			);
		}

		const seen = new Set();
		for (const reference of authoredRelated) {
			if (reference === resource.ref) {
				errors.push(`${resource.sourceLabel}: related reference ${reference} points to itself.`);
				continue;
			}
			if (seen.has(reference)) {
				errors.push(`${resource.sourceLabel}: duplicate related reference ${reference}.`);
				continue;
			}
			seen.add(reference);

			const target = byRef.get(reference);
			if (!target) {
				errors.push(`${resource.sourceLabel}: related reference ${reference} does not exist.`);
			} else if (!target.published) {
				errors.push(`${resource.sourceLabel}: related reference ${reference} is not published.`);
			}
		}

		const derivedPath = resourcePath({ kind: resource.kind, slug: resource.slug });
		if (resource.path !== derivedPath) {
			errors.push(
				`${resource.sourceLabel}: detail path ${resource.path} does not match ${derivedPath}.`
			);
		}
	}

	if (copyPayloadBytes > copyBudgetBytes) {
		errors.push(
			`Published resource copy payload is ${(copyPayloadBytes / 1024).toFixed(1)} KiB, above the ${(copyBudgetBytes / 1024).toFixed(0)} KiB build budget.`
		);
	}

	return {
		errors,
		warnings,
		resources,
		copyPayloadBytes,
		publishedResources: resources.filter((resource) => resource.published)
	};
}

function runCli() {
	const sources = scanResourceSources();
	const result = validateResourceSources(sources);
	for (const warning of result.warnings) console.warn(`Resource warning: ${warning}`);

	if (result.errors.length > 0) {
		console.error(`Resource validation failed with ${result.errors.length} issue(s):`);
		for (const error of result.errors) console.error(`- ${error}`);
		process.exitCode = 1;
		return;
	}

	const prompts = result.publishedResources.filter((resource) => resource.kind === 'prompt').length;
	const lists = result.publishedResources.filter((resource) => resource.kind === 'list').length;
	console.log(
		`Resource validation passed: ${sources.length} files checked (${prompts} published prompts, ` +
			`${lists} published word lists; ${(result.copyPayloadBytes / 1024).toFixed(1)} KiB copy payload).`
	);
}

const isMain =
	process.argv[1] !== undefined &&
	path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) runCli();
