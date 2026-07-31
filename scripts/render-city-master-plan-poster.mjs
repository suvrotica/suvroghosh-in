import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from 'playwright';
import sharp from 'sharp';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const previewOrigin = process.env.CITY_MASTER_PLAN_PREVIEW_ORIGIN ?? 'http://127.0.0.1:4213';
const articleUrl = new URL(
	'/blog/visualizations/the-city-that-refuses-a-master-plan',
	previewOrigin
).href;
const artifactDirectory = path.join(projectRoot, 'artifacts', 'city-master-plan');
const pngPath = path.join(artifactDirectory, 'canonical-poster.png');
const webpPath = path.join(
	projectRoot,
	'static',
	'images',
	'the-city-that-refuses-a-master-plan.webp'
);

await mkdir(artifactDirectory, { recursive: true });

const browser = await chromium.launch({
	channel: process.env.PLAYWRIGHT_CHANNEL?.trim() || 'chrome',
	headless: true
});

try {
	const page = await browser.newPage({
		acceptDownloads: true,
		reducedMotion: 'reduce',
		viewport: { width: 1440, height: 1000 }
	});
	await page.goto(articleUrl, { waitUntil: 'domcontentloaded' });
	const laboratory = page.getByTestId('city-master-plan-lab');
	await laboratory.waitFor({ state: 'visible' });
	await page.waitForFunction(
		() =>
			document.querySelector('[data-testid="city-master-plan-lab"]')?.dataset.state === 'complete',
		undefined,
		{ timeout: 60_000 }
	);

	const downloadPromise = page.waitForEvent('download', { timeout: 60_000 });
	await laboratory.getByRole('button', { name: 'Download social PNG' }).click();
	const download = await downloadPromise;
	await download.saveAs(pngPath);

	await sharp(pngPath)
		.resize(1200, 900, { fit: 'fill' })
		.webp({ effort: 6, quality: 82, smartSubsample: true })
		.toFile(webpPath);

	const metadata = await sharp(webpPath).metadata();
	console.log(
		`Canonical renderer poster saved: ${path.relative(projectRoot, webpPath)} (${metadata.width} × ${metadata.height})`
	);
} finally {
	await browser.close();
}
