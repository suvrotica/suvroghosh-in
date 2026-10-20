import { expect, test } from '@playwright/test';

test('Observable wave keeps readable phone axes and reports amplitude in data units', async ({
	page
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.goto('/blog/visualizations/hello-observable-your-first-living-d3-visualization');
	const shell = page.locator('.observable-shell').last();
	await shell.scrollIntoViewIfNeeded();
	const slider = shell.getByRole('slider', { name: 'Amplitude', exact: true });
	await expect(slider).toBeVisible();
	await expect(shell.locator('output[data-output-for="amplitude"]')).toContainText('units');
	const chart = shell.locator('svg').last();
	await expect(chart.locator('.wave-axis text').first()).toBeVisible();
	const sizes = await chart.locator('.wave-axis text').evaluateAll((elements) =>
		elements.map((element) => {
			const text = element as SVGTextElement;
			const matrix = text.getScreenCTM()!;
			return Number.parseFloat(getComputedStyle(text).fontSize) * Math.hypot(matrix.a, matrix.b);
		})
	);
	expect(Math.min(...sizes)).toBeGreaterThanOrEqual(10);
	const clippedTicks = await chart.locator('.wave-axis text').evaluateAll((elements) =>
		elements
			.filter((element) => {
				const text = element as SVGTextElement;
				const bounds = text.getBoundingClientRect();
				const frame = text.ownerSVGElement!.getBoundingClientRect();
				return bounds.left < frame.left || bounds.right > frame.right;
			})
			.map((element) => element.textContent)
	);
	expect(clippedTicks).toEqual([]);
	const line = chart.locator('path').last();
	const before = await line.getAttribute('d');
	await slider.focus();
	await slider.press('End');
	await expect.poll(() => line.getAttribute('d')).not.toBe(before);
});

test('Brownian diagnostic axes remain readable on phones after resizing a populated plot', async ({
	page
}) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.goto('/blog/visualizations/brownian-motion-laboratory');
	const lab = page.getByTestId('brownian-motion-lab');
	await expect(lab).toHaveAttribute('data-hydrated', 'true');
	await lab.getByRole('button', { name: 'Add 999 more particles', exact: true }).click();
	await lab.getByRole('button', { name: 'Step', exact: true }).evaluate((button) => {
		if (!(button instanceof HTMLButtonElement)) throw new Error('Expected a step button');
		for (let index = 0; index < 120; index++) button.click();
	});
	await expect(lab).toHaveAttribute('data-step-count', '120');
	await lab.getByRole('tab', { name: 'Mean-square displacement', exact: true }).click();
	await page.setViewportSize({ width: 390, height: 844 });
	const chart = lab.locator('.diagnostics svg');
	await chart.scrollIntoViewIfNeeded();
	await expect.poll(() => chart.getAttribute('viewBox')).not.toBe('0 0 760 280');
	const sizes = await chart.locator('.tick,.axis-label').evaluateAll((elements) =>
		elements.map((element) => {
			const text = element as SVGTextElement;
			const matrix = text.getScreenCTM()!;
			return Number.parseFloat(getComputedStyle(text).fontSize) * Math.hypot(matrix.a, matrix.b);
		})
	);
	expect(Math.min(...sizes)).toBeGreaterThanOrEqual(10);
	await expect(chart.locator('.measured-line')).not.toHaveAttribute('d', /NaN|Infinity/);
});

test('Meaning Map composes search and keyboard selection and keeps its mobile graph width', async ({
	page
}) => {
	await page.goto('/blog/visualizations/the-meaning-connection-map', {
		waitUntil: 'domcontentloaded'
	});
	const map = page.locator('[data-meaning-map]');
	const nodes = map.locator('.nodes g[tabindex="0"]');
	await expect(nodes.first()).toBeVisible();
	const headerBottom = await page
		.locator('.site-header')
		.evaluate((element) => element.getBoundingClientRect().bottom);
	await expect
		.poll(() => map.evaluate((element) => element.getBoundingClientRect().top))
		.toBeGreaterThanOrEqual(headerBottom);
	await expect(map.getByRole('button', { name: 'Foundations', exact: true })).toBeVisible();
	const label = await nodes.first().getAttribute('aria-label');
	await nodes.first().focus();
	await nodes.first().press('Enter');
	await expect(
		map.locator('aside').getByRole('heading', { name: label!, exact: true })
	).toBeVisible();
	await map.getByRole('textbox', { name: 'Search concepts' }).fill('no-such-concept-review');
	await expect(nodes).toHaveCount(0);
	await expect(map.locator('aside')).toHaveCount(0);
	await map.getByRole('textbox', { name: 'Search concepts' }).fill('');
	await expect(nodes.first()).toBeVisible();
	await page.setViewportSize({ width: 390, height: 844 });
	const phoneHeaderBottom = await page
		.locator('.site-header')
		.evaluate((element) => element.getBoundingClientRect().bottom);
	await expect
		.poll(() => map.evaluate((element) => element.getBoundingClientRect().top))
		.toBeGreaterThanOrEqual(phoneHeaderBottom);
	const svg = map.locator('svg').first();
	const width = await svg.evaluate((element) => element.getBoundingClientRect().width);
	await nodes.first().focus();
	await nodes.first().press('Enter');
	await expect(map.locator('aside')).toBeVisible();
	expect(await svg.evaluate((element) => element.getBoundingClientRect().width)).toBeCloseTo(
		width,
		0
	);
	expect(width).toBeGreaterThan(300);
	await expect(map.getByRole('button', { name: /Close/u })).toBeVisible();
});

test('pausing and resuming the introductory shader preserves its elapsed simulation time', async ({
	page
}) => {
	await page.emulateMedia({ reducedMotion: 'no-preference' });
	await page.addInitScript(() => {
		const recorded = window as unknown as { shaderTimes: number[] };
		recorded.shaderTimes = [];
		for (const prototype of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
			const names = new WeakMap<WebGLUniformLocation, string>();
			const location = prototype.getUniformLocation;
			prototype.getUniformLocation = function (program, name) {
				const found = location.call(this, program, name);
				if (found) names.set(found, name);
				return found;
			};
			const uniform = prototype.uniform1f;
			prototype.uniform1f = function (location, value) {
				if (location && names.get(location) === 'u_time') recorded.shaderTimes.push(value);
				return uniform.call(this, location, value);
			};
		}
	});
	await page.goto('/blog/visualizations/hello-fragment-your-first-shader-from-scratch', {
		waitUntil: 'domcontentloaded'
	});
	const figure = page.locator('.visualization-shell').first();
	await figure.scrollIntoViewIfNeeded();
	const time = () =>
		page.evaluate(() => (window as unknown as { shaderTimes: number[] }).shaderTimes.at(-1) ?? 0);
	await expect.poll(time).toBeGreaterThan(0.4);
	const before = await time();
	await figure.getByRole('button', { name: 'Pause', exact: true }).click();
	await expect(figure).toContainText('Interactive shader paused');
	expect(await time()).toBeGreaterThanOrEqual(before);
	const frozen = await time();
	await page.waitForTimeout(200);
	expect(await time()).toBe(frozen);
	await figure.getByRole('button', { name: 'Start', exact: true }).click();
	await expect.poll(time).toBeGreaterThan(frozen);
});

test('paused introductory shaders redraw when controls change after their asynchronous mount', async ({
	page
}) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.goto('/blog/visualizations/hello-fragment-your-first-shader-from-scratch', {
		waitUntil: 'domcontentloaded'
	});
	const figure = page.locator('.visualization-shell').first();
	await figure.scrollIntoViewIfNeeded();
	const canvas = figure.locator('canvas').first();
	await expect(canvas).toBeVisible();
	await expect(figure).toContainText('Interactive shader paused');
	const before = await canvas.screenshot();
	const palette = figure.getByRole('combobox', { name: /Colour field/u });
	await palette.selectOption('calm');
	await expect.poll(async () => (await canvas.screenshot()).equals(before)).toBe(false);
	const paused = await canvas.screenshot();
	await page.waitForTimeout(200);
	expect((await canvas.screenshot()).equals(paused)).toBe(true);
});
