import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = path.join(root, 'static/images/visualizations/through-a-different-glass');
const checking = process.argv.includes('--check');
const baseIndex = process.argv.indexOf('--base');
if (baseIndex >= 0 && !process.argv[baseIndex + 1]) throw new Error('--base needs a loopback URL.');
const base = new URL(baseIndex >= 0 ? process.argv[baseIndex + 1] : 'http://127.0.0.1:4317');
if (
	!['http:', 'https:'].includes(base.protocol) ||
	!['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname)
)
	throw new Error('Poster capture requires a loopback preview.');
const articlePath = '/blog/visualizations/through-a-different-glass';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const pixelHash = async (bytes) => hash(await sharp(bytes).ensureAlpha().raw().toBuffer());

async function sourceFiles(relative) {
	const entries = await readdir(path.join(root, relative), { withFileTypes: true });
	const paths = await Promise.all(
		entries.map(async (entry) => {
			const name = `${relative}/${entry.name}`;
			if (entry.isDirectory()) return sourceFiles(name);
			return /\.(?:ts|svelte|css)$/u.test(name) && !/\.test\./u.test(name) ? [name] : [];
		})
	);
	return paths.flat().sort();
}

async function provenance() {
	const paths = [
		...(await sourceFiles('src/lib/components/visualizations/lens-mirror-lab')),
		...(await sourceFiles('src/lib/visualizations/lens-mirror-lab')),
		'scripts/render-lens-mirror-samples.mjs',
		'scripts/capture-lens-mirror-poster.mjs',
		'static/images/visualizations/through-a-different-glass/samples.json'
	].sort();
	const sources = {};
	for (const file of paths)
		sources[file] = hash((await readFile(path.join(root, file), 'utf8')).replace(/\r\n/gu, '\n'));
	const samplePixels = {};
	for (const name of ['calibration', 'facade', 'portrait', 'corridor', 'typography']) {
		samplePixels[name] = await pixelHash(await readFile(path.join(directory, `${name}.png`)));
	}
	return { sources, samplePixels, sourceHash: hash(JSON.stringify({ sources, samplePixels })) };
}

const before = await provenance();
if (checking) {
	const manifest = JSON.parse(await readFile(path.join(directory, 'poster.json'), 'utf8'));
	if (
		manifest.sourceHash !== before.sourceHash ||
		JSON.stringify(manifest.sources) !== JSON.stringify(before.sources) ||
		JSON.stringify(manifest.samplePixels) !== JSON.stringify(before.samplePixels)
	)
		throw new Error('Lens-lab application or samples changed; recapture the poster.');
	const bytes = await readFile(path.join(directory, 'poster.png'));
	const metadata = await sharp(bytes).metadata();
	if (
		metadata.format !== 'png' ||
		metadata.width !== manifest.width ||
		metadata.height !== manifest.height ||
		metadata.width !== manifest.clip?.width ||
		metadata.height !== manifest.clip?.height
	)
		throw new Error('Poster dimensions or format differ from capture provenance.');
	if (manifest.pixelSha256 !== (await pixelHash(bytes)))
		throw new Error('Poster pixels differ from capture provenance.');
	if (
		manifest.articlePath !== articlePath ||
		manifest.captureMode !== 'local-article-browser' ||
		manifest.state !== 'default-calibration-barrel' ||
		manifest.captureSelector !== '#lens-mirror-lab through .optics-notice'
	)
		throw new Error('Poster capture state or provenance is invalid.');
	console.log(
		`Lens-lab poster verified: ${manifest.width} × ${manifest.height}, default state, sources and decoded pixels.`
	);
} else {
	const { chromium } = await import('playwright');
	const browser = await chromium.launch({
		channel: process.env.PLAYWRIGHT_CHANNEL?.trim() || (process.env.CI ? undefined : 'chrome'),
		headless: true
	});
	try {
		const page = await browser.newPage({
			viewport: { width: 1600, height: 1200 },
			deviceScaleFactor: 1,
			reducedMotion: 'reduce',
			colorScheme: 'light',
			serviceWorkers: 'block'
		});
		const errors = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await page.addInitScript(() => localStorage.setItem('site-theme', 'paper'));
		const response = await page.goto(new URL(articlePath, base).href, {
			waitUntil: 'domcontentloaded',
			timeout: 90_000
		});
		if (!response?.ok())
			throw new Error(`Article preview returned ${response?.status() ?? 'no response'}.`);
		const lab = page.locator('#lens-mirror-lab');
		await lab.scrollIntoViewIfNeeded();
		await lab.locator('[data-render-state="ready"]').waitFor({ timeout: 60_000 });
		const privacyNote = page.locator('aside[data-privacy-note]');
		if (await privacyNote.isVisible())
			await privacyNote
				.getByRole('button', { name: 'Dismiss privacy notice without choosing', exact: true })
				.click();
		await page.evaluate(() => document.fonts.ready);
		if (
			(await lab
				.getByRole('button', { name: 'Barrel distortion', exact: true })
				.getAttribute('aria-pressed')) !== 'true'
		)
			throw new Error('Poster requires the default barrel preset.');
		if (
			(await lab
				.getByRole('button', { name: 'Calibration', exact: true })
				.getAttribute('aria-pressed')) !== 'true'
		)
			throw new Error('Poster requires the default calibration sample.');
		const measure = () =>
			lab.evaluate((element) => {
				const shell = element.getBoundingClientRect();
				const notice = element.querySelector('.optics-notice')?.getBoundingClientRect();
				if (!notice) throw new Error('The optical explanation is missing.');
				return {
					x: Math.floor(shell.left + window.scrollX),
					y: Math.floor(shell.top + window.scrollY),
					width: Math.ceil(shell.width),
					height: Math.ceil(notice.bottom - shell.top)
				};
			});
		let geometry = await measure();
		// Chrome can clamp a clipped screenshot to its viewport even when
		// captureBeyondViewport is requested. Make the entire measured crop visible.
		await page.setViewportSize({
			width: 1600,
			height: Math.max(1200, geometry.y + geometry.height + 40)
		});
		geometry = await measure();
		const bytes = await page.screenshot({
			clip: geometry,
			captureBeyondViewport: true,
			animations: 'disabled',
			style: '.site-header { visibility: hidden !important; }'
		});
		if (errors.length) throw new Error(`Application errors during capture: ${errors.join('; ')}`);
		const after = await provenance();
		if (before.sourceHash !== after.sourceHash)
			throw new Error('Application sources changed during capture; retry when edits have settled.');
		const metadata = await sharp(bytes).metadata();
		if (metadata.width !== geometry.width || metadata.height !== geometry.height)
			throw new Error('Chromium clipped the poster crop; the complete notice must remain visible.');
		await mkdir(directory, { recursive: true });
		await writeFile(path.join(directory, 'poster.png'), bytes);
		await writeFile(
			path.join(directory, 'poster.json'),
			JSON.stringify(
				{
					articlePath,
					captureMode: 'local-article-browser',
					state: 'default-calibration-barrel',
					captureSelector: '#lens-mirror-lab through .optics-notice',
					viewport: page.viewportSize(),
					clip: geometry,
					width: metadata.width,
					height: metadata.height,
					...after,
					pixelSha256: await pixelHash(bytes)
				},
				null,
				2
			) + '\n'
		);
		console.log(`Captured actual lens-lab poster: ${metadata.width} × ${metadata.height}.`);
	} finally {
		await browser.close();
	}
}
