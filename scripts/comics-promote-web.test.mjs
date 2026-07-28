import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { promoteWebAssets, sha256 } from './comics/lib.mjs';

const PANEL_COUNT = 338;
const SOURCE_DIGEST = 'a'.repeat(64);

function tinyWebp(label) {
	const payload = Buffer.from(label, 'utf8');
	const bytes = Buffer.alloc(12 + payload.length);
	bytes.write('RIFF', 0, 'ascii');
	bytes.writeUInt32LE(bytes.length - 8, 4);
	bytes.write('WEBP', 8, 'ascii');
	payload.copy(bytes, 12);
	return bytes;
}

async function writeJson(filename, value) {
	await fs.mkdir(path.dirname(filename), { recursive: true });
	await fs.writeFile(filename, `${JSON.stringify(value, null, 2)}\n`);
}

async function makeFixture() {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'comic-promote-web-'));
	const episodeDirectory = path.join(
		root,
		'src',
		'lib',
		'comics',
		'fixture-town',
		'episodes',
		'001-fixture-album'
	);
	const inputDirectory = path.join(episodeDirectory, 'exports', 'web');
	const panelIds = Array.from(
		{ length: PANEL_COUNT },
		(_, index) => `p${String(index + 1).padStart(3, '0')}-01`
	);
	const panels = panelIds.map((id) => ({
		id,
		art: {
			status: 'final',
			final: `panels/approved/${id}.png`
		}
	}));
	const entries = await Promise.all(
		panelIds.map(async (panelId, index) => {
			const bytes = tinyWebp(`${panelId}-${index}`);
			const file = `exports/web/assets/${panelId}-1280w.webp`;
			await fs.mkdir(path.join(inputDirectory, 'assets'), { recursive: true });
			await fs.writeFile(path.join(episodeDirectory, ...file.split('/')), bytes);
			return {
				page: index + 1,
				panel: 1,
				panelId,
				status: 'final',
				assets: [
					{
						format: 'webp',
						width: 1280,
						file,
						bytes: bytes.length,
						sha256: sha256(bytes)
					}
				]
			};
		})
	);
	const metadata = {
		id: '001',
		slug: 'fixture-album',
		seriesSlug: 'fixture-town'
	};
	const pages = [{ page: 1, panels }];
	const sources = {
		root,
		episodeDirectory,
		metadata,
		pages,
		sourceDigest: SOURCE_DIGEST
	};
	await writeJson(path.join(episodeDirectory, 'generated', 'episode.json'), {
		sourceDigest: SOURCE_DIGEST,
		metadata,
		pages
	});
	await writeJson(path.join(inputDirectory, 'manifest.json'), {
		format: 'suvroghosh-comic-web-export',
		formatVersion: 1,
		episodeId: '001',
		sourceDigest: SOURCE_DIGEST,
		entries
	});
	return { root, episodeDirectory, inputDirectory, panelIds, entries, sources };
}

test('web promotion is dry-run by default, confirmed explicitly, and idempotent', async (t) => {
	const fixture = await makeFixture();
	t.after(() => fs.rm(fixture.root, { recursive: true, force: true }));

	const dryRun = await promoteWebAssets({
		sources: fixture.sources,
		inputDirectory: fixture.inputDirectory
	});
	assert.equal(dryRun.confirmed, false);
	assert.equal(dryRun.panelCount, PANEL_COUNT);
	assert.equal(dryRun.copyCount, PANEL_COUNT);
	assert.equal(dryRun.changed.length, 0);
	await assert.rejects(fs.access(dryRun.runtimeMapPath));
	await assert.rejects(fs.access(dryRun.destinationDirectory));

	const confirmed = await promoteWebAssets({
		sources: fixture.sources,
		inputDirectory: fixture.inputDirectory,
		confirm: true
	});
	assert.equal(confirmed.copied.length, PANEL_COUNT);
	assert.equal(confirmed.runtimeMapChanged, true);
	const runtimeMap = JSON.parse(await fs.readFile(confirmed.runtimeMapPath, 'utf8'));
	assert.equal(runtimeMap.sourceDigest, SOURCE_DIGEST);
	assert.equal(Object.keys(runtimeMap.panels).length, PANEL_COUNT);
	const firstUrl = runtimeMap.panels[fixture.panelIds[0]];
	assert.match(
		firstUrl,
		/^\/images\/comics\/fixture-town\/fixture-album\/p001-01-[a-f0-9]{64}\.webp$/
	);

	const secondRun = await promoteWebAssets({
		sources: fixture.sources,
		inputDirectory: fixture.inputDirectory,
		confirm: true
	});
	assert.equal(secondRun.existingCount, PANEL_COUNT);
	assert.equal(secondRun.copyCount, 0);
	assert.deepEqual(secondRun.changed, []);

	const firstTarget = path.resolve(fixture.root, 'static', ...firstUrl.slice(1).split('/'));
	await fs.writeFile(firstTarget, tinyWebp('differing-overwrite'));
	await assert.rejects(
		promoteWebAssets({
			sources: fixture.sources,
			inputDirectory: fixture.inputDirectory,
			confirm: true
		}),
		/Refusing to overwrite differing promoted asset/
	);
});

test('web promotion rejects stale digests, placeholders, and altered staged bytes', async (t) => {
	const fixture = await makeFixture();
	t.after(() => fs.rm(fixture.root, { recursive: true, force: true }));
	const manifestPath = path.join(fixture.inputDirectory, 'manifest.json');
	const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));

	manifest.sourceDigest = 'b'.repeat(64);
	await writeJson(manifestPath, manifest);
	await assert.rejects(
		promoteWebAssets({
			sources: fixture.sources,
			inputDirectory: fixture.inputDirectory
		}),
		/invalid or stale/
	);

	manifest.sourceDigest = SOURCE_DIGEST;
	manifest.entries[0].placeholder = { file: 'placeholders/p001-01.svg' };
	await writeJson(manifestPath, manifest);
	await assert.rejects(
		promoteWebAssets({
			sources: fixture.sources,
			inputDirectory: fixture.inputDirectory
		}),
		/containing placeholders/
	);

	delete manifest.entries[0].placeholder;
	await writeJson(manifestPath, manifest);
	const firstStaged = path.join(
		fixture.episodeDirectory,
		...fixture.entries[0].assets[0].file.split('/')
	);
	await fs.writeFile(firstStaged, tinyWebp('altered-after-manifest'));
	await assert.rejects(
		promoteWebAssets({
			sources: fixture.sources,
			inputDirectory: fixture.inputDirectory
		}),
		/does not match its declared bytes, SHA-256, and WebP signature/
	);
});
