import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const feature = 'between-a-click-and-a-page';
const articlePath = `/blog/visualizations/${feature}`;
const componentDirectory = `src/lib/components/visualizations/${feature}`;
const modelDirectory = `src/lib/visualizations/${feature}`;
const outputDirectory = path.join(root, 'static/images/visualizations', feature);
const dimensions = { width: 1200, height: 630 };
const captureMode = 'local-article-browser';
const state = 'default-paused';
const contentStatus = 'illustrative-model';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const pixels = async (bytes) => hash(await sharp(bytes).ensureAlpha().raw().toBuffer());

async function componentSources(directory) {
	const entries = await readdir(path.join(root, directory), { withFileTypes: true });
	const nested = await Promise.all(
		entries.map(async (entry) => {
			const relative = `${directory}/${entry.name}`;
			if (entry.isDirectory()) return componentSources(relative);
			return /\.(?:svelte|css)$/u.test(entry.name) ? [relative] : [];
		})
	);
	return nested.flat().sort();
}

async function provenance() {
	const paths = [
		...(await componentSources(componentDirectory)),
		`${modelDirectory}/model.ts`,
		`${modelDirectory}/geometry.json`,
		`${modelDirectory}/generate-geometry.mjs`,
		'scripts/render-http-tcp-assets.mjs'
	].sort();
	const sources = {};
	for (const source of paths) {
		const normalized = (await readFile(path.join(root, source), 'utf8')).replace(/\r\n?/gu, '\n');
		sources[source] = hash(normalized);
	}
	return { sources, sourceHash: hash(JSON.stringify(sources)) };
}

const args = process.argv.slice(2);
let checking = false;
let baseValue = 'http://127.0.0.1:4296';
for (let index = 0; index < args.length; index += 1) {
	if (args[index] === '--check') checking = true;
	else if (args[index] === '--base') {
		baseValue = args[index + 1];
		if (!baseValue || baseValue.startsWith('--'))
			throw new Error('--base requires a loopback URL.');
		index += 1;
	} else throw new Error(`Unknown argument: ${args[index]}`);
}
const base = new URL(baseValue);
if (
	!['http:', 'https:'].includes(base.protocol) ||
	!['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname) ||
	base.username ||
	base.password
)
	throw new Error('Capture requires an HTTP(S) loopback preview URL without credentials.');

const current = await provenance();
if (checking) {
	const manifest = JSON.parse(await readFile(path.join(outputDirectory, 'assets.json'), 'utf8'));
	const bytes = await readFile(path.join(outputDirectory, 'social.png'));
	const metadata = await sharp(bytes).metadata();
	if (
		manifest.sourceHash !== current.sourceHash ||
		JSON.stringify(manifest.sources) !== JSON.stringify(current.sources)
	)
		throw new Error(`${feature}: scene sources changed; recapture the publication image.`);
	if (
		metadata.format !== 'png' ||
		metadata.width !== dimensions.width ||
		metadata.height !== dimensions.height ||
		manifest.width !== dimensions.width ||
		manifest.height !== dimensions.height
	)
		throw new Error(`${feature}: expected a 1200 × 630 PNG and matching manifest dimensions.`);
	if (manifest.pixelSha256 !== (await pixels(bytes)))
		throw new Error(`${feature}: captured pixels differ from their provenance.`);
	if (
		manifest.articlePath !== articlePath ||
		manifest.capturePath !== articlePath ||
		manifest.captureMode !== captureMode ||
		manifest.state !== state ||
		manifest.contentStatus !== contentStatus ||
		manifest.theme !== 'paper' ||
		manifest.reducedMotion !== 'reduce' ||
		manifest.stage !== 'dns'
	)
		throw new Error(`${feature}: invalid article or capture-state provenance.`);
	console.log(
		`${feature}: paused default scene, dimensions, source hashes and pixel provenance verified.`
	);
} else {
	const { chromium } = await import('playwright');
	const browser = await chromium.launch({
		channel: process.env.PLAYWRIGHT_CHANNEL?.trim() || (process.env.CI ? undefined : 'chrome'),
		headless: true
	});
	try {
		const page = await browser.newPage({
			viewport: { width: 1440, height: 1240 },
			deviceScaleFactor: 1,
			serviceWorkers: 'block',
			reducedMotion: 'reduce',
			colorScheme: 'light'
		});
		const errors = [];
		page.on('pageerror', (error) => errors.push(error.message));
		// The only navigated page is the local article. Prevent analytics, live-site
		// fallbacks and other external requests from entering a deterministic capture.
		await page.route('**/*', (route) => {
			const url = new URL(route.request().url());
			return url.origin === base.origin || ['data:', 'blob:'].includes(url.protocol)
				? route.continue()
				: route.abort('blockedbyclient');
		});
		await page.addInitScript(() => {
			localStorage.setItem('site-theme', 'paper');
		});
		await page.goto(new URL(articlePath, base).href, {
			waitUntil: 'domcontentloaded',
			timeout: 90_000
		});
		const shell = page.locator('[data-network-feature]').first();
		await shell.scrollIntoViewIfNeeded();
		const ready = shell.locator('[data-network-ready]').first();
		await ready.waitFor({ timeout: 60_000 });
		await shell.locator('[data-network-ready][data-still="true"]').waitFor({ timeout: 10_000 });
		// Wait for and dismiss the native notice without storing a preference. This
		// keeps capture independent of the site's current media-choice button labels.
		const privacyNote = page.locator('[data-privacy-note]');
		await privacyNote.waitFor({ state: 'visible', timeout: 15_000 });
		await privacyNote
			.getByRole('button', { name: 'Dismiss privacy notice without choosing', exact: true })
			.click();
		await privacyNote.waitFor({ state: 'hidden' });
		await page.evaluate(() => document.fonts.ready);
		const capture = ready.locator('[data-network-poster]').first();
		await capture.scrollIntoViewIfNeeded();
		await page.evaluate(
			() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
		);
		const stage = await ready.getAttribute('data-stage');
		if (stage !== 'dns')
			throw new Error(`${feature}: default capture must start at the DNS stage.`);
		const play = ready.getByRole('button', { name: 'Follow the request', exact: true });
		if (!(await play.isDisabled()))
			throw new Error(`${feature}: reduced-motion capture must be paused.`);
		const defaults = await ready.evaluate((element) => ({
			fresh: element.querySelector('input[type="radio"]')?.checked,
			rtt: element.querySelector('input[aria-label="Round-trip delay"]')?.value,
			server: element.querySelector('select[aria-label="Server work"]')?.value,
			checkedExperiments: element.querySelectorAll('input[type="checkbox"]:checked').length,
			elapsed: element.querySelector('[data-network-poster] output')?.textContent?.trim()
		}));
		if (
			defaults.fresh !== true ||
			defaults.rtt !== '120' ||
			defaults.server !== '80' ||
			defaults.checkedExperiments !== 0 ||
			defaults.elapsed !== '0 ms'
		)
			throw new Error(`${feature}: capture must retain the unchanged default scenario.`);
		const screenshot = await capture.screenshot({
			animations: 'disabled',
			style: '.site-header { visibility: hidden !important; }'
		});
		if (errors.length) throw new Error(`${feature}: ${errors.join('; ')}`);
		const bytes = await sharp(screenshot)
			.resize({ ...dimensions, fit: 'contain', background: '#f0eee6' })
			.png()
			.toBuffer();
		await mkdir(outputDirectory, { recursive: true });
		await writeFile(path.join(outputDirectory, 'social.png'), bytes);
		await writeFile(
			path.join(outputDirectory, 'assets.json'),
			`${JSON.stringify(
				{
					...current,
					articlePath,
					capturePath: articlePath,
					captureMode,
					state,
					contentStatus,
					theme: 'paper',
					reducedMotion: 'reduce',
					stage,
					...dimensions,
					pixelSha256: await pixels(bytes)
				},
				null,
				2
			)}\n`
		);
		console.log(`${feature}: captured the implemented article's paused default scene.`);
	} finally {
		await browser.close();
	}
}
