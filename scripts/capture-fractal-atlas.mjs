import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const baseURL = process.env.FRACTAL_ATLAS_BASE_URL?.trim() || 'http://127.0.0.1:4214';
const articlePath = '/blog/visualizations/the-fractal-atlas';
const outputDirectory = path.resolve('docs/fractal-atlas-captures');
const desktopViewport = { width: 1440, height: 1_000 };

await fs.mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({
	channel: process.env.PLAYWRIGHT_CHANNEL?.trim() || 'chrome',
	headless: true
});

const captures = [];

async function openAtlas({
	pathname = articlePath,
	viewport = desktopViewport,
	forcedColors = 'none'
} = {}) {
	const context = await browser.newContext({
		viewport,
		deviceScaleFactor: 1,
		reducedMotion: 'reduce',
		forcedColors
	});
	const page = await context.newPage();
	const diagnostics = [];

	page.on('pageerror', (error) => diagnostics.push(`pageerror: ${error.message}`));
	page.on('console', (message) => {
		if (message.type() !== 'warning' && message.type() !== 'error') return;
		const source = `${message.location().url} ${message.text()}`;
		if (source.includes('/_vercel/') || /favicon/iu.test(source)) return;
		diagnostics.push(`${message.type()}: ${message.text()}`);
	});

	await page.goto(`${baseURL}${pathname}`, { waitUntil: 'domcontentloaded' });
	const lab = page.getByTestId('fractal-atlas-lab');
	await lab.waitFor({ state: 'visible' });
	await page.waitForFunction(
		() =>
			document.querySelector('[data-testid="fractal-atlas-lab"]')?.getAttribute('data-hydrated') ===
			'true'
	);
	await lab.locator('.primary-plane .fractal-stage').scrollIntoViewIfNeeded();
	await page.waitForFunction(() =>
		/^(webgl2|canvas-2d|worker|vector)$/u.test(
			document.querySelector('[data-testid="fractal-atlas-lab"]')?.getAttribute('data-backend') ?? ''
		)
	);

	return { context, page, lab, diagnostics };
}

async function captureViewport(specimen, name, anchor = specimen.lab.locator('.atlas-header')) {
	await anchor.evaluate((element) => element.scrollIntoView({ block: 'start', inline: 'nearest' }));
	await specimen.page.evaluate(() => window.scrollBy(0, -72));
	await specimen.page.waitForTimeout(180);
	const file = path.join(outputDirectory, `${name}.png`);
	await specimen.page.screenshot({
		path: file,
		fullPage: false,
		animations: 'disabled'
	});
	captures.push(file);
}

async function closeSpecimen(specimen) {
	if (specimen.diagnostics.length) {
		throw new Error(specimen.diagnostics.join('\n'));
	}
	await specimen.context.close();
}

try {
	const defaultSpecimen = await openAtlas();
	await captureViewport(defaultSpecimen, '01-default-dual-plane');
	await closeSpecimen(defaultSpecimen);

	const mobileSpecimen = await openAtlas({ viewport: { width: 390, height: 844 } });
	await captureViewport(mobileSpecimen, '02-mobile-view');
	await closeSpecimen(mobileSpecimen);

	const orbitSpecimen = await openAtlas();
	await orbitSpecimen.lab.getByRole('button', { name: 'Orbit inspector' }).click();
	const orbitPanel = orbitSpecimen.lab.locator('.orbit-inspector');
	await orbitPanel.waitFor({ state: 'visible' });
	await captureViewport(orbitSpecimen, '03-orbit-inspector', orbitPanel);
	await closeSpecimen(orbitSpecimen);

	const newtonSpecimen = await openAtlas();
	await newtonSpecimen.lab.getByRole('button', { name: 'Newton', exact: true }).click();
	await newtonSpecimen.page.waitForFunction(
		() =>
			document.querySelector('[data-testid="fractal-atlas-lab"]')?.getAttribute('data-family') ===
			'newton'
	);
	await captureViewport(newtonSpecimen, '04-newton-mode');
	await closeSpecimen(newtonSpecimen);

	const buddhabrotSpecimen = await openAtlas();
	await buddhabrotSpecimen.lab.getByRole('button', { name: 'Buddhabrot', exact: true }).click();
	await buddhabrotSpecimen.page.waitForFunction(
		() =>
			document.querySelector('[data-testid="fractal-atlas-lab"]')?.getAttribute('data-backend') ===
				'worker' &&
			Number(
				document.querySelector('[data-testid="fractal-atlas-lab"]')?.getAttribute('data-progress')
			) > 0
	);
	await buddhabrotSpecimen.lab.getByRole('button', { name: 'Pause', exact: true }).click();
	await captureViewport(buddhabrotSpecimen, '05-buddhabrot-mode');
	await closeSpecimen(buddhabrotSpecimen);

	const precisionSpecimen = await openAtlas({
		pathname: `${articlePath}?v=1&f=mandelbrot&x=-0.743643887037151&y=0.13182590420533&s=2.4e-13&it=240&prec=double-single&q=battery`
	});
	await precisionSpecimen.lab.getByRole('button', { name: 'Precision meter' }).click();
	const precisionPanel = precisionSpecimen.lab.locator('.precision');
	await precisionPanel.waitFor({ state: 'visible' });
	await captureViewport(precisionSpecimen, '06-precision-comparison', precisionPanel);
	await closeSpecimen(precisionSpecimen);

	const forcedColorsSpecimen = await openAtlas({ forcedColors: 'active' });
	await captureViewport(forcedColorsSpecimen, '07-forced-colours-view');
	await closeSpecimen(forcedColorsSpecimen);
} finally {
	await browser.close();
}

console.log(`Captured ${captures.length} Fractal Atlas handoff views:`);
for (const capture of captures) {
	console.log(`- ${path.relative(process.cwd(), capture)}`);
}
