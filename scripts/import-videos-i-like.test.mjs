import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createCatalogue, extractReferences } from './import-videos-i-like.mjs';

const COMMIT = '729fa4cc676ee2f26d946f2ef800127e52160b22';
const VIDEO = 'EkyAuG9RSSU';
const PLAYLIST = 'PLr2CZAfX_oc8Q-bi6M8rYlcVyb3DJEsHR';

test('extracts short/watch/embed/shorts/live links, HTML entities and source timestamps', () => {
	const references = extractReferences(`
<Ytp src="https://youtu.be/${VIDEO}?si=source&t=1h2m3s" />
[Watch](https://www.youtube.com/watch?v=${VIDEO}&amp;start=12)
<iframe src='https://www.youtube.com/embed/${VIDEO}'></iframe>
https://www.youtube.com/shorts/${VIDEO}.
<https://www.youtube.com/live/${VIDEO}>
https://www.youtube.com/playlist?list=${PLAYLIST}&index=3
`);
	assert.equal(references.length, 6);
	assert.equal(references[0].parsed.startSeconds, 3723);
	assert.equal(references[0].originalUrl, `https://youtu.be/${VIDEO}?si=source&t=1h2m3s`);
	assert.equal(references[1].parsed.startSeconds, 12);
	assert.match(references[1].originalUrl, /&amp;/);
	for (const reference of references.slice(0, 5)) assert.equal(reference.parsed.videoId, VIDEO);
	assert.equal(references[5].parsed.playlistId, PLAYLIST);
	assert.equal(references[5].parsed.index, 2);
});

test('ignores lookalike hosts, credentials, ports, invalid IDs and malformed selector values', () => {
	const references = extractReferences(`
https://youtube.com.evil.example/watch?v=${VIDEO}
https://example.com/youtu.be/${VIDEO}
https://youtube.com@evil.example/watch?v=${VIDEO}
https://user@youtube.com/watch?v=${VIDEO}
https://youtube.com:443/watch?v=${VIDEO}
https://youtu.be/short
https://youtube.com/watch?v=${VIDEO}&v=${VIDEO}
https://youtu.be/${VIDEO}?t=bad
https://youtube.com/playlist?list=${PLAYLIST}&index=0
javascript:alert('not a source')
`);
	assert.deepEqual(references, []);
});

test('deduplicates cards while preserving each occurrence, order, timestamps and memberships', () => {
	const files = [
		{ path: 'drafts/OldPhotos.md', content: `<Ytp src="https://youtu.be/${VIDEO}?t=12" />` },
		{ path: 'drafts/MedDoc.md', content: `<Ytp src="https://youtube.com/watch?v=${VIDEO}" />` },
		{
			path: 'drafts/MathDoc.md',
			content: `<Ytp src="https://youtu.be/QL4_4GAWvPs" />\n<Ytp src="https://youtu.be/QL4_4GAWvPs?t=60" />`
		}
	];
	const result = createCatalogue(files, COMMIT);
	assert.equal(result.fileCount, 3);
	assert.equal(result.referenceCount, 4);
	assert.equal(result.entries.length, 2);
	const repeated = result.entries.find((entry) => entry.id === VIDEO);
	assert.deepEqual(repeated.categories, ['documentaries', 'other']);
	assert.deepEqual(
		repeated.sources.map((source) => source.file),
		['drafts/MedDoc.md', 'drafts/OldPhotos.md']
	);
	assert.equal(repeated.sources[1].startSeconds, 12);
	assert.equal(repeated.url, `https://www.youtube.com/watch?v=${VIDEO}`);
	assert.equal(
		repeated.sources[0].url,
		`https://github.com/suvrotica/SuvroTuitionBlog/blob/${COMMIT}/drafts/MedDoc.md`
	);
	assert.deepEqual(result.entries[0].categories, ['documentaries', 'maths']);
	assert.deepEqual(
		result.entries[0].sources.map((source) => source.order),
		[1, 2]
	);
	assert.deepEqual(result, createCatalogue([...files].reverse(), COMMIT));
});

test('keeps playlist/Mix identity and classifies Bengali films from the actual section', () => {
	const result = createCatalogue(
		[
			{
				path: 'drafts/Bengali.md',
				content: `**Movies**\n<Ytp src="https://youtu.be/${VIDEO}" />\n**Music**\n<Ytp src="https://youtu.be/HvOXmnTJYRc" />`
			},
			{
				path: 'drafts/Hindi.md',
				content: `<Ytp src="https://youtube.com/playlist?list=RD6sfHEAeNklM&playnext=1" />`
			},
			{
				path: 'drafts/nested/source file.md',
				content: `[A playlist](https://youtube.com/watch?v=${VIDEO}&list=${PLAYLIST}&index=2&t=42)`
			}
		],
		COMMIT
	);
	assert.deepEqual(result.entries[0].categories, ['films']);
	assert.deepEqual(result.entries[0].musicCategories, []);
	assert.deepEqual(result.entries[1].categories, ['music']);
	assert.deepEqual(result.entries[1].musicCategories, ['bengali']);
	assert.equal(result.entries[2].kind, 'mix');
	assert.equal(result.entries[3].kind, 'playlist');
	assert.equal(result.entries[3].sources[0].index, 1);
	assert.equal(result.entries[3].sources[0].startSeconds, 42);
	assert.match(result.entries[3].sources[0].url, /nested\/source%20file\.md$/);
});

test('checked-in inventory has the complete pinned source and internally valid provenance', async () => {
	const catalogue = JSON.parse(
		await readFile(
			new URL('../src/lib/visualizations/videos-i-like/catalogue.json', import.meta.url),
			'utf8'
		)
	);
	assert.equal(catalogue.commit, COMMIT);
	assert.equal(catalogue.fileCount, 108);
	assert.equal(catalogue.referenceCount, 96);
	assert.equal(catalogue.entries.length, 95);
	assert.equal(catalogue.entries.filter((entry) => entry.kind === 'video').length, 89);
	assert.equal(catalogue.entries.filter((entry) => entry.kind === 'playlist').length, 5);
	assert.equal(catalogue.entries.filter((entry) => entry.kind === 'mix').length, 1);
	assert.equal(
		new Set(catalogue.entries.flatMap((entry) => entry.sources.map((source) => source.file))).size,
		16
	);
	assert.equal(new Set(catalogue.entries.map((entry) => entry.key)).size, 95);
	assert.equal(
		catalogue.entries.reduce((sum, entry) => sum + entry.sources.length, 0),
		96
	);
	assert.equal(catalogue.entries.filter((entry) => entry.categories.includes('films')).length, 13);
	for (const entry of catalogue.entries) {
		assert.equal(entry.key, `${entry.kind}:${entry.id}`);
		assert.ok(entry.sources.length > 0);
		assert.ok(entry.categories.length > 0);
		assert.equal(extractReferences(entry.url).length, 1);
		for (const source of entry.sources) {
			assert.ok(source.url.includes(`/blob/${COMMIT}/drafts/`));
			assert.ok(Number.isInteger(source.order) && source.order > 0);
			const [{ parsed }] = extractReferences(source.originalUrl);
			assert.equal(parsed.playlistId ?? parsed.videoId, entry.id);
		}
	}
});
