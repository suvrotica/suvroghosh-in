/**
 * Actual instrument captures. Start Vite/preview at BASE_URL, then run this file.
 * --check verifies committed artwork and source provenance without a browser.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(ROOT, 'static/images/visualizations/probabilistic-piano');
const ARTIFACTS = path.join(ROOT, 'artifacts/probabilistic-piano');
const MANIFEST = path.join(OUTPUT, 'assets.json');
const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:5175';
const ROUTE = '/blog/visualizations/the-piano-that-forgives';
const CAPTURE_VERSION = 'probabilistic-piano-browser-capture-v2';
const MAX_BYTES = 750 * 1024;
const SOURCES = [
	'src/lib/visualizations/probabilistic-piano/model.ts',
	'src/lib/visualizations/probabilistic-piano/keyboard.ts',
	'src/lib/visualizations/probabilistic-piano/effects.ts',
	'src/lib/visualizations/probabilistic-piano/audio.ts',
	'src/lib/visualizations/probabilistic-piano/painting.ts',
	'src/lib/components/visualizations/probabilistic-piano/ProbabilisticPiano.svelte',
	'src/lib/components/visualizations/probabilistic-piano/piano.css',
	'scripts/render-probabilistic-piano-assets.mjs'
];
const EXPECTED = {
	'piano-poster.jpg': { width: 1440, height: 760 },
	'piano-social.jpg': { width: 1200, height: 630 }
};
const STATE = {
	modelVersion: '2',
	keyboardRange: 'A0–C8 / MIDI 21–108',
	publicationMotion: 'still',
	desktopView: 'fit',
	phoneView: 'playing',
	captureViewportHeight: 3000,
	preset: 'pond',
	chord: 'C6/9',
	mode: 'nearest',
	temperature: 0.7,
	seed: 1907,
	eventIndex: 0,
	requestedMidi: 61,
	selectedMidi: 60,
	previousMelody: [],
	activeBeforePress: [],
	sound: false
};

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
async function sourceHash() {
	const inputs = await Promise.all(
		SOURCES.map(
			async (name) =>
				`${name}\0${(await readFile(path.join(ROOT, name), 'utf8')).replace(/\r\n?/g, '\n')}`
		)
	);
	return sha256(`${CAPTURE_VERSION}\0${inputs.join('\0')}`);
}

async function matchesCaptureOrOptimization(name, bytes, recorded) {
	const currentHash = sha256(bytes);
	if (bytes.length === recorded.bytes && currentHash === recorded.sha256) return true;
	// The normal build can re-encode raster publication inputs. Accept that one
	// explicit same-dimension derivation, preserving the renderer capture's hash.
	const optimization = JSON.parse(
		await readFile(path.join(ROOT, 'scripts/image-optimization-manifest.json'), 'utf8')
	);
	const entry = optimization.files?.[`static/images/visualizations/probabilistic-piano/${name}`];
	return Boolean(
		entry &&
		entry.optimizerVersion === optimization.version &&
		entry.sourceHash === recorded.sha256 &&
		entry.sourceBytes === recorded.bytes &&
		entry.outputHash === currentHash &&
		entry.outputBytes === bytes.length &&
		entry.originalWidth === recorded.width &&
		entry.originalHeight === recorded.height &&
		entry.width === recorded.width &&
		entry.height === recorded.height &&
		entry.resized === false
	);
}

async function verify(fingerprint) {
	const manifest = JSON.parse(await readFile(MANIFEST, 'utf8'));
	if (manifest.version !== 1 || manifest.captureVersion !== CAPTURE_VERSION)
		throw new Error('Unknown probabilistic-piano capture manifest.');
	if (manifest.sourceHash !== fingerprint)
		throw new Error(
			'Piano artwork is stale. Run npm run probabilistic-piano:assets against the local site.'
		);
	if (JSON.stringify(manifest.state) !== JSON.stringify(STATE))
		throw new Error('Piano capture state no longer matches the documented fixture.');
	if (
		JSON.stringify(Object.keys(manifest.files || {}).sort()) !==
		JSON.stringify(Object.keys(EXPECTED).sort())
	)
		throw new Error('Piano artwork manifest has an unexpected file set.');
	for (const [name, dimensions] of Object.entries(EXPECTED)) {
		const bytes = await readFile(path.join(OUTPUT, name));
		const metadata = await sharp(bytes).metadata();
		const recorded = manifest.files[name];
		if (
			metadata.format !== 'jpeg' ||
			metadata.width !== dimensions.width ||
			metadata.height !== dimensions.height
		)
			throw new Error(`Invalid piano artwork dimensions or format: ${name}`);
		if (bytes.length > MAX_BYTES || !(await matchesCaptureOrOptimization(name, bytes, recorded)))
			throw new Error(`Piano artwork content/byte budget mismatch: ${name}`);
		if (recorded.width !== dimensions.width || recorded.height !== dimensions.height)
			throw new Error(`Piano artwork manifest dimensions disagree: ${name}`);
	}
	console.log(
		'Probabilistic piano: 2 actual instrument captures verified against current source, dimensions and hashes.'
	);
}

async function openCapture(browser, options = {}) {
	const context = await browser.newContext({
		deviceScaleFactor: 1,
		colorScheme: 'light',
		reducedMotion: 'reduce',
		...options,
		// The whole instrument fits without screenshot-time viewport emulation.
		viewport: { width: options.viewport?.width ?? 1472, height: STATE.captureViewportHeight },
		serviceWorkers: 'block'
	});
	const page = await context.newPage();
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto(`${BASE_URL}${ROUTE}`, { waitUntil: 'networkidle' });
	// Keep the instrument itself unchanged while preventing sticky site chrome
	// from covering a locator capture after Playwright scrolls it into view.
	await page.addStyleTag({ content: '.site-header { visibility: hidden !important; }' });
	await page.getByRole('button', { name: 'Enable sound', exact: false }).waitFor();
	await page.waitForFunction(() => {
		const button = document.querySelector('.sound-button');
		const canvas = document.querySelector('[data-piano-stage] canvas');
		return button && !button.disabled && canvas && canvas.width > 300;
	});
	await page.evaluate(() => document.fonts.ready);
	const rejectOptional = page.getByRole('button', { name: 'Reject optional', exact: true });
	await rejectOptional.waitFor({ state: 'visible', timeout: 5000 }).catch((error) => {
		if (error.name !== 'TimeoutError') throw error;
	});
	if (await rejectOptional.isVisible()) await rejectOptional.click();
	await page
		.getByText('Your choices are saved.', { exact: false })
		.waitFor({ state: 'hidden', timeout: 10000 });
	const fit = page.getByRole('button', { name: 'Fit all 88 keys', exact: true });
	const summary = page.locator('details.piano-workbench > summary');
	await summary.click();
	await page.getByLabel('Musical seed', { exact: true }).fill(String(STATE.seed));
	const temperature = page.getByLabel('Temperature', { exact: true });
	await temperature.focus();
	await temperature.press('Home');
	for (let index = 0; index < 14; index++) await temperature.press('ArrowRight');
	await summary.click();
	if ((options.viewport?.width ?? 1472) >= 1200) await fit.click();
	const key = page.locator('[data-piano-key="61"]');
	await key.focus();
	await page.keyboard.down('w');
	await page.locator('[data-piano-root][data-held="1"]').waitFor();
	await page.waitForFunction(() => {
		const distribution = document.querySelector('.decision-inspector table');
		return (
			distribution?.textContent.includes('54.98%') && distribution.textContent.includes('45.02%')
		);
	});
	await page.waitForFunction(() =>
		document.querySelector('.piano-whisper')?.textContent.includes('C♯4 → C4')
	);
	await page.waitForFunction(
		(expected) =>
			document.querySelector('[data-piano-root]')?.getAttribute('data-view') === expected,
		(options.viewport?.width ?? 1472) >= 1200 ? 'fit' : 'playing'
	);
	return { context, page, errors, summary };
}

/** Crop the real viewport pixels; never resize it implicitly for an element capture. */
async function captureElement(page, selector, destination) {
	const target = page.locator(selector);
	await target.scrollIntoViewIfNeeded();
	const view = await page.locator('[data-piano-root]').getAttribute('data-view');
	const clip = await target.evaluate((element) => {
		const rect = element.getBoundingClientRect();
		return {
			left: Math.round(rect.left),
			top: Math.round(rect.top),
			width: Math.round(rect.width),
			height: Math.round(rect.height)
		};
	});
	const viewport = page.viewportSize();
	if (
		clip.left < 0 ||
		clip.top < 0 ||
		clip.left + clip.width > viewport.width ||
		clip.top + clip.height > viewport.height
	)
		throw new Error('Capture target does not fit the fixed viewport.');
	const screenshot = await page.screenshot({
		type: 'png',
		fullPage: false,
		animations: 'disabled'
	});
	const bytes = await sharp(screenshot).extract(clip).png().toBuffer();
	if (destination) await writeFile(destination, bytes);
	if ((await page.locator('[data-piano-root]').getAttribute('data-view')) !== view)
		throw new Error('Capture changed the keyboard viewport.');
	return bytes;
}

async function generate(fingerprint) {
	await mkdir(OUTPUT, { recursive: true });
	await mkdir(ARTIFACTS, { recursive: true });
	const browser = await chromium.launch({
		channel: process.env.PLAYWRIGHT_CHANNEL?.trim() || (process.env.CI ? undefined : 'chrome'),
		headless: true
	});
	const manifest = {
		version: 1,
		captureVersion: CAPTURE_VERSION,
		sourceHash: fingerprint,
		provenance:
			'Actual local Svelte instrument, native keys and Canvas2D pond. The social image adds an editorial title band above the same unaltered stage capture. Poster letterboxing preserves the entire stage geometry.',
		state: STATE,
		sources: SOURCES,
		files: {}
	};
	async function saveJpeg(name, input) {
		const bytes = await sharp(input).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
		if (bytes.length > MAX_BYTES) throw new Error(`Artwork exceeds ${MAX_BYTES} bytes: ${name}`);
		await writeFile(path.join(OUTPUT, name), bytes);
		manifest.files[name] = { ...EXPECTED[name], bytes: bytes.length, sha256: sha256(bytes) };
		console.log(
			`Captured ${name}: ${EXPECTED[name].width} × ${EXPECTED[name].height}, ${Math.round(bytes.length / 1024)} KiB`
		);
	}
	try {
		const desktop = await openCapture(browser);
		await captureElement(desktop.page, '[data-piano-root]', path.join(ARTIFACTS, 'desktop.png'));
		const stage = await captureElement(desktop.page, '[data-piano-stage]');
		const poster = await sharp(stage)
			.resize(1440, 760, { fit: 'contain', background: '#14252a' })
			.png()
			.toBuffer();
		await saveJpeg('piano-poster.jpg', poster);
		const stageSocial = await sharp(stage).resize(1200, 446, { fit: 'fill' }).png().toBuffer();
		const heading = Buffer.from(
			'<svg width="1200" height="184" xmlns="http://www.w3.org/2000/svg"><rect width="1200" height="184" fill="#eae6d9"/><text x="46" y="39" font-family="sans-serif" font-size="12" letter-spacing="4" fill="#496b62">SUVRO GHOSH / THE LISTENING GARDEN</text><text x="42" y="105" font-family="Georgia,serif" font-size="61" fill="#233b3c">The piano that forgives.</text><text x="46" y="148" font-family="Georgia,serif" font-size="24" fill="#496b62">Painting jazz with probability</text><text x="1154" y="147" text-anchor="end" font-family="sans-serif" font-size="11" letter-spacing="2" fill="#496b62">VISUALIZATIONS</text></svg>'
		);
		const social = await sharp({
			create: { width: 1200, height: 630, channels: 3, background: '#14252a' }
		})
			.composite([
				{ input: heading, top: 0, left: 0 },
				{ input: stageSocial, top: 184, left: 0 }
			])
			.png()
			.toBuffer();
		await saveJpeg('piano-social.jpg', social);
		await desktop.page.keyboard.up('w');
		await desktop.summary.click();
		await captureElement(
			desktop.page,
			'.decision-inspector',
			path.join(ARTIFACTS, 'inspector.png')
		);
		await desktop.summary.click();
		await desktop.page.getByRole('button', { name: /Find a home note/ }).click();
		await captureElement(desktop.page, '[data-piano-stage]', path.join(ARTIFACTS, 'unchanged.png'));
		if (desktop.errors.length) throw new Error(desktop.errors.join('; '));
		await desktop.context.close();
		const phone = await openCapture(browser, {
			viewport: { width: 390, height: 844 },
			isMobile: true,
			hasTouch: true,
			colorScheme: 'dark'
		});
		await captureElement(phone.page, '[data-piano-root]', path.join(ARTIFACTS, 'mobile.png'));
		await phone.page.keyboard.up('w');
		if (phone.errors.length) throw new Error(phone.errors.join('; '));
		await phone.context.close();
		const still = await openCapture(browser, { reducedMotion: 'reduce' });
		await still.page.locator('[data-piano-root].still').waitFor();
		await captureElement(still.page, '[data-piano-root]', path.join(ARTIFACTS, 'still.png'));
		await still.page.keyboard.up('w');
		if (still.errors.length) throw new Error(still.errors.join('; '));
		await still.context.close();
		const tablet = await openCapture(browser, { viewport: { width: 768, height: 1024 } });
		await captureElement(tablet.page, '[data-piano-root]', path.join(ARTIFACTS, 'tablet.png'));
		await tablet.page.keyboard.up('w');
		if (tablet.errors.length) throw new Error(tablet.errors.join('; '));
		await tablet.context.close();
		const motion = await openCapture(browser, { reducedMotion: 'no-preference' });
		await motion.page.getByRole('button', { name: 'Enter focus view', exact: true }).click();
		await motion.page.locator('[data-piano-key="64"]').focus();
		await motion.page.keyboard.down('d');
		await motion.page.keyboard.down('g');
		await motion.page.waitForTimeout(700);
		await captureElement(
			motion.page,
			'[data-piano-root]',
			path.join(ARTIFACTS, 'focus-motion.png')
		);
		await motion.page.keyboard.up('w');
		await motion.page.keyboard.up('d');
		await motion.page.keyboard.up('g');
		if (motion.errors.length) throw new Error(motion.errors.join('; '));
		await motion.context.close();
		await writeFile(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
	} finally {
		await browser.close();
	}
	await verify(fingerprint);
}

const fingerprint = await sourceHash();
if (process.argv.includes('--check')) await verify(fingerprint);
else await generate(fingerprint);
