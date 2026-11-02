#!/usr/bin/env node
/** Import saved YouTube links as data, without publishing or changing local notes. */
import { createHash } from 'node:crypto';
import { lstat, mkdir, open, readdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractReferences } from './import-videos-i-like.mjs';
import { parseYouTubeUrl } from '../src/lib/visualizations/listening-room/youtube.ts';

export const LIMITS = Object.freeze({
	files: 1000,
	fileBytes: 2 * 1024 * 1024,
	totalBytes: 8 * 1024 * 1024,
	depth: 16,
	entries: 10_000
});
const DEFAULT_OUTPUT = fileURLToPath(
	new URL('../src/lib/visualizations/videos-i-like/obsidian.json', import.meta.url)
);

// These labels describe collections, not the prose or private locations of source notes.
const MEMBERSHIPS = {
	'Algorithms and Data Structures Videos.md': ['Algorithms', ['technology', 'maths']],
	'Amartya Sen interviewed by Ravish Kumar.md': ['Interviews', ['talks']],
	'Atheism.md': ['Atheism', ['talks']],
	'FOXP2 and the Genetics of Human Language.md': ['Language and genetics', ['science']],
	'Good science videos.md': ['Science documentaries', ['science', 'documentaries']],
	'Links to AI.md': ['Artificial intelligence', ['technology']],
	'Links to Bengali Culture.md': ['Bengali culture', ['talks']],
	'Links to Biology.md': ['Biology', ['science']],
	'Links to Botany.md': ['Botany', ['science']],
	'Links to Chemistry.md': ['Chemistry', ['science']],
	'Links to Cooking Food.md': ['Cooking', ['food']],
	'Links to Data Science.md': ['Data science', ['technology', 'maths']],
	'Links to Differential Equation.md': ['Differential equations', ['maths']],
	'Links to Electronics.md': ['Electronics', ['technology']],
	'Links to Energy.md': ['Energy', ['science']],
	'Links to Graph Theory.md': ['Graph theory', ['maths']],
	'Links to Linear Algebra.md': ['Linear algebra', ['maths']],
	'Links to Mathematics.md': ['Mathematics', ['maths']],
	'Links to Network.md': ['Networks', ['technology']],
	'Links to Physics.md': ['Physics', ['science']],
	'Links to Probability.md': ['Probability', ['maths']],
	'Links to Python.md': ['Python', ['technology']],
	'Links to Robotics.md': ['Robotics', ['technology']],
	'Links to Science Audiobooks.md': ['Science audiobooks', ['audiobooks', 'science']],
	'Links to Topology.md': ['Topology', ['maths']],
	'Links to graphics design.md': ['Graphics and design', ['technology']],
	'Links to the Brain.md': ['The brain', ['science']],
	'Mental Health Videos.md': ['Mental health', ['science', 'documentaries']],
	'New eye treatment.md': ['Eye health', ['science']],
	'Opioid Drug Videos.md': ['Medicines', ['science']]
};

function urlTokens(markdown) {
	return [...markdown.matchAll(/https?:\/\/[^\s<>"'`]+/g)].map((match) => ({
		url: match[0].replace(/[)\]},.;!?]+$/, ''),
		offset: match.index
	}));
}

/** The historic 16-hex p form predates the PL playlist prefix. Keep this import-only. */
export function normalizeLegacyPlaylist(input) {
	if (
		typeof input !== 'string' ||
		input.length > 4096 ||
		input.includes('\\') ||
		[...input].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
	)
		return null;
	const authority = /^https?:\/\/([^/?#]+)/i.exec(input.trim())?.[1];
	if (!authority || authority.includes(':')) return null;
	let url;
	try {
		url = new URL(input.replace(/&amp;|&#0*38;|&#x0*26;/gi, '&'));
	} catch {
		return null;
	}
	if (
		!['http:', 'https:'].includes(url.protocol) ||
		!['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(url.hostname) ||
		url.username ||
		url.password ||
		url.port ||
		url.pathname !== '/view_play_list' ||
		url.searchParams.getAll('p').length !== 1 ||
		!/^[A-Fa-f0-9]{16}$/.test(url.searchParams.get('p') ?? '')
	)
		return null;
	const normalized = new URL('https://www.youtube.com/playlist');
	normalized.searchParams.set('list', `PL${url.searchParams.get('p').toUpperCase()}`);
	for (const key of ['t', 'start', 'index']) {
		for (const value of url.searchParams.getAll(key)) normalized.searchParams.append(key, value);
	}
	normalized.hash = url.hash;
	return parseYouTubeUrl(normalized.href);
}

/** Keep useful time/index context but remove tracking parameters and incidental fragments. */
export function sourceUrl(parsed) {
	const url = new URL(`https://www.youtube.com/${parsed.videoId ? 'watch' : 'playlist'}`);
	if (parsed.videoId) url.searchParams.set('v', parsed.videoId);
	if (parsed.playlistId) url.searchParams.set('list', parsed.playlistId);
	if (parsed.startSeconds !== undefined) url.searchParams.set('t', String(parsed.startSeconds));
	if (parsed.index !== undefined) url.searchParams.set('index', String(parsed.index + 1));
	return url.href;
}

export function extractLocalReferences(markdown) {
	const references = extractReferences(markdown);
	const accepted = new Set(references.map((reference) => reference.offset));
	for (const token of urlTokens(markdown)) {
		if (accepted.has(token.offset)) continue;
		const parsed = normalizeLegacyPlaylist(token.url);
		if (parsed) references.push({ originalUrl: token.url, parsed, offset: token.offset });
	}
	return references.sort((a, b) => a.offset - b.offset);
}

function relativeSource(file) {
	if (
		typeof file !== 'string' ||
		isAbsolute(file) ||
		file.includes('\\') ||
		file.split('/').some((part) => part === '..' || part === '.') ||
		!/^.+\.md$/i.test(file)
	)
		throw new Error('Source notes must have relative Markdown paths.');
	return file;
}

function identity(file) {
	const slug = file
		.replace(/\.md$/i, '')
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
	return `obsidian:${slug || createHash('sha256').update(file).digest('hex').slice(0, 12)}`;
}

/** Deterministic editorial manifest. Private note content never enters the output. */
export function createSupplementalCatalogue(files) {
	if (!Array.isArray(files) || files.length > LIMITS.files)
		throw new Error(`At most ${LIMITS.files} Markdown notes can be imported.`);
	const entries = new Map();
	const identities = new Set();
	let referenceCount = 0;
	for (const file of [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
		const path = relativeSource(file.path);
		const sourceIdentity = identity(path);
		if (identities.has(sourceIdentity))
			throw new Error(
				'Two source notes have the same normalized identity; import was not written.'
			);
		identities.add(sourceIdentity);
		const [label, categories] = MEMBERSHIPS[basename(path)] ?? ['Saved videos', ['other']];
		for (const [index, reference] of extractLocalReferences(file.content).entries()) {
			const { parsed } = reference;
			const id = parsed.playlistId ?? parsed.videoId;
			const kind = parsed.playlistId ? (id.startsWith('RD') ? 'mix' : 'playlist') : 'video';
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
			for (const category of categories) {
				if (!entry.categories.includes(category)) entry.categories.push(category);
			}
			entry.sources.push({
				file: sourceIdentity,
				label,
				collection: 'obsidian',
				originalUrl: sourceUrl(parsed),
				order: index + 1,
				...(parsed.startSeconds !== undefined ? { startSeconds: parsed.startSeconds } : {}),
				...(parsed.index !== undefined ? { index: parsed.index } : {})
			});
			referenceCount++;
		}
	}
	return {
		version: 1,
		collection: 'Obsidian Videos',
		fileCount: files.length,
		referenceCount,
		entries: [...entries.values()]
	};
}

function inside(root, path) {
	const child = relative(root, path);
	return child === '' || (!isAbsolute(child) && child !== '..' && !child.startsWith(`..${sep}`));
}

async function readBoundedNote(path, limit) {
	const handle = await open(path, 'r');
	const chunks = [];
	let length = 0;
	try {
		for (;;) {
			const buffer = Buffer.alloc(Math.min(64 * 1024, limit + 1 - length));
			const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
			if (!bytesRead) break;
			length += bytesRead;
			if (length > limit) throw new Error('A Markdown note changed beyond its size limit.');
			chunks.push(buffer.subarray(0, bytesRead));
		}
		return Buffer.concat(chunks, length);
	} finally {
		await handle.close();
	}
}

/** Bounded, read-only traversal. No symlinks, junctions, or paths outside the selected folder. */
export async function readLocalSources(folder) {
	const requestedRoot = resolve(folder);
	const rootStat = await lstat(requestedRoot);
	if (rootStat.isSymbolicLink() || !rootStat.isDirectory())
		throw new Error('--folder must be a real directory, not a link.');
	const root = await realpath(requestedRoot);
	const files = [];
	let totalBytes = 0;
	let totalEntries = 0;
	async function walk(directory, depth) {
		if (depth > LIMITS.depth) throw new Error('The selected folder exceeds the nesting limit.');
		for (const entry of await readdir(directory, { withFileTypes: true })) {
			if (++totalEntries > LIMITS.entries)
				throw new Error('The selected folder contains too many filesystem entries.');
			const path = resolve(directory, entry.name);
			const stat = await lstat(path);
			if (stat.isSymbolicLink()) throw new Error('Linked files and folders cannot be imported.');
			if (!inside(root, await realpath(path)))
				throw new Error('A source path resolves outside the selected folder.');
			if (stat.isDirectory()) await walk(path, depth + 1);
			else if (stat.isFile() && /\.md$/i.test(entry.name)) {
				if (files.length >= LIMITS.files) throw new Error('The Markdown note limit was exceeded.');
				if (stat.size > LIMITS.fileBytes)
					throw new Error('A Markdown note exceeds the size limit.');
				if (totalBytes + stat.size > LIMITS.totalBytes)
					throw new Error('The Markdown collection exceeds the total size limit.');
				const bytes = await readBoundedNote(
					path,
					Math.min(LIMITS.fileBytes, LIMITS.totalBytes - totalBytes)
				);
				totalBytes += bytes.byteLength;
				files.push({
					path: relative(root, path).split(sep).join('/'),
					content: new TextDecoder('utf-8', { fatal: true }).decode(bytes)
				});
			}
		}
	}
	await walk(root, 0);
	if (!files.length) throw new Error('The selected folder contains no Markdown notes.');
	return files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

export function sourceDiagnostics(files) {
	const result = { notesWithoutLinks: 0, channels: 0, unsupportedYouTube: 0, otherLinks: 0 };
	for (const file of files) {
		const references = extractLocalReferences(file.content);
		if (!references.length) result.notesWithoutLinks++;
		const accepted = new Set(references.map((reference) => reference.offset));
		for (const token of urlTokens(file.content)) {
			if (accepted.has(token.offset)) continue;
			let url;
			try {
				url = new URL(token.url);
			} catch {
				result.otherLinks++;
				continue;
			}
			if (/^(?:(?:www|m|music)\.)?youtube\.com$/.test(url.hostname)) {
				if (/^\/(?:@[^/]+|(?:c|channel|user)\/[^/]+)\/?$/.test(url.pathname)) result.channels++;
				else result.unsupportedYouTube++;
			} else if (/^(?:www\.)?(?:youtu\.be|youtube-nocookie\.com)$/.test(url.hostname))
				result.unsupportedYouTube++;
			else result.otherLinks++;
		}
	}
	return result;
}

export async function importLocalCatalogue({ folder, output = DEFAULT_OUTPUT, check = false }) {
	if (!folder) throw new Error('Provide the local Videos folder with --folder <path>.');
	const outputPath = resolve(output);
	const root = await realpath(resolve(folder));
	let outputAncestor = dirname(outputPath);
	for (;;) {
		try {
			outputAncestor = await realpath(outputAncestor);
			break;
		} catch (error) {
			if (error.code !== 'ENOENT') throw error;
			const parent = dirname(outputAncestor);
			if (parent === outputAncestor) throw error;
			outputAncestor = parent;
		}
	}
	if (inside(root, outputPath) || inside(root, outputAncestor))
		throw new Error('The output must be outside the local source folder.');
	try {
		const outputStat = await lstat(outputPath);
		if (outputStat.isSymbolicLink() || outputStat.nlink > 1)
			throw new Error('The output cannot be a link.');
		if (!outputStat.isFile()) throw new Error('The output must be a regular file.');
	} catch (error) {
		if (error.code !== 'ENOENT') throw error;
	}
	const files = await readLocalSources(folder);
	const catalogue = createSupplementalCatalogue(files);
	const serialized = `${JSON.stringify(catalogue, null, 2)}\n`;
	let previous = '';
	try {
		previous = (await readFile(outputPath, 'utf8')).replaceAll('\r\n', '\n');
	} catch (error) {
		if (error.code !== 'ENOENT') throw error;
	}
	if (check && previous !== serialized)
		throw new Error('The local video catalogue is missing or stale.');
	if (!check && previous !== serialized) {
		await mkdir(dirname(outputPath), { recursive: true });
		await writeFile(outputPath, serialized);
	}
	return { catalogue, diagnostics: sourceDiagnostics(files), changed: previous !== serialized };
}

async function main(args) {
	let folder;
	let output;
	let check = false;
	for (let index = 0; index < args.length; index++) {
		if (args[index] === '--folder' && args[index + 1]) folder = args[++index];
		else if (args[index] === '--output' && args[index + 1]) output = args[++index];
		else if (args[index] === '--check') check = true;
		else throw new Error(`Unknown or incomplete argument: ${args[index]}`);
	}
	const { catalogue, diagnostics, changed } = await importLocalCatalogue({ folder, output, check });
	const counts = ['video', 'playlist', 'mix'].map(
		(kind) =>
			`${catalogue.entries.filter((entry) => entry.kind === kind).length} ${kind === 'mix' ? 'mixes' : `${kind}s`}`
	);
	console.log(
		`${check ? 'Verified' : changed ? 'Imported' : 'Unchanged'}: ${catalogue.fileCount} notes, ${catalogue.referenceCount} YouTube references, ${catalogue.entries.length} selections (${counts.join(', ')}).`
	);
	console.log(
		`Skipped links: ${diagnostics.channels} channels, ${diagnostics.unsupportedYouTube} unsupported YouTube links, ${diagnostics.otherLinks} other links. Notes without supported links: ${diagnostics.notesWithoutLinks}.`
	);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main(process.argv.slice(2)).catch((error) => {
		console.error(error.message);
		process.exitCode = 1;
	});
}
