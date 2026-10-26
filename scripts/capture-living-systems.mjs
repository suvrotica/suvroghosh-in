import { chromium } from '@playwright/test';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const directory = path.join(root, 'static/images/visualizations/living-systems');
const artifactDirectory = path.join(root, 'artifacts/living-systems');
const hash = (buffer) => createHash('sha256').update(buffer).digest('hex');
const pixelHash = async (buffer) => hash(await sharp(buffer).ensureAlpha().raw().toBuffer());
const sourceFiles = [];
sourceFiles.push('scripts/capture-living-systems.mjs');
for (const relative of [
	'src/lib/components/visualizations/living-systems',
	'src/lib/visualizations/living-systems'
]) {
	for (const name of (await readdir(path.join(root, relative))).sort()) {
		if (!name.endsWith('.test.ts')) sourceFiles.push(`${relative}/${name}`);
	}
}
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
	if (JSON.stringify(manifest.sources) !== JSON.stringify(sources))
		throw new Error('Living Systems capture sources changed; recapture the actual interface.');
	const png = await readFile(path.join(directory, 'social.png'));
	if ((await pixelHash(png)) !== manifest.pixelSha256)
		throw new Error('Living Systems poster pixels differ.');
	const size = await sharp(png).metadata();
	if (size.width !== manifest.width || size.height !== manifest.height)
		throw new Error('Living Systems poster dimensions differ.');
	console.log(`Living Systems: actual interface poster verified (${size.width} × ${size.height}).`);
	process.exit(0);
}

const baseURL = process.env.LIVING_SYSTEMS_BASE_URL || 'http://127.0.0.1:4387';
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
try {
	await mkdir(directory, { recursive: true });
	await mkdir(artifactDirectory, { recursive: true });
	const page = await browser.newPage({
		viewport: { width: 1440, height: 1150 },
		deviceScaleFactor: 1,
		reducedMotion: 'reduce',
		serviceWorkers: 'block'
	});
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto(`${baseURL}/blog/visualizations/living-systems`, { waitUntil: 'networkidle' });
	await page.locator('.ls-runtime[data-mode="life"][data-steps="0"]').waitFor();
	await page.evaluate(() => document.fonts.ready);
	await page.locator('.ls-stage canvas').scrollIntoViewIfNeeded();
	// The same seeded model and ordinary single-step control used by a visitor.
	for (let i = 0; i < 20; i++)
		await page.getByRole('button', { name: 'Step', exact: false }).click();
	await page.waitForTimeout(250);
	const screenshot = await page
		.locator('.ls-lab')
		.screenshot({ path: path.join(artifactDirectory, 'desktop.png') });
	const png = await sharp(screenshot).resize({ width: 1200 }).png().toBuffer();
	await writeFile(path.join(directory, 'social.png'), png);
	const size = await sharp(png).metadata();
	await writeFile(
		path.join(directory, 'assets.json'),
		JSON.stringify(
			{
				version: 2,
				description:
					'Actual Living Systems interface; seeded Life random garden after 20 model steps.',
				seed: 1847,
				preset: 'soup',
				steps: 20,
				width: size.width,
				height: size.height,
				capturePngSha256: hash(png),
				pixelSha256: await pixelHash(png),
				sources
			},
			null,
			2
		) + '\n'
	);
	for (const [mode, name] of [
		['ant', 'Langton'],
		['diffusion', 'Diffusion'],
		['walk', 'Random Walk']
	]) {
		await page.getByRole('button', { name: new RegExp(name) }).click();
		if (mode === 'walk')
			for (let i = 0; i < 40; i++)
				await page.getByRole('button', { name: 'Step', exact: false }).click();
		await page.waitForTimeout(100);
		await page.locator('.ls-lab').screenshot({ path: path.join(artifactDirectory, `${mode}.png`) });
	}
	await page.setViewportSize({ width: 390, height: 844 });
	await page.getByRole('button', { name: /Game of Life/ }).click();
	await page.waitForTimeout(100);
	await page.locator('.ls-lab').screenshot({ path: path.join(artifactDirectory, 'mobile.png') });
	const widths = await page.evaluate(() => ({
		page: document.documentElement.scrollWidth,
		viewport: innerWidth
	}));
	if (widths.page > widths.viewport + 1)
		throw new Error(`Mobile overflow: ${JSON.stringify(widths)}`);
	if (errors.length) throw new Error(errors.join('\n'));
	console.log(
		JSON.stringify({
			poster: path.join(directory, 'social.png'),
			width: size.width,
			height: size.height,
			mobile: widths,
			browserErrors: errors
		})
	);
} finally {
	await browser.close();
}
