import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const base = process.env.ESSAY_ANATOMY_BASE_URL || 'http://127.0.0.1:4326';
const directory = '.codex-artifacts/essay-anatomy';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({
	channel: process.env.PLAYWRIGHT_CHANNEL || (process.env.CI ? undefined : 'chrome'),
	headless: true
});
try {
	const context = await browser.newContext({
		viewport: { width: 1440, height: 1100 },
		reducedMotion: 'reduce',
		serviceWorkers: 'block'
	});
	const page = await context.newPage();
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto(`${base}/blog/visualizations/anatomy-of-an-essay`);
	await page.waitForSelector('[data-ready="true"]');
	await page.screenshot({ path: `${directory}/desktop.png` });
	await page.locator('.ea-workspace').scrollIntoViewIfNeeded();
	await page.screenshot({ path: `${directory}/reading.png` });
	const coil = page.locator('.ea-coil').first();
	const sentenceId = await coil.getAttribute('data-sentence');
	await page.locator(`[data-source-sentence="${sentenceId}"]`).click();
	await page.locator('.ea-specimen').scrollIntoViewIfNeeded();
	await page.screenshot({ path: `${directory}/selected-sentence.png` });
	await page.getByRole('button', { name: /^Dissect/ }).click();
	await page.locator('.ea-specimen').scrollIntoViewIfNeeded();
	await page.screenshot({ path: `${directory}/dissected.png` });
	await page.getByRole('button', { name: /^Reassemble/ }).click();
	await page.getByRole('button', { name: 'Compare two', exact: true }).click();
	await page.waitForSelector('.ea-second .ea-svg');
	await page.locator('.ea-workspace').scrollIntoViewIfNeeded();
	await page.screenshot({ path: `${directory}/comparison.png` });
	await page
		.locator('.ea-svg')
		.first()
		.screenshot({ path: `${directory}/specimen-close.png`, scale: 'css' });
	await page.evaluate(() => document.documentElement.classList.add('dark'));
	await page.screenshot({ path: `${directory}/dark-comparison.png` });
	const darkA11y = await new AxeBuilder({ page }).include('.essay-atlas').analyze();
	await page.evaluate(() => document.documentElement.classList.remove('dark'));
	await page.getByRole('button', { name: 'Read a body', exact: true }).click();
	const lightA11y = await new AxeBuilder({ page }).include('.essay-atlas').analyze();
	await page.setViewportSize({ width: 390, height: 844 });
	await page.evaluate(() => window.scrollTo(0, 0));
	await page.screenshot({ path: `${directory}/mobile.png` });
	await page.locator('.ea-specimen').scrollIntoViewIfNeeded();
	await page.screenshot({ path: `${directory}/mobile-reading.png` });
	const violations = (result) =>
		result.violations.map((violation) => ({
			id: violation.id,
			impact: violation.impact,
			nodes: violation.nodes.map((node) => ({ target: node.target, summary: node.failureSummary }))
		}));
	const report = {
		route: `${base}/blog/visualizations/anatomy-of-an-essay`,
		screenshots: 9,
		selectedCoilSentence: sentenceId,
		browserErrors: errors,
		accessibility: { light: violations(lightA11y), dark: violations(darkA11y) }
	};
	await writeFile(`${directory}/verification.json`, JSON.stringify(report, null, 2) + '\n');
	console.log(JSON.stringify(report, null, 2));
	if (errors.length || report.accessibility.light.length || report.accessibility.dark.length)
		process.exitCode = 1;
} finally {
	await browser.close();
}
