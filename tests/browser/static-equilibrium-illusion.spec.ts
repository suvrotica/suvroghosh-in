import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const articlePath = '/blog/visualizations/static-equilibrium-illusion';

async function openExplorer(page: Page) {
	await page.route('https://va.vercel-scripts.com/**', (route) =>
		route.fulfill({ status: 200, contentType: 'application/javascript', body: '' })
	);
	await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
	const explorer = page.getByTestId('homeodynamics-explorer');
	await expect(explorer).toHaveCount(1);
	await expect(explorer).toHaveAttribute('data-ready', 'true', { timeout: 60_000 });
	await expect(explorer).toBeVisible();
	return explorer;
}

test('post metadata, SSR, poster and all three evidence plates render', async ({
	page,
	request
}) => {
	const runtimeDataRequests: string[] = [];
	page.on('request', (outgoing) => {
		if (['fetch', 'xhr'].includes(outgoing.resourceType()))
			runtimeDataRequests.push(outgoing.url());
	});
	const response = await request.get(articlePath);
	expect(response.ok()).toBe(true);
	const html = await response.text();
	expect(html).toContain('The Static-Equilibrium Illusion: Life Refuses to Hold Still');
	expect(html).toContain('data-testid="homeodynamics-explorer"');
	expect(html).toContain('Representative rhythms, not medical reference values.');
	expect(html).toContain('Dimensionless teaching model—not a fit to shark or tuna field data.');
	expect(html).toContain('Measured field data');
	expect(html).toContain('Disputed inference');

	const poster = await request.get(
		'/images/visualizations/static-equilibrium-illusion/static-equilibrium-illusion.svg'
	);
	expect(poster.ok()).toBe(true);
	expect(await poster.text()).toContain(
		'<title id="title">The Static-Equilibrium Illusion</title>'
	);

	const explorer = await openExplorer(page);
	await expect(
		page.getByRole('heading', {
			level: 1,
			name: 'The Static-Equilibrium Illusion: Life Refuses to Hold Still',
			exact: true
		})
	).toHaveCount(1);
	await expect(explorer.getByTestId('time-microscope')).toBeVisible();
	await expect(explorer.getByTestId('feedback-lab')).toBeVisible();
	await expect(explorer.getByTestId('ecosystem-lab')).toBeVisible();
	expect(runtimeDataRequests).toEqual([]);
});

test('time-window tabs are keyboard navigable and the normalized view announces its scale', async ({
	page
}) => {
	const explorer = await openExplorer(page);
	const heartbeatCard = explorer.locator('.evidence-card').filter({ hasText: 'Heartbeat' });
	await expect(heartbeatCard).toContainText('Drawn mark · Model-derived illustration');
	await expect(heartbeatCard).toContainText('Numerical support · Derived conversion');
	await expect(heartbeatCard).toContainText('Numerical support · Authoritative range');
	const first = explorer.getByRole('tab', { name: 'About 20 seconds' });
	await first.focus();
	await page.keyboard.press('ArrowRight');
	await expect(explorer.getByRole('tab', { name: 'About 2 hours' })).toHaveAttribute(
		'aria-selected',
		'true'
	);
	await page.keyboard.press('End');
	await expect(explorer.getByRole('tab', { name: 'One day' })).toHaveAttribute(
		'aria-selected',
		'true'
	);
	await explorer.getByRole('button', { name: 'Show normalized orchestra' }).click();
	await expect(
		explorer.getByText(/every signal is rescaled independently from 0 to 1/iu)
	).toBeVisible();
});

test('verified model interactions expose the delayed overshoot without mutating the baseline view', async ({
	page
}) => {
	const explorer = await openExplorer(page);
	const feedback = explorer.getByTestId('feedback-lab');
	await feedback.getByRole('button', { name: /Sustained oscillation/iu }).click();
	await expect(feedback.locator('.regime-stamp')).toContainText(
		/bounded late-cycle range persists/iu
	);

	const ecosystem = explorer.getByTestId('ecosystem-lab');
	await ecosystem.getByRole('button', { name: 'Sharks may later overshoot' }).click();
	await ecosystem.getByRole('button', { name: 'Remove 10 sharks' }).click();
	await expect(ecosystem.getByText(/Prediction matched this run/iu)).toBeVisible();
	await expect(ecosystem.getByText(/At t = 14\.16, sharks reach 45\.48/iu)).toBeVisible();
	await expect(ecosystem.getByText(/uninterrupted baseline/iu).first()).toBeVisible();
});

test('reduced motion disables autoplay while pause-all and scrubbers remain usable', async ({
	page
}) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	const explorer = await openExplorer(page);
	await expect(explorer.getByTestId('feedback-lab')).toHaveAttribute('data-reduced-motion', 'true');
	await expect(explorer.getByTestId('ecosystem-lab')).toHaveAttribute(
		'data-reduced-motion',
		'true'
	);
	for (const button of await explorer.getByRole('button', { name: 'Play', exact: true }).all()) {
		await expect(button).toBeDisabled();
	}
	const pauseAll = explorer.getByRole('button', { name: 'Pause all motion' });
	await pauseAll.click();
	await expect(explorer).toHaveAttribute('data-all-paused', 'true');
	await expect(explorer.getByRole('button', { name: 'Resume permitted motion' })).toBeVisible();
	await explorer.getByLabel(/Trace cursor/iu).fill('700');
	await expect(explorer.getByText(/current x\(t\)/iu)).toBeVisible();
});

test('SVG geometry is finite and exact data fallbacks carry units and provenance', async ({
	page
}) => {
	const explorer = await openExplorer(page);
	const invalid = await explorer.evaluate((element) =>
		Array.from(element.querySelectorAll('svg *')).flatMap((node) =>
			Array.from(node.attributes)
				.filter((attribute) => /(?:NaN|Infinity|undefined|null)/u.test(attribute.value))
				.map((attribute) => `${node.tagName}.${attribute.name}=${attribute.value}`)
		)
	);
	expect(invalid).toEqual([]);

	await explorer.getByText('Human-rhythm source drawer and exact display settings').click();
	await expect(explorer.getByRole('table').first()).toContainText('Population / conditions');
	await expect(explorer.getByRole('table').first()).toContainText('nmol/L');
	await explorer.getByText('Field-data table, transformation, sources and limitations').click();
	await expect(explorer.getByRole('table').last()).toContainText('Lower 95% CL');
	await expect(explorer.getByRole('table').last()).toContainText('0.17779166666666668');
});

test('requested viewports, paper and night themes reflow without page overflow', async ({
	page
}, testInfo) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	let explorer = await openExplorer(page);
	for (const viewport of [
		{ width: 390, height: 844 },
		{ width: 768, height: 1024 },
		{ width: 1440, height: 900 },
		{ width: 320, height: 568 }
	]) {
		await page.setViewportSize(viewport);
		explorer = page.getByTestId('homeodynamics-explorer');
		await explorer.scrollIntoViewIfNeeded();
		const geometry = await explorer.evaluate((element) => {
			const bounds = element.getBoundingClientRect();
			const undersizedControls = Array.from(
				element.querySelectorAll<HTMLElement>('button, select, input[type="range"]')
			)
				.filter(
					(control) => control.getClientRects().length > 0 && !control.hasAttribute('disabled')
				)
				.map((control) => ({
					name:
						control.getAttribute('aria-label') ?? control.textContent?.trim() ?? control.tagName,
					height: control.getBoundingClientRect().height
				}))
				.filter((control) => control.height < 43.5);
			return {
				left: bounds.left,
				right: bounds.right,
				viewportWidth: document.documentElement.clientWidth,
				documentOverflow:
					document.documentElement.scrollWidth - document.documentElement.clientWidth,
				undersizedControls
			};
		});
		expect(geometry.left).toBeGreaterThanOrEqual(-1.5);
		expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth + 1.5);
		expect(geometry.documentOverflow).toBeLessThanOrEqual(1);
		expect(geometry.undersizedControls).toEqual([]);
		if (viewport.width <= 390) {
			const compactCharts = await explorer.evaluate((element) => {
				const selectors = [
					'.chart-card > .rhythm-chart',
					'.feedback-panels .chart-panel:first-child > svg',
					'.ecosystem-chart-grid .chart-panel:first-child > svg',
					'.measured-panel .chart-panel > svg'
				];
				return selectors.map((selector) => {
					const svg = element.querySelector<SVGSVGElement>(selector)!;
					const panel = svg.parentElement!;
					return {
						selector,
						svgWidth: svg.getBoundingClientRect().width,
						panelWidth: panel.clientWidth,
						scrollWidth: panel.scrollWidth
					};
				});
			});
			for (const chart of compactCharts) {
				expect(chart.svgWidth, chart.selector).toBeLessThanOrEqual(chart.panelWidth + 1);
				expect(chart.scrollWidth, chart.selector).toBeLessThanOrEqual(chart.panelWidth + 1);
			}

			const endpointChecks = await explorer.evaluate((element) => {
				const checks = [
					{ selector: '.chart-card > .rhythm-chart', labels: ['0 s', '20 s'] },
					{
						selector: '.feedback-panels .chart-panel:first-child > svg',
						labels: ['0', '45']
					},
					{
						selector: '.ecosystem-chart-grid .chart-panel:first-child > svg',
						labels: ['0', '30']
					},
					{ selector: '.measured-panel .chart-panel > svg', labels: ['1987', '1994'] }
				];
				return checks.flatMap(({ selector, labels }) => {
					const svg = element.querySelector<SVGSVGElement>(selector)!;
					const panelBounds = svg.parentElement!.getBoundingClientRect();
					return labels.map((label) => {
						const text = Array.from(svg.querySelectorAll<SVGTextElement>('text'))
							.filter((node) => node.textContent?.trim() === label)
							.sort((a, b) => b.getBBox().y - a.getBBox().y)[0]!;
						const bounds = text.getBoundingClientRect();
						return {
							selector,
							label,
							visible:
								bounds.left >= panelBounds.left - 1 &&
								bounds.right <= panelBounds.right + 1 &&
								bounds.top >= panelBounds.top - 1 &&
								bounds.bottom <= panelBounds.bottom + 1,
							height: bounds.height
						};
					});
				});
			});
			for (const endpoint of endpointChecks) {
				expect(endpoint.visible, `${endpoint.selector}: ${endpoint.label}`).toBe(true);
				expect(endpoint.height, `${endpoint.selector}: ${endpoint.label}`).toBeGreaterThanOrEqual(
					11.5
				);
			}

			const timeLabelCollisions = await explorer
				.locator('.chart-card > .rhythm-chart')
				.evaluate((svg) => {
					const units = Array.from(svg.querySelectorAll<SVGTextElement>('.series-unit'));
					const domains = Array.from(svg.querySelectorAll<SVGTextElement>('.domain-label'));
					return units.flatMap((unit) => {
						const a = unit.getBoundingClientRect();
						return domains
							.filter((domain) => {
								const b = domain.getBoundingClientRect();
								return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
							})
							.map((domain) => `${unit.textContent?.trim()} × ${domain.textContent?.trim()}`);
					});
				});
			expect(timeLabelCollisions).toEqual([]);
		}
		if (viewport.width !== 320) {
			await page.screenshot({
				animations: 'disabled',
				fullPage: true,
				path: testInfo.outputPath(`homeodynamics-${viewport.width}x${viewport.height}.png`)
			});
		}
		if (viewport.width <= 390) {
			for (const testId of ['time-microscope', 'feedback-lab', 'ecosystem-lab']) {
				await explorer.getByTestId(testId).screenshot({
					animations: 'disabled',
					path: testInfo.outputPath(`homeodynamics-${viewport.width}-${testId}.png`)
				});
			}
		}
	}

	await page.setViewportSize({ width: 1440, height: 900 });
	const palettes: string[] = [];
	for (const theme of ['paper', 'night'] as const) {
		const themeSelect = page
			.getByLabel('Colour theme', { exact: true })
			.filter({ visible: true })
			.first();
		await themeSelect.selectOption(theme);
		await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
		palettes.push(
			await explorer.evaluate((element) => {
				const style = getComputedStyle(element);
				return `${style.backgroundColor}|${style.color}`;
			})
		);
	}
	expect(new Set(palettes).size).toBe(2);
});

test('the scoped explorer has no serious WCAG violations', async ({ page }) => {
	const explorer = await openExplorer(page);
	await explorer.getByRole('button', { name: 'Sharks may later overshoot' }).click();
	const result = await new AxeBuilder({ page })
		.include('[data-testid="homeodynamics-explorer"]')
		.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
		.analyze();
	expect(
		result.violations.filter((violation) =>
			['serious', 'critical'].includes(violation.impact ?? '')
		)
	).toEqual([]);

	await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
	expect(await page.evaluate(() => matchMedia('(forced-colors: active)').matches)).toBe(true);
	await expect(page.getByText('Measured field data', { exact: true })).toBeVisible();
	await expect(page.getByText('Disputed inference', { exact: true })).toBeVisible();
	const rhythmPatterns = await explorer
		.locator('.rhythm-path')
		.evaluateAll((paths) => paths.map((path) => getComputedStyle(path).strokeDasharray));
	expect(new Set(rhythmPatterns).size).toBe(rhythmPatterns.length);
	const ecosystemPatterns = await explorer
		.locator('.eco-trace.baseline')
		.evaluateAll((paths) => paths.map((path) => getComputedStyle(path).strokeDasharray));
	expect(new Set(ecosystemPatterns).size).toBe(ecosystemPatterns.length);
	const forcedColourStrokes = await explorer.evaluate((element) => ({
		canvasText: getComputedStyle(element).color,
		strokes: Array.from(
			element.querySelectorAll(
				'.chart-axis, .chart-tick, .operating-line, .perturbation-line, .intervention-marker, .cursor-line, .eco-trace'
			)
		).map((node) => getComputedStyle(node).stroke)
	}));
	expect(new Set(forcedColourStrokes.strokes)).toEqual(new Set([forcedColourStrokes.canvasText]));
	expect(
		await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth
		)
	).toBeLessThanOrEqual(1);
});

test('print re-centres the ledger and uses a light paper palette', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	const explorer = await openExplorer(page);
	await page.emulateMedia({ media: 'print', reducedMotion: 'reduce' });
	const geometry = await explorer.evaluate((element) => {
		const bounds = element.getBoundingClientRect();
		const style = getComputedStyle(element);
		return {
			left: bounds.left,
			right: bounds.right,
			viewportWidth: document.documentElement.clientWidth,
			background: style.backgroundColor,
			colour: style.color
		};
	});
	expect(geometry.left).toBeGreaterThanOrEqual(-1);
	expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth + 1);
	expect(geometry.background).toBe('rgb(255, 255, 255)');
	expect(geometry.colour).toBe('rgb(17, 17, 17)');
});
