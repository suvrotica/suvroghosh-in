import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { format, resolveConfig } from 'prettier';
import { bodyHash, postRevisionHash, splitPost } from './generate-post-tags.mjs';

const permittedFields = new Set(['description', 'thumbnailAlt']);
const normaliseLines = (value) => value.replace(/\r\n?/g, '\n');

// A deliberately narrow authoring operation, not a bypass in the publishing build.
export function refreshSeoMetadataEntry(beforeText, afterText, cached, source) {
	const before = splitPost(beforeText, source);
	const after = splitPost(afterText, source);
	if (normaliseLines(before.body) !== normaliseLines(after.body)) {
		throw new Error(`${source}: article prose changed; use the normal revision workflow.`);
	}
	const protectedMetadata = (metadata) =>
		Object.fromEntries(Object.entries(metadata).filter(([key]) => !permittedFields.has(key)));
	if (!isDeepStrictEqual(protectedMetadata(before.metadata), protectedMetadata(after.metadata))) {
		throw new Error(`${source}: only description and thumbnailAlt may change.`);
	}
	if (
		!cached ||
		cached.hashVersion !== 2 ||
		cached.bodyHash !== bodyHash(before.body) ||
		cached.revisionHash !== postRevisionHash(before)
	) {
		throw new Error(`${source}: the cache does not match the committed baseline.`);
	}
	if (before.metadata.published === false) {
		throw new Error(`${source}: unpublished entries use the normal authoring workflow.`);
	}
	const description = after.metadata.description;
	if (
		typeof description !== 'string' ||
		description.trim().length < 70 ||
		description.trim().length > 165
	) {
		throw new Error(`${source}: description must contain 70–165 characters.`);
	}
	if (
		after.metadata.thumbnail &&
		(typeof after.metadata.thumbnailAlt !== 'string' || !after.metadata.thumbnailAlt.trim())
	) {
		throw new Error(`${source}: the existing thumbnail needs authored alternative text.`);
	}
	return { ...cached, revisionHash: postRevisionHash(after) };
}

async function main() {
	if (
		process.argv.length !== 4 ||
		process.argv[2] !== '--base' ||
		!process.argv[3] ||
		process.argv[3].startsWith('-')
	) {
		throw new Error('Usage: node scripts/refresh-seo-metadata.mjs --base <committed-revision>');
	}
	const git = (...args) =>
		execFileSync('git', args, {
			encoding: 'utf8',
			maxBuffer: 32 * 1024 * 1024,
			stdio: ['ignore', 'pipe', 'pipe']
		});
	const base = git(
		'rev-parse',
		'--verify',
		'--end-of-options',
		`${process.argv[3]}^{commit}`
	).trim();
	git('merge-base', '--is-ancestor', base, 'HEAD');
	const manifestPath = 'scripts/post-tags-manifest.json';
	const baselineManifest = JSON.parse(git('show', `${base}:${manifestPath}`));
	const currentManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
	const names = git('diff', '--name-status', '-z', base, '--', 'src/lib/posts').split('\0');
	const updates = [];
	for (let index = 0; names[index]; index += 2) {
		const status = names[index];
		const source = names[index + 1];
		if (status !== 'M' || !/^src\/lib\/posts\/[^/]+\.md$/.test(source)) {
			throw new Error('Only modifications to existing article Markdown files are supported.');
		}
		const cached = baselineManifest.posts[source];
		if (!isDeepStrictEqual(currentManifest.posts[source], cached)) {
			throw new Error(`${source}: the working cache already differs from the baseline.`);
		}
		const updated = refreshSeoMetadataEntry(
			git('show', `${base}:${source}`),
			fs.readFileSync(source, 'utf8'),
			cached,
			source
		);
		updates.push({ source, updated });
	}
	if (!updates.length) throw new Error('No article metadata changes were found.');
	// Validate the complete batch before writing any generated state.
	for (const { source, updated } of updates) currentManifest.posts[source] = updated;
	const formatted = await format(JSON.stringify(currentManifest), {
		...(await resolveConfig(path.resolve(manifestPath))),
		filepath: manifestPath
	});
	const temporary = `${manifestPath}.seo-refresh.tmp`;
	try {
		fs.writeFileSync(temporary, formatted);
		fs.renameSync(temporary, manifestPath);
	} finally {
		if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
	}
	console.log(
		`Refreshed ${updates.length} SEO metadata cache entries against ${base}; prose, dates, tags, artwork paths and all other metadata verified unchanged.`
	);
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
	try {
		await main();
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	}
}
