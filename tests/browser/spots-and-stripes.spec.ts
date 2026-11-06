import { expect, test } from '@playwright/test';

const ARTICLE_PATH = '/blog/visualizations/how-spots-and-stripes-form';

test.describe('How spots and stripes form interactive visualization', () => {
	test('renders reading order, computed preview, and evolves from noise with pause/continue/restart', async ({
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
		await expect(page.locator('h1')).toContainText('How spots and stripes form');
		await expect(page.getByTestId('computed-experiment-preview')).toBeVisible();

		const instrument = page.getByTestId('spots-and-stripes-instrument');
		await expect(instrument).toBeVisible();
		await expect(instrument).toHaveAttribute('data-status', 'preview');
		await expect(page.getByTestId('computed-preview-banner')).toContainText(
			'Computed example. Press Grow from noise to see how it forms.'
		);

		// Verify reading order: preview -> instrument -> three suggested experiments -> equations disclosure -> atlas link
		await expect(
			page.getByRole('heading', { name: 'Three short suggested experiments' })
		).toBeVisible();
		const equationsDisclosure = page.getByTestId('equations-disclosure');
		await expect(equationsDisclosure).toBeVisible();
		await expect(
			page.locator('a[href="/blog/visualizations/reaction-diffusion-atlas"]').first()
		).toBeVisible();

		// Press Grow from noise
		await page.getByTestId('grow-from-noise-btn').click();
		await expect(instrument).toHaveAttribute('data-status', 'running');

		// Pause playback
		await page.getByTestId('pause-continue-btn').click();
		await expect(instrument).toHaveAttribute('data-status', 'paused');
		await expect(page.getByTestId('status-pill')).toContainText('Paused');

		// Continue playback, then pause again
		await page.getByTestId('pause-continue-btn').click();
		await expect(instrument).toHaveAttribute('data-status', 'running');
		await page.getByTestId('pause-continue-btn').click();
		await expect(instrument).toHaveAttribute('data-status', 'paused');

		// Restart resets model time to 0.00 and shows restart banner
		await page.getByTestId('restart-btn').click();
		await expect(instrument).toHaveAttribute('data-model-time', '0.00');
		await expect(page.getByTestId('restart-banner')).toContainText(
			'Experiment restarted from the same seed (1952)'
		);

		expect(consoleErrors).toEqual([]);
	});

	test('synchronises Compare equal spreading and separates display-only Pigment threshold from simulation state', async ({
		page
	}) => {
		await page.goto(`${ARTICLE_PATH}?motion=reduce`);

		const instrument = page.getByTestId('spots-and-stripes-instrument');
		await expect(instrument).toBeVisible();
		await expect(instrument).toHaveAttribute('data-reduced-motion', 'true');

		// Switch views while on computed preview (t = 60.00) and verify simulation time & metrics do not change
		const initialTime = await instrument.getAttribute('data-model-time');
		const initialStd = await page.getByTestId('primary-std-val').textContent();
		expect(initialTime).toBe('60.00');

		await expect(page.getByTestId('pigment-threshold-panel')).toHaveCount(0);
		await page.getByTestId('view-inhibitor').click();
		await expect(instrument).toHaveAttribute('data-view-mode', 'inhibitor');
		await expect(instrument).toHaveAttribute('data-model-time', '60.00');
		await expect(page.getByTestId('primary-std-val')).toHaveText(initialStd ?? '');

		await page.getByTestId('view-pigment').click();
		await expect(instrument).toHaveAttribute('data-view-mode', 'pigment');
		const thresholdPanel = page.getByTestId('pigment-threshold-panel');
		await expect(thresholdPanel).toBeVisible();
		await expect(thresholdPanel).toContainText('Changes the display, not the simulation.');

		// Change pigment threshold and verify canvas updates while simulation state stays untouched
		const thresholdSlider = page.getByTestId('pigment-threshold-slider');
		await thresholdSlider.fill('0.24');
		await thresholdSlider.dispatchEvent('input');
		await expect(page.getByTestId('pigment-threshold-value')).toContainText('+0.24');
		await expect(instrument).toHaveAttribute('data-model-time', '60.00');
		await expect(page.getByTestId('primary-std-val')).toHaveText(initialStd ?? '');

		// Toggle Compare equal spreading: restarts both fields from small disturbances at t = 0.00
		await page.getByTestId('compare-equal-toggle').click();
		await expect(instrument).toHaveAttribute('data-compare-equal', 'true');
		await expect(instrument).toHaveAttribute('data-model-time', '0.00');
		await expect(page.getByTestId('primary-field-card')).toContainText('Different spreading rates');
		await expect(page.getByTestId('equal-field-card')).toContainText('Equal spreading rates');
		await expect(page.getByTestId('variation-chart')).toBeVisible();

		// Settle both fields to t = 60.0 and verify differential pattern grows while equal spreading fades
		await page.getByTestId('settle-simulation-btn').click();
		await expect(instrument).toHaveAttribute('data-status', 'finished');
		await expect(instrument).toHaveAttribute('data-model-time', '60.00');

		const settledDiffStd = Number(await page.getByTestId('primary-std-val').textContent());
		const settledEqualStd = Number(await page.getByTestId('equal-std-val').textContent());
		expect(settledDiffStd).toBeGreaterThan(0.45);
		expect(settledEqualStd).toBeLessThan(0.001);
		await expect(page.getByTestId('comparison-verdict')).toContainText('almost uniform surface');
	});

	test('supports presets, domain shape changes, mobile stacking, static fallback, and clean navigation teardown', async ({
		page
	}) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto(`${ARTICLE_PATH}?motion=reduce`);

		const instrument = page.getByTestId('spots-and-stripes-instrument');
		await expect(instrument).toBeVisible();

		// Verify touch targets >= 44px on mobile
		const growBtnBox = await page.getByTestId('grow-from-noise-btn').boundingBox();
		expect(growBtnBox?.height ?? 0).toBeGreaterThanOrEqual(44);

		// Open Change the shape disclosure and select Tapered patch
		const shapeDetails = page.getByTestId('change-shape-details');
		await shapeDetails.locator('summary').click();
		await expect(shapeDetails).toContainText(
			'The signals spread inside the patch. They do not cross its edges.'
		);
		await page.getByTestId('shape-tapered-patch').click();
		await expect(instrument).toHaveAttribute('data-domain', 'tapered-patch');

		const primaryCanvas = page.getByTestId('primary-canvas');
		await expect(primaryCanvas).toHaveAttribute('width', '120');
		await expect(primaryCanvas).toHaveAttribute('height', '48');

		// Switch preset to Stripes and verify restart notice
		await page.getByTestId('preset-stripes').click();
		await expect(page.getByTestId('pattern-balance-value')).toContainText('0.000');
		await expect(page.getByTestId('restart-banner')).toContainText('Stripes preset');

		// Navigate away to Visualizations gallery and verify clean teardown
		await page.goto('/blog/visualizations');
		await expect(page.locator('h1')).toContainText('Visualizations');

		// Verify ?canvas=off static fallback path
		await page.goto(`${ARTICLE_PATH}?canvas=off`);
		await expect(page.getByTestId('spots-static-fallback')).toBeVisible();
	});
});
