import { expect, test } from '@playwright/test';

const ARTICLE_PATH = '/blog/visualizations/the-predator-prey-loom';

test.describe('The Predator–Prey Loom interactive visualization', () => {
	test('renders phase portrait, aligned time histories, measured peak lag, and worked settings on load', async ({
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
		await expect(page.locator('h1')).toContainText('The Predator–Prey Loom');
		await expect(page.getByTestId('intro-copy-primary')).toContainText(
			'More food can support more prey. That gives predators more to eat, but their population takes time to respond.'
		);
		await expect(page.getByTestId('predator-prey-loom-app')).toBeVisible();

		// Play example button is visible and initially paused with computed history already displayed
		await expect(page.getByTestId('btn-play-pause')).toContainText('Play example');
		await expect(page.getByTestId('phase-portrait-svg')).toBeVisible();
		await expect(page.getByTestId('time-history-svg')).toBeVisible();
		await expect(page.getByTestId('phase-portrait-caption')).toContainText(
			'Right means more prey. Up means more predators. Follow the arrows to see what changes next.'
		);

		// Highlighted prey peak and following predator peak with measured lag
		await expect(page.getByTestId('phase-prey-peak-marker')).toBeVisible();
		await expect(page.getByTestId('phase-predator-peak-marker')).toBeVisible();
		await expect(page.getByTestId('time-measured-lag-annotation')).toContainText(
			'Predators peak later'
		);

		// Switch between the three worked settings (K = 1.5, K = 3.0, K = 4.0)
		await page.getByTestId('preset-k-1.5').click();
		await expect(page.getByTestId('computed-headline')).toContainText(
			'These swings are shrinking towards steady populations.'
		);

		await page.getByTestId('preset-k-3.0').click();
		await expect(page.getByTestId('computed-headline')).toContainText(
			'The populations are approaching a repeating cycle.'
		);

		await page.getByTestId('preset-k-4.0').click();
		await expect(page.getByTestId('computed-headline')).toContainText(
			'The prey population now falls much lower between peaks.'
		);

		expect(consoleErrors).toEqual([]);
	});

	test('supports temporary food pulse, 25% predator removal jump with baseline comparison, and Restore earlier conditions', async ({
		page
	}) => {
		await page.goto(ARTICLE_PATH);
		await expect(page.getByTestId('predator-prey-loom-app')).toBeVisible();

		// Trigger Remove 25% of predators and verify jump marker + Without this change baseline
		await page.getByTestId('btn-remove-predators').click();
		await expect(page.getByTestId('phase-jump-marker')).toBeVisible();
		await expect(page.getByTestId('time-predator-jump-marker')).toBeVisible();
		await expect(page.getByTestId('phase-baseline-comparison')).toBeVisible();

		// Trigger Add food briefly (+50% K for 10 units) and verify pulse band on time chart
		await page.getByTestId('btn-add-food-briefly').click();
		await expect(page.getByTestId('time-pulse-band')).toBeVisible();

		// Run Guided Prompt 3 (Increase the food supply) and then Restore earlier conditions
		await page.getByTestId('prompt-btn-increase-food').click();
		await expect(page.getByTestId('btn-restore-conditions')).toBeEnabled();
		await page.getByTestId('btn-restore-conditions').click();
		await expect(page.getByTestId('status-badge')).toContainText('K = 1.50');
	});

	test('renders 3x3 comparison grid with slow-settling distinction, mobile layout without horizontal scroll, and static fallback', async ({
		page
	}) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto(ARTICLE_PATH);

		await expect(page.getByTestId('predator-prey-loom-app')).toBeVisible();

		// Check touch target height >= 44px
		const playBox = await page.getByTestId('btn-play-pause').boundingBox();
		expect(playBox?.height ?? 0).toBeGreaterThanOrEqual(44);

		// Verify 3x3 comparison grid cells and slow-settling cell (a = 0.75, K = 3)
		const slowSettlingCell = page.getByTestId('comparison-cell-a0.75-k3');
		await expect(slowSettlingCell).toBeVisible();
		await expect(slowSettlingCell).toContainText('still settling');

		await slowSettlingCell.click();
		await expect(page.getByTestId('status-badge')).toContainText('K = 3.00');

		// Verify no horizontal page overflow on mobile
		const hasHorizontalOverflow = await page.evaluate(
			() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2
		);
		expect(hasHorizontalOverflow).toBe(false);

		// Verify static fallback with ?canvas=off
		await page.goto(`${ARTICLE_PATH}?canvas=off`);
		await expect(page.getByTestId('predator-prey-loom-static-fallback')).toBeVisible();
	});
});
