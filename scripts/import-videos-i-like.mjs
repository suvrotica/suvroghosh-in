#!/usr/bin/env node
/**
 * Read the author's draft links as data; never compile or execute source Markdown.
 * Run with Node's TypeScript stripping support (Node 22.6+).
 *
 * node --experimental-strip-types scripts/import-videos-i-like.mjs
 * node --experimental-strip-types scripts/import-videos-i-like.mjs --commit <full SHA>
 * Add --check to verify the checked-in catalogue without writing it.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseYouTubeUrl } from '../src/lib/visualizations/listening-room/youtube.ts';

export const REPOSITORY = 'suvrotica/SuvroTuitionBlog';
export const BRANCH = 'laptop';
const DEFAULT_OUTPUT = fileURLToPath(
	new URL('../src/lib/visualizations/videos-i-like/catalogue.json', import.meta.url)
);
const REQUEST_TIMEOUT_MS = 15_000;
const FETCH_CONCURRENCY = 6;
const MAX_FILES = 1_000;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_TREE_BYTES = 8 * 1024 * 1024;
const COMMIT = /^[a-f0-9]{40}$/;

/** Editorial memberships come from the source posts, not invented video titles. */
const MEMBERSHIPS = {
	'Bengali.md': { categories: ['music'], musicCategories: ['bengali'] },
	'Hindi.md': { categories: ['music'], musicCategories: ['hindi'] },
	'English.md': { categories: ['music'], musicCategories: ['english'] },
	'Rabi.md': { categories: ['music'], musicCategories: ['rabindrasangeet'] },
	'Audiobook.md': { categories: ['audiobooks'], musicCategories: [] },
	'Brain.md': { categories: ['documentaries'], musicCategories: [] },
	'MathDoc.md': { categories: ['documentaries', 'maths'], musicCategories: [] },
	'MedDoc.md': { categories: ['documentaries'], musicCategories: [] },
	'LAvids.md': { categories: ['maths'], musicCategories: [] },
	'StatisticsTheName.md': { categories: ['maths'], musicCategories: [] },
	'Inspirational.md': { categories: ['talks'], musicCategories: [] },
	'PMBA.md': { categories: ['talks'], musicCategories: [] }
};

function sourcePathUrl(path) {
	return path.split('/').map(encodeURIComponent).join('/');
}

function membershipAt(file, offset) {
	// This post explicitly separates films from music; its title alone is ambiguous.
	if (file.path === 'drafts/Bengali.md') {
		const headings = [
			...file.content.slice(0, offset).matchAll(/^\s*\*\*(Movies|Music)\*\*\s*$/gm)
		];
		if (headings.at(-1)?.[1] === 'Movies') return { categories: ['films'], musicCategories: [] };
	}
	return (
		MEMBERSHIPS[file.path.slice('drafts/'.length)] ?? {
			categories: ['other'],
			musicCategories: []
		}
	);
}

/** Extract literal links from Markdown, HTML/Svelte attributes and plain prose. */
export function extractReferences(markdown) {
	const references = [];
	// Capture complete URL tokens, so a lookalike hostname cannot become a valid suffix.
	for (const match of markdown.matchAll(/https?:\/\/[^\s<>"'`]+/g)) {
		const originalUrl = match[0].replace(/[)\]},.;!?]+$/, '');
		const decodedUrl = originalUrl.replace(/&amp;|&#0*38;|&#x0*26;/gi, '&');
		const parsed = parseYouTubeUrl(decodedUrl);
		if (!parsed) continue;
		references.push({ originalUrl, parsed, offset: match.index });
	}
	return references;
}

/**
 * Deterministic order: repository path, then occurrence within each source file.
 * A repeated video retains every occurrence and every source-derived membership.
 */
export function createCatalogue(files, commit) {
	if (!COMMIT.test(commit)) throw new Error('A full lowercase Git commit SHA is required.');
	const entries = new Map();
	let referenceCount = 0;
	const sorted = [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
	for (const file of sorted) {
		if (!/^drafts\/.+\.md$/i.test(file.path) || file.path.includes('..')) {
			throw new Error(`Unexpected source path: ${file.path}`);
		}
		const references = extractReferences(file.content);
		for (const [index, reference] of references.entries()) {
			const { parsed, originalUrl } = reference;
			const membership = membershipAt(file, reference.offset);
			const kind = parsed.playlistId
				? parsed.playlistId.startsWith('RD')
					? 'mix'
					: 'playlist'
				: 'video';
			const id = parsed.playlistId ?? parsed.videoId;
			const key = `${kind}:${id}`;
			if (!entries.has(key)) {
				entries.set(key, {
					key,
					kind,
					id,
					url:
						kind === 'video'
							? `https://www.youtube.com/watch?v=${id}`
							: `https://www.youtube.com/playlist?list=${id}`,
					categories: [],
					musicCategories: [],
					sources: []
				});
			}
			const entry = entries.get(key);
			for (const category of membership.categories) {
				if (!entry.categories.includes(category)) entry.categories.push(category);
			}
			for (const category of membership.musicCategories) {
				if (!entry.musicCategories.includes(category)) entry.musicCategories.push(category);
			}
			entry.sources.push({
				file: file.path,
				url: `https://github.com/${REPOSITORY}/blob/${commit}/${sourcePathUrl(file.path)}`,
				originalUrl,
				order: index + 1,
				...(parsed.startSeconds !== undefined ? { startSeconds: parsed.startSeconds } : {}),
				...(parsed.index !== undefined ? { index: parsed.index } : {})
			});
			referenceCount += 1;
		}
	}
	return {
		version: 1,
		repository: REPOSITORY,
		branch: BRANCH,
		commit,
		fileCount: files.length,
		referenceCount,
		entries: [...entries.values()]
	};
}

async function readRemote(url, byteLimit) {
	const response = await fetch(url, {
		headers: {
			Accept: 'application/vnd.github+json',
			'User-Agent': 'suvroghosh-video-catalogue-import'
		},
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
		redirect: 'error'
	});
	if (!response.ok) throw new Error(`Source request failed (${response.status}): ${url}`);
	if (!response.body) throw new Error(`Source response has no body: ${url}`);
	const reader = response.body.getReader();
	const chunks = [];
	let length = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			length += value.byteLength;
			if (length > byteLimit) throw new Error(`Source response exceeds its byte limit: ${url}`);
			chunks.push(value);
		}
	} finally {
		await reader.cancel();
		reader.releaseLock();
	}
	return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
}

/** Bounded concurrency keeps a refresh small and gives stable output despite fetch order. */
export async function fetchCatalogueSources(commit) {
	if (commit !== undefined && !COMMIT.test(commit)) {
		throw new Error('--commit must be a full lowercase Git commit SHA.');
	}
	if (!commit) {
		const ref = JSON.parse(
			await readRemote(
				`https://api.github.com/repos/${REPOSITORY}/git/ref/heads/${BRANCH}`,
				MAX_TREE_BYTES
			)
		);
		commit = ref.object?.sha;
		if (!COMMIT.test(commit)) throw new Error('GitHub did not return a valid branch commit.');
	}
	const tree = JSON.parse(
		await readRemote(
			`https://api.github.com/repos/${REPOSITORY}/git/trees/${commit}?recursive=1`,
			MAX_TREE_BYTES
		)
	);
	if (tree.truncated || !Array.isArray(tree.tree)) {
		throw new Error('GitHub returned an incomplete source tree; no catalogue was written.');
	}
	const paths = tree.tree
		.filter((entry) => entry.type === 'blob' && /^drafts\/.+\.md$/i.test(entry.path))
		.map((entry) => entry.path)
		.sort();
	if (!paths.length || paths.length > MAX_FILES) {
		throw new Error(`Unexpected Markdown source count: ${paths.length}`);
	}
	const files = new Array(paths.length);
	let next = 0;
	await Promise.all(
		Array.from({ length: Math.min(FETCH_CONCURRENCY, paths.length) }, async () => {
			while (next < paths.length) {
				const index = next++;
				const path = paths[index];
				files[index] = {
					path,
					content: await readRemote(
						`https://raw.githubusercontent.com/${REPOSITORY}/${commit}/${sourcePathUrl(path)}`,
						MAX_FILE_BYTES
					)
				};
			}
		})
	);
	return { files, commit };
}

async function main(args) {
	let commit;
	let check = false;
	let output = DEFAULT_OUTPUT;
	for (let index = 0; index < args.length; index += 1) {
		if (args[index] === '--check') check = true;
		else if (args[index] === '--commit' && args[index + 1]) commit = args[++index];
		else if (args[index] === '--output' && args[index + 1]) output = resolve(args[++index]);
		else throw new Error(`Unknown or incomplete argument: ${args[index]}`);
	}
	const source = await fetchCatalogueSources(commit);
	const catalogue = createCatalogue(source.files, source.commit);
	const serialized = `${JSON.stringify(catalogue, null, 2)}\n`;
	let previous = '';
	try {
		previous = (await readFile(output, 'utf8')).replaceAll('\r\n', '\n');
	} catch (error) {
		if (error.code !== 'ENOENT') throw error;
	}
	if (check && previous !== serialized) throw new Error('Video catalogue is missing or stale.');
	if (!check && previous !== serialized) {
		await mkdir(dirname(output), { recursive: true });
		await writeFile(output, serialized);
	}
	console.log(
		`${check ? 'Verified' : previous === serialized ? 'Unchanged' : 'Imported'}: ${catalogue.fileCount} files, ${catalogue.referenceCount} references, ${catalogue.entries.length} entries at ${source.commit}.`
	);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main(process.argv.slice(2)).catch((error) => {
		console.error(error.message);
		process.exitCode = 1;
	});
}
