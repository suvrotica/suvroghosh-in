import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import {
	FAMILIES,
	defaultForFamily,
	encodeState
} from '../src/lib/visualizations/fractal-trip/model.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = path.join(root, 'static/images/visualizations/fractal-trip');
const route = '/blog/visualizations/fractal-trip';
const hash = (value) => createHash('sha256').update(value).digest('hex');
const sources = Object.fromEntries(
	await Promise.all(
		['model.ts', 'renderer.ts', 'shaders.ts'].map(async (name) => [
			name,
			hash(
				(
					await readFile(path.join(root, 'src/lib/visualizations/fractal-trip', name), 'utf8')
				).replaceAll('\r\n', '\n')
			)
		])
	)
);

if (process.argv.includes('--check')) {
	const manifest = JSON.parse(await readFile(path.join(directory, 'assets.json'), 'utf8'));
	if (
		manifest.version !== 1 ||
		manifest.route !== route ||
		JSON.stringify(manifest.sources) !== JSON.stringify(sources)
	)
		throw new Error('Fractal Trip artwork sources changed; recapture its images.');
	if (manifest.images.length !== FAMILIES.length + 1)
		throw new Error('Fractal Trip has missing preset artwork.');
	for (const item of manifest.images) {
		if (!/^[a-z-]+\.png$/.test(item.file)) throw new Error('Invalid asset path.');
		const bytes = await readFile(path.join(directory, item.file));
		const metadata = await sharp(bytes).metadata();
		const pixels = await sharp(bytes).ensureAlpha().raw().toBuffer();
		if (
			metadata.width !== item.width ||
			metadata.height !== item.height ||
			hash(pixels) !== item.pixelSha256
		)
			throw new Error(`Fractal Trip asset differs from its capture: ${item.file}`);
	}
	console.log('Fractal Trip: actual-renderer poster and seven preset images verified.');
} else {
	const baseIndex = process.argv.indexOf('--base');
	const base = new URL(
		baseIndex >= 0
			? process.argv[baseIndex + 1]
			: process.env.FRACTAL_TRIP_BASE_URL || 'http://127.0.0.1:4348'
	);
	if (
		base.protocol !== 'http:' ||
		!['localhost', '127.0.0.1', '[::1]'].includes(base.hostname) ||
		base.username ||
		base.password
	)
		throw new Error('Capture requires a loopback HTTP preview.');
	await mkdir(directory, { recursive: true });
	const { chromium } = await import('@playwright/test');
	const browser = await chromium.launch({
		channel: process.env.PLAYWRIGHT_CHANNEL || (process.env.CI ? 'chromium' : 'chrome'),
		headless: true
	});
	const images = [];
	try {
		const page = await browser.newPage({
			viewport: { width: 1060, height: 1100 },
			deviceScaleFactor: 1,
			reducedMotion: 'reduce',
			serviceWorkers: 'block',
			acceptDownloads: true
		});
		page.setDefaultTimeout(60000);
		const errors = [];
		page.on('pageerror', (error) => errors.push(error.message));
		for (const family of FAMILIES) {
			const state = { ...defaultForFamily(family.id), quality: 'high' };
			await page.goto(`${base.origin}${route}?trip=${encodeState(state)}`, {
				waitUntil: 'domcontentloaded'
			});
			await page.locator('#fractal-trip[data-ready="true"]').waitFor();
			await page.locator('.ft-fallback').waitFor({ state: 'detached' });
			const downloadPromise = page.waitForEvent('download');
			await page.locator('.ft-footer > button').click();
			const download = await downloadPromise;
			const stream = await download.createReadStream();
			if (!stream) throw new Error('No exported PNG stream.');
			const chunks = [];
			for await (const chunk of stream) chunks.push(chunk);
			const captured = Buffer.concat(chunks);
			const output = `${family.id}.png`;
			const bytes = await sharp(captured).resize(400, 250, { fit: 'cover' }).png().toBuffer();
			await writeFile(path.join(directory, output), bytes);
			images.push({
				file: output,
				width: 400,
				height: 250,
				family: family.id,
				pixelSha256: hash(await sharp(bytes).ensureAlpha().raw().toBuffer())
			});
			if (family.id === 'mandelbulb') {
				const poster = await sharp(captured).resize(1440, 900, { fit: 'cover' }).png().toBuffer();
				await writeFile(path.join(directory, 'poster.png'), poster);
				images.unshift({
					file: 'poster.png',
					width: 1440,
					height: 900,
					family: family.id,
					pixelSha256: hash(await sharp(poster).ensureAlpha().raw().toBuffer())
				});
			}
			console.log(`Captured ${family.name} from the app's native PNG export.`);
		}
		if (errors.length) throw new Error(errors.join('\n'));
		await writeFile(
			path.join(directory, 'assets.json'),
			JSON.stringify(
				{ version: 1, route, captureMode: 'native-png-export', motion: 'paused', sources, images },
				null,
				2
			) + '\n'
		);
	} finally {
		await browser.close();
	}
}
