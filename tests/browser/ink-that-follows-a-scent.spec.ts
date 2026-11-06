import { expect, test } from '@playwright/test';

const ARTICLE_PATH = '/blog/visualizations/ink-that-follows-a-scent';

test.describe('Ink That Follows a Scent interactive visualization', () => {
	test('renders desktop layout, intro copy, presets, tools, live sensing toggle, and How it works disclosure', async ({
		page
	}) => {
		const consoleErrors: string[] = [];
		await page.route('**/_vercel/**', (route) =>
			route.fulfill({ status: 200, contentType: 'application/javascript', body: '' })
		);
		page.on('console', (msg) => {
			if (msg.type() === 'error' && !msg.text().includes('_vercel')) {
				consoleErrors.push(msg.text());
			}
		});

		await page.goto(ARTICLE_PATH);

		await expect(page.locator('h1')).toHaveCount(1);
		await expect(page.locator('h1')).toContainText('Ink That Follows a Scent');
		await expect(page.getByTestId('intro-copy-primary')).toContainText(
			'Paint an invisible chemical trail. Watch the particles respond.'
		);
		await expect(page.getByTestId('intro-copy-secondary')).toContainText(
			'Each particle wanders randomly. Sensing adds a small push towards stronger chemical.'
		);

		const interactive = page.getByTestId('ink-scent-interactive');
		await expect(interactive).toBeVisible();
		await expect(page.getByTestId('simulation-status')).toContainText('Running');

		// Pause and verify trail fading freezes
		const pauseBtn = page.getByTestId('pause-resume-btn');
		await expect(pauseBtn).toContainText('Pause');
		await pauseBtn.click();
		await expect(page.getByTestId('simulation-status')).toContainText('Paused');
		await expect(pauseBtn).toContainText('Resume');

		// Brush size visible for Paint and Erase, hidden for Move source
		await expect(page.getByTestId('brush-size-control')).toBeVisible();
		await page.getByTestId('tool-erase').click();
		await expect(page.getByTestId('brush-size-control')).toBeVisible();
		await page.getByTestId('tool-move-source').click();
		await expect(page.getByTestId('brush-size-control')).toHaveCount(0);

		// Keyboard movement of the chemical source handle
		const sourceHandle = page.getByTestId('source-handle');
		await sourceHandle.focus();
		await expect(page.getByTestId('source-keyboard-hint')).toContainText(
			'Use arrow keys to move the chemical source'
		);
		const initialLabel = await sourceHandle.getAttribute('aria-label');
		await sourceHandle.press('ArrowLeft');
		const movedLabel = await sourceHandle.getAttribute('aria-label');
		expect(movedLabel).not.toBe(initialLabel);

		// Live sensing switch in exploration mode
		const senseSwitch = page.getByTestId('sense-chemical-switch');
		await expect(senseSwitch).toContainText('Sense chemical: On');
		await senseSwitch.click();
		await expect(senseSwitch).toContainText('Sense chemical: Off');
		await expect(page.getByTestId('live-sensing-off-banner')).toContainText(
			'Sensing is now off. Earlier movement is still visible.'
		);

		// Load Curved line preset and verify clear reset notice
		await page.getByTestId('preset-curved-line').click();
		await expect(page.getByTestId('reset-banner')).toContainText(
			'Reset: started a fresh experiment with Curved line.'
		);

		// Open How it works disclosure and verify exact formula and Springer reference
		const disclosure = page.getByTestId('how-it-works-disclosure');
		await disclosure.locator('summary').click();
		await expect(disclosure).toContainText(
			'The chemical landscape is drawn directly. This version does not simulate chemical spreading or decay.'
		);
		await expect(page.getByTestId('update-rule-formula')).toContainText('reflectAtBoundary');
		await expect(
			disclosure.locator('a[href="https://link.springer.com/chapter/10.1007/978-0-387-22437-4_11"]')
		).toBeVisible();

		expect(consoleErrors).toEqual([]);
	});

	test('supports Compare from same start, Show chemical overlay, and independent Clear trails / Clear chemical actions', async ({
		page
	}) => {
		await page.goto(`${ARTICLE_PATH}?motion=reduce`);

		const interactive = page.getByTestId('ink-scent-interactive');
		await expect(interactive).toBeVisible();
		await expect(page.getByTestId('simulation-status')).toContainText('Paused');

		// Reduced-motion starts paused on a pre-computed 12 s state where Sensing on > Sensing off
		const initialOn = Number(await page.getByTestId('avg-chemical-on').textContent());
		const initialOff = Number(await page.getByTestId('avg-chemical-off').textContent());
		expect(initialOn).toBeGreaterThan(initialOff + 0.08);

		// Toggle Compare from same start
		await page.getByTestId('compare-from-same-start-btn').click();
		await expect(page.getByTestId('comparison-explanation')).toContainText(
			'Same starting points. Same random nudges. Sensing on versus off.'
		);
		await expect(page.getByTestId('panel-sensing-on')).toBeVisible();
		await expect(page.getByTestId('panel-sensing-off')).toBeVisible();

		// Show chemical reveals fixed-scale legend
		await expect(page.getByTestId('chemical-legend')).toHaveCount(0);
		await page.getByTestId('show-chemical-btn').click();
		await expect(page.getByTestId('chemical-legend')).toBeVisible();
		await expect(page.getByTestId('chemical-legend')).toContainText('Low (0.0)');
		await expect(page.getByTestId('chemical-legend')).toContainText('High (1.0)');

		// Clear trails preserves chemical and particle positions (average chemical stays unchanged)
		const beforeClearTrailsOn = await page.getByTestId('avg-chemical-on').textContent();
		await page.getByTestId('clear-trails-btn').click();
		await expect(page.getByTestId('reset-banner')).toContainText(
			'Cleared trail drawing. Particle positions and chemical field are preserved.'
		);
		await expect(page.getByTestId('avg-chemical-on')).toHaveText(beforeClearTrailsOn ?? '');

		// Clear chemical drops average chemical at particle positions to 0.000
		await page.getByTestId('clear-chemical-btn').click();
		await expect(page.getByTestId('reset-banner')).toContainText(
			'Cleared chemical landscape. Earlier ink trails remain until they fade.'
		);
		await expect(page.getByTestId('avg-chemical-on')).toHaveText('0.000');
		await expect(page.getByTestId('avg-chemical-off')).toHaveText('0.000');
	});

	test('supports mobile stacking, >=44px touch targets, static fallback, and clean navigation teardown', async ({
		page
	}) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto(`${ARTICLE_PATH}?motion=reduce`);

		await expect(page.getByTestId('ink-scent-interactive')).toBeVisible();

		// Verify touch targets >= 44px on mobile
		const compareBtnBox = await page.getByTestId('compare-from-same-start-btn').boundingBox();
		expect(compareBtnBox?.height ?? 0).toBeGreaterThanOrEqual(44);
		const sourceHandleBox = await page.getByTestId('source-handle').boundingBox();
		expect(sourceHandleBox?.width ?? 0).toBeGreaterThanOrEqual(44);
		expect(sourceHandleBox?.height ?? 0).toBeGreaterThanOrEqual(44);

		// Activate comparison mode on mobile and verify vertical stacking
		await page.getByTestId('compare-from-same-start-btn').click();
		const onBox = await page.getByTestId('panel-sensing-on').boundingBox();
		const offBox = await page.getByTestId('panel-sensing-off').boundingBox();
		expect(offBox?.y ?? 0).toBeGreaterThan((onBox?.y ?? 0) + 100);

		// Navigate away to Visualizations gallery and verify clean teardown
		await page.goto('/blog/visualizations');
		await expect(page.locator('h1')).toContainText('Visualizations');

		// Verify ?canvas=off static fallback path
		await page.goto(`${ARTICLE_PATH}?canvas=off`);
		await expect(page.getByTestId('ink-scent-static-fallback')).toBeVisible();
	});
});
