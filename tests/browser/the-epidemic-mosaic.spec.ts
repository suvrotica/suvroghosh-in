import { expect, test } from '@playwright/test';

const ARTICLE_PATH = '/blog/visualizations/the-epidemic-mosaic';

test.describe('The Epidemic Mosaic interactive visualization', () => {
	test('starts paused at day 0.0, renders side-by-side bridge comparison, supports bridge selection and region inspection', async ({
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
		await expect(page.locator('h1')).toContainText('The Epidemic Mosaic');
		await expect(page.getByTestId('intro-copy-primary')).toContainText(
			'Two communities. One infection. Add a connection and see what changes.'
		);
		await expect(page.getByTestId('intro-copy-secondary')).toContainText(
			'Each shape contains people. Lines show contact between regions. Sharing a border does not create contact.'
		);

		const workbench = page.getByTestId('epidemic-mosaic-workbench');
		await expect(workbench).toBeVisible();

		// Must start paused at day 0.0 with a prominent Run comparison button
		const runBtn = page.getByTestId('run-pause-btn');
		await expect(runBtn).toContainText('Run comparison');
		await expect(page.getByTestId('status-banner')).toContainText('Day 0.0 / 120');

		// Both scenarios are visible side by side on desktop
		const withoutCard = page.getByTestId('city-card-without-bridge');
		const withCard = page.getByTestId('city-card-with-bridge');
		await expect(withoutCard).toBeVisible();
		await expect(withCard).toBeVisible();
		await expect(page.getByTestId('proposed-bridge-line-without-bridge')).toBeVisible();

		// Verify initial inspector shows A5 · Market Cross with S: 95, I: 5
		await expect(page.getByTestId('selected-region-heading')).toContainText('A5 · Market Cross');
		await expect(page.getByTestId('region-pop-bar-with-bridge')).toContainText(
			'Susceptible (S): 95'
		);
		await expect(page.getByTestId('region-pop-bar-with-bridge')).toContainText(
			'Infectious (I): 5'
		);

		// Select another region directly on the city mosaic
		await page.getByTestId('polygon-with-bridge-A06').click();
		await expect(page.getByTestId('selected-region-heading')).toContainText('A6 · Foundry Quay');
		await expect(page.getByTestId('region-pop-bar-with-bridge')).toContainText(
			'Susceptible (S): 100'
		);

		// Change bridge via selector and verify reset announcement + Restore default bridge button
		await page.getByTestId('bridge-select-a').selectOption('A03');
		await expect(page.getByTestId('status-banner')).toContainText(
			'Bridge updated: Bridge set to A3 · Clocktower ↔ B3 · Canal Basin. Both scenarios have been reset to day 0.0.'
		);
		const restoreBtn = page.getByTestId('restore-default-bridge-btn');
		await expect(restoreBtn).toBeEnabled();
		await restoreBtn.click();
		await expect(page.getByTestId('status-banner')).toContainText(
			'Restored default bridge: Bridge set to A6 · Foundry Quay ↔ B3 · Canal Basin.'
		);

		// Open Model details disclosure and verify equations & references
		const disclosure = page.getByTestId('model-details-disclosure');
		await disclosure.locator('summary').click();
		await expect(page.getByTestId('param-beta-local')).toBeVisible();
		await expect(page.getByTestId('param-beta-link')).toBeVisible();
		await expect(
			disclosure.locator('a[href="https://link.springer.com/chapter/10.1007/978-0-387-22437-4_10"]')
		).toBeVisible();
		await expect(
			disclosure.locator('a[href="https://pmc.ncbi.nlm.nih.gov/articles/PMC6002090/"]')
		).toBeVisible();

		expect(consoleErrors).toEqual([]);
	});

	test('supports Equal-Budget Vaccination experiment, day scrubbing, and 20-run batch comparison', async ({
		page
	}) => {
		await page.goto(ARTICLE_PATH);
		await expect(page.getByTestId('epidemic-mosaic-workbench')).toBeVisible();

		// Switch to Experiment 2: Place the same vaccines
		await page.getByTestId('mode-vaccination-btn').click();
		await expect(page.getByTestId('vaccination-experiment-controls')).toBeVisible();
		await expect(page.getByTestId('vaccine-budget-readout')).toContainText(
			'540 doses (15.0% of city)'
		);
		await expect(page.getByTestId('vaccination-experiment-controls')).toContainText(
			'Vaccination gives immediate, complete protection in this model.'
		);

		// Verify all three strategy city cards and summary cards are rendered
		await expect(page.getByTestId('city-card-even')).toBeVisible();
		await expect(page.getByTestId('city-card-most-connections')).toBeVisible();
		await expect(page.getByTestId('city-card-around-the-bridge')).toBeVisible();

		// Inspect A6 · Foundry Quay (bridge endpoint) at Day 0: Around the bridge places 91 doses there
		await page.getByTestId('region-inspector-select').selectOption('A06');
		await expect(page.getByTestId('region-pop-bar-around-the-bridge')).toContainText(
			'Vaccinated (V): 91'
		);
		await expect(page.getByTestId('region-pop-bar-even')).toContainText('Vaccinated (V): 15');

		// Change vaccine budget to 720 doses (20.0%) and verify reset
		const budgetInput = page.getByTestId('vaccine-budget-input');
		await budgetInput.fill('720');
		await budgetInput.dispatchEvent('change');
		await expect(page.getByTestId('vaccine-budget-readout')).toContainText(
			'720 doses (20.0% of city)'
		);
		await expect(page.getByTestId('status-banner')).toContainText(
			'Vaccine budget set to 720 doses (20.0% of city). All three strategies reset to day 0.0.'
		);

		// Trigger Repeat 20 times and verify batch table rows
		await page.getByTestId('repeat-20-btn').click();
		await expect(page.getByTestId('batch-row-even')).toBeVisible();
		await expect(page.getByTestId('batch-row-most-connections')).toBeVisible();
		await expect(page.getByTestId('batch-row-around-the-bridge')).toBeVisible();
	});

	test('supports narrow-screen scenario switch with both summaries visible, >=44px touch targets, and static fallback', async ({
		page
	}) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto(ARTICLE_PATH);

		await expect(page.getByTestId('epidemic-mosaic-workbench')).toBeVisible();

		// Touch target height >= 44px
		const runBtnBox = await page.getByTestId('run-pause-btn').boundingBox();
		expect(runBtnBox?.height ?? 0).toBeGreaterThanOrEqual(44);

		// On narrow screens, one large city is visible at a time with an accessible scenario switcher,
		// while both scenario summaries remain visible.
		await expect(page.getByTestId('mobile-scenario-switcher')).toBeVisible();
		await expect(page.getByTestId('city-card-with-bridge')).toBeVisible();
		await expect(page.getByTestId('city-card-without-bridge')).toBeHidden();
		await expect(page.getByTestId('summary-card-without-bridge')).toBeVisible();
		await expect(page.getByTestId('summary-card-with-bridge')).toBeVisible();

		await page.getByTestId('mobile-switch-without-bridge').click();
		await expect(page.getByTestId('city-card-without-bridge')).toBeVisible();
		await expect(page.getByTestId('city-card-with-bridge')).toBeHidden();

		// Navigate away to Visualizations gallery and verify clean teardown
		await page.goto('/blog/visualizations');
		await expect(page.locator('h1')).toContainText('Visualizations');

		// Verify ?canvas=off static fallback path
		await page.goto(`${ARTICLE_PATH}?canvas=off`);
		await expect(page.getByTestId('epidemic-mosaic-static-fallback')).toBeVisible();
	});
});
