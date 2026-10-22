import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const features = ['build-one-build-a-thousand', 'the-six-week-shadow', 'the-museum-of-almost'];
const dimensions = { width: 1200, height: 630 };
const museumContentStatuses = new Set(['demonstration', 'mixed', 'verified']);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const pixels = async (bytes) => hash(await sharp(bytes).ensureAlpha().raw().toBuffer());

async function sourcesBelow(directory) {
	const entries = await readdir(path.join(root, directory), { withFileTypes: true });
	const found = await Promise.all(
		entries.map(async (entry) => {
			const relative = `${directory}/${entry.name}`;
			if (entry.isDirectory()) return sourcesBelow(relative);
			return /\.(?:svelte|[cm]?js|ts|css|json)$/u.test(entry.name) && !/\.test\./u.test(entry.name)
				? [relative]
				: [];
		})
	);
	return found.flat().sort();
}

async function provenance(feature) {
	const paths = [
		...(await sourcesBelow(`src/lib/visualizations/${feature}`)),
		...(await sourcesBelow(`src/lib/components/visualizations/${feature}`)),
		'scripts/render-maker-collection-assets.mjs'
	].sort();
	const sources = {};
	for (const source of paths) {
		sources[source] = hash(
			(await readFile(path.join(root, source), 'utf8')).replace(/\r\n/gu, '\n')
		);
	}
	return { sources, sourceHash: hash(JSON.stringify(sources)) };
}

const checking = process.argv.includes('--check');
const baseIndex = process.argv.indexOf('--base');
const base = new URL(
	baseIndex >= 0
		? process.argv[baseIndex + 1]
		: process.env.MAKER_BASE_URL || 'http://127.0.0.1:4292'
);
if (!['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname))
	throw new Error('Capture requires a loopback preview.');

let browser;
try {
	if (!checking) {
		const { chromium } = await import('playwright');
		browser = await chromium.launch({
			channel: process.env.PLAYWRIGHT_CHANNEL?.trim() || (process.env.CI ? undefined : 'chrome'),
			headless: true
		});
	}
	for (const feature of features) {
		const directory = path.join(root, 'static/images/visualizations', feature);
		const current = await provenance(feature);
		const articlePath = `/blog/visualizations/${feature}`;
		if (checking) {
			const manifest = JSON.parse(await readFile(path.join(directory, 'assets.json'), 'utf8'));
			const bytes = await readFile(path.join(directory, 'social.png'));
			const metadata = await sharp(bytes).metadata();
			if (
				manifest.sourceHash !== current.sourceHash ||
				JSON.stringify(manifest.sources) !== JSON.stringify(current.sources)
			)
				throw new Error(`${feature}: scene sources changed; recapture its publication image.`);
			if (metadata.width !== 1200 || metadata.height !== 630 || metadata.format !== 'png')
				throw new Error(`${feature}: expected a 1200 × 630 PNG.`);
			if (manifest.pixelSha256 !== (await pixels(bytes)))
				throw new Error(`${feature}: captured pixels differ from provenance.`);
			if (
				manifest.articlePath !== articlePath ||
				manifest.captureMode !== 'local-article-browser' ||
				manifest.state !==
					(feature === 'the-six-week-shadow' ? 'default-proposed-change' : 'default') ||
				(feature === 'the-museum-of-almost'
					? !museumContentStatuses.has(manifest.contentStatus)
					: manifest.contentStatus !== 'illustrative-model')
			)
				throw new Error(`${feature}: invalid capture provenance.`);
			console.log(`${feature}: default scene, dimensions, sources and pixel provenance verified.`);
			continue;
		}
		const page = await browser.newPage({
			viewport: { width: 1440, height: 1100 },
			deviceScaleFactor: 1,
			serviceWorkers: 'block',
			reducedMotion: 'reduce',
			colorScheme: 'light'
		});
		const errors = [];
		page.on('pageerror', (error) => errors.push(error.message));
		try {
			await page.addInitScript(() => {
				localStorage.setItem('site-theme', 'paper');
			});
			const capturePath =
				feature === 'the-six-week-shadow' ? `${articlePath}?shadow=1.1.b.10.5` : articlePath;
			await page.goto(new URL(capturePath, base).href, {
				waitUntil: 'domcontentloaded',
				timeout: 90_000
			});
			const shell = page.locator(`[data-maker-feature="${feature}"]`);
			await shell.scrollIntoViewIfNeeded();
			await shell.locator('[data-maker-ready="true"]').waitFor({ timeout: 60_000 });
			for (const name of ['Reject optional', 'Dismiss privacy confirmation']) {
				const button = page.getByRole('button', { name, exact: true });
				if (await button.isVisible()) await button.click();
			}
			await page.evaluate(() => document.fonts.ready);
			const capture = shell.locator('[data-maker-capture]').first();
			let contentStatus = 'illustrative-model';
			if (feature === 'the-museum-of-almost') {
				const museumStatus = await shell.getAttribute('data-maker-content-status');
				if (!museumContentStatuses.has(museumStatus))
					throw new Error('Museum capture has an invalid content status.');
				const label = capture.locator('.ma-masthead .ma-demonstration').first();
				const labelText = (await label.innerText()).trim();
				const prefix =
					museumStatus === 'demonstration'
						? /^Demonstration collection\b/iu
						: museumStatus === 'mixed'
							? /^Mixed collection\b/iu
							: /^Verified collection\b/iu;
				const hasFictionalLabel = /\bfictional\b/iu.test(labelText);
				if (
					!(await label.isVisible()) ||
					!prefix.test(labelText) ||
					(museumStatus === 'verified' ? hasFictionalLabel : !hasFictionalLabel)
				)
					throw new Error(`Museum capture must retain a visible ${museumStatus} collection label.`);
				contentStatus = museumStatus;
			}
			const screenshot = await capture.screenshot({
				animations: 'disabled',
				style: '.site-header { visibility: hidden !important; }'
			});
			if (errors.length) throw new Error(`${feature}: ${errors.join('; ')}`);
			const bytes = await sharp(screenshot)
				.resize({ ...dimensions, fit: 'contain', background: '#f3efe5' })
				.png()
				.toBuffer();
			await mkdir(directory, { recursive: true });
			await writeFile(path.join(directory, 'social.png'), bytes);
			await writeFile(
				path.join(directory, 'assets.json'),
				`${JSON.stringify(
					{
						...current,
						articlePath,
						captureMode: 'local-article-browser',
						state: feature === 'the-six-week-shadow' ? 'default-proposed-change' : 'default',
						capturePath,
						contentStatus,
						...dimensions,
						pixelSha256: await pixels(bytes)
					},
					null,
					2
				)}\n`
			);
			console.log(`${feature}: captured implemented default scene.`);
		} finally {
			await page.close();
		}
	}
} finally {
	await browser?.close();
}
