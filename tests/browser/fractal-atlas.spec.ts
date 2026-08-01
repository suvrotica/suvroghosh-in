import { expect, test, type Download, type Page } from '@playwright/test';

const articlePath = '/blog/visualizations/the-fractal-atlas';
const runtimeDiagnostics = new WeakMap<Page, string[]>();

function laboratory(page: Page) {
	return page.getByTestId('fractal-atlas-lab');
}

function collectUnexpectedRuntimeDiagnostics(page: Page): string[] {
	const diagnostics: string[] = [];
	page.on('pageerror', (error) => diagnostics.push(`pageerror: ${error.message}`));
	page.on('console', (message) => {
		if (message.type() !== 'warning' && message.type() !== 'error') return;
		const source = `${message.location().url} ${message.text()}`;
		if (source.includes('/_vercel/') || /favicon/iu.test(source)) return;
		diagnostics.push(`${message.type()}: ${message.text()}`);
	});
	return diagnostics;
}

async function waitForAtlas(page: Page) {
	const lab = laboratory(page);
	await expect(lab).toBeVisible();
	await expect(lab).toHaveAttribute('data-hydrated', 'true');
	await lab.locator('.primary-plane .fractal-stage').scrollIntoViewIfNeeded();
	await expect
		.poll(() => lab.getAttribute('data-backend'), { timeout: 45_000 })
		.toMatch(/^(webgl2|canvas-2d|worker|vector)$/u);
}

async function downloadBytes(download: Download): Promise<Buffer> {
	const stream = await download.createReadStream();
	const chunks: Buffer[] = [];
	for await (const chunk of stream) {
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	}
	return Buffer.concat(chunks);
}

test.beforeEach(({ page }) => {
	runtimeDiagnostics.set(page, collectUnexpectedRuntimeDiagnostics(page));
});

test.afterEach(({ page }) => {
	expect(runtimeDiagnostics.get(page) ?? []).toEqual([]);
});

test('the canonical article hydrates from a meaningful field plate into a computed linked atlas', async ({
	page,
	request
}) => {
	const response = await request.get(articlePath);
	expect(response.ok()).toBe(true);
	const html = await response.text();
	expect(html).toContain('The Fractal Atlas: A Field Guide to Infinity');
	expect(html).toContain('/images/fractal-atlas.png');
	expect(html).toContain('data-testid="fractal-atlas-lab"');
	expect(html).toContain('Static field plate');

	await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
	await waitForAtlas(page);
	const lab = laboratory(page);
	await expect(lab).toHaveAttribute('data-family', 'mandelbrot');
	await expect(page.getByRole('heading', { name: 'The Fractal Atlas', exact: true })).toBeVisible();
	await expect(lab.locator('.primary-plane .fractal-stage')).toBeVisible();
	await expect(lab.locator('.julia-plane .fractal-stage')).toBeVisible();
	await expect(lab.getByText('Linked Julia', { exact: false }).first()).toBeVisible();

	const visibleCanvas = lab.locator('.primary-plane canvas.render-layer:not([hidden])').first();
	await expect(visibleCanvas).toBeVisible();
	const renderEvidence = await visibleCanvas.evaluate((element) => {
		const canvas = element as HTMLCanvasElement;
		return {
			width: canvas.width,
			height: canvas.height,
			dataLength: canvas.toDataURL('image/png').length
		};
	});
	expect(renderEvidence.width).toBeGreaterThan(300);
	expect(renderEvidence.height).toBeGreaterThan(240);
	expect(renderEvidence.dataLength).toBeGreaterThan(1_000);

	const coordinateBefore = await lab
		.locator('.readout-strip')
		.getByText('Pointer / pinned coordinate')
		.locator('..')
		.locator('code')
		.textContent();
	const stage = lab.locator('.primary-plane .fractal-stage');
	const box = await stage.boundingBox();
	expect(box).not.toBeNull();
	await stage.click({ position: { x: box!.width * 0.62, y: box!.height * 0.42 } });
	await expect
		.poll(() =>
			lab
				.locator('.readout-strip')
				.getByText('Pointer / pinned coordinate')
				.locator('..')
				.locator('code')
				.textContent()
		)
		.not.toBe(coordinateBefore);
	await expect(lab.getByRole('button', { name: 'Orbit inspector' })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect(lab.getByRole('heading', { name: "One pixel's paperwork" })).toBeVisible();

	await lab.getByRole('button', { name: 'Orbit inspector' }).click();
	await expect(lab.getByRole('heading', { name: "One pixel's paperwork" })).toBeVisible();
	await expect(lab.getByText(/after \d+ iteration/iu)).toBeVisible();
});

test('navigation shortcuts, zoom breadcrumb and Reset all preserve a reversible atlas state', async ({
	page
}) => {
	await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
	await waitForAtlas(page);
	const lab = laboratory(page);
	const breadcrumb = lab.getByRole('navigation', { name: 'Zoom breadcrumb' });
	await expect(breadcrumb.locator('[aria-current="location"]')).toHaveText('1×');

	await lab.getByTitle('Zoom in').click();
	await expect.poll(() => new URL(page.url()).searchParams.get('s')).not.toBe('2.8');
	await expect(breadcrumb.getByRole('button')).toHaveCount(1);
	const zoomedSpan = new URL(page.url()).searchParams.get('s');

	await page.keyboard.press('h');
	await expect.poll(() => new URL(page.url()).searchParams.get('s')).not.toBe(zoomedSpan);
	await expect(breadcrumb.locator('[aria-current="location"]')).toHaveText('1×');

	await page.keyboard.press('o');
	await expect(lab.getByRole('heading', { name: "One pixel's paperwork" })).toBeVisible();
	await page.keyboard.press('o');
	await expect(lab.getByRole('heading', { name: "One pixel's paperwork" })).toBeHidden();

	await lab.getByRole('button', { name: 'Julia', exact: true }).click();
	await lab.getByRole('button', { name: 'Explore', exact: true }).click();
	await lab.getByLabel('Compare mode').check();
	await lab.getByRole('button', { name: 'Orbit inspector' }).click();
	await lab.getByRole('button', { name: 'Reset all', exact: true }).click();
	await expect(lab).toHaveAttribute('data-family', 'mandelbrot');
	await expect(lab.getByRole('heading', { name: 'Move, link and compare' })).toBeVisible();
	await expect(lab.locator('.compare-plane')).toHaveCount(0);
	await expect(lab.locator('.julia-plane .fractal-stage')).toBeVisible();
	await expect(breadcrumb.locator('[aria-current="location"]')).toHaveText('1×');
	await expect(lab.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled();

	await lab.getByTitle('Zoom in').click();
	await page.keyboard.press('r');
	await expect.poll(() => new URL(page.url()).searchParams.get('s')).toBe('2.8');
});

test('all required families share the instrument and progressive work can pause and step', async ({
	page
}) => {
	await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
	await waitForAtlas(page);
	const lab = laboratory(page);
	const families = [
		['Julia', 'julia', /^(webgl2|canvas-2d|worker)$/u],
		['Multibrot', 'multibrot', /^(webgl2|canvas-2d|worker)$/u],
		['Burning Ship', 'burning-ship', /^(webgl2|canvas-2d|worker)$/u],
		['Tricorn', 'tricorn', /^(webgl2|canvas-2d|worker)$/u],
		['Phoenix', 'phoenix', /^(webgl2|canvas-2d|worker)$/u],
		['Map Workshop', 'custom-map', /^(webgl2|canvas-2d|worker)$/u],
		['Newton', 'newton', /^(webgl2|canvas-2d|worker)$/u],
		['Buddhabrot', 'buddhabrot', /^worker$/u],
		['Barnsley fern', 'barnsley-fern', /^worker$/u],
		['Sierpiński', 'sierpinski', /^vector$/u],
		['L-systems', 'l-system', /^vector$/u]
	] as const;

	for (const [label, family, backend] of families) {
		await lab.getByRole('button', { name: label, exact: true }).click();
		await expect(lab).toHaveAttribute('data-family', family);
		await expect.poll(() => lab.getAttribute('data-backend'), { timeout: 30_000 }).toMatch(backend);
	}

	await lab.getByRole('button', { name: 'Formula controls' }).click();
	const growthButton = lab.getByRole('button', { name: /(?:Grow 0 →|Pause growth)/u });
	await growthButton.click();
	await expect(growthButton).toHaveAttribute('aria-pressed', 'true');
	await growthButton.click();
	await expect(growthButton).toHaveAttribute('aria-pressed', 'false');

	await lab.getByRole('button', { name: 'Sierpiński', exact: true }).click();
	await lab.getByRole('button', { name: 'Formula controls' }).click();
	await lab.getByLabel('Construction view').selectOption('chaos');
	await expect.poll(() => new URL(page.url()).searchParams.get('sier')).toBe('chaos');

	await lab.getByRole('button', { name: 'Mandelbrot', exact: true }).click();
	await lab.getByRole('button', { name: 'Explore', exact: true }).click();
	await lab.getByLabel('Cardioid + bulb guide').check();
	await expect.poll(() => new URL(page.url()).searchParams.get('card')).toBe('1');
	await lab.getByRole('button', { name: 'Multibrot', exact: true }).click();
	await lab.getByRole('button', { name: 'Explore', exact: true }).click();
	await lab.getByLabel('Degree symmetry guide').check();
	await expect.poll(() => new URL(page.url()).searchParams.get('sym')).toBe('1');
	await lab.getByRole('button', { name: 'Formula controls' }).click();
	await lab.getByRole('slider', { name: /Integer degree d/u }).fill('5');
	await expect.poll(() => new URL(page.url()).searchParams.get('d')).toBe('5');
	await expect(lab.locator('.readout-strip')).toContainText('2.7000e+0');

	await lab.getByRole('button', { name: 'Map Workshop', exact: true }).click();
	await lab.getByRole('button', { name: 'Formula controls' }).click();
	await expect(lab.getByTestId('map-workshop')).toBeVisible();
	await lab.getByLabel('Integer power').fill('4');
	await lab.getByLabel('Integer power').press('Tab');
	await expect.poll(() => new URL(page.url()).searchParams.get('f')).toBe('custom-map');
	await expect.poll(() => new URL(page.url()).searchParams.get('map')).toContain('"power":4');

	await lab.getByRole('button', { name: 'Phoenix', exact: true }).click();
	await lab.getByRole('button', { name: 'Formula controls' }).click();
	await lab
		.getByRole('group', { name: 'Initial remembered value z₋₁' })
		.getByLabel('Real')
		.fill('0.25');
	await lab
		.getByRole('group', { name: 'Initial remembered value z₋₁' })
		.getByLabel('Real')
		.press('Tab');
	await expect.poll(() => new URL(page.url()).searchParams.get('pzr')).toBe('0.25');

	await lab.getByRole('button', { name: 'Newton', exact: true }).click();
	await lab.getByRole('button', { name: 'Formula controls' }).click();
	await lab.getByLabel('Relaxation λ').fill('0.8');
	await lab.getByLabel('Relaxation λ').press('Tab');
	await expect.poll(() => new URL(page.url()).searchParams.get('lam')).toBe('0.8');
	await lab.getByRole('button', { name: 'Orbit inspector' }).click();
	await expect(lab.locator('.orbit-inspector svg .root-label')).toHaveCount(3);
	await expect(
		lab.locator('.orbit-inspector svg[aria-label^="Newton convergence path"]')
	).toContainText('R1');

	await lab.getByRole('button', { name: 'Mandelbrot', exact: true }).click();
	await lab.getByRole('button', { name: 'Palette laboratory' }).click();
	await lab.getByLabel('Colouring method').selectOption('distance');
	await expect(lab.getByRole('group', { name: 'Distance-relief light' })).toBeVisible();
	await expect(lab.locator('.primary-plane .fractal-stage')).toHaveAttribute(
		'aria-label',
		/distance colouring at balanced quality/iu
	);
	await lab.getByRole('slider', { name: /Light strength/u }).fill('0.41');
	await expect.poll(() => new URL(page.url()).searchParams.get('dls')).toBe('0.41');
	await lab.getByLabel('Colouring method').selectOption('histogram');
	await expect(lab).toHaveAttribute('data-backend', /^(worker|canvas-2d)$/u);
	await expect(lab.getByText(/bounded frame histogram/iu)).toBeVisible();

	await lab.getByRole('button', { name: 'Explore', exact: true }).click();
	await lab.getByRole('button', { name: 'battery saver', exact: true }).click();
	await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe('battery');

	await lab.getByRole('button', { name: 'Buddhabrot', exact: true }).click();
	await expect(lab).toHaveAttribute('data-family', 'buddhabrot');
	await expect
		.poll(async () => Number(await lab.getAttribute('data-progress')), { timeout: 45_000 })
		.toBeGreaterThan(0);
	await lab.getByRole('button', { name: 'Pause', exact: true }).click();
	const paused = Number(await lab.getAttribute('data-progress'));
	await lab.getByRole('button', { name: 'One batch', exact: true }).click();
	await expect
		.poll(async () => Number(await lab.getAttribute('data-progress')), { timeout: 30_000 })
		.toBeGreaterThanOrEqual(paused);

	await lab.getByRole('button', { name: 'Explore', exact: true }).click();
	await lab.getByLabel('Compare mode').check();
	await expect(lab.locator('.compare-plane .fractal-stage')).toBeVisible();
	await lab.getByLabel('Second family').selectOption('newton');
	await expect(lab.locator('.compare-plane .plane-label')).toContainText('Newton');
});

test('bounded URL state survives reload and JSON, PNG and recursive SVG exports are valid', async ({
	page
}) => {
	await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
	await waitForAtlas(page);
	const lab = laboratory(page);

	await lab.getByRole('button', { name: 'Julia', exact: true }).click();
	await expect.poll(() => new URL(page.url()).searchParams.get('f')).toBe('julia');
	await page.goBack({ waitUntil: 'domcontentloaded' });
	await expect(lab).toHaveAttribute('data-family', 'mandelbrot');
	await page.goForward({ waitUntil: 'domcontentloaded' });
	await expect(lab).toHaveAttribute('data-family', 'julia');
	await lab.getByRole('button', { name: 'Formula controls' }).click();
	await lab.getByLabel('Real').fill('-0.4');
	await lab.getByLabel('Real').press('Tab');
	await expect.poll(() => new URL(page.url()).searchParams.get('f')).toBe('julia');
	const sharedUrl = page.url();
	await page.reload({ waitUntil: 'domcontentloaded' });
	await waitForAtlas(page);
	expect(page.url()).toBe(sharedUrl);
	await expect(laboratory(page)).toHaveAttribute('data-family', 'julia');

	await laboratory(page).getByRole('button', { name: 'Save and export' }).click();
	await laboratory(page).getByLabel('PNG resolution').selectOption('1x');
	await expect(laboratory(page).getByText(/peak memory/iu)).toBeVisible();
	await laboratory(page).getByLabel('PNG resolution').selectOption('current');
	await laboratory(page)
		.getByLabel(/Include atlas caption/u)
		.check();
	const [jsonDownload] = await Promise.all([
		page.waitForEvent('download'),
		laboratory(page)
			.getByRole('button', { name: /Settings JSON/u })
			.click()
	]);
	const json = JSON.parse((await downloadBytes(jsonDownload)).toString('utf8')) as {
		artifact: string;
		state: { family: string; version: number };
		selectedPoint: { re: number; im: number };
	};
	expect(json.artifact).toBe('Fractal Atlas specimen');
	expect(json.state).toMatchObject({ family: 'julia', version: 1 });
	expect(Number.isFinite(json.selectedPoint.re)).toBe(true);

	const [csvDownload] = await Promise.all([
		page.waitForEvent('download'),
		laboratory(page)
			.getByRole('button', { name: /Orbit CSV/u })
			.click()
	]);
	const csv = (await downloadBytes(csvDownload)).toString('utf8');
	expect(csv).toContain('n,re_z,im_z,magnitude,argument_radians');
	expect(csv.trim().split(/\r?\n/u).length).toBeGreaterThan(2);

	const [pngDownload] = await Promise.all([
		page.waitForEvent('download'),
		laboratory(page)
			.getByRole('button', { name: /Export PNG/u })
			.click()
	]);
	const png = await downloadBytes(pngDownload);
	expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
	expect(png.length).toBeGreaterThan(5_000);

	await laboratory(page).getByRole('button', { name: 'Sierpiński', exact: true }).click();
	await laboratory(page).getByRole('button', { name: 'Save and export' }).click();
	const svgButton = laboratory(page).getByRole('button', { name: /SVG construction/u });
	await expect(svgButton).toBeEnabled();
	const [svgDownload] = await Promise.all([page.waitForEvent('download'), svgButton.click()]);
	const svg = (await downloadBytes(svgDownload)).toString('utf8');
	expect(svg).toContain('<svg');
	expect(svg).toContain('<polygon');
	expect(svg.length).toBeGreaterThan(500);

	await page.goto(`${articlePath}?v=1&f=mandelbrot&it=-1&s=0`, {
		waitUntil: 'domcontentloaded'
	});
	await waitForAtlas(page);
	await expect(laboratory(page).getByText(/state correction/iu)).toBeVisible();
	await expect(laboratory(page)).toHaveAttribute('data-family', 'mandelbrot');
});

test('guided fieldwork uses local preset plates, A/B Julia pins and four fixed-geometry colour views', async ({
	page
}) => {
	await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
	await waitForAtlas(page);
	const lab = laboratory(page);

	await lab.getByRole('button', { name: 'Field expeditions' }).click();
	await expect(lab.locator('.experiment-grid article')).toHaveCount(10);
	await expect(lab.locator('.preset-gallery img')).toHaveCount(30);
	const presetImages = lab.locator('.preset-gallery img');
	for (let index = 0; index < (await presetImages.count()); index += 1) {
		const image = presetImages.nth(index);
		await image.scrollIntoViewIfNeeded();
		await expect
			.poll(() =>
				image.evaluate((element) => ({
					complete: (element as HTMLImageElement).complete,
					width: (element as HTMLImageElement).naturalWidth
				}))
			)
			.toEqual({ complete: true, width: 360 });
	}
	await expect(lab.locator('.preset-card-copy dl').first()).toContainText('Vertical span');
	await expect(lab.locator('.preset-card-copy dl code').first()).not.toBeEmpty();
	const boundaryPreset = lab
		.locator('.preset-gallery article')
		.filter({ hasText: 'Across the boundary' });
	await boundaryPreset.getByRole('button', { name: 'Load expedition' }).click();
	await expect(lab.getByRole('button', { name: 'Orbit inspector' })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect(lab.getByRole('heading', { name: "One pixel's paperwork" })).toBeVisible();

	await lab.getByRole('button', { name: 'Explore', exact: true }).click();
	const stage = lab.locator('.primary-plane .fractal-stage');
	const box = await stage.boundingBox();
	expect(box).not.toBeNull();
	await stage.click({ position: { x: box!.width * 0.58, y: box!.height * 0.44 } });
	await lab.getByRole('button', { name: 'Explore', exact: true }).click();
	await lab.getByRole('button', { name: 'Pin selected as A' }).click();
	await stage.click({ position: { x: box!.width * 0.61, y: box!.height * 0.47 } });
	await lab.getByRole('button', { name: 'Explore', exact: true }).click();
	await lab.getByRole('button', { name: 'Pin selected as B' }).click();
	await expect(lab.locator('.parameter-pins')).toContainText(/Δc/iu);
	const deltaMagnitude = Number(
		(await lab.locator('.parameter-pins dd small').textContent())?.split('=').at(1)?.trim()
	);
	expect(deltaMagnitude).toBeGreaterThan(0);
	await lab.getByRole('button', { name: 'Build Julia path A → B' }).click();
	const pathLab = lab.locator('#parameter-path-laboratory');
	await expect(pathLab).toBeVisible();
	await expect(pathLab.locator('.parameter-path-strip article')).toHaveCount(7);
	await pathLab.locator('.parameter-path-strip article').nth(3).getByRole('button').click();
	await expect.poll(() => new URL(page.url()).searchParams.get('path')).toBe('1');
	await expect.poll(() => new URL(page.url()).searchParams.get('pn')).toBe('7');
	await expect.poll(() => new URL(page.url()).searchParams.get('px')).toBe('3');
	const parameterPathUrl = page.url();
	await page.reload({ waitUntil: 'domcontentloaded' });
	await waitForAtlas(page);
	expect(page.url()).toBe(parameterPathUrl);
	await expect(laboratory(page).locator('#parameter-path-laboratory')).toBeVisible();
	await expect(laboratory(page).locator('.parameter-path-strip article.active')).toHaveCount(1);
	const pathPlay = laboratory(page).getByRole('button', { name: 'Play path' });
	await pathPlay.click();
	await expect(laboratory(page).getByRole('button', { name: 'Pause path' })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	const directStage = laboratory(page).locator('.primary-plane .fractal-stage');
	const directBox = await directStage.boundingBox();
	expect(directBox).not.toBeNull();
	await directStage.click({
		position: { x: directBox!.width * 0.52, y: directBox!.height * 0.49 }
	});
	await laboratory(page).getByRole('button', { name: 'Explore', exact: true }).click();
	await expect(laboratory(page).getByRole('button', { name: 'Play path' })).toHaveAttribute(
		'aria-pressed',
		'false'
	);
	await lab.getByRole('button', { name: 'Compare Julia A / B' }).click();
	await expect(lab).toHaveAttribute('data-family', 'julia');
	await expect(lab.locator('.compare-plane .plane-label')).toContainText('Julia');

	await lab.getByRole('button', { name: 'Palette laboratory' }).click();
	await expect(lab.locator('.colour-costume-lab figure')).toHaveCount(4);
	await expect(lab.locator('.colour-costume-lab')).toContainText(
		'All four panes use the same centre'
	);
	await expect(lab.locator('.colour-costume-lab canvas.render-layer:not([hidden])')).toHaveCount(4);
});

test('precision tiers and WebGL context restoration are exercised when available in Chromium', async ({
	page
}) => {
	await page.setViewportSize({ width: 900, height: 700 });
	await page.goto(
		`${articlePath}?v=1&f=mandelbrot&x=-0.743643887037151&y=0.13182590420533&s=2.4e-13&it=240&prec=double-single&q=battery`,
		{ waitUntil: 'domcontentloaded' }
	);
	await waitForAtlas(page);
	const lab = laboratory(page);
	await lab.getByRole('button', { name: 'Precision meter' }).click();
	const initialTier = (
		(await lab
			.locator('.precision dl')
			.getByText('Active precision tier')
			.locator('..')
			.locator('dd')
			.textContent()) ?? ''
	).trim();
	expect(initialTier).toMatch(/^(Extended double-single|CPU double)$/u);
	await expect(lab.locator('.precision dl')).toContainText('increased');

	const exactRe = '-0.74364388703715100792301305236157';
	const exactIm = '0.13182590420532999943598128774412';
	await page.goto(
		`${articlePath}?v=1&f=mandelbrot&xd=${exactRe}&yd=${exactIm}&s=1e-18&it=120&prec=perturbation&q=battery`,
		{ waitUntil: 'domcontentloaded' }
	);
	await waitForAtlas(page);
	const exactLab = laboratory(page);
	await exactLab.getByRole('button', { name: 'Precision meter' }).click();
	await expect.poll(() => new URL(page.url()).searchParams.get('xd')).toBe(exactRe);
	await expect.poll(() => new URL(page.url()).searchParams.get('yd')).toBe(exactIm);
	await expect
		.poll(
			async () =>
				(
					(await exactLab
						.locator('.precision dl')
						.getByText('Active precision tier')
						.locator('..')
						.locator('dd')
						.textContent()) ?? ''
				).trim(),
			{ timeout: 60_000 }
		)
		.toBe('CPU double');
	const activeDeepTier = (
		(await exactLab
			.locator('.precision dl')
			.getByText('Active precision tier')
			.locator('..')
			.locator('dd')
			.textContent()) ?? ''
	).trim();
	const referenceOrbit = exactLab
		.locator('.precision dl')
		.getByText('Reference orbit')
		.locator('..')
		.locator('dd');
	expect(activeDeepTier).toBe('CPU double');
	await expect(referenceOrbit).toContainText(/not (?:used|available)/iu);
	await expect(exactLab.locator('.readout-strip > p')).toContainText(
		'Precision ceiling plate ready'
	);

	const deepStage = exactLab.locator('.primary-plane .fractal-stage');
	const deepBox = await deepStage.boundingBox();
	expect(deepBox).not.toBeNull();
	await deepStage.click({ position: { x: deepBox!.width * 0.44, y: deepBox!.height * 0.5 } });
	await expect.poll(() => new URL(page.url()).searchParams.get('srd')).not.toBeNull();
	const leftSelected = new URL(page.url()).searchParams.get('srd');
	await deepStage.click({ position: { x: deepBox!.width * 0.56, y: deepBox!.height * 0.5 } });
	await expect.poll(() => new URL(page.url()).searchParams.get('srd')).not.toBe(leftSelected);
	const rightSelected = new URL(page.url()).searchParams.get('srd');
	expect(leftSelected).not.toBeNull();
	expect(rightSelected).not.toBeNull();
	expect(Number(leftSelected)).toBe(Number(rightSelected));
	const exactSelectedUrl = page.url();
	await page.reload({ waitUntil: 'domcontentloaded' });
	await waitForAtlas(page);
	expect(page.url()).toBe(exactSelectedUrl);
	expect(new URL(page.url()).searchParams.get('srd')).toBe(rightSelected);
	await exactLab.getByRole('button', { name: 'Orbit inspector' }).click();
	await expect(exactLab.locator('.orbit-inspector .exact-coordinate').first()).toContainText(
		rightSelected!
	);

	if ((await exactLab.getAttribute('data-backend')) === 'webgl2') {
		const gpuCanvas = exactLab.locator('.primary-plane canvas.render-layer:not([hidden])').first();
		const contextLossAvailable = await gpuCanvas.evaluate((element) => {
			const gl = (element as HTMLCanvasElement).getContext('webgl2');
			const extension = gl?.getExtension('WEBGL_lose_context');
			if (!extension) return false;
			extension.loseContext();
			setTimeout(() => extension.restoreContext(), 1_250);
			return true;
		});
		if (contextLossAvailable) {
			await expect
				.poll(() => exactLab.getAttribute('data-backend'), { timeout: 10_000 })
				.toMatch(/^(worker|canvas-2d)$/u);
			await expect
				.poll(() => exactLab.getAttribute('data-backend'), { timeout: 30_000 })
				.toBe('webgl2');
			await expect(exactLab.locator('.precision dl')).toContainText('Perturbation');
		}
	} else {
		await expect(exactLab).toHaveAttribute('data-backend', /^(worker|canvas-2d)$/u);
	}
});

test('the mobile and no-script fallbacks stay readable without horizontal overflow', async ({
	page,
	browser,
	baseURL
}) => {
	await page.setViewportSize({ width: 360, height: 800 });
	await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
	await waitForAtlas(page);
	const lab = laboratory(page);
	const geometry = await lab.evaluate((element) => {
		const primary = element.querySelector<HTMLElement>('.primary-plane');
		const stage = element.querySelector<HTMLElement>('.primary-plane .fractal-stage');
		const buttons = [...element.querySelectorAll<HTMLButtonElement>('button')].filter(
			(button) => button.getBoundingClientRect().height > 0
		);
		return {
			labWidth: element.getBoundingClientRect().width,
			primaryHeight: primary?.getBoundingClientRect().height ?? 0,
			stageWidth: stage?.getBoundingClientRect().width ?? 0,
			minimumButtonHeight: Math.min(
				...buttons.map((button) => button.getBoundingClientRect().height)
			),
			documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
			labOverflow: element.scrollWidth - element.clientWidth
		};
	});
	expect(geometry.labWidth).toBeLessThanOrEqual(360);
	expect(geometry.primaryHeight).toBeLessThan(800);
	expect(geometry.stageWidth).toBeGreaterThan(280);
	expect(geometry.stageWidth).toBeGreaterThanOrEqual(geometry.labWidth - 2);
	expect(geometry.minimumButtonHeight).toBeGreaterThanOrEqual(43.5);
	expect(geometry.documentOverflow).toBeLessThanOrEqual(1);
	expect(geometry.labOverflow).toBeLessThanOrEqual(1);

	await expect(lab.locator('[role="tabpanel"]:not([hidden])')).toHaveCount(1);
	await lab.getByRole('tab', { name: 'Linked Julia' }).click();
	await expect(lab.locator('.julia-plane')).toBeVisible();
	await expect(lab.locator('.primary-plane')).toBeHidden();
	await expect(lab.getByRole('tab', { name: 'Linked Julia' })).toHaveAttribute(
		'aria-selected',
		'true'
	);

	const context = await browser.newContext({
		javaScriptEnabled: false,
		viewport: { width: 360, height: 800 }
	});
	const noScriptPage = await context.newPage();
	try {
		await noScriptPage.goto(`${baseURL}${articlePath}`, { waitUntil: 'domcontentloaded' });
		const noScriptLab = laboratory(noScriptPage);
		await expect(noScriptLab.locator('.no-script-atlas')).toBeVisible();
		await expect(noScriptLab.locator('.no-script-atlas img')).toBeVisible();
		await expect(
			noScriptLab.getByRole('heading', {
				name: 'The Fractal Atlas requires JavaScript for numerical navigation.'
			})
		).toBeVisible();
		await expect(noScriptLab.locator('.atlas-js')).toBeHidden();
		const overflow = await noScriptPage.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth
		);
		expect(overflow).toBeLessThanOrEqual(1);
	} finally {
		await context.close();
	}
});
