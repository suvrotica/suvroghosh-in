import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { bodyHash, postRevisionHash, splitPost, freshnessIssue } from './generate-post-tags.mjs';
import { refreshSeoMetadataEntry } from './refresh-seo-metadata.mjs';

const description =
	'An essay about hospital record exchange, local workflows and the difficulty of preserving clinical meaning.';
const original = `---\ntitle: An original title\ndescription: Short\ndate: '2026-01-01'\ncategory: Healthcare IT\ntags: [Records]\npublished: true\nthumbnail: /images/unchanged.jpg\n---\nThe original sentence.  \n\nAnother paragraph.\n`;
const corrected = original.replace(
	'description: Short',
	`description: "${description}"\nthumbnailAlt: "A black cup on a woven grey surface, viewed from above."`
);
const before = splitPost(original, 'fixture.md');
const cached = {
	hashVersion: 2,
	bodyHash: bodyHash(before.body),
	revisionHash: postRevisionHash(before),
	generatedTags: ['Records'],
	generatorVersion: '2026-07-22.1'
};
const run = (after = corrected, cache = cached, prior = original) =>
	refreshSeoMetadataEntry(prior, after, cache, 'fixture.md');

test('refreshes only a proven description/alt revision without inventing an article date', () => {
	const updated = run();
	assert.equal(updated.revisionHash, postRevisionHash(splitPost(corrected, 'fixture.md')));
	assert.deepEqual({ ...updated, revisionHash: cached.revisionHash }, cached);
	assert.ok(!('dateModified' in updated));
	const after = splitPost(corrected, 'fixture.md');
	assert.equal(freshnessIssue(updated, after, bodyHash(after.body), postRevisionHash(after)), null);
});

test('accepts platform line endings but rejects even a prose whitespace edit', () => {
	assert.doesNotThrow(() => run(corrected.replaceAll('\n', '\r\n')));
	assert.throws(() => run(corrected.replace('sentence.  ', 'sentence. ')), /prose changed/);
	assert.throws(
		() => run(corrected.replace('original sentence', 'rewritten sentence')),
		/prose changed/
	);
});

for (const [name, changed] of [
	['title', corrected.replace('An original title', 'A replacement title')],
	['canonical category', corrected.replace('category: Healthcare IT', 'category: Science')],
	['publication date', corrected.replace("date: '2026-01-01'", "date: '2026-01-02'")],
	[
		'revision date',
		corrected.replace("date: '2026-01-01'", "date: '2026-01-01'\ndateModified: '2026-10-21'")
	],
	['artwork path', corrected.replace('/images/unchanged.jpg', '/images/replacement.jpg')],
	['tags', corrected.replace('tags: [Records]', 'tags: [New]')],
	[
		'visible FAQ',
		corrected.replace('tags: [Records]', 'tags: [Records]\nfaq: [{question: New, answer: Added}]')
	],
	['unknown metadata', corrected.replace('tags: [Records]', 'tags: [Records]\nother: value')]
])
	test(`rejects a change to ${name}`, () =>
		assert.throws(() => run(changed), /only description and thumbnailAlt/));

test('rejects absent, stale and incompatible caches instead of manufacturing a baseline', () => {
	for (const cache of [
		undefined,
		{ ...cached, hashVersion: 1 },
		{ ...cached, bodyHash: 'stale' },
		{ ...cached, revisionHash: 'stale' }
	]) {
		assert.throws(
			() => refreshSeoMetadataEntry(original, corrected, cache, 'fixture.md'),
			/cache does not match/
		);
	}
});

test('rejects invalid descriptions, missing alt and unpublished input', () => {
	assert.throws(() => run(corrected.replace(description, 'Too short')), /70–165/);
	assert.throws(() => run(corrected.replace(description, 'x'.repeat(166))), /70–165/);
	assert.throws(() => run(corrected.replace(/thumbnailAlt: [^\n]+\n/, '')), /authored alternative/);
	const draft = original.replace('published: true', 'published: false');
	const parsed = splitPost(draft, 'fixture.md');
	assert.throws(
		() =>
			run(
				corrected.replace('published: true', 'published: false'),
				{ ...cached, revisionHash: postRevisionHash(parsed) },
				draft
			),
		/unpublished/
	);
});

test('ordinary publishing still rejects an unrefreshed revision with no update date', () => {
	const after = splitPost(corrected, 'fixture.md');
	assert.match(
		freshnessIssue(cached, after, bodyHash(after.body), postRevisionHash(after)),
		/add dateModified/
	);
});

const command = fileURLToPath(new URL('./refresh-seo-metadata.mjs', import.meta.url));
function fixture(action) {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'suvro-seo-refresh-'));
	try {
		const git = (...args) =>
			execFileSync('git', args, {
				cwd: directory,
				encoding: 'utf8',
				stdio: ['ignore', 'pipe', 'pipe']
			}).trim();
		git('init', '--quiet');
		git('config', 'user.email', 'fixture@example.invalid');
		git('config', 'user.name', 'SEO fixture');
		fs.mkdirSync(path.join(directory, 'src/lib/posts'), { recursive: true });
		fs.mkdirSync(path.join(directory, 'scripts'));
		const manifest = { version: '2026-07-22.1', hashVersion: 2, posts: {} };
		for (const name of ['first', 'second']) {
			fs.writeFileSync(path.join(directory, `src/lib/posts/${name}.md`), original);
			manifest.posts[`src/lib/posts/${name}.md`] = cached;
		}
		const manifestFile = path.join(directory, 'scripts/post-tags-manifest.json');
		fs.writeFileSync(manifestFile, JSON.stringify(manifest));
		git('add', '.');
		git('commit', '--quiet', '-m', 'Baseline fixture');
		action({ directory, manifestFile, baseline: git('rev-parse', 'HEAD'), manifest });
	} finally {
		const actual = fs.realpathSync(directory);
		const parent = fs.realpathSync(path.dirname(directory));
		assert.ok(
			actual.startsWith(parent + path.sep) && path.basename(actual).startsWith('suvro-seo-refresh-')
		);
		fs.rmSync(actual, { recursive: true, force: true });
	}
}

test('CLI resolves a committed baseline and writes only corrected revision hashes', () =>
	fixture(({ directory, manifestFile, baseline, manifest }) => {
		fs.writeFileSync(path.join(directory, 'src/lib/posts/first.md'), corrected);
		const result = spawnSync(process.execPath, [command, '--base', baseline], {
			cwd: directory,
			encoding: 'utf8'
		});
		assert.equal(result.status, 0, result.stderr);
		const output = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
		assert.deepEqual(
			output.posts['src/lib/posts/second.md'],
			manifest.posts['src/lib/posts/second.md']
		);
		assert.deepEqual(output.posts['src/lib/posts/first.md'], run());
	}));

test('CLI validates the whole batch before writing and rejects missing baselines', () =>
	fixture(({ directory, manifestFile, baseline }) => {
		fs.writeFileSync(path.join(directory, 'src/lib/posts/first.md'), corrected);
		fs.writeFileSync(
			path.join(directory, 'src/lib/posts/second.md'),
			corrected.replace('original sentence', 'changed prose')
		);
		const unchanged = fs.readFileSync(manifestFile, 'utf8');
		const result = spawnSync(process.execPath, [command, '--base', baseline], {
			cwd: directory,
			encoding: 'utf8'
		});
		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /prose changed/);
		assert.equal(fs.readFileSync(manifestFile, 'utf8'), unchanged);
		const missing = spawnSync(process.execPath, [command, '--base', 'missing-revision'], {
			cwd: directory,
			encoding: 'utf8'
		});
		assert.notEqual(missing.status, 0);
		assert.equal(fs.readFileSync(manifestFile, 'utf8'), unchanged);
	}));
