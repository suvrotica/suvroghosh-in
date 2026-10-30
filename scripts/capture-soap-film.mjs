import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = path.join(root, 'static/images/visualizations/soap-film');
const artifacts = path.join(root, '.codex-artifacts/soap-film');
const articlePath = '/blog/visualizations/why-soap-bubbles-change-colour';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const pixelHash = async (bytes) => hash(await sharp(bytes).ensureAlpha().raw().toBuffer());
const sourceFiles = [
	...['optics.ts', 'colour-data.ts', 'renderer.ts', 'fragment.glsl'].map(
		(name) => `src/lib/visualizations/soap-film/${name}`
	),
	// The app owns default state, clock initialisation and the native PNG export.
	'src/lib/components/visualizations/soap-film/SoapFilmApp.svelte',
	// Stage aspect ratio and canvas sizing are part of the captured composition.
	'src/lib/components/visualizations/soap-film/soap-film.css'
];
const sources = Object.fromEntries(
	await Promise.all(
		sourceFiles.map(async (file) => [
			file,
			hash((await readFile(path.join(root, file), 'utf8')).replace(/\r\n/gu, '\n'))
		])
	)
);

if (process.argv.includes('--check')) {
	if (process.argv.length !== 3) throw new Error('Use --check without capture arguments.');
	const manifest = JSON.parse(await readFile(path.join(directory, 'assets.json'), 'utf8'));
	const png = await readFile(path.join(directory, 'poster.png'));
	const metadata = await sharp(png).metadata();
	if (JSON.stringify(manifest.sources) !== JSON.stringify(sources))
		throw new Error('Soap-film source changed; recapture the native PNG export.');
	if (
		manifest.version !== 1 ||
		manifest.articlePath !== articlePath ||
		manifest.captureMode !== 'native-png-export' ||
		manifest.motion !== 'reduced' ||
		manifest.animationTime !== 0 ||
		manifest.thicknessNm !== 480 ||
		manifest.angleDeg !== 12 ||
		manifest.flowing !== true ||
		manifest.width !== 1200 ||
		manifest.height !== 900 ||
		manifest.fit !== 'contain' ||
		!Number.isInteger(manifest.exportWidth) ||
		manifest.exportWidth < 600 ||
		!Number.isInteger(manifest.exportHeight) ||
		manifest.exportHeight < 400 ||
		!/^[a-f0-9]{64}$/u.test(manifest.exportPngSha256 ?? '') ||
		!/^[a-f0-9]{64}$/u.test(manifest.capturePngSha256 ?? '')
	)
		throw new Error('Soap-film poster capture metadata is invalid.');
	if (
		metadata.format !== 'png' ||
		metadata.width !== 1200 ||
		metadata.height !== 900 ||
		manifest.pixelSha256 !== (await pixelHash(png))
	)
		throw new Error('Soap-film poster pixels or dimensions do not match provenance.');
	// Pixel hashes survive the repository's lossless, same-dimension optimisation.
	console.log('Soap film: source and poster pixel provenance verified (1200 × 900).');
} else {
	let baseArgument;
	for (let index = 2; index < process.argv.length; index++) {
		if (process.argv[index] === '--base' && process.argv[index + 1]) {
			baseArgument = process.argv[++index];
		} else throw new Error('Usage: node scripts/capture-soap-film.mjs [--base URL] [--check]');
	}
	const base = new URL(baseArgument || process.env.SOAP_FILM_BASE_URL || 'http://127.0.0.1:4342');
	if (
		base.protocol !== 'http:' ||
		!['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname) ||
		base.username ||
		base.password
	)
		throw new Error('Poster capture requires an HTTP loopback preview.');
	const { chromium } = await import('@playwright/test');
	const browser = await chromium.launch({
		channel: process.env.PLAYWRIGHT_CHANNEL?.trim() || (process.env.CI ? 'chromium' : 'chrome'),
		headless: true,
		timeout: 30_000
	});
	try {
		await mkdir(directory, { recursive: true });
		await mkdir(artifacts, { recursive: true });
		const page = await browser.newPage({
			viewport: { width: 1440, height: 1100 },
			deviceScaleFactor: 1.5,
			reducedMotion: 'reduce',
			serviceWorkers: 'block',
			acceptDownloads: true
		});
		page.setDefaultTimeout(30_000);
		const errors = [];
		page.on('pageerror', (error) => errors.push(error.message));
		// Missing poster requests on the first capture are not runtime failures.
		// Page errors are failures; this script never substitutes an invented image.
		await page.goto(new URL(articlePath, base).href, {
			waitUntil: 'domcontentloaded',
			timeout: 90_000
		});
		await page.locator('.sf-experiment[data-ready="true"]').waitFor({ timeout: 60_000 });
		await page.locator('.sf-stage canvas[data-time="0.000"]').waitFor();
		const canvas = page.locator('.sf-stage canvas');
		if (
			(await canvas.getAttribute('data-thickness')) !== '480' ||
			(await canvas.getAttribute('data-angle')) !== '12' ||
			(await page
				.getByRole('button', { name: 'Flowing film', exact: true })
				.getAttribute('aria-pressed')) !== 'true'
		)
			throw new Error('Soap-film defaults changed; review and update the capture specification.');
		await page.evaluate(() => document.fonts.ready);
		const downloadPromise = page.waitForEvent('download', { timeout: 30_000 });
		await page.getByRole('button', { name: /Save image/ }).click();
		const download = await downloadPromise;
		const failure = await download.failure();
		if (failure) throw new Error(`Soap-film PNG download failed: ${failure}`);
		const downloadedPath = await download.path();
		if (!downloadedPath) throw new Error('Soap-film PNG download produced no local file.');
		const exported = await readFile(downloadedPath);
		const exportMetadata = await sharp(exported).metadata();
		if (
			exportMetadata.format !== 'png' ||
			exportMetadata.width < 600 ||
			exportMetadata.height < 400
		)
			throw new Error('Soap-film export is missing or unexpectedly small.');
		const stats = await sharp(exported).stats();
		if (stats.channels.slice(0, 3).every((channel) => channel.stdev < 8))
			throw new Error('Soap-film exported canvas appears blank.');
		if (errors.length) throw new Error(errors.join('\n'));
		const png = await sharp(exported)
			.resize(1200, 900, { fit: 'contain', background: '#11161a' })
			.png()
			.toBuffer();
		await writeFile(path.join(directory, 'poster.png'), png);
		await writeFile(
			path.join(directory, 'assets.json'),
			JSON.stringify(
				{
					version: 1,
					articlePath,
					captureMode: 'native-png-export',
					motion: 'reduced',
					animationTime: 0,
					thicknessNm: 480,
					angleDeg: 12,
					flowing: true,
					width: 1200,
					height: 900,
					fit: 'contain',
					exportWidth: exportMetadata.width,
					exportHeight: exportMetadata.height,
					exportPngSha256: hash(exported),
					capturePngSha256: hash(png),
					pixelSha256: await pixelHash(png),
					sources
				},
				null,
				2
			) + '\n'
		);
		await page.getByRole('button', { name: /Reset/ }).click();
		await page.locator('.sf-stage canvas[data-time="0.000"]').waitFor();
		await page
			.locator('.sf-shell')
			.screenshot({ path: path.join(artifacts, 'desktop.png'), scale: 'css' });
		const mobile = await browser.newPage({
			viewport: { width: 390, height: 844 },
			deviceScaleFactor: 1,
			isMobile: true,
			hasTouch: true,
			reducedMotion: 'reduce',
			serviceWorkers: 'block'
		});
		mobile.on('pageerror', (error) => errors.push(error.message));
		await mobile.goto(new URL(articlePath, base).href, {
			waitUntil: 'domcontentloaded',
			timeout: 90_000
		});
		await mobile.locator('.sf-experiment[data-ready="true"]').waitFor({ timeout: 60_000 });
		await mobile.locator('.sf-stage canvas[data-time="0.000"]').waitFor();
		await mobile.evaluate(() => document.fonts.ready);
		await mobile
			.locator('.sf-shell')
			.screenshot({ path: path.join(artifacts, 'mobile.png'), scale: 'css' });
		if (errors.length) throw new Error(errors.join('\n'));
		console.log(
			JSON.stringify({
				poster: path.join(directory, 'poster.png'),
				exportSize: `${exportMetadata.width}×${exportMetadata.height}`,
				desktop: path.join(artifacts, 'desktop.png'),
				mobile: path.join(artifacts, 'mobile.png')
			})
		);
	} finally {
		await browser.close();
	}
}
