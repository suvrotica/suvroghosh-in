import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import sharp from 'sharp';
import { createSampleSources, renderSamples } from './render-lens-mirror-samples.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const geometryHashes = {
	calibration: '3904daa317a0dc8b191625c401ec7ea2927b3c6ece3cf839f00de0a7e547ba05',
	facade: '7d06e90c986c2c8279e3be26c6052405d435561bcba849c2fbd8fb3bad7ee959',
	portrait: 'ba4e830b3071b1653c127a9cd71bc78c3baee320417749d59bae6457577354de',
	corridor: 'ebcc07007989473d0c126c47975cc05f0713cb0300477f5870de2ea9e56b619f',
	typography: '475d32c704d76e7599bda18f9a2c3c5e5b2b8130a6e8dc5d7290794026e1e24b'
};

test('outlined labels preserve the original optical geometry and authored label placement', () => {
	const labels = [];
	const sources = createSampleSources((...args) => {
		labels.push(args);
		return '';
	});
	for (const [id, source] of Object.entries(sources))
		assert.equal(hash(source), geometryHashes[id]);
	assert.equal(labels.length, 47);
	// Captured from the original procedural source before changing text rendering.
	assert.equal(
		hash(JSON.stringify(labels)),
		'ea63243621778e0fb973b3a1849c2cefef789f647957caa0c023c8d49acfb124'
	);
});

test('all sample pixels are identical with normal and empty system-font discovery', async (t) => {
	const temporary = await mkdtemp(path.join(os.tmpdir(), 'lens-font-test-'));
	t.after(() => rm(temporary, { recursive: true, force: true }));
	const fonts = path.join(temporary, 'empty-fonts');
	const cache = path.join(temporary, 'cache');
	await mkdir(fonts);
	await mkdir(cache);
	const escapeXml = (value) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;');
	const configuration = path.join(temporary, 'fonts.conf');
	await writeFile(
		configuration,
		`<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd"><fontconfig><dir>${escapeXml(fonts.replaceAll('\\', '/'))}</dir><cachedir>${escapeXml(cache.replaceAll('\\', '/'))}</cachedir></fontconfig>`
	);
	const child = `
		import {createHash} from 'node:crypto';
		import sharp from 'sharp';
		import {createSampleSources} from './scripts/render-lens-mirror-samples.mjs';
		const hashes={};
		for(const [id,source] of Object.entries(createSampleSources())) {
			const pixels=await sharp(Buffer.from(source)).ensureAlpha().raw().toBuffer();
			hashes[id]=createHash('sha256').update(pixels).digest('hex');
		}
		console.log(JSON.stringify(hashes));
	`;
	const outputs = [];
	for (const env of [
		process.env,
		{ ...process.env, FONTCONFIG_FILE: configuration, FONTCONFIG_PATH: temporary }
	]) {
		const result = spawnSync(process.execPath, ['--input-type=module', '-e', child], {
			cwd: root,
			env,
			encoding: 'utf8',
			timeout: 30_000,
			maxBuffer: 128 * 1024
		});
		assert.ifError(result.error);
		assert.equal(result.status, 0, result.stderr);
		outputs.push(JSON.parse(result.stdout));
	}
	assert.deepEqual(outputs[1], outputs[0]);
	for (const source of Object.values(createSampleSources()))
		assert.doesNotMatch(source, /<text\b|font-family|@font-face|<foreignObject\b|<image\b/u);
	const manifest = JSON.parse(
		await readFile(
			path.join(root, 'static/images/visualizations/through-a-different-glass/samples.json')
		)
	);
	for (const [id, pixelHash] of Object.entries(outputs[0]))
		assert.equal(pixelHash, manifest.samples[id].pixelHash, `${id} differs from reviewed pixels`);
});

test('strict verification detects pixel and provenance changes without rewriting artifacts', async (t) => {
	const temporary = await mkdtemp(path.join(os.tmpdir(), 'lens-artifact-test-'));
	t.after(() => rm(temporary, { recursive: true, force: true }));
	const manifest = await renderSamples({ outputDirectory: temporary });
	await renderSamples({ outputDirectory: temporary, checking: true });
	const calibration = path.join(temporary, 'calibration.png');
	const original = await readFile(calibration);
	const pixels = await sharp(original).ensureAlpha().raw().toBuffer();
	pixels[0] ^= 1;
	const changed = await sharp(pixels, {
		raw: { width: manifest.width, height: manifest.height, channels: 4 }
	})
		.png()
		.toBuffer();
	await writeFile(calibration, changed);
	await assert.rejects(
		renderSamples({ outputDirectory: temporary, checking: true }),
		/calibration\.png differs from its procedural source/u
	);
	assert.deepEqual(await readFile(calibration), changed);
	await writeFile(calibration, original);
	manifest.samples.calibration.svgHash = '0'.repeat(64);
	const alteredManifest = JSON.stringify(manifest);
	await writeFile(path.join(temporary, 'samples.json'), alteredManifest);
	await assert.rejects(
		renderSamples({ outputDirectory: temporary, checking: true }),
		/source or label provenance changed/u
	);
	assert.equal(await readFile(path.join(temporary, 'samples.json'), 'utf8'), alteredManifest);
});
