import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';
import {
	assertCleanSketchSource,
	discoverSketchSources,
	generateSketchArtifacts
} from './lib/sketch-manifest.mjs';

const root = resolve(import.meta.dirname, '..');
const sketchDirectory = resolve(root, 'static', 'sketch');
const { manifest } = await generateSketchArtifacts({
	sketchDirectory,
	cachePath: resolve(root, 'scripts', 'sketch-generation-manifest.json'),
	verifyOnly: true
});
const report = JSON.parse(
	await readFile(resolve(root, 'scripts', 'sketch-import-report.json'), 'utf8')
);
const hash = (buffer) => createHash('sha256').update(buffer).digest('hex');
const cleanPublicPaths = new Set();
let bytes = 0;
for (const artwork of manifest) {
	for (const asset of [artwork.source, ...Object.values(artwork.variants)]) {
		const url = new URL(asset.src, 'https://suvroghosh.in');
		assert.ok(url.pathname.startsWith('/sketch/'), `Unexpected sketch path: ${asset.src}`);
		const path = resolve(root, 'static', decodeURIComponent(url.pathname.slice(1)));
		assert.ok(
			path.startsWith(sketchDirectory + sep),
			`Path escapes sketch directory: ${asset.src}`
		);
		const contents = await readFile(path);
		assert.equal(
			url.searchParams.get('v'),
			hash(contents).slice(0, 16),
			`Stale cache version: ${asset.src}`
		);
		assert.equal(contents.length, asset.bytes, `Stale size: ${asset.src}`);
		assertCleanSketchSource(contents, {}, asset.src);
		cleanPublicPaths.add(path);
		bytes += contents.length;
	}
}
async function allGeneratedFiles(directory) {
	const result = [];
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const path = resolve(directory, entry.name);
		if (entry.isDirectory()) result.push(...(await allGeneratedFiles(path)));
		else result.push(path);
	}
	return result;
}
for (const path of [
	...(await discoverSketchSources(sketchDirectory)),
	...(await allGeneratedFiles(resolve(sketchDirectory, '_generated')))
]) {
	assert.ok(cleanPublicPaths.has(path), `Unreferenced public image: ${relative(root, path)}`);
}
const masters = new Map(report.publicMasters.map((entry) => [entry.filename, entry]));
assert.equal(
	masters.size,
	manifest.length,
	'Import accounting does not match the published collection.'
);
for (const artwork of manifest) {
	const filename = decodeURIComponent(
		new URL(artwork.source.src, 'https://suvroghosh.in').pathname.split('/').at(-1)
	);
	assert.ok(masters.has(filename), `Unaccounted artwork: ${filename}`);
	assert.equal(
		hash(await readFile(resolve(sketchDirectory, filename))),
		masters.get(filename).sha256,
		`Master changed after reconciliation: ${filename}`
	);
}
for (const input of report.inputs)
	assert.ok(masters.has(input.canonicalSource), `Unaccounted input: ${input.filename}`);
assert.equal(report.inputs.length, report.summary.inputFiles);
const order = manifest.map((artwork) => artwork.galleryOrder);
assert.ok(
	order.every((value) => Number.isSafeInteger(value) && value >= 0),
	'Missing stable gallery order.'
);
assert.equal(new Set(order).size, order.length, 'Duplicate gallery order.');
console.log(
	`Verified ${manifest.length} unique artworks, ${cleanPublicPaths.size} clean/versioned public image files, ${report.inputs.length} accounted inputs, ${bytes} bytes.`
);
console.log(
	`Perceptual candidates awaiting review: ${report.summary.unreviewedPerceptualCandidates}. Method limitations are recorded in scripts/sketch-import-report.json.`
);
