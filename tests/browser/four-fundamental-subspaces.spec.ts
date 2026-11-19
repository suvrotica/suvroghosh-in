import { expect, test, type Download, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';

const articlePath = '/blog/visualizations/four-fundamental-subspaces-3d';

function attachDiagnostics(page: Page): string[] {
	const errors: string[] = [];
	page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
	page.on('console', (msg) => {
		if (msg.type() !== 'error') return;
		const txt = `${msg.location().url} ${msg.text()}`;
		if (/\/_vercel\/|favicon/iu.test(txt)) return;
		errors.push(`console.error: ${msg.text()}`);
	});
	return errors;
}

async function waitForLabReady(page: Page, path = articlePath): Promise<void> {
	await page.goto(path, { waitUntil: 'domcontentloaded' });
	const lab = page.getByTestId('four-fundamental-subspaces-lab');
	await expect(lab).toBeVisible();
	await expect(lab.getByTestId('ffs-domain-canvas')).toBeVisible();
	await expect(lab.getByTestId('ffs-codomain-canvas')).toBeVisible();
	await page.waitForTimeout(350);
}

test.describe('Four Fundamental Subspaces in 3D Laboratory', () => {
	test('mounts dual 3D WebGL viewports, enforces single H1, and renders live algebraic receipts', async ({
		page
	}) => {
		const errors = attachDiagnostics(page);
		await waitForLabReady(page);

		await expect(page.locator('h1')).toHaveCount(1);
		await expect(page.locator('h1')).toHaveText('The Four Fundamental Subspaces in 3D');

		const lab = page.getByTestId('four-fundamental-subspaces-lab');
		await expect(lab.getByTestId('ffs-rank-pill')).toContainText('3×3 · Rank r = 2');

		const domBox = await lab.getByTestId('ffs-domain-canvas').boundingBox();
		const codBox = await lab.getByTestId('ffs-codomain-canvas').boundingBox();
		expect(domBox).not.toBeNull();
		expect(codBox).not.toBeNull();
		expect(domBox!.width).toBeGreaterThan(220);
		expect(domBox!.height).toBeGreaterThan(280);
		expect(codBox!.width).toBeGreaterThan(220);

		const ledger = lab.getByTestId('ffs-ledger');
		await expect(ledger).toContainText('dim C(Aᵀ) + dim N(A) = 2 + 1 = 3');
		await expect(ledger).toContainText('dim C(A) + dim N(Aᵀ) = 2 + 1 = 3');
		await expect(ledger.locator('th sub')).toHaveText([
			'r',
			'n',
			'c',
			'r',
			'n',
			'2',
			'F',
			'F',
			'F',
			'r',
			'n'
		]);
		await expect(lab).toContainText('ℝ³ → ℝ³');
		await expect(lab).toContainText('Smallest singular value σ₃');
		const initialText = (await lab.textContent()) ?? '';
		expect(initialText).not.toMatch(/ℝ\^|u_c|_F|v_r|x_r|x_n|σ[0-9]/);

		// Preserved math casing inside uppercase headings & clean screen-reader labels
		const mathInlineTransforms = await lab
			.locator('.ffs-math-inline')
			.evaluateAll((els) => els.map((el) => getComputedStyle(el).textTransform));
		expect(mathInlineTransforms.length).toBeGreaterThan(0);
		expect(mathInlineTransforms.every((t) => t === 'none')).toBe(true);

		const canvasLabels = await lab
			.locator('canvas')
			.evaluateAll((els) => els.map((el) => el.getAttribute('aria-label') ?? ''));
		expect(canvasLabels).toHaveLength(2);
		for (const aria of canvasLabels) {
			expect(aria).toContain('ℝ³');
			expect(aria).not.toMatch(/R\^|A\^T/);
		}

		// Rendered FAQ section uses clean Unicode math notation with zero raw ASCII math
		const faq = page.locator('[data-article-faq]');
		await expect(faq).toBeVisible();
		const faqText = (await faq.textContent()) ?? '';
		expect(faqText).toContain('C(Aᵀ)');
		expect(faqText).toContain('ℝ³');
		expect(faqText).toContain('σ₃');
		expect(faqText).toContain('A⁺b');
		expect(faqText).not.toMatch(/R\^|A\^T|x_r|sigma_|u_3|A\^\+|->/);

		expect(errors).toEqual([]);
	});

	test('switches across canonical examples dropdown and updates subspaces, rank, and rectangular framing', async ({
		page
	}) => {
		const errors = attachDiagnostics(page);
		await waitForLabReady(page);

		const lab = page.getByTestId('four-fundamental-subspaces-lab');
		const select = lab.getByTestId('ffs-canonical-select');

		// Overdetermined 3x2 Line Fit
		await select.selectOption('overdetermined-line-fit');
		await expect(lab.getByTestId('ffs-rank-pill')).toContainText('3×2 · Rank r = 2');
		await expect(lab.getByTestId('ffs-domain-stage')).toContainText('Input Space ℝ²');
		await expect(lab.getByTestId('ffs-codomain-stage')).toContainText('Output Space ℝ³');
		await expect(lab.getByTestId('ffs-preset-takeaway')).toContainText('3×2 design matrix');

		// Strang 3-Node Graph Incidence
		await select.selectOption('strang-graph-incidence');
		await expect(lab.getByTestId('ffs-rank-pill')).toContainText('3×3 · Rank r = 2');
		await expect(lab.getByTestId('ffs-preset-takeaway')).toContainText('Kirchhoff');

		// Rank-1 Outer Product
		await select.selectOption('rank1-outer-product');
		await expect(lab.getByTestId('ffs-rank-pill')).toContainText('3×3 · Rank r = 1');

		// Nearly Singular -> drop sigma_3 to 0
		await select.selectOption('nearly-singular');
		await expect(lab.getByTestId('ffs-rank-pill')).toContainText('3×3 · Rank r = 3');
		await lab.getByRole('button', { name: 'Drop to 0' }).click();
		await expect(lab.getByTestId('ffs-rank-pill')).toContainText('3×3 · Rank r = 2');

		// Zero Matrix
		await select.selectOption('zero-matrix');
		await expect(lab.getByTestId('ffs-rank-pill')).toContainText('3×3 · Rank r = 0');

		expect(errors).toEqual([]);
	});

	test('edits matrix entries, transposes A <-> A^T, symmetrizes, and generates seeded rank matrices', async ({
		page
	}) => {
		const errors = attachDiagnostics(page);
		await waitForLabReady(page);

		const lab = page.getByTestId('four-fundamental-subspaces-lab');
		await lab.getByTestId('ffs-canonical-select').selectOption('overdetermined-line-fit');
		await expect(lab.getByTestId('ffs-rank-pill')).toContainText('3×2');

		// Transpose 3x2 -> 2x3
		await lab.getByRole('button', { name: 'Transpose A ↔ Aᵀ' }).click();
		await expect(lab.getByTestId('ffs-rank-pill')).toContainText('2×3 · Rank r = 2');
		await expect(lab.getByTestId('ffs-domain-stage')).toContainText('Input Space ℝ³');
		await expect(lab.getByTestId('ffs-codomain-stage')).toContainText('Output Space ℝ²');
		await expect(lab.getByTestId('ffs-preset-takeaway')).toContainText('in ℝ³');
		await expect(lab.getByTestId('ffs-preset-takeaway')).toContainText('in ℝ²');
		await expect(lab.getByTestId('ffs-preset-takeaway')).not.toContainText('ℝ^');
		await expect(lab).toContainText('ℝ³ → ℝ²');

		// Resize to 1x1 and verify ℝ¹ typography in shape header and custom takeaway
		await lab.getByRole('button', { name: '1', exact: true }).first().click();
		await lab.getByRole('button', { name: '1', exact: true }).nth(1).click();
		await expect(lab.getByTestId('ffs-rank-pill')).toContainText('1×1');
		await expect(lab).toContainText('ℝ¹ → ℝ¹');
		await expect(lab.getByTestId('ffs-preset-takeaway')).toContainText('in ℝ¹');
		await expect(lab.getByTestId('ffs-preset-takeaway')).not.toContainText('ℝ^');

		// Switch back to square matrix and edit an entry directly
		await lab.getByTestId('ffs-canonical-select').selectOption('asymmetric-rank2');
		const cell00 = lab.locator('#ffs-a-0-0');
		await cell00.fill('2.5');
		await cell00.dispatchEvent('change');
		await expect(lab.getByTestId('ffs-rank-pill')).toContainText('Rank r = 3');

		// Symmetrize & Seeded Rank 1
		await lab.getByRole('button', { name: 'Symmetrize' }).click();
		await lab.getByRole('button', { name: 'Rank 1', exact: true }).click();
		await expect(lab.getByTestId('ffs-rank-pill')).toContainText('Rank r = 1');

		expect(errors).toEqual([]);
	});

	test('exercises Vectors lab: slides x along N(A) with invariant Ax, snaps b into C(A), and perturbs into N(A^T)', async ({
		page
	}) => {
		const errors = attachDiagnostics(page);
		await waitForLabReady(page);

		const lab = page.getByTestId('four-fundamental-subspaces-lab');
		await lab.getByRole('tab', { name: 'Vectors' }).click();
		await expect(lab).toContainText('Input Vector x ∈ ℝ³');
		await expect(lab).toContainText('Target Vector b ∈ ℝ³ (Ax = b)');
		expect((await lab.textContent()) ?? '').not.toContain('ℝ^');

		// Record initial Ax value from ledger
		const axRowCell = lab.locator('tr', { hasText: 'Output Ax ∈ C(A)' }).locator('td');
		const initialAx = (await axRowCell.textContent())?.trim();

		// Slide x along N(A)
		await lab.getByRole('button', { name: 'Slide x along N(A)' }).click();
		await page.waitForTimeout(450);
		await lab.getByRole('button', { name: 'Stop Sliding x' }).click();
		const afterSlideAx = (await axRowCell.textContent())?.trim();
		expect(afterSlideAx).toBe(initialAx);

		// Snap b into C(A) -> becomes exact solution family
		await expect(lab.getByTestId('ffs-regime-card')).toContainText('least-squares');
		await lab.getByRole('button', { name: 'Snap b into C(A)' }).click();
		await expect(lab.getByTestId('ffs-regime-card')).toContainText(
			'Infinitely many exact solutions'
		);

		// Perturb b into N(A^T) -> becomes least-squares again
		await lab.getByRole('button', { name: 'Perturb b into N(Aᵀ)' }).click();
		await expect(lab.getByTestId('ffs-regime-card')).toContainText(
			'Infinitely many least-squares approximations'
		);

		expect(errors).toEqual([]);
	});

	test('exercises smart camera presets, Superimposed 3-Stage SVD morph, RREF basis switcher, fullscreen, and PNG export', async ({
		page
	}) => {
		const errors = attachDiagnostics(page);
		await waitForLabReady(page);

		const lab = page.getByTestId('four-fundamental-subspaces-lab');

		// Smart camera presets
		await lab.getByRole('button', { name: 'Edge-On to Plane' }).click();
		await expect(lab.getByRole('button', { name: 'Edge-On to Plane' })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
		await lab.getByRole('button', { name: 'Look Down Nullspace' }).click();
		await expect(lab.getByRole('button', { name: 'Look Down Nullspace' })).toHaveAttribute(
			'aria-pressed',
			'true'
		);

		// Switch Basis to RREF / Pivot
		await lab.getByTestId('ffs-ledger').getByRole('button', { name: 'RREF / Pivot' }).click();
		await expect(lab.getByTestId('ffs-ledger')).toContainText('r1 =');
		await expect(lab.getByTestId('ffs-ledger')).toContainText('n1 =');

		// Superimposed Morph mode + 3-Stage SVD
		await lab.getByRole('button', { name: 'Superimposed Morph' }).click();
		await expect(lab.getByTestId('ffs-morph-dock')).toBeVisible();
		await lab.getByRole('button', { name: /3-Stage SVD/u }).click();
		await lab.getByRole('button', { name: 'ΣVᵀ (0.67)' }).click();
		await expect(lab.getByTestId('ffs-morph-dock')).toContainText('Stage 2/3');

		// Return to Dual Stages
		await lab.getByRole('button', { name: 'Dual Stages' }).click();
		await expect(lab.getByTestId('ffs-codomain-canvas')).toBeVisible();

		// Fullscreen toggle + Escape
		await lab.getByRole('button', { name: 'Fullscreen' }).click();
		await expect(lab.getByRole('button', { name: 'Exit Fullscreen' })).toBeVisible();
		await page.keyboard.press('Escape');

		// Export PNG snapshot
		await lab.getByRole('tab', { name: 'Share' }).click();
		const downloadPromise: Promise<Download> = page.waitForEvent('download');
		await lab.getByRole('button', { name: 'Export PNG Snapshot' }).click();
		const download = await downloadPromise;
		expect(download.suggestedFilename()).toMatch(/^four-fundamental-subspaces-.*\.png$/);
		const downloadPath = await download.path();
		expect(downloadPath).toBeTruthy();
		const pngBytes = await readFile(downloadPath!);
		expect(pngBytes.byteLength).toBeGreaterThan(10_000);

		expect(errors).toEqual([]);
	});

	test('renders genuine interactive 2D orthographic SVG fallback when ?webgl=off is active (including Superimposed Morph, keyboard, and PNG export)', async ({
		page
	}) => {
		const errors = attachDiagnostics(page);
		await page.goto(`${articlePath}?webgl=off&cam=edge-on`, { waitUntil: 'domcontentloaded' });

		const lab = page.getByTestId('four-fundamental-subspaces-lab');
		await expect(lab.getByTestId('ffs-svg-fallback')).toBeVisible();
		await expect(lab.locator('canvas')).toHaveCount(0);
		await expect(lab.locator('svg.ffs-svg-stage')).toHaveCount(2);
		const svgLabels = await lab
			.locator('svg.ffs-svg-stage')
			.evaluateAll((els) => els.map((el) => el.getAttribute('aria-label') ?? ''));
		for (const aria of svgLabels) {
			expect(aria).toContain('ℝ³');
			expect(aria).not.toMatch(/R\^|A\^T/);
		}
		await expect(lab.getByRole('button', { name: 'Edge-On to Plane' })).toHaveAttribute(
			'aria-pressed',
			'true'
		);

		// Superimposed Morph + Morph Dock work cleanly in SVG fallback mode
		await lab.getByRole('button', { name: 'Superimposed Morph' }).click();
		await expect(lab.getByTestId('ffs-morph-dock')).toBeVisible();
		await expect(lab.locator('svg.ffs-svg-stage')).toHaveCount(1);
		await lab.getByRole('button', { name: 'ΣVᵀ (0.67)' }).click();
		await lab.getByRole('button', { name: 'Dual Stages' }).click();
		await expect(lab.locator('svg.ffs-svg-stage')).toHaveCount(2);

		// Keyboard orbit and zoom buttons remain operational without WebGL
		await lab.focus();
		await page.keyboard.press('ArrowRight');
		await lab.getByRole('button', { name: 'Zoom in' }).click();
		await lab.getByRole('button', { name: 'Reset View' }).click();

		// PNG export also works from SVG fallback
		await lab.getByRole('tab', { name: 'Share' }).click();
		const downloadPromise: Promise<Download> = page.waitForEvent('download');
		await lab.getByRole('button', { name: 'Export PNG Snapshot' }).click();
		const download = await downloadPromise;
		const downloadPath = await download.path();
		expect(downloadPath).toBeTruthy();
		const pngBytes = await readFile(downloadPath!);
		expect(pngBytes.byteLength).toBeGreaterThan(8_000);

		// Verify controls still drive the SVG fallback live
		await lab.getByTestId('ffs-canonical-select').selectOption('overdetermined-line-fit');
		await expect(lab.getByTestId('ffs-rank-pill')).toContainText('3×2 · Rank r = 2');

		expect(errors).toEqual([]);
	});

	test('restores serialized URL state, resets to the active preset, respects prefers-reduced-motion, and passes axe-core in both themes', async ({
		page
	}) => {
		const errors = attachDiagnostics(page);

		// 1. Full URL state round-trip restoration
		const deepUrl = `${articlePath}?preset=strang-graph-incidence&shape=3x3&a=-1,1,0;0,-1,1;-1,0,1&x=0.5,1.6,2.1&b=1,0.8,0.4&tol=1.00e-2&basis=rref&view=superimposed&mmode=svd-stages&t=0.67&link=0&cam=edge-on&theme=light`;
		await page.goto(deepUrl, { waitUntil: 'domcontentloaded' });
		const lab = page.getByTestId('four-fundamental-subspaces-lab');
		await expect(lab).toBeVisible();
		await page.waitForTimeout(350);

		await expect(lab).toHaveAttribute('data-studio-theme', 'light');
		await expect(lab.getByTestId('ffs-canonical-select')).toHaveValue('strang-graph-incidence');
		await expect(lab.getByTestId('ffs-morph-dock')).toBeVisible();
		await expect(lab.getByRole('button', { name: 'Edge-On to Plane' })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
		await expect(
			lab.getByTestId('ffs-ledger').getByRole('button', { name: 'RREF / Pivot' })
		).toHaveAttribute('aria-pressed', 'true');

		// 2. Edit an entry on Strang Graph Incidence, then verify Reset Preset restores Strang (not default asymmetric)
		await lab.locator('#ffs-a-0-0').fill('2');
		await lab.locator('#ffs-a-0-0').dispatchEvent('change');
		await expect(lab.getByTestId('ffs-canonical-select')).toHaveValue('custom');
		await lab.getByRole('button', { name: 'Reset Preset' }).click();
		await expect(lab.getByTestId('ffs-canonical-select')).toHaveValue('strang-graph-incidence');

		// 3. Axe-core accessibility scan on Warm Paper and Dark Graphite themes
		const lightAxe = await new AxeBuilder({ page })
			.include('[data-testid="four-fundamental-subspaces-lab"]')
			.analyze();
		expect(lightAxe.violations).toEqual([]);

		await lab.getByRole('button', { name: 'Graphite Canvas' }).click();
		await lab.getByRole('button', { name: 'Dual Stages' }).click();
		await page.waitForTimeout(250);
		const darkAxe = await new AxeBuilder({ page })
			.include('[data-testid="four-fundamental-subspaces-lab"]')
			.analyze();
		expect(darkAxe.violations).toEqual([]);

		// 4. Reduced-motion discrete stepping for Slide x along N(A) and Play Morph
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await lab.getByRole('tab', { name: 'Vectors' }).click();
		const xCell = lab.locator('tr', { hasText: 'Input x' }).locator('td');
		const axCell = lab.locator('tr', { hasText: 'Output Ax ∈ C(A)' }).locator('td');
		const xBefore = (await xCell.textContent())?.trim();
		const axBefore = (await axCell.textContent())?.trim();

		await lab.getByRole('button', { name: 'Slide x along N(A)' }).click();
		const xAfterStep = (await xCell.textContent())?.trim();
		const axAfterStep = (await axCell.textContent())?.trim();
		expect(xAfterStep).not.toBe(xBefore);
		expect(axAfterStep).toBe(axBefore);
		// Button stays non-looping in reduced-motion mode
		await expect(lab.getByRole('button', { name: 'Slide x along N(A)' })).toHaveAttribute(
			'aria-pressed',
			'false'
		);

		expect(errors).toEqual([]);
	});

	test('renders cleanly without horizontal overflow across tablet and mobile viewports', async ({
		page
	}) => {
		const errors = attachDiagnostics(page);
		for (const vp of [
			{ width: 768, height: 1024 },
			{ width: 390, height: 844 },
			{ width: 844, height: 390 }
		]) {
			await page.setViewportSize(vp);
			await waitForLabReady(page);
			const hasOverflow = await page.evaluate(
				() => document.documentElement.scrollWidth > window.innerWidth + 1
			);
			expect(hasOverflow, `horizontal overflow at ${vp.width}x${vp.height}`).toBe(false);
		}
		expect(errors).toEqual([]);
	});
});
