import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
	link,
	mkdtemp,
	mkdir,
	readFile,
	realpath,
	rm,
	stat,
	symlink,
	writeFile
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, sep } from 'node:path';
import test from 'node:test';
import {
	createSupplementalCatalogue,
	extractLocalReferences,
	importLocalCatalogue,
	LIMITS,
	normalizeLegacyPlaylist,
	readLocalSources,
	sourceDiagnostics
} from './import-obsidian-videos.mjs';

const video = 'QL4_4GAWvPs';
const playlist = 'PL65CC0384A1798ADF';
const hash = (content) => createHash('sha256').update(content).digest('hex');

async function fixture(t) {
	const temporaryRoot = await realpath(tmpdir());
	const root = await mkdtemp(join(temporaryRoot, 'obsidian-import-test-'));
	const folder = join(root, 'notes');
	await mkdir(folder);
	t.after(async () => {
		const child = relative(temporaryRoot, await realpath(root));
		assert(!isAbsolute(child) && !child.startsWith(`..${sep}`) && child !== '..');
		assert(child.startsWith('obsidian-import-test-'));
		await rm(root, { recursive: true, force: true });
	});
	return { root, folder, output: join(root, 'supplement.json') };
}

test('extracts supported Markdown, iframe, plain and legacy links without importing channels', () => {
	const content = [
		`[A video](https://youtu.be/${video}?si=tracking&t=1m2s)`,
		`<iframe src="https://www.youtube.com/embed/${video}?start=15&amp;feature=shared"></iframe>`,
		'http://www.youtube.com/view_play_list?p=65CC0384A1798ADF',
		'https://youtube.com/@saved-channel',
		'https://youtube.com.evil.test/watch?v=QL4_4GAWvPs',
		'https://youtube.com/watch?v=invalid'
	].join('\n');
	const references = extractLocalReferences(content);
	assert.equal(references.length, 3);
	assert.deepEqual(
		references.map((item) => item.parsed.startSeconds),
		[62, 15, undefined]
	);
	assert.equal(references[2].parsed.playlistId, playlist);
	assert(
		references.every((item, index) => index === 0 || item.offset > references[index - 1].offset)
	);
	assert.deepEqual(sourceDiagnostics([{ path: 'Links.md', content }]), {
		notesWithoutLinks: 0,
		channels: 1,
		unsupportedYouTube: 1,
		otherLinks: 1
	});
});

test('legacy conversion stays on exact YouTube hosts and rejects ambiguous identifiers', () => {
	assert.deepEqual(
		normalizeLegacyPlaylist('http://www.youtube.com/view_play_list?p=65CC0384A1798ADF'),
		{ playlistId: playlist }
	);
	for (const invalid of [
		'https://youtube.com.evil.test/view_play_list?p=65CC0384A1798ADF',
		'https://name@youtube.com/view_play_list?p=65CC0384A1798ADF',
		'https://youtube.com:444/view_play_list?p=65CC0384A1798ADF',
		'https://youtube.com:443/view_play_list?p=65CC0384A1798ADF',
		'https://youtube.com/view_play_list?p=65CC0384A1798ADF\n',
		'https://youtube.com/view_play_list?p=65CC0384A1798ADF&p=65CC0384A1798ADF',
		'https://youtube.com/view_play_list?p=not-a-playlist',
		'https://youtube.com/view_play_list?p=65CC0384A1798ADF&t=invalid',
		'https://youtube.com/view_play_list?p=65CC0384A1798ADF&index=2&index=3',
		'https://youtube.com/another-path?p=65CC0384A1798ADF'
	])
		assert.equal(normalizeLegacyPlaylist(invalid), null, invalid);
});

test('merges repeated identities and memberships while retaining ordered safe provenance', () => {
	const files = [
		{
			path: 'Links to Mathematics.md',
			content: `PRIVATE PROSE MUST NOT APPEAR\nhttps://youtu.be/${video}?si=tracking&t=25\nhttps://youtu.be/${video}?t=30`
		},
		{ path: 'Links to AI.md', content: `https://www.youtube.com/watch?v=${video}` },
		{
			path: 'Links to Science Audiobooks.md',
			content: `https://www.youtube.com/watch?v=${video}&list=${playlist}&index=3&t=10&si=private-tracking`
		}
	];
	const catalogue = createSupplementalCatalogue(files);
	assert.deepEqual(catalogue, createSupplementalCatalogue([...files].reverse()));
	assert.equal(catalogue.fileCount, 3);
	assert.equal(catalogue.referenceCount, 4);
	assert.equal(catalogue.entries.length, 2);
	const single = catalogue.entries.find((entry) => entry.kind === 'video');
	assert.deepEqual(single.categories, ['technology', 'maths']);
	assert.deepEqual(
		single.sources.map((source) => source.order),
		[1, 1, 2]
	);
	assert.equal(single.sources[1].originalUrl, `https://www.youtube.com/watch?v=${video}&t=25`);
	const collection = catalogue.entries.find((entry) => entry.kind === 'playlist');
	assert.deepEqual(collection.categories, ['audiobooks', 'science']);
	assert.equal(collection.sources[0].index, 2);
	assert.equal(
		collection.sources[0].originalUrl,
		`https://www.youtube.com/watch?v=${video}&list=${playlist}&t=10&index=3`
	);
	for (const source of catalogue.entries.flatMap((entry) => entry.sources)) {
		assert.equal(source.collection, 'obsidian');
		assert(source.file.startsWith('obsidian:'));
		assert(!Object.hasOwn(source, 'url'));
	}
	const serialized = JSON.stringify(catalogue);
	assert(!serialized.includes('PRIVATE PROSE'));
	assert(!serialized.includes('tracking'));
	assert(!serialized.includes('.md'));
});

test('rejects absolute/traversal source paths and reports notes without supported videos', () => {
	for (const path of ['/private.md', '../private.md', 'inside/../private.md', 'C:\\private.md'])
		assert.throws(() => createSupplementalCatalogue([{ path, content: '' }]), /relative/);
	assert.deepEqual(sourceDiagnostics([{ path: 'empty.md', content: 'A local note.' }]), {
		notesWithoutLinks: 1,
		channels: 0,
		unsupportedYouTube: 0,
		otherLinks: 0
	});
});

test('imports nested Markdown deterministically, leaves notes unchanged and checks without writing', async (t) => {
	const { folder, output } = await fixture(t);
	await mkdir(join(folder, 'nested'));
	const note = join(folder, 'nested', 'Links to Physics.md');
	const content = `Private local explanation\nhttps://youtu.be/${video}?si=tracking\n`;
	await writeFile(note, content);
	await writeFile(join(folder, 'ignored.txt'), `https://youtu.be/${video}`);
	const before = hash(await readFile(note));
	const first = await importLocalCatalogue({ folder, output });
	assert.equal(first.catalogue.fileCount, 1);
	assert.equal(first.catalogue.entries[0].categories[0], 'science');
	assert.equal(first.catalogue.entries[0].sources[0].file, 'obsidian:nested-links-to-physics');
	assert.equal(hash(await readFile(note)), before);
	const writtenAt = (await stat(output)).mtimeMs;
	const second = await importLocalCatalogue({ folder, output, check: true });
	assert.equal(second.changed, false);
	assert.equal((await stat(output)).mtimeMs, writtenAt);
	assert.equal(hash(await readFile(note)), before);
	assert(!(await readFile(output, 'utf8')).includes(folder));
	await writeFile(note, `${content}\nhttps://youtu.be/KbyYTjfgZJI`);
	await assert.rejects(importLocalCatalogue({ folder, output, check: true }), /missing or stale/);
	assert.equal((await stat(output)).mtimeMs, writtenAt);
});

test('cannot write the generated catalogue into the source folder', async (t) => {
	const { folder, output } = await fixture(t);
	const source = join(folder, 'Links to Physics.md');
	const content = `https://youtu.be/${video}`;
	await writeFile(source, content);
	await assert.rejects(importLocalCatalogue({ folder, output: source }), /outside/);
	await assert.rejects(
		importLocalCatalogue({ folder, output: join(folder, 'new', 'catalogue.json') }),
		/outside/
	);
	assert.equal(await readFile(source, 'utf8'), content);
	await link(source, output);
	await assert.rejects(importLocalCatalogue({ folder, output }), /cannot be a link/);
	assert.equal(await readFile(source, 'utf8'), content);
	await assert.rejects(importLocalCatalogue({}), /--folder/);
});

test('rejects symlink/junction traversal rather than reading outside the selected folder', async (t) => {
	const { root, folder } = await fixture(t);
	const outside = join(root, 'outside');
	await mkdir(outside);
	await writeFile(join(outside, 'Linked.md'), `https://youtu.be/${video}`);
	await symlink(outside, join(folder, 'link'), process.platform === 'win32' ? 'junction' : 'dir');
	await assert.rejects(readLocalSources(folder), /Linked/);
	await assert.rejects(readLocalSources(join(folder, 'link')), /real directory/);
});

test('enforces file and total byte limits before accepting a local collection', async (t) => {
	const { folder } = await fixture(t);
	const oversized = join(folder, 'Oversized.md');
	await writeFile(oversized, Buffer.alloc(LIMITS.fileBytes + 1));
	await assert.rejects(readLocalSources(folder), /size limit/);
	await writeFile(oversized, Buffer.alloc(LIMITS.fileBytes));
	for (let index = 0; index < 4; index++)
		await writeFile(join(folder, `Another-${index}.md`), Buffer.alloc(LIMITS.fileBytes));
	await assert.rejects(readLocalSources(folder), /total size limit/);
});
