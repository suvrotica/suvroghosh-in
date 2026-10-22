import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = path.join(root, 'static/images/visualizations/memory-palace');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function below(relative) {
	const result = [];
	for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
		const child = `${relative}/${entry.name}`;
		if (entry.isDirectory()) result.push(...(await below(child)));
		else if (/\.(svelte|ts|mjs|css|json)$/u.test(child) && !/\.test\./u.test(child))
			result.push(child);
	}
	return result;
}
const sources = {};
for (const source of [
	...(await below('src/lib/components/visualizations/memory-palace')),
	...(await below('src/lib/visualizations/memory-palace')),
	'scripts/render-memory-palace-assets.mjs'
].sort()) {
	sources[source] = hash((await readFile(path.join(root, source), 'utf8')).replace(/\r\n/gu, '\n'));
}
const sourceHash = hash(JSON.stringify(sources));
const pixels = async (bytes) => hash(await sharp(bytes).ensureAlpha().raw().toBuffer());
const articlePath = '/blog/visualizations/a-place-for-every-idea';
if (process.argv.includes('--check')) {
	const manifest = JSON.parse(await readFile(path.join(directory, 'assets.json'), 'utf8'));
	const bytes = await readFile(path.join(directory, 'social.png'));
	const meta = await sharp(bytes).metadata();
	if (
		manifest.sourceHash !== sourceHash ||
		JSON.stringify(manifest.sources) !== JSON.stringify(sources)
	)
		throw new Error('Memory palace sources changed; recapture its publication image.');
	if (
		meta.width !== 1200 ||
		meta.height !== 630 ||
		meta.format !== 'png' ||
		manifest.pixelSha256 !== (await pixels(bytes))
	)
		throw new Error('Memory palace poster pixels or dimensions do not match provenance.');
	if (
		manifest.articlePath !== articlePath ||
		manifest.captureMode !== 'local-article-browser' ||
		manifest.state !== 'empty-route-prepare'
	)
		throw new Error('Memory palace capture metadata is invalid.');
	console.log('Memory palace: source and pixel provenance verified (1200 × 630).');
} else {
	const base = new URL(process.env.MEMORY_PALACE_BASE_URL || 'http://127.0.0.1:4296');
	if (!['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname))
		throw new Error('Capture requires a loopback preview.');
	const { chromium } = await import('playwright');
	const browser = await chromium.launch({
		channel: process.env.PLAYWRIGHT_CHANNEL?.trim() || (process.env.CI ? undefined : 'chrome'),
		headless: true
	});
	try {
		const page = await browser.newPage({
			viewport: { width: 1440, height: 1100 },
			serviceWorkers: 'block',
			deviceScaleFactor: 1,
			reducedMotion: 'reduce',
			colorScheme: 'light'
		});
		const errors = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await page.route('**/*', (request) =>
			new URL(request.request().url()).origin === base.origin ||
			request.request().url().startsWith('data:')
				? request.continue()
				: request.abort()
		);
		await page.addInitScript(() => localStorage.setItem('site-theme', 'paper'));
		await page.goto(new URL(articlePath, base).href, {
			waitUntil: 'domcontentloaded',
			timeout: 90000
		});
		const shell = page.locator('[data-memory-palace]');
		await shell.scrollIntoViewIfNeeded();
		await shell.locator('[data-memory-ready="true"]').waitFor({ timeout: 60000 });
		for (const name of ['Reject optional', 'Dismiss privacy confirmation']) {
			const button = page.getByRole('button', { name, exact: true });
			if (await button.isVisible()) {
				await button.click();
				await button.waitFor({ state: 'hidden' });
			}
		}
		await page.evaluate(() => document.fonts.ready);
		// Freeze publication layout so sticky columns and the article's full-width
		// translated figure cannot move between screenshot measurement and clipping.
		await page.addStyleTag({
			content: `html{scroll-behavior:auto!important}[data-memory-palace]{width:1200px!important;position:static!important;left:auto!important;transform:none!important;margin:0!important}.mp-workspace{display:block!important}.mp-map-column{position:static!important;width:900px!important;top:auto!important;padding:0!important}.site-header{visibility:hidden!important}`
		});
		await shell
			.locator('.palace-stage')
			.evaluate((element) => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
		const shot = await shell.locator('.palace-stage').screenshot({ animations: 'disabled' });
		if (errors.length) throw new Error(errors.join('; '));
		const house = await sharp(shot)
			.resize({ width: 820, height: 590, fit: 'contain', background: '#f5f0e4' })
			.png()
			.toBuffer();
		const plate = Buffer.from(
			`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#f5f0e4"/><rect x="16" y="16" width="1168" height="598" rx="4" fill="none" stroke="#c5c5ae"/><g fill="#263f3a"><text x="44" y="70" font-family="Arial" font-size="11" letter-spacing="2">THE CALCUTTA FIELDBOOK</text><text x="44" y="170" font-family="Georgia" font-size="52">A place</text><text x="44" y="231" font-family="Georgia" font-size="52">for every</text><text x="44" y="292" font-family="Georgia" font-size="56" font-style="italic" fill="#8d3d26">idea.</text><text x="46" y="378" font-family="Arial" font-size="12" letter-spacing="1.5">BUILD A MEMORY PALACE</text><text x="46" y="421" font-family="Georgia" font-size="19">Learn the route.</text><text x="46" y="451" font-family="Georgia" font-size="19">Make a scene.</text><text x="46" y="481" font-family="Georgia" font-size="19">Try remembering.</text><text x="46" y="571" font-family="Arial" font-size="11" letter-spacing="1">WORD LISTS · CONCEPTS · RECALL</text></g></svg>`
		);
		const bytes = await sharp(plate)
			.composite([{ input: house, left: 356, top: 20 }])
			.png()
			.toBuffer();
		await mkdir(directory, { recursive: true });
		await writeFile(path.join(directory, 'social.png'), bytes);
		await writeFile(
			path.join(directory, 'assets.json'),
			`${JSON.stringify({ sources, sourceHash, articlePath, captureMode: 'local-article-browser', state: 'empty-route-prepare', width: 1200, height: 630, pixelSha256: await pixels(bytes) }, null, 2)}\n`
		);
		console.log('Memory palace: captured the implemented empty route.');
	} finally {
		await browser.close();
	}
}
