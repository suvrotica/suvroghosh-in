import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import sharp from 'sharp';
import AxeBuilder from '@axe-core/playwright';
import { extractNarration } from '../../src/lib/components/blog/tts/narration.mjs';

const features = [
	'build-one-build-a-thousand',
	'the-six-week-shadow',
	'the-museum-of-almost'
] as const;
type Feature = (typeof features)[number];
const route = (feature: Feature) => `/blog/visualizations/${feature}`;
const shell = (page: Page, feature: Feature) => page.locator(`[data-maker-feature="${feature}"]`);
const runtime = (page: Page, feature: Feature) =>
	shell(page, feature).locator('[data-maker-ready="true"]');
const output = '.codex-artifacts/maker-collection';

async function ready(page: Page, feature: Feature) {
	await page.goto(route(feature), { waitUntil: 'domcontentloaded' });
	await shell(page, feature).scrollIntoViewIfNeeded();
	await expect(runtime(page, feature)).toBeVisible({ timeout: 60_000 });
	for (const name of ['Reject optional', 'Dismiss privacy confirmation']) {
		const button = page.getByRole('button', { name, exact: true });
		if (await button.isVisible()) await button.click();
	}
	return runtime(page, feature);
}

for (const feature of features) {
	test(`${feature}: readable SSR, real poster and stable narration`, async ({
		browser,
		page,
		baseURL,
		request
	}) => {
		const context = await browser.newContext({
			baseURL,
			javaScriptEnabled: false,
			serviceWorkers: 'block'
		});
		try {
			const ssr = await context.newPage();
			await ssr.goto(route(feature), { waitUntil: 'domcontentloaded' });
			await expect(shell(ssr, feature)).toBeVisible();
			await expect(shell(ssr, feature).locator('svg').first()).toBeVisible();
			expect(await shell(ssr, feature).getAttribute('data-tts-exclude')).not.toBeNull();
			const transcript = await ssr.evaluate(extractNarration, undefined);
			expect(transcript.length).toBeGreaterThan(400);
			await expect(ssr.getByRole('heading', { level: 1 })).toHaveCount(1);
			for (const sibling of features.filter((id) => id !== feature))
				await expect(ssr.locator(`a[href="${route(sibling)}"]`).first()).toBeVisible();
			const poster = await request.get(`/images/visualizations/${feature}/social.png`);
			expect(poster.ok()).toBe(true);
			expect(await sharp(await poster.body()).metadata()).toMatchObject({
				width: 1200,
				height: 630,
				format: 'png'
			});
			const live = await ready(page, feature);
			expect(await page.evaluate(extractNarration, undefined)).toBe(transcript);
			await live.getByRole('button').first().click();
			expect(await page.evaluate(extractNarration, undefined)).toBe(transcript);
		} finally {
			await context.close();
		}
	});

	test(`${feature}: phone, keyboard, themes, Still and accessibility`, async ({ page }) => {
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await page.addInitScript(() => {
			localStorage.setItem('site-theme', 'paper');
			localStorage.setItem('site-motion', 'still');
		});
		const live = await ready(page, feature);
		await mkdir(output, { recursive: true });
		await shell(page, feature).screenshot({
			path: `${output}/${feature}-desktop-paper.png`,
			style: '.site-header { visibility: hidden !important; }',
			animations: 'disabled'
		});
		const paperBackground = await shell(page, feature).evaluate(
			(element) => getComputedStyle(element).backgroundColor
		);
		await page.locator('#desktop-theme').selectOption('night');
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'night');
		await expect
			.poll(() =>
				shell(page, feature).evaluate((element) => getComputedStyle(element).backgroundColor)
			)
			.not.toBe(paperBackground);
		await shell(page, feature).screenshot({
			path: `${output}/${feature}-desktop-night.png`,
			style: '.site-header { visibility: hidden !important; }',
			animations: 'disabled'
		});
		await page.setViewportSize({ width: 390, height: 844 });
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await shell(page, feature).scrollIntoViewIfNeeded();
		await shell(page, feature).screenshot({
			path: `${output}/${feature}-phone-night.png`,
			style: '.site-header { visibility: hidden !important; }',
			animations: 'disabled'
		});
		expect(
			await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
		).toBe(true);
		const small = await live
			.locator('button:visible, input[type="number"]:visible, input[type="range"]:visible')
			.evaluateAll((elements) =>
				elements
					.filter((element) => {
						const rect = element.getBoundingClientRect();
						return rect.width < 43.5 || rect.height < 43.5;
					})
					.map((element) => ({
						name: element.getAttribute('aria-label') || element.textContent,
						width: element.getBoundingClientRect().width,
						height: element.getBoundingClientRect().height
					}))
			);
		expect(small).toEqual([]);
		// Enter the feature through ordinary tab order and activate its first button.
		await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
		await page.keyboard.press('Control+Home');
		let reached = false;
		for (let i = 0; i < 110; i++) {
			await page.keyboard.press('Tab');
			reached = await live.evaluate(
				(element) =>
					element.contains(document.activeElement) && document.activeElement?.tagName === 'BUTTON'
			);
			if (reached) break;
		}
		expect(reached).toBe(true);
		await page.keyboard.press('Enter');
		const audit = await new AxeBuilder({ page })
			.include(`[data-maker-feature="${feature}"]`)
			.withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
			.analyze();
		expect(audit.violations).toEqual([]);
		expect(errors).toEqual([]);
	});
}

test('the gallery discovers all three articles under Design', async ({ page }) => {
	await page.goto('/blog/visualizations');
	await page.getByRole('button', { name: 'Design', exact: true }).click();
	for (const feature of features)
		await expect(page.locator(`a[href="${route(feature)}"]`).first()).toBeVisible();
});

test('workshop decisions expose the small-batch cost, complete comparison and reset', async ({
	page
}) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	const lab = await ready(page, 'build-one-build-a-thousand');
	const results = lab.locator('.bott-results');
	await expect(results).toContainText('1 h');
	await lab.getByRole('button', { name: '10', exact: true }).click();
	await lab.getByRole('checkbox', { name: /Cutting guide/u }).check();
	await expect(results).toContainText('10 h 30 min');
	const number = lab.getByRole('spinbutton', { name: 'Exact order quantity' });
	await number.fill('1000');
	await number.press('Tab');
	await lab.getByRole('checkbox', { name: /Illustrated instructions/u }).check();
	await lab.getByRole('checkbox', { name: /Protective packaging/u }).check();
	await expect(results).toContainText('694 h 30 min');
	await expect(results).toContainText('Working day 105');
	await lab.getByRole('button', { name: 'Compare with original setup', exact: true }).click();
	const comparison = lab.locator('.bott-comparison');
	await expect(comparison).toContainText('Working day 153');
	await expect(comparison).toContainText('Working day 105');
	await lab.getByRole('button', { name: /Chapter 3:/u }).click();
	await lab.getByRole('button', { name: 'Reset workshop', exact: true }).click();
	await expect(number).toHaveValue('1');
	await expect(lab.getByRole('button', { name: /Chapter 3:/u })).toHaveAttribute(
		'aria-current',
		'step'
	);
	for (const checkbox of await lab.getByRole('checkbox').all())
		await expect(checkbox).not.toBeChecked();
	await expect(results).toContainText('1 h');
	for (const name of [
		'Cutting & preparation',
		'Material stock',
		'Assembly & fixes',
		'Packing',
		'Customer shelf'
	]) {
		await lab.getByRole('button', { name, exact: true }).click();
		await expect(lab.locator('.bott-inspector')).toBeVisible();
	}
});

test('the shadow keeps elapsed time, effort, waits and dependency inspection consistent', async ({
	page
}) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	const lab = await ready(page, 'the-six-week-shadow');
	await expect(lab.locator('[data-shadow-elapsed]')).toHaveText('No change');
	await lab.getByRole('button', { name: 'Move the button', exact: true }).first().click();
	await expect(lab.locator('[data-shadow-elapsed]')).toHaveText('30');
	await expect(lab.locator('[data-shadow-effort]')).toHaveText('20');
	await lab.getByRole('button', { name: 'Explore the complete workshop', exact: true }).click();
	for (const name of ['Supplier wait, number', 'Production wait, number'])
		await lab.getByRole('spinbutton', { name, exact: true }).fill('0');
	await expect(lab.locator('[data-shadow-elapsed]')).toHaveText('15');
	await expect(lab.locator('[data-shadow-effort]')).toHaveText('20');
	for (const name of ['Work', 'Waiting', 'All']) {
		await lab.getByRole('button', { name, exact: true }).click();
		await expect(lab.locator('[data-shadow-elapsed]')).toHaveText('15');
		await expect(lab.locator('[data-shadow-effort]')).toHaveText('20');
	}
	await lab
		.locator('.shadow-task-list')
		.getByRole('button', { name: /Instructions, photographs/u })
		.click();
	await lab.getByRole('button', { name: 'What must happen first?', exact: true }).click();
	await expect(lab.locator('.shadow-prerequisites')).toContainText('B: Build and check a sample');
	await lab.getByRole('button', { name: 'One workshop prototype', exact: true }).click();
	await expect(lab.locator('[data-shadow-elapsed]')).toHaveText('5');
	await expect(lab.locator('[data-shadow-effort]')).toHaveText('5');
	await lab.getByRole('button', { name: 'Reset default scenario', exact: true }).click();
	await expect(lab.locator('[data-shadow-elapsed]')).toHaveText('No change');
	await expect(
		lab.getByRole('spinbutton', { name: 'Supplier wait, number', exact: true })
	).toHaveValue('10');
});

test('museum records retain distinct evidence statuses through rapid switching, tabs and close', async ({
	page
}) => {
	const lab = await ready(page, 'the-museum-of-almost');
	for (const [id, outcome] of [
		['lamp', 'Tested reuse'],
		['recorder', 'Proposed; untested'],
		['planter', 'Closed; no reuse recorded'],
		['page', 'Unresolved']
	]) {
		await lab.locator(`[data-drawer="${id}"]`).click();
		const record = lab.locator('#ma-open-record');
		await expect(record).toContainText(
			'Demonstration collection — fictional projects and evidence'
		);
		await expect(record.locator('.ma-outcome')).toContainText(outcome);
		await record.getByRole('tab', { name: 'What happened next?', exact: true }).click();
		await expect(record).toContainText('Unknown');
		await expect(
			record.getByRole('button', { name: 'Compare the supported connector revision', exact: true })
		).toHaveCount(id === 'lamp' ? 1 : 0);
		if (id === 'lamp') {
			await record
				.getByRole('button', { name: 'Compare the supported connector revision', exact: true })
				.click();
			await expect(record.locator('.ma-comparison')).toContainText('fictional');
		}
	}
	await lab.locator('[data-drawer="lamp"]').click();
	await lab.locator('[data-drawer="recorder"]').click();
	await lab.locator('[data-drawer="planter"]').click();
	await expect(lab.locator('#ma-open-record')).toContainText('Desk planter');
	const objectTab = lab.getByRole('tab', { name: 'The object', exact: true });
	await objectTab.focus();
	await page.keyboard.press('ArrowRight');
	await expect(
		lab.getByRole('tab', { name: 'What do we actually know?', exact: true })
	).toBeFocused();
	await expect(lab.locator('#ma-open-record')).toContainText('Possible explanation');
	await lab.getByRole('button', { name: 'Close Desk planter drawer', exact: true }).click();
	await expect(lab.locator('[data-drawer="planter"]')).toBeFocused();
	await expect(lab.locator('#ma-open-record')).toHaveCount(0);
});

test('repeated article navigation creates fresh independent mounts', async ({ page }) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	for (let cycle = 0; cycle < 2; cycle++) {
		await ready(page, features[0]);
		for (const feature of features.slice(1)) {
			await page
				.locator(`a[href="${route(feature)}"]`)
				.first()
				.click();
			await shell(page, feature).scrollIntoViewIfNeeded();
			await expect(runtime(page, feature)).toBeVisible();
			await expect(page.locator('[data-maker-ready="true"]')).toHaveCount(1);
		}
	}
	expect(errors).toEqual([]);
});

test('a phone keyboard can inspect the work and the museum evidence without spatial input', async ({
	page
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.emulateMedia({ reducedMotion: 'reduce' });
	const workshop = await ready(page, 'build-one-build-a-thousand');
	const quantity = workshop.getByRole('spinbutton', { name: 'Exact order quantity' });
	await quantity.focus();
	await quantity.fill('1000');
	await quantity.press('Tab');
	for (const name of [/Cutting guide/u, /Illustrated instructions/u, /Protective packaging/u]) {
		const checkbox = workshop.getByRole('checkbox', { name });
		await checkbox.focus();
		await checkbox.press('Space');
	}
	await expect(workshop.locator('.bott-results')).toContainText('Working day 105');
	for (const name of ['Material stock', 'Assembly & fixes', 'Packing', 'Customer shelf']) {
		const button = workshop.getByRole('button', { name, exact: true });
		await button.focus();
		await button.press('Enter');
		await expect(workshop.locator('.bott-inspector')).toBeVisible();
	}
	const museum = await ready(page, 'the-museum-of-almost');
	const drawer = museum.locator('[data-drawer="lamp"]');
	await drawer.focus();
	await drawer.press('Enter');
	const evidenceTab = museum.getByRole('tab', { name: 'What do we actually know?', exact: true });
	await evidenceTab.focus();
	await evidenceTab.press('Enter');
	const claim = museum.locator('.ma-claim').first();
	await claim.focus();
	await claim.press('Enter');
	await expect(museum.locator('.ma-evidence-detail')).toContainText('fictional');
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
		true
	);
	const audit = await new AxeBuilder({ page })
		.include('[data-maker-feature="the-museum-of-almost"]')
		.withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
		.analyze();
	expect(audit.violations).toEqual([]);
});

test('malformed owned URLs cannot introduce results, verified status or unsupported comparisons', async ({
	page
}) => {
	await page.goto(`${route('the-six-week-shadow')}?shadow=1.1.b.999.5&result=2`);
	await shell(page, 'the-six-week-shadow').scrollIntoViewIfNeeded();
	await expect(runtime(page, 'the-six-week-shadow').locator('[data-shadow-elapsed]')).toHaveText(
		'30'
	);
	await page.goto(`${route('the-museum-of-almost')}?museum=1.recorder.verified&comparison=tested`);
	await shell(page, 'the-museum-of-almost').scrollIntoViewIfNeeded();
	await expect(runtime(page, 'the-museum-of-almost')).toBeVisible();
	await expect(runtime(page, 'the-museum-of-almost').locator('#ma-open-record')).toHaveCount(0);
	await expect(runtime(page, 'the-museum-of-almost')).toContainText(
		'Demonstration collection — fictional projects and evidence'
	);
});

test('interrupting workshop motion settles the previous action and reset clears its targets', async ({
	page
}) => {
	await page.addInitScript(() => localStorage.setItem('site-motion', 'alive'));
	await page.emulateMedia({ reducedMotion: 'no-preference' });
	const lab = await ready(page, 'build-one-build-a-thousand');
	await lab.getByRole('button', { name: /Chapter 4:/u }).click();
	await lab.getByRole('combobox', { name: 'Assembly movement speed' }).selectOption('0.5');
	await lab.getByRole('button', { name: 'Separate the three pieces', exact: true }).click();
	await page.waitForTimeout(180);
	await lab.getByRole('button', { name: 'Send parcels to the shelf', exact: true }).click();
	const back = lab.locator('.bott-scene-desktop [data-motion-piece="back"]').first();
	const separatedPose = await back.evaluate(
		(element) =>
			`translate(${Number((element as HTMLElement).dataset.dx)} ${Number((element as HTMLElement).dataset.dy)})`
	);
	await expect(back).toHaveAttribute('transform', separatedPose);
	await lab.getByRole('button', { name: 'Reset workshop', exact: true }).click();
	await page.locator('#desktop-motion').selectOption('still');
	await expect(lab.locator('[data-parcel-token]').first()).toHaveCSS(
		'transform',
		'matrix(1, 0, 0, 1, 0, 0)'
	);
	await expect(lab.locator('.bott-results')).toContainText('1 h');
	await page.locator('#desktop-motion').selectOption('alive');
	await lab.getByRole('button', { name: 'Send parcels to the shelf', exact: true }).click();
	await page.waitForTimeout(180);
	await lab.getByRole('button', { name: 'Separate the three pieces', exact: true }).click();
	await page.locator('#desktop-motion').selectOption('still');
	await expect(lab.locator('[data-delivery-mark]').first()).toHaveCSS('visibility', 'visible');
});
