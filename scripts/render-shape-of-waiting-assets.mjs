import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { build } from 'esbuild';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'static/images/visualizations/shape-of-waiting');
const sources = [
	'types.ts',
	'presets.ts',
	'presentation.ts',
	'engine.ts',
	'drawing.ts',
	'serialization.ts',
	'export.ts'
]
	.map((name) => `src/lib/visualizations/shape-of-waiting/${name}`)
	.concat('scripts/render-shape-of-waiting-assets.mjs');
const hash = createHash('sha256');
for (const source of sources)
	hash
		.update(source)
		.update((await readFile(path.join(root, source), 'utf8')).replace(/\r\n/g, '\n'));
const sourceHash = hash.digest('hex');
const files = {
	'shape-of-waiting-social.png': [1200, 630],
	'shape-of-waiting-poster.png': [1600, 1000]
};
const pixelHash = async (buffer) =>
	createHash('sha256')
		.update(await sharp(buffer).ensureAlpha().raw().toBuffer())
		.digest('hex');
if (process.argv.includes('--check')) {
	const manifest = JSON.parse(await readFile(path.join(output, 'assets.json'), 'utf8'));
	if (manifest.sourceHash !== sourceHash)
		throw new Error('Waiting artwork is stale; run npm run shape-of-waiting:assets.');
	for (const [name, [width, height]] of Object.entries(files)) {
		const bytes = await readFile(path.join(output, name));
		const actual = await sharp(bytes).metadata();
		if (
			actual.width !== width ||
			actual.height !== height ||
			(await pixelHash(bytes)) !== manifest.files[name].pixelSha256
		)
			throw new Error(`Waiting artwork dimensions or pixels changed: ${name}`);
	}
	const report = JSON.parse(
		await readFile(path.join(output, 'shape-of-waiting-poster.json'), 'utf8')
	);
	if (
		report.seed !== manifest.settings.seed ||
		report.modelVersion !== manifest.modelVersion ||
		report.snapshotTime !== manifest.snapshotTime
	)
		throw new Error('Waiting receipt and artwork provenance disagree.');
	console.log('Shape of Waiting: two model-derived plates, pixel hashes and provenance verified.');
} else {
	const bundle = await build({
		stdin: {
			contents: `import {simulate} from './src/lib/visualizations/shape-of-waiting/engine.ts'; import {OPENING_SETTINGS} from './src/lib/visualizations/shape-of-waiting/presentation.ts'; import {MODEL_VERSION} from './src/lib/visualizations/shape-of-waiting/presets.ts'; import {encodeReplay} from './src/lib/visualizations/shape-of-waiting/serialization.ts'; import {receiptCanvas,receiptReport,CANONICAL_URL} from './src/lib/visualizations/shape-of-waiting/export.ts'; window.waitingCapture={simulate,OPENING_SETTINGS,MODEL_VERSION,encodeReplay,receiptCanvas,receiptReport,CANONICAL_URL};`,
			resolveDir: root
		},
		bundle: true,
		write: false,
		format: 'iife',
		platform: 'browser',
		target: 'es2022'
	});
	const browser = await chromium.launch({
		channel: process.env.PLAYWRIGHT_CHANNEL?.trim() || (process.env.CI ? undefined : 'chrome'),
		headless: true
	});
	try {
		const page = await browser.newPage({ serviceWorkers: 'block' });
		await page.setContent(
			'<!doctype html><html lang="en"><title>Waiting capture</title><body></body></html>'
		);
		await page.addScriptTag({ content: bundle.outputFiles[0].text });
		const result = await page.evaluate((definitions) => {
			const {
				simulate,
				OPENING_SETTINGS,
				MODEL_VERSION,
				encodeReplay,
				receiptCanvas,
				receiptReport,
				CANONICAL_URL
			} = window.waitingCapture;
			const run = simulate(OPENING_SETTINGS);
			const time = OPENING_SETTINGS.window * 0.78;
			const url = `${CANONICAL_URL}#waiting=${encodeReplay({ version: MODEL_VERSION, settings: OPENING_SETTINGS, baseline: null, time })}`;
			return {
				settings: OPENING_SETTINGS,
				modelVersion: MODEL_VERSION,
				snapshotTime: time,
				report: receiptReport(run, null, time, url),
				images: Object.fromEntries(
					Object.entries(definitions).map(([name, [width, height]]) => [
						name,
						receiptCanvas(run, null, time, url, width, height).toDataURL('image/png').split(',')[1]
					])
				)
			};
		}, files);
		await mkdir(output, { recursive: true });
		const metadata = {};
		for (const [name, base64] of Object.entries(result.images)) {
			const bytes = Buffer.from(base64, 'base64');
			await writeFile(path.join(output, name), bytes);
			metadata[name] = {
				width: files[name][0],
				height: files[name][1],
				pixelSha256: await pixelHash(bytes)
			};
		}
		await writeFile(
			path.join(output, 'shape-of-waiting-poster.json'),
			JSON.stringify(result.report, null, 2) + '\n'
		);
		await writeFile(
			path.join(output, 'assets.json'),
			JSON.stringify(
				{
					sourceHash,
					sources,
					captureMode: 'bundled-browser-source',
					modelVersion: result.modelVersion,
					settings: result.settings,
					snapshotTime: result.snapshotTime,
					files: metadata
				},
				null,
				2
			) + '\n'
		);
		console.log(
			'Shape of Waiting: captured actual engine/export sources into two publication plates.'
		);
	} finally {
		await browser.close();
	}
}
