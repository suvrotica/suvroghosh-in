import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = path.join(root, 'static/images/visualizations/strange-matter');
const articlePath = '/blog/visualizations/strange-matter';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const pixelHash = async (bytes) => hash(await sharp(bytes).ensureAlpha().raw().toBuffer());
// These three modules are the inputs to the clean artwork export. Interface
// typography and article edits do not invalidate a poster without the interface.
const sourceFiles = ['model.ts', 'geometry.ts', 'renderer.ts'].map(
	(name) => `src/lib/visualizations/strange-matter/${name}`
);
const sources = Object.fromEntries(
	await Promise.all(
		sourceFiles.map(async (file) => [
			file,
			hash((await readFile(path.join(root, file), 'utf8')).replace(/\r\n/gu, '\n'))
		])
	)
);

if (process.argv.includes('--check')) {
	const manifest = JSON.parse(await readFile(path.join(directory, 'assets.json'), 'utf8'));
	const png = await readFile(path.join(directory, 'poster.png'));
	const metadata = await sharp(png).metadata();
	if (JSON.stringify(manifest.sources) !== JSON.stringify(sources))
		throw new Error('Strange Matter artwork sources changed; recapture its PNG export.');
	if (
		manifest.version !== 1 ||
		manifest.articlePath !== articlePath ||
		manifest.captureMode !== 'native-png-export' ||
		manifest.motion !== 'reduced' ||
		manifest.animationTime !== 0 ||
		manifest.world !== 'liquid' ||
		manifest.width !== 1200 ||
		manifest.height !== 750 ||
		manifest.exportWidth !== 1600 ||
		manifest.exportHeight !== 1000 ||
		!/^[a-f0-9]{64}$/u.test(manifest.capturePngSha256 ?? '')
	)
		throw new Error('Strange Matter poster capture metadata is invalid.');
	if (
		metadata.format !== 'png' ||
		metadata.width !== 1200 ||
		metadata.height !== 750 ||
		manifest.pixelSha256 !== (await pixelHash(png))
	)
		throw new Error('Strange Matter poster pixels or dimensions do not match provenance.');
	// Pixel identity survives the site's existing lossless, same-dimension image
	// optimisation. capturePngSha256 records the original capture encoding.
	console.log('Strange Matter: artwork source and pixel provenance verified (1200 × 750).');
} else {
	let baseArgument;
	for (let i = 2; i < process.argv.length; i++) {
		if (process.argv[i] === '--base' && process.argv[i + 1]) {
			baseArgument = process.argv[++i];
		} else throw new Error('Usage: node scripts/capture-strange-matter.mjs [--base URL] [--check]');
	}
	const base = new URL(
		baseArgument || process.env.STRANGE_MATTER_BASE_URL || 'http://127.0.0.1:4337'
	);
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
		const page = await browser.newPage({
			viewport: { width: 1440, height: 1000 },
			deviceScaleFactor: 1,
			reducedMotion: 'reduce',
			serviceWorkers: 'block',
			acceptDownloads: true
		});
		page.setDefaultTimeout(30_000);
		const errors = [];
		page.on('pageerror', (error) => errors.push(error.message));
		// Clean route: default design and time zero, without inherited share state.
		await page.goto(new URL(articlePath, base).href, {
			waitUntil: 'domcontentloaded',
			timeout: 90_000
		});
		await page.locator('[data-ready="true"][data-world="liquid"]').waitFor({ timeout: 60_000 });
		await page.getByRole('button', { name: 'Save artwork' }).click();
		const downloadPromise = page.waitForEvent('download', { timeout: 30_000 });
		await page.getByRole('button', { name: 'PNG 1600 px', exact: true }).click();
		const download = await downloadPromise;
		const failure = await download.failure();
		if (failure) throw new Error(`Strange Matter PNG download failed: ${failure}`);
		const downloadedPath = await download.path();
		if (!downloadedPath) throw new Error('Strange Matter PNG download produced no local file.');
		const exported = await readFile(downloadedPath);
		const exportMetadata = await sharp(exported).metadata();
		if (
			exportMetadata.format !== 'png' ||
			exportMetadata.width !== 1600 ||
			exportMetadata.height !== 1000
		)
			throw new Error('Strange Matter default PNG export must be 1600 × 1000.');
		if (errors.length) throw new Error(errors.join('\n'));
		const png = await sharp(exported).resize(1200, 750).png().toBuffer();
		await mkdir(directory, { recursive: true });
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
					world: 'liquid',
					width: 1200,
					height: 750,
					exportWidth: 1600,
					exportHeight: 1000,
					capturePngSha256: hash(png),
					pixelSha256: await pixelHash(png),
					sources
				},
				null,
				2
			) + '\n'
		);
		console.log(`Strange Matter: captured the actual artwork PNG export at ${directory}.`);
	} finally {
		await browser.close();
	}
}
