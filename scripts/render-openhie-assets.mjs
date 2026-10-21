import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'static/images/visualizations/openhie');
const articlePath = '/blog/visualizations/the-patient-between-the-systems';
const name = 'openhie-social.png';
const dimensions = { width: 1200, height: 630 };

async function sourceFiles(directory) {
	const entries = await readdir(path.join(root, directory), { withFileTypes: true });
	const found = await Promise.all(
		entries.map(async (entry) => {
			const relative = `${directory}/${entry.name}`;
			if (entry.isDirectory()) return sourceFiles(relative);
			return /\.(?:svelte|[cm]?js|ts|css|json)$/u.test(entry.name) && !/\.test\./u.test(entry.name)
				? [relative]
				: [];
		})
	);
	return found.flat().sort();
}

const sources = [
	...(await sourceFiles('src/lib/components/visualizations/openhie')),
	...(await sourceFiles('src/lib/visualizations/openhie')),
	...(await sourceFiles('scripts/lib/openhie-anatomy')),
	'scripts/generate-openhie-instrument.mjs',
	'scripts/render-openhie-assets.mjs'
].sort();
const sourceHasher = createHash('sha256');
const sourceHashes = {};
for (const source of sources) {
	const bytes = (await readFile(path.join(root, source), 'utf8')).replace(/\r\n/gu, '\n');
	sourceHashes[source] = createHash('sha256').update(bytes).digest('hex');
	sourceHasher.update(source).update('\0').update(bytes).update('\0');
}
const sourceHash = sourceHasher.digest('hex');
const pixelHash = async (bytes) =>
	createHash('sha256')
		.update(await sharp(bytes).ensureAlpha().raw().toBuffer())
		.digest('hex');

if (process.argv.includes('--check')) {
	const manifest = JSON.parse(await readFile(path.join(output, 'assets.json'), 'utf8'));
	if (
		manifest.sourceHash !== sourceHash ||
		JSON.stringify(manifest.sources) !== JSON.stringify(sourceHashes)
	)
		throw new Error(
			'OpenHIE artwork is stale; run npm run openhie:assets against the verified local article.'
		);
	const bytes = await readFile(path.join(output, name));
	const metadata = await sharp(bytes).metadata();
	if (
		metadata.width !== dimensions.width ||
		metadata.height !== dimensions.height ||
		metadata.format !== 'png'
	)
		throw new Error('OpenHIE social poster must be a 1200 × 630 PNG.');
	if ((await pixelHash(bytes)) !== manifest.files[name]?.pixelSha256)
		throw new Error('OpenHIE poster pixels differ from the captured provenance.');
	if (
		!['local-article-browser', 'local-component-browser'].includes(manifest.captureMode) ||
		manifest.scenario !== 'success' ||
		!Number.isInteger(manifest.step)
	)
		throw new Error('OpenHIE capture provenance is missing or invalid.');
	console.log(
		'OpenHIE: captured article poster, dimensions, source hashes and pixel provenance verified.'
	);
} else {
	const { chromium } = await import('playwright');
	const baseIndex = process.argv.indexOf('--base');
	const pageIndex = process.argv.indexOf('--page');
	const capturePath = pageIndex >= 0 ? process.argv[pageIndex + 1] : articlePath;
	const base =
		baseIndex >= 0
			? process.argv[baseIndex + 1]
			: process.env.OPENHIE_BASE_URL || 'http://127.0.0.1:4284';
	if (!base) throw new Error('--base requires a URL.');
	if (!capturePath) throw new Error('--page requires a local page path.');
	const captureURL = new URL(capturePath, base);
	if (!['127.0.0.1', 'localhost', '[::1]'].includes(captureURL.hostname))
		throw new Error('OpenHIE assets must be captured from a local preview.');
	const browser = await chromium.launch({
		channel: process.env.PLAYWRIGHT_CHANNEL?.trim() || (process.env.CI ? undefined : 'chrome'),
		headless: true
	});
	try {
		const page = await browser.newPage({
			viewport: { width: 1440, height: 1000 },
			deviceScaleFactor: 1,
			serviceWorkers: 'block',
			reducedMotion: 'reduce'
		});
		const errors = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await page.goto(captureURL.href, { waitUntil: 'domcontentloaded', timeout: 90_000 });
		const lab = page.locator('.ohie-lab');
		await lab.scrollIntoViewIfNeeded();
		const runtime = lab.locator('[data-ohie-ready="true"]');
		await runtime.waitFor({ state: 'visible', timeout: 60_000 });
		const rejectOptional = page.getByRole('button', { name: 'Reject optional', exact: true });
		if (await rejectOptional.isVisible()) await rejectOptional.click();
		const privacyConfirmation = page.getByRole('button', {
			name: 'Dismiss privacy confirmation',
			exact: true
		});
		if (await privacyConfirmation.isVisible()) await privacyConfirmation.click();
		await runtime.getByLabel('Scenario', { exact: true }).selectOption('success');
		const slider = runtime.getByRole('slider', { name: 'Journey event', exact: true });
		await slider.evaluate((element) => {
			const input = element;
			input.value = input.max;
			input.dispatchEvent(new Event('input', { bubbles: true }));
		});
		await page.waitForFunction(
			() =>
				document.querySelector('[data-ohie-ready="true"]')?.getAttribute('data-status') ===
				'success'
		);
		await page.evaluate(() => document.fonts.ready);
		const state = await runtime.evaluate((element) => ({
			scenario: element.getAttribute('data-scenario'),
			step: Number(element.getAttribute('data-step')),
			status: element.getAttribute('data-status')
		}));
		const capture = runtime.locator('.ohie-capture');
		const background = await lab.evaluate((element) =>
			getComputedStyle(element).getPropertyValue('--ohie-paper').trim()
		);
		const screenshot = await capture.screenshot({ animations: 'disabled' });
		await mkdir(path.join(root, 'artifacts/openhie'), { recursive: true });
		await lab.evaluate((element) => element.scrollIntoView({ block: 'start' }));
		await page.screenshot({
			path: path.join(root, 'artifacts/openhie/desktop-result.png'),
			animations: 'disabled'
		});
		if (errors.length) throw new Error(`OpenHIE capture browser errors: ${errors.join('; ')}`);
		const bytes = await sharp(screenshot)
			.resize({
				...dimensions,
				fit: 'contain',
				background: background || '#f2f0e8'
			})
			.png()
			.toBuffer();
		await mkdir(output, { recursive: true });
		await writeFile(path.join(output, name), bytes);
		await writeFile(
			path.join(output, 'assets.json'),
			JSON.stringify(
				{
					sourceHash,
					sources: sourceHashes,
					captureMode:
						capturePath === articlePath ? 'local-article-browser' : 'local-component-browser',
					articlePath,
					capturePath,
					...state,
					files: { [name]: { ...dimensions, pixelSha256: await pixelHash(bytes) } }
				},
				null,
				2
			) + '\n'
		);
		console.log(
			`OpenHIE: captured actual ${capturePath === articlePath ? 'article' : 'component'} instrument at ${state.scenario} event ${state.step}.`
		);
	} finally {
		await browser.close();
	}
}
