import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'static/images/visualizations/missing-data');
const manifestPath = path.join(output, 'assets.json');
const inputs = [
	'src/lib/visualizations/missing-data/types.ts',
	'src/lib/visualizations/missing-data/model.ts',
	'src/lib/visualizations/missing-data/colors.ts',
	'src/lib/visualizations/missing-data/renderer.ts',
	'src/lib/visualizations/missing-data/export.ts',
	'scripts/render-missing-data-assets.mjs'
];
const sourceHash = createHash('sha256');
for (const input of inputs) {
	sourceHash
		.update(input)
		.update((await readFile(path.join(root, input), 'utf8')).replace(/\r\n/g, '\n'));
}
const fingerprint = sourceHash.digest('hex');
const files = {
	'missing-data-social.png': { width: 1200, height: 630, format: 'social' },
	'missing-data-poster.png': { width: 1800, height: 1300, format: 'full' }
};

async function pixelHash(bytes) {
	const pixels = await sharp(bytes).ensureAlpha().raw().toBuffer();
	return createHash('sha256').update(pixels).digest('hex');
}

if (process.argv.includes('--check')) {
	const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
	if (manifest.sourceHash !== fingerprint) {
		throw new Error(
			'Missing-data artwork is stale. Run npm run missing-data:assets with a dev server.'
		);
	}
	for (const [name, expected] of Object.entries(files)) {
		const bytes = await readFile(path.join(output, name));
		const metadata = await sharp(bytes).metadata();
		if (metadata.width !== expected.width || metadata.height !== expected.height) {
			throw new Error(`Invalid missing-data artwork dimensions: ${name}`);
		}
		if (manifest.files[name]?.pixelSha256 !== (await pixelHash(bytes))) {
			throw new Error(`Missing-data artwork pixels have changed: ${name}`);
		}
	}
	const report = JSON.parse(await readFile(path.join(output, 'missing-data-poster.json'), 'utf8'));
	if (report.modelVersion !== manifest.modelVersion || report.seed !== manifest.settings.seed) {
		throw new Error('The missing-data poster report does not match its provenance.');
	}
	console.log('Missing data: two model-derived publication plates and their provenance verified.');
} else {
	await mkdir(output, { recursive: true });
	let browser;
	try {
		browser = await chromium.launch({
			channel: process.env.PLAYWRIGHT_CHANNEL?.trim() || (process.env.CI ? undefined : 'chrome'),
			headless: true
		});
		const page = await browser.newPage({
			viewport: { width: 1200, height: 800 },
			bypassCSP: true
		});
		const baseURL = process.env.MISSING_DATA_BASE_URL || 'http://127.0.0.1:4277';
		let captureMode = 'browser-source-module';
		try {
			// A same-origin static document avoids loading the site's unrelated homepage runtime.
			await page.goto(new URL('/robots.txt', baseURL).href, {
				waitUntil: 'domcontentloaded',
				timeout: 10_000
			});
			await page.evaluate(async () => {
				const [model, exporter] = await Promise.all([
					import('/src/lib/visualizations/missing-data/model.ts'),
					import('/src/lib/visualizations/missing-data/export.ts')
				]);
				window.__missingDataCapture = { ...model, ...exporter };
			});
		} catch {
			// Production previews omit /src. Bundle those same sources for an equivalent local capture.
			captureMode = 'bundled-browser-source';
			const bundle = await build({
				stdin: {
					contents: `import * as model from './src/lib/visualizations/missing-data/model.ts';
					import * as exporter from './src/lib/visualizations/missing-data/export.ts';
					window.__missingDataCapture = {...model, ...exporter};`,
					resolveDir: root
				},
				bundle: true,
				write: false,
				format: 'iife',
				platform: 'browser',
				target: 'es2022'
			});
			await page.setContent('<!doctype html><title>Missing-data publication capture</title>');
			await page.addScriptTag({ content: bundle.outputFiles[0].text });
		}
		const captured = await page.evaluate(() => {
			const { buildExperiment, DEFAULT_SETTINGS, renderFingerprint, fingerprintReport } =
				window.__missingDataCapture;
			const experiment = buildExperiment({
				...DEFAULT_SETTINGS,
				scenario: 'dropout',
				view: 'time',
				rate: 0.4,
				ordering: 'dropout'
			});
			const canvas = document.createElement('canvas');
			const images = {};
			for (const format of ['social', 'full']) {
				renderFingerprint(canvas, experiment, format);
				images[format] = canvas.toDataURL('image/png').split(',')[1];
			}
			return { images, report: fingerprintReport(experiment) };
		});
		const manifest = {
			version: 1,
			modelVersion: captured.report.modelVersion,
			sourceHash: fingerprint,
			captureMode,
			provenance:
				'The actual seeded missing-data model and shared fingerprint Canvas renderer. The WebGL explorer and these plates use the same fixed score-point colours and provenance markers. PNG compression is lossless.',
			settings: captured.report.parameters,
			files: {}
		};
		for (const [name, info] of Object.entries(files)) {
			const bytes = await sharp(Buffer.from(captured.images[info.format], 'base64'))
				.png({ compressionLevel: 9 })
				.toBuffer();
			await writeFile(path.join(output, name), bytes);
			manifest.files[name] = {
				width: info.width,
				height: info.height,
				bytes: bytes.length,
				pixelSha256: await pixelHash(bytes)
			};
			console.log(
				`Captured ${name}: ${info.width} × ${info.height}, ${Math.round(bytes.length / 1024)} KiB`
			);
		}
		await writeFile(
			path.join(output, 'missing-data-poster.json'),
			`${JSON.stringify(captured.report, null, 2)}\n`
		);
		await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
	} finally {
		await browser?.close();
	}
}
