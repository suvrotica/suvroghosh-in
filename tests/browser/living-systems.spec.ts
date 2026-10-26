import { mkdir } from 'node:fs/promises';
import { expect, test, type Locator, type Page } from '@playwright/test';

const articlePath = '/blog/visualizations/living-systems';
const modes = [
	['life', 'Game of Life'],
	['ant', 'Langton’s Ant'],
	['diffusion', 'Diffusion'],
	['walk', 'Random Walk']
] as const;

async function ready(page: Page) {
	await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
	expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(
		true
	);
	for (const name of ['Reject optional', 'Dismiss privacy confirmation']) {
		const button = page.getByRole('button', { name, exact: true });
		if (await button.isVisible()) await button.click();
	}
	const shell = page.getByRole('region', { name: 'Living Systems simulation playground' });
	await shell.scrollIntoViewIfNeeded();
	const runtime = shell.locator('.ls-runtime');
	await expect(runtime).toBeVisible();
	await expect(runtime.getByRole('button', { name: 'Play simulation', exact: true })).toBeEnabled();
	await expect(runtime.locator('canvas')).toHaveAttribute('width', /[1-9][0-9]+/u);
	await page.evaluate(() => document.fonts.ready);
	await page.evaluate(
		() =>
			new Promise<void>((resolve) =>
				requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
			)
	);
	return { shell, runtime, canvas: runtime.locator('canvas') };
}

async function selectMode(runtime: Locator, mode: (typeof modes)[number]) {
	const button = runtime
		.getByRole('navigation', { name: 'Choose a simulation' })
		.getByRole('button', {
			name: new RegExp(mode[1], 'u')
		});
	await button.click();
	await expect(runtime).toHaveAttribute('data-mode', mode[0]);
	await expect(button).toHaveAttribute('aria-pressed', 'true');
}

async function steps(runtime: Locator) {
	return Number(await runtime.getAttribute('data-steps'));
}

async function metric(runtime: Locator, label: string) {
	const value = await runtime
		.locator('dt')
		.filter({ hasText: new RegExp(`^${label}$`, 'u') })
		.locator('..')
		.locator('dd')
		.innerText();
	return Number.parseFloat(value.replaceAll(',', ''));
}

async function fieldPoint(canvas: Locator, x: number, y: number, zoom = 1, panX = 0, panY = 0) {
	// Choosing a tool below the stage can scroll the field above the viewport.
	// Bring it back before mapping world coordinates to an actual pointer target.
	await canvas.scrollIntoViewIfNeeded();
	const box = await canvas.boundingBox();
	expect(box).not.toBeNull();
	const scale = Math.min(box!.width / 120, box!.height / 84) * zoom;
	return {
		x: box!.x + box!.width / 2 + (x + 0.5 - 60) * scale + panX,
		y: box!.y + box!.height / 2 + (y + 0.5 - 42) * scale + panY
	};
}

test('the server retains the article, scientific explanation and static fallback', async ({
	request
}) => {
	const response = await request.get(articlePath);
	expect(response.ok()).toBe(true);
	const html = await response.text();
	expect(html).toContain('Living');
	expect(html).toContain('Small rules.');
	expect(html).toContain('/images/visualizations/living-systems/social.png');
	expect(html).toContain('Enable JavaScript to run the simulations');
	expect(html).toContain('A drop learns the shape of a room');
	expect(html).toContain('Mean squared displacement');
	expect((html.match(/<h1\b/gu) ?? []).length).toBe(1);
	expect(html).toMatch(/Updated\s*<time\b[^>]*datetime="2026-10-26"/u);
});

test('all four models step exactly once, retain their state and reset their selected preset', async ({
	page
}) => {
	const { runtime } = await ready(page);
	await expect(runtime).toHaveAttribute('data-playing', 'false');
	const observed = new Map<string, number>();
	for (const mode of modes) {
		await selectMode(runtime, mode);
		const before = await steps(runtime);
		await runtime.getByRole('button', { name: 'Step', exact: true }).click();
		await expect.poll(() => steps(runtime)).toBe(before + 1);
		await expect(runtime).toHaveAttribute('data-playing', 'false');
		observed.set(mode[0], before + 1);
	}
	for (const mode of modes) {
		await selectMode(runtime, mode);
		await expect.poll(() => steps(runtime)).toBe(observed.get(mode[0]));
		await runtime.getByRole('button', { name: 'Reset', exact: true }).click();
		await expect.poll(() => steps(runtime)).toBe(mode[0] === 'ant' ? 11_000 : 0);
	}
});

test('Life painting maps through zoom and pan, then erases the same logical cells after fit', async ({
	page
}) => {
	const { runtime, canvas } = await ready(page);
	await runtime.getByRole('combobox', { name: 'Preset', exact: true }).selectOption('blinker');
	const population = await metric(runtime, 'Living cells');
	expect(population).toBe(3);
	await runtime.getByRole('button', { name: 'Zoom in', exact: true }).click();
	await expect(runtime.locator('.ls-stage-bottom')).toContainText('125%');
	const centre = await fieldPoint(canvas, 60, 42, 1.25);
	await page.mouse.move(centre.x, centre.y);
	await page.mouse.down();
	await page.mouse.move(centre.x + 40, centre.y + 24, { steps: 4 });
	await page.mouse.up();
	await runtime.getByRole('button', { name: /\+ Paint/u }).click();
	await runtime.getByRole('slider', { name: 'Brush size', exact: true }).focus();
	await runtime.getByRole('slider', { name: 'Brush size', exact: true }).press('Home');
	const point = await fieldPoint(canvas, 25, 25, 1.25, 40, 24);
	await page.mouse.click(point.x, point.y);
	await expect.poll(() => metric(runtime, 'Living cells')).toBeGreaterThan(population);
	await expect(runtime).toHaveAttribute('data-steps', '0');
	await runtime.getByRole('button', { name: 'Fit', exact: true }).click();
	await runtime.getByRole('button', { name: /Erase/u }).click();
	const originalPoint = await fieldPoint(canvas, 25, 25);
	await page.mouse.click(originalPoint.x, originalPoint.y);
	await expect.poll(() => metric(runtime, 'Living cells')).toBe(population);
	await runtime.getByRole('combobox', { name: 'Life boundary' }).selectOption('finite');
	await expect(runtime.locator('.ls-stage-top')).toContainText('FINITE EDGES');
});

test('diffusion deposits dye, conserves it while spreading and distinguishes a continuous source', async ({
	page
}) => {
	const { runtime, canvas } = await ready(page);
	await selectMode(runtime, modes[2]);
	const initialMass = await metric(runtime, 'Total dye');
	await runtime.getByRole('button', { name: /\+ Dye/u }).click();
	const point = await fieldPoint(canvas, 30, 30);
	await page.mouse.click(point.x, point.y);
	await expect.poll(() => metric(runtime, 'Total dye')).toBeGreaterThan(initialMass);
	const depositedMass = await metric(runtime, 'Total dye');
	const variance = await metric(runtime, 'Variance');
	for (let index = 0; index < 8; index++)
		await runtime.getByRole('button', { name: 'Step', exact: true }).click();
	expect(Math.abs((await metric(runtime, 'Total dye')) - depositedMass)).toBeLessThanOrEqual(0.2);
	expect(await metric(runtime, 'Variance')).toBeLessThan(variance);
	await runtime.getByRole('checkbox', { name: 'Continuous source' }).check();
	for (let index = 0; index < 8; index++)
		await runtime.getByRole('button', { name: 'Step', exact: true }).click();
	await expect.poll(() => metric(runtime, 'Total dye')).toBeGreaterThan(depositedMass);
});

test('keyboard transport is scoped to the focused field and playback can be explicitly started', async ({
	page
}) => {
	const { runtime, canvas } = await ready(page);
	const seed = runtime.getByRole('spinbutton', { name: 'Random seed', exact: true });
	await seed.focus();
	await seed.press('n');
	await expect(runtime).toHaveAttribute('data-steps', '0');
	await seed.press('Space');
	await expect(runtime).toHaveAttribute('data-playing', 'false');
	await canvas.focus();
	await canvas.press('n');
	await expect(runtime).toHaveAttribute('data-steps', '1');
	await canvas.press('r');
	await expect(runtime).toHaveAttribute('data-steps', '0');
	await canvas.press('Equal');
	await expect(runtime.locator('.ls-stage-bottom')).toContainText('125%');
	await canvas.press('Home');
	await expect(runtime.locator('.ls-stage-bottom')).toContainText('100%');
	await canvas.press('Space');
	await expect(runtime).toHaveAttribute('data-playing', 'true');
	await expect.poll(() => steps(runtime)).toBeGreaterThan(0);
	await canvas.press('Space');
	await expect(runtime).toHaveAttribute('data-playing', 'false');
});

test('seeded reset reproduces the field and frame export contains the observed experiment', async ({
	page
}) => {
	const { runtime, canvas } = await ready(page);
	const fingerprint = () =>
		canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL('image/png'));
	const initial = await fingerprint();
	await runtime.getByRole('button', { name: 'Step', exact: true }).click();
	await expect.poll(fingerprint).not.toBe(initial);
	await runtime.getByRole('button', { name: 'Reset', exact: true }).click();
	await expect.poll(fingerprint).toBe(initial);
	const [download] = await Promise.all([
		page.waitForEvent('download'),
		runtime.getByRole('button', { name: /Save frame/u }).click()
	]);
	expect(download.suggestedFilename()).toBe('living-systems-life-0.png');
	expect(await download.failure()).toBeNull();
});

test('each retained random experiment keeps its own displayed seed', async ({ page }) => {
	const { runtime } = await ready(page);
	const seed = runtime.getByRole('spinbutton', { name: 'Random seed', exact: true });
	await seed.fill('99');
	await seed.press('Tab');
	await expect(seed).toHaveValue('99');
	await selectMode(runtime, modes[3]);
	await expect(seed).toHaveValue('1847');
	await seed.fill('77');
	await seed.press('Tab');
	await selectMode(runtime, modes[0]);
	await expect(seed).toHaveValue('99');
	await selectMode(runtime, modes[3]);
	await expect(seed).toHaveValue('77');
});

test('desktop modes render distinct measured worlds without browser errors', async ({ page }) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	const { shell, runtime, canvas } = await ready(page);
	await mkdir('artifacts/living-systems', { recursive: true });
	const fingerprints = new Set<string>();
	for (const mode of modes) {
		await selectMode(runtime, mode);
		for (let index = 0; index < 12; index++)
			await runtime.getByRole('button', { name: 'Step', exact: true }).click();
		await page.mouse.move(0, 0);
		await expect(runtime.locator('.ls-metrics dd')).toHaveCount(3);
		fingerprints.add(
			await canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL('image/png'))
		);
		await shell.screenshot({ path: `artifacts/living-systems/desktop-${mode[0]}.png` });
	}
	expect(fingerprints.size).toBe(4);
	expect(errors).toEqual([]);
});

test('mobile retains all modes, usable controls and a field without horizontal page overflow', async ({
	page
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	const { shell, runtime, canvas } = await ready(page);
	for (const mode of modes) {
		await selectMode(runtime, mode);
		await runtime.getByRole('button', { name: 'Step', exact: true }).click();
		const box = await canvas.boundingBox();
		expect(box).not.toBeNull();
		expect(box!.width).toBeGreaterThan(250);
		expect(box!.x).toBeGreaterThanOrEqual(0);
		expect(box!.x + box!.width).toBeLessThanOrEqual(391);
		expect(
			await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
		).toBe(true);
	}
	await mkdir('artifacts/living-systems', { recursive: true });
	await shell.screenshot({ path: 'artifacts/living-systems/mobile.png' });
});
