import { expect, test } from '@playwright/test';

test('shell preset drawer fills its desktop slot and retains the phone rail', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 1000 });
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.goto('/blog/visualizations/the-living-aperture');
	const lab = page.locator('.living-aperture-lab');
	const list = lab.locator('.preset-list');
	await expect(list.locator('.preset-card').nth(1)).toBeVisible();
	const geometry = await list.evaluate((element) => {
		const listBounds = element.getBoundingClientRect();
		const drawerBounds = element.closest('.preset-browser')!.getBoundingClientRect();
		const slotBounds = element.closest('.presets')!.getBoundingClientRect();
		return {
			height: listBounds.height,
			drawerHeight: drawerBounds.height,
			slotHeight: slotBounds.height,
			top: listBounds.top,
			bottom: listBounds.bottom,
			cards: [...element.querySelectorAll('.preset-card')].slice(0, 2).map((card) => {
				const bounds = card.getBoundingClientRect();
				return { top: bounds.top, bottom: bounds.bottom };
			})
		};
	});
	expect(geometry.height).toBeGreaterThanOrEqual(300);
	expect(Math.abs(geometry.drawerHeight - geometry.slotHeight)).toBeLessThan(2);
	for (const card of geometry.cards) {
		expect(card.top).toBeGreaterThanOrEqual(geometry.top - 1);
		expect(card.bottom).toBeLessThanOrEqual(geometry.bottom + 1);
	}
	await page.setViewportSize({ width: 390, height: 844 });
	const rail = await list.evaluate((element) => ({
		height: element.getBoundingClientRect().height,
		overflow: getComputedStyle(element).overflowX,
		scrolls: element.scrollWidth > element.clientWidth
	}));
	expect(rail.height).toBeGreaterThanOrEqual(100);
	expect(rail.height).toBeLessThan(350);
	expect(rail.overflow).toBe('auto');
	expect(rail.scrolls).toBe(true);
});

test('the nucleus opening keeps its outside-cell annotation inside a taller desktop stage', async ({
	page
}) => {
	await page.setViewportSize({ width: 1440, height: 1000 });
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.goto('/blog/visualizations/weather-inside-the-nucleus');
	const stage = page.getByTestId('weather-cold-open');
	const label = stage.locator('.outside-space-label');
	await expect(label).toBeVisible();
	const labelBounds = await label.boundingBox();
	const stageBounds = await stage.boundingBox();
	expect(labelBounds).not.toBeNull();
	expect(stageBounds).not.toBeNull();
	expect(labelBounds!.x).toBeGreaterThanOrEqual(Math.max(0, stageBounds!.x) + 8);
	expect(labelBounds!.x + labelBounds!.width).toBeLessThanOrEqual(
		Math.min(1440, stageBounds!.x + stageBounds!.width) - 8
	);
});

test('the complete artificial-life canvas fits its phone-width habitat', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.goto(
		'/blog/visualizations/artificial-life-lab-evolve-a-digital-ecosystem-in-your-browser'
	);
	const canvas = page.locator('.artificial-life-lab canvas[data-render-frame-cap="30"]');
	await expect(canvas).toBeVisible();
	const bounds = await canvas.evaluate((element) => {
		const surface = element.getBoundingClientRect();
		const stage = element.parentElement!.getBoundingClientRect();
		const lab = element.closest('.artificial-life-lab')!.getBoundingClientRect();
		return {
			surface: surface.width,
			stage: stage.width,
			lab: lab.width,
			right: surface.right,
			labRight: lab.right
		};
	});
	expect(bounds.surface).toBeLessThanOrEqual(bounds.lab);
	expect(bounds.stage).toBeLessThanOrEqual(bounds.lab);
	expect(Math.abs(bounds.surface - bounds.stage)).toBeLessThan(1);
	expect(bounds.right).toBeLessThanOrEqual(bounds.labRight);
});

test('calcium chart preserves readable axes and adapts ticks on a phone', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/blog/visualizations/fertilization-calcium-clock');
	const atlas = page.getByTestId('fertilization-calcium-atlas');
	await expect(atlas).toHaveAttribute('data-ready', 'true');
	const chart = atlas.locator('.trace-svg');
	await expect(chart.locator('.axis-tick:not(.y-tick)')).toHaveCount(3);
	const textSizes = await chart.locator('.axis-tick, .axis-title').evaluateAll((elements) =>
		elements.map((element) => {
			const text = element as SVGTextElement;
			const matrix = text.getScreenCTM()!;
			return Number.parseFloat(getComputedStyle(text).fontSize) * Math.hypot(matrix.a, matrix.b);
		})
	);
	expect(Math.min(...textSizes)).toBeGreaterThanOrEqual(10);
	await expect(chart.locator('.primary-trace')).not.toHaveAttribute('d', /NaN|Infinity/);
	await page.setViewportSize({ width: 1440, height: 1000 });
	await expect(chart).toHaveAttribute('viewBox', '0 0 640 238');
	await expect(chart.locator('.axis-tick:not(.y-tick)')).toHaveCount(5);
});
