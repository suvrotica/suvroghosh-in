import { expect, test } from '@playwright/test';

const ARTICLE_PATH = '/blog/visualizations/why-two-aqi-apps-show-different-numbers';
const STATIC_COMPARISON_PATH =
	'/images/visualizations/why-two-aqi-apps-show-different-numbers/default-comparison.png';

test.describe('Why two AQI apps show different numbers — interactive explainer', () => {
	test('SSR renders all three panels, default 60 µg/m³ comparison, ceiling note, optional details, and verbatim article without JavaScript', async ({
		browser,
		request
	}) => {
		const res = await request.get(ARTICLE_PATH);
		expect(res.ok()).toBe(true);
		const html = await res.text();
		expect((html.match(/<h1\b/gu) ?? []).length).toBe(1);
		expect(html).toContain('Why two AQI apps show different numbers');
		expect(html).toContain('How can the same air produce two different AQI numbers?');
		expect(html).toContain('Why do two apps give different AQI numbers for the same place?');

		const imgRes = await request.get(STATIC_COMPARISON_PATH);
		expect(imgRes.ok()).toBe(true);
		expect(imgRes.headers()['content-type']).toContain('image/png');

		const context = await browser.newContext({
			javaScriptEnabled: false,
			serviceWorkers: 'block'
		});
		try {
			const page = await context.newPage();
			await page.goto(res.url());

			const shell = page.locator('[data-aqi-explainer]');
			await expect(shell).toBeVisible();
			await expect(shell.getByTestId('score-india-cpcb')).toContainText('100');
			await expect(shell.getByTestId('score-india-cpcb')).toContainText('Satisfactory');
			await expect(shell.getByTestId('score-us-epa')).toContainText('154');
			await expect(shell.getByTestId('score-us-epa')).toContainText('Unhealthy');
			await expect(shell.getByTestId('readout-24h-average')).toContainText('110 µg/m³');
			await expect(shell.getByTestId('readout-latest-hour')).toContainText('360 µg/m³');
			await expect(shell.getByTestId('overall-aqi-readout')).toContainText('Overall AQI: 154');
			await expect(shell.getByTestId('ceiling-note')).toContainText('500');

			// Native <details> opens without JavaScript and shows all four verified presets
			const details = shell.getByTestId('calculation-details');
			await details.locator('summary').click();
			await expect(details).toHaveAttribute('open', '');
			await expect(details.locator('tbody tr')).toHaveCount(4);
		} finally {
			await context.close();
		}
	});

	test('switches all four 24-hour PM2.5 presets, shows ordering reversal at 90 & 120, and updates averaging bars on fixed axis limits', async ({
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
		const shell = page.locator('[data-aqi-explainer]');
		await expect(shell).toBeVisible();

		// Initial preset = 60 µg/m³
		await expect(shell.getByTestId('preset-pm25-60')).toHaveAttribute('aria-pressed', 'true');
		await expect(shell.getByTestId('panel-1-dynamic-note')).toHaveText(
			'Changing the scale changes the score. It removes no pollution.'
		);
		await expect(shell.getByTestId('panel-1-persistent-note')).toHaveText(
			'A lower number on a different scale does not mean cleaner air.'
		);

		const presetExpectations = [
			{
				conc: 30,
				india: '50',
				indiaCat: 'Good',
				us: '90',
				usCat: 'Moderate',
				reverses: false
			},
			{
				conc: 90,
				india: '200',
				indiaCat: 'Moderately polluted',
				us: '175',
				usCat: 'Unhealthy',
				reverses: true
			},
			{
				conc: 120,
				india: '300',
				indiaCat: 'Poor',
				us: '196',
				usCat: 'Unhealthy',
				reverses: true
			},
			{
				conc: 60,
				india: '100',
				indiaCat: 'Satisfactory',
				us: '154',
				usCat: 'Unhealthy',
				reverses: false
			}
		] as const;

		for (const item of presetExpectations) {
			await shell.getByTestId(`preset-pm25-${item.conc}`).click();
			await expect(shell.getByTestId(`preset-pm25-${item.conc}`)).toHaveAttribute(
				'aria-pressed',
				'true'
			);
			await expect(shell.getByTestId('score-india-cpcb')).toContainText(item.india);
			await expect(shell.getByTestId('score-india-cpcb')).toContainText(item.indiaCat);
			await expect(shell.getByTestId('score-us-epa')).toContainText(item.us);
			await expect(shell.getByTestId('score-us-epa')).toContainText(item.usCat);
			await expect(shell.getByTestId('panel-1-persistent-note')).toHaveText(
				'A lower number on a different scale does not mean cleaner air.'
			);
			if (item.reverses) {
				await expect(shell.getByTestId('panel-1-dynamic-note')).toContainText('reverses');
			}
		}

		// Panel 2: check Smoke arrives vs Steady day on fixed 0–400 axis
		const hourlySvg = shell.getByTestId('hourly-chart-svg');
		await expect(hourlySvg.locator('rect.hourly-bar')).toHaveCount(24);
		await expect(hourlySvg).toContainText('400');

		const meanLineSmokeY = await shell.getByTestId('hourly-mean-line').getAttribute('y1');
		await shell.getByTestId('scenario-steady-day').click();
		await expect(shell.getByTestId('readout-24h-average')).toContainText('60 µg/m³');
		await expect(shell.getByTestId('readout-latest-hour')).toContainText('60 µg/m³');
		await expect(hourlySvg).toContainText('400');
		const meanLineSteadyY = await shell.getByTestId('hourly-mean-line').getAttribute('y1');
		expect(Number(meanLineSteadyY)).toBeGreaterThan(Number(meanLineSmokeY));

		// Panel 3: overall AQI = 154 on US AQI scale
		await expect(shell.getByTestId('overall-aqi-readout')).toContainText('Overall AQI: 154');
		const pm25Width = Number(await shell.getByTestId('pollutant-bar-pm25').getAttribute('width'));
		const pm10Width = Number(await shell.getByTestId('pollutant-bar-pm10').getAttribute('width'));
		const ozoneWidth = Number(await shell.getByTestId('pollutant-bar-ozone').getAttribute('width'));
		expect(pm25Width).toBeGreaterThan(pm10Width);
		expect(pm10Width).toBeGreaterThan(ozoneWidth);

		expect(consoleErrors).toEqual([]);
	});

	test('supports keyboard focus, light/dark themes, and stacks cards cleanly at 375px mobile width without horizontal overflow', async ({
		page
	}) => {
		await page.route('**/_vercel/**', (route) =>
			route.fulfill({ status: 200, contentType: 'application/javascript', body: '' })
		);
		await page.setViewportSize({ width: 375, height: 812 });
		await page.goto(ARTICLE_PATH);

		const shell = page.locator('[data-aqi-explainer]');
		await expect(shell).toBeVisible();

		// Touch target size >= 44px on preset and scenario buttons
		for (const testId of ['preset-pm25-30', 'preset-pm25-60', 'scenario-steady-day']) {
			const box = await shell.getByTestId(testId).boundingBox();
			expect(box).not.toBeNull();
			expect(box!.height).toBeGreaterThanOrEqual(44);
		}

		// Cards stack vertically on 375px screen
		const indiaBox = await shell.getByTestId('card-india-cpcb').boundingBox();
		const usBox = await shell.getByTestId('card-us-epa').boundingBox();
		expect(indiaBox).not.toBeNull();
		expect(usBox).not.toBeNull();
		expect(usBox!.y).toBeGreaterThan(indiaBox!.y + indiaBox!.height - 2);

		// Keyboard operation
		const btn90 = shell.getByTestId('preset-pm25-90');
		await btn90.focus();
		await expect(btn90).toBeFocused();
		await btn90.press('Enter');
		await expect(shell.getByTestId('score-india-cpcb')).toContainText('200');

		// Open optional details and verify zero horizontal page overflow at 375px
		await shell.getByTestId('calculation-details').locator('summary').click();
		const overflow = await page.evaluate(
			() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth
		);
		expect(overflow).toBeLessThanOrEqual(1);

		// Theme switching check (light vs dark)
		await page.evaluate(() => {
			document.documentElement.classList.remove('dark');
			document.documentElement.dataset.theme = 'paper';
		});
		const lightBg = await shell.evaluate((el) => getComputedStyle(el).backgroundColor);
		await page.evaluate(() => {
			document.documentElement.classList.add('dark');
			document.documentElement.dataset.theme = 'night';
		});
		const darkBg = await shell.evaluate((el) => getComputedStyle(el).backgroundColor);
		expect(darkBg).not.toBe(lightBg);
	});
});
