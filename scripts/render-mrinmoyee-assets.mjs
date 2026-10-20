import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { build } from 'esbuild';
import { DEFAULT_DESIGN, PRESETS } from '../src/lib/visualizations/mrinmoyee/config.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'static/images/visualizations/mrinmoyee');
const manifestPath = path.join(output, 'assets.json');
const inputs = [
	'src/lib/visualizations/mrinmoyee/types.ts',
	'src/lib/visualizations/mrinmoyee/config.ts',
	'src/lib/visualizations/mrinmoyee/sculpture.ts',
	'src/lib/visualizations/mrinmoyee/renderer.ts',
	'scripts/render-mrinmoyee-assets.mjs'
];
const sourceHash = createHash('sha256');
for (const input of inputs)
	sourceHash
		.update(input)
		.update((await readFile(path.join(root, input), 'utf8')).replace(/\r\n/g, '\n'));
const fingerprint = sourceHash.digest('hex');
const files = [
	'mrinmoyee-poster.jpg',
	'mrinmoyee-social.jpg',
	...PRESETS.map((preset) => `preset-${preset.id}.jpg`)
];

if (process.argv.includes('--check')) {
	const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
	if (manifest.sourceHash !== fingerprint)
		throw new Error('Mrinmoyee artwork is stale. Run npm run mrinmoyee:assets.');
	for (const name of files) {
		const bytes = await readFile(path.join(output, name));
		const metadata = await sharp(bytes).metadata();
		if (bytes.length > 750 * 1024 || !metadata.width || !metadata.height)
			throw new Error(`Invalid publication artwork: ${name}`);
		if (
			manifest.files[name]?.width !== metadata.width ||
			manifest.files[name]?.height !== metadata.height
		)
			throw new Error(`Artwork dimensions changed: ${name}`);
	}
	console.log(`Mrinmoyee: ${files.length} renderer captures verified against current source.`);
} else {
	await mkdir(output, { recursive: true });
	let browser;
	try {
		// Bundle the same production renderer directly: no mock, server, or page artwork.
		const bundle = await build({
			stdin: {
				contents: `import { createAtelierRenderer } from './src/lib/visualizations/mrinmoyee/renderer.ts';
				window.loadCapture = (design) => {
					window.captureRenderer?.dispose();
					const canvas = document.createElement('canvas');
					canvas.style.cssText = 'display:block;width:100%;height:100%';
					document.body.replaceChildren(canvas);
					window.captureRenderer = createAtelierRenderer(canvas, design, {quality:'high',presentation:false,ambientMotion:false,reducedMotion:true});
					window.captureRenderer.thumbnail();
				};`,
				resolveDir: root
			},
			bundle: true,
			write: false,
			format: 'iife',
			platform: 'browser',
			target: 'es2022'
		});
		browser = await chromium.launch({
			channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome',
			headless: true,
			args: ['--enable-unsafe-swiftshader']
		});
		const page = await browser.newPage({
			viewport: { width: 1200, height: 1050 },
			deviceScaleFactor: 1,
			reducedMotion: 'reduce'
		});
		const pageErrors = [];
		page.on('pageerror', (error) => pageErrors.push(error.message));
		await page.setContent(
			'<html><head><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#100f0d}</style></head><body></body></html>'
		);
		await page.addScriptTag({ content: bundle.outputFiles[0].text });
		const manifest = {
			version: 1,
			sourceHash: fingerprint,
			provenance:
				'Actual Three.js renderer captures. Social typography is composited over the rendered sculpture.',
			files: {}
		};
		async function capture(design, width, height) {
			await page.setViewportSize({ width, height });
			await page.evaluate((value) => window.loadCapture(value), design);
			await page
				.locator('canvas')
				.evaluate(
					(canvas) =>
						new Promise((resolve) =>
							requestAnimationFrame(() => requestAnimationFrame(() => resolve(canvas.width)))
						)
				);
			return page.locator('canvas').screenshot({ type: 'png' });
		}
		async function save(name, bytes, width, height) {
			const result = await sharp(bytes)
				.resize(width, height, { fit: 'cover' })
				.jpeg({ quality: 87, mozjpeg: true })
				.toBuffer();
			await writeFile(path.join(output, name), result);
			manifest.files[name] = { width, height, bytes: result.length };
			console.log(
				`Captured ${name}: ${width} × ${height}, ${Math.round(result.length / 1024)} KiB`
			);
		}
		await save('mrinmoyee-poster.jpg', await capture(DEFAULT_DESIGN, 1200, 1050), 1200, 1050);
		for (const preset of PRESETS)
			await save(`preset-${preset.id}.jpg`, await capture(preset.design, 800, 700), 400, 350);
		const socialDesign = {
			...DEFAULT_DESIGN,
			camera: { position: [0, 4, 14], target: [-1.3, 3.8, 0] }
		};
		const social = await capture(socialDesign, 1200, 630);
		const typeLayer = Buffer.from(
			`<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="shade"><stop stop-color="#100e0c" stop-opacity=".88"/><stop offset=".6" stop-color="#100e0c" stop-opacity="0"/></linearGradient></defs><rect width="1200" height="630" fill="url(#shade)"/><text x="65" y="200" fill="#d4af7a" font-size="13" font-family="sans-serif" letter-spacing="4">CLAY · CLOTH · LIGHT</text><text x="60" y="284" fill="#f2e6d3" font-size="65" font-family="Georgia,serif">Mrinmoyee</text><text x="65" y="328" fill="#e0c29b" font-size="17" font-family="sans-serif" letter-spacing="4">THE DURGA ATELIER</text><text x="65" y="399" fill="#bdac95" font-size="20" font-family="Georgia,serif" font-style="italic">Make her your own.</text><text x="65" y="560" fill="#b6a184" font-size="11" font-family="sans-serif" letter-spacing="3">SUVROGHOSH.IN / VISUALIZATIONS</text></svg>`
		);
		await save(
			'mrinmoyee-social.jpg',
			await sharp(social)
				.composite([{ input: typeLayer }])
				.toBuffer(),
			1200,
			630
		);
		if (pageErrors.length)
			throw new Error(`Capture encountered browser errors: ${pageErrors.join('; ')}`);
		await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
	} finally {
		await browser?.close();
	}
}
