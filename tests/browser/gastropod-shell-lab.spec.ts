import { readFile } from 'node:fs/promises';
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Download, type Page, type TestInfo } from '@playwright/test';

const ARTICLE_PATH = '/blog/visualizations/the-living-aperture';
const SHELL_READY_TIMEOUT = 45_000;

async function openLaboratory(page: Page, path = ARTICLE_PATH): Promise<void> {
	const runtimeErrors: string[] = [];
	page.on('pageerror', (error) => runtimeErrors.push(error.message));
	page.on('console', (message) => {
		if (
			message.type() === 'error' &&
			!message.text().startsWith('Failed to load resource:') &&
			!message.text().includes('/_vercel/insights/script.js') &&
			!message.text().includes('/_vercel/speed-insights/script.js')
		) {
			runtimeErrors.push(message.text());
		}
	});
	page.on('requestfailed', (request) => {
		if (/\/_vercel\//.test(request.url())) return;
		runtimeErrors.push(
			`request failed: ${request.url()} (${request.failure()?.errorText ?? 'unknown'})`
		);
	});
	await page.goto(path, { waitUntil: 'domcontentloaded' });
	await expect(page).toHaveTitle(/Living Aperture/);
	await expect(
		page.getByRole('region', { name: 'The Living Aperture shell laboratory' })
	).toBeVisible();
	await expect
		.poll(
			async () => {
				if (runtimeErrors.length > 0) return `runtime error: ${runtimeErrors.join(' | ')}`;
				return String(await page.locator('.living-aperture-lab .viewport-host canvas').count());
			},
			{ timeout: SHELL_READY_TIMEOUT, message: 'viewport canvas count (or startup error)' }
		)
		.toBe('1');
}

function desktopOnly(testInfo: TestInfo): void {
	test.skip(
		testInfo.project.name !== 'desktop',
		'Desktop workflow; responsive checks run per device.'
	);
}

async function downloadedText(download: Download): Promise<string> {
	const path = await download.path();
	expect(path).not.toBeNull();
	return readFile(path!, 'utf8');
}

test.describe('The Living Aperture blog visualization', () => {
	test.describe.configure({ mode: 'serial' });

	test('loads inside the canonical article with one shell canvas', async ({ page }) => {
		await openLaboratory(page);
		await expect(page).toHaveURL(new RegExp(`${ARTICLE_PATH}(?:[?#]|$)`));
		await expect(page.locator('.living-aperture-lab .brand-title')).toHaveText(
			'The Living Aperture'
		);
		await expect(page.getByLabel('Model classification')).toContainText(/Model [AB]/);
		await expect(page.getByRole('region', { name: 'Growth timeline' })).toBeVisible();

		const canvas = page.locator('.living-aperture-lab .viewport-host canvas');
		await expect(canvas).toHaveCount(1);
		expect(await canvas.getAttribute('aria-label')).toMatch(
			/Interactive three-dimensional shell specimen|WebGL is unavailable/
		);
	});

	test('does not change the parent document theme and scopes keyboard shortcuts to the lab', async ({
		page
	}, testInfo) => {
		desktopOnly(testInfo);
		await openLaboratory(page);
		const rootThemeBefore = await page.locator('html').getAttribute('data-theme');
		await page.getByRole('button', { name: 'Overlays' }).click();
		await page.getByLabel('High contrast').check();
		await expect(page.locator('.living-aperture-lab')).toHaveAttribute('data-lab-contrast', 'high');
		expect(await page.locator('html').getAttribute('data-theme')).toBe(rootThemeBefore);

		const age = page.getByRole('slider', { name: 'Deposited shell age' });
		await page.getByRole('button', { name: 'Restart growth' }).click();
		await page.locator('body').click({ position: { x: 4, y: 4 } });
		await page.keyboard.press('ArrowRight');
		await expect(age).toHaveValue('0');
		await page.locator('.living-aperture-lab .viewport-host canvas').focus();
		await page.keyboard.press('ArrowRight');
		expect(Number(await age.inputValue())).toBeGreaterThan(0);
	});

	test('shares recipe state through a query parameter while preserving article anchors', async ({
		page
	}, testInfo) => {
		desktopOnly(testInfo);
		await page.addInitScript(() => {
			Object.defineProperty(navigator, 'clipboard', {
				configurable: true,
				value: {
					writeText: async () => {
						throw new Error('Clipboard permission denied for fallback regression.');
					}
				}
			});
			Object.defineProperty(Document.prototype, 'execCommand', {
				configurable: true,
				value(command: string) {
					if (command !== 'copy') return false;
					if (
						!(window as Window & { __gastropodFallbackAllowed?: boolean })
							.__gastropodFallbackAllowed
					)
						return false;
					const active = document.activeElement;
					if (!(active instanceof HTMLTextAreaElement)) return false;
					(window as Window & { __gastropodFallbackCopy?: string }).__gastropodFallbackCopy =
						active.value;
					return true;
				}
			});
		});
		await openLaboratory(page);
		await page.locator('.preset-card').filter({ hasText: 'Turritella-like turret' }).click();
		await page.evaluate(() => {
			window.location.hash = 'scientific-scope';
		});
		await expect(page).toHaveURL(/#scientific-scope$/);
		await page.getByRole('button', { name: 'Save / share' }).click();
		const dialog = page.getByRole('dialog', { name: 'Save & share' });
		const shareUrl = dialog.getByLabel('Reproducible recipe URL');
		await expect(shareUrl).toHaveValue(/\?shell=/);
		const expectedUrl = await shareUrl.inputValue();
		await dialog.getByRole('button', { name: 'Copy link' }).click();
		await expect(
			dialog.getByText('The shell link could not be copied. Select the URL and copy it manually.')
		).toBeVisible();
		await page.evaluate(() => {
			(window as Window & { __gastropodFallbackAllowed?: boolean }).__gastropodFallbackAllowed =
				true;
		});
		await dialog.getByRole('button', { name: 'Copy link' }).click();
		await expect(dialog.getByRole('button', { name: 'Copied' })).toBeVisible();
		expect(
			await page.evaluate(
				() => (window as Window & { __gastropodFallbackCopy?: string }).__gastropodFallbackCopy
			)
		).toBe(expectedUrl);
		await dialog.getByRole('button', { name: 'Put in address bar' }).click();
		await expect(page).toHaveURL(
			/\/blog\/visualizations\/the-living-aperture\?shell=.*#scientific-scope$/
		);
		await dialog.getByRole('button', { name: 'Done' }).click();
		const tightness = page.getByLabel('Coil tightness numeric value');
		await tightness.fill('3.22');
		await tightness.blur();
		await page.getByRole('button', { name: 'Save / share' }).click();
		await expect(dialog.getByRole('button', { name: 'Copy link' })).toBeVisible();
		await expect(dialog.getByRole('status')).toHaveCount(0);
		await dialog.getByRole('button', { name: 'Done' }).click();
		await page.evaluate(() => localStorage.removeItem('living-aperture:autosave:v2'));
		await page.reload({ waitUntil: 'domcontentloaded' });
		await expect(
			page.getByRole('button', { name: 'Rename recipe Turritella-like turret' })
		).toBeVisible();
		await expect(
			page.locator('.preset-card').filter({ hasText: 'Turritella-like turret' })
		).toHaveAttribute('aria-pressed', 'true');
	});

	test('supports deterministic sculpting, undo, presets, and ring-prefix playback', async ({
		page
	}, testInfo) => {
		desktopOnly(testInfo);
		await openLaboratory(page);
		const tightness = page.getByLabel('Coil tightness numeric value');
		await tightness.fill('3.2');
		await tightness.blur();
		await expect(tightness).toHaveValue('3.2');
		await page.getByRole('button', { name: 'Undo' }).click();
		await expect(tightness).toHaveValue('2.35');
		const preset = page.locator('.preset-card').filter({ hasText: 'Turritella-like turret' });
		await preset.click();
		await expect(preset).toHaveAttribute('aria-pressed', 'true');

		const age = page.getByRole('slider', { name: 'Deposited shell age' });
		await page.getByRole('button', { name: 'Restart growth' }).click();
		await page.getByRole('button', { name: 'Step one aperture ring forward' }).click();
		expect(Number(await age.inputValue())).toBeGreaterThan(0);
		await expect(age).toHaveAttribute('aria-valuetext', /ring 2 of/);
		await expect
			.poll(() =>
				page.evaluate(
					() =>
						(
							window as Window & {
								__LIVING_APERTURE_DIAGNOSTICS__?: { visibleRingCount: number };
							}
						).__LIVING_APERTURE_DIAGNOSTICS__?.visibleRingCount ?? 0
				)
			)
			.toBe(2);
		await page.getByRole('button', { name: 'Play growth' }).click();
		await expect(page.getByRole('button', { name: 'Pause growth' })).toBeVisible();
		await page.getByRole('button', { name: 'Pause growth' }).click();
	});

	test('keeps analytic-only controls honest when an accretion preset is active', async ({
		page
	}, testInfo) => {
		desktopOnly(testInfo);
		await openLaboratory(page);
		await page.getByRole('tab', { name: /Experiments/ }).click();
		await page.getByRole('button', { name: /^Alternating winding sense/ }).click();
		await expect(page.getByLabel('Integration span numeric value')).toBeVisible();
		await expect(page.getByLabel('Coil tightness numeric value')).toHaveCount(0);

		await page.getByRole('tab', { name: 'Advanced' }).click();
		await expect(page.getByLabel('Analytic planar curve')).toBeDisabled();
		await expect(page.getByLabel('Analytic expansion per radian numeric value')).toBeDisabled();
		await expect(page.getByText('Model B control boundary.')).toBeVisible();
	});

	test('gates geometry exports until the current recipe surface is accepted', async ({
		page
	}, testInfo) => {
		desktopOnly(testInfo);
		await openLaboratory(page);
		const exportDialog = page.locator('dialog[aria-labelledby="export-title"]');
		const glbButton = exportDialog.locator('button').filter({ hasText: /^GLB/ });
		await expect(glbButton).toBeEnabled({ timeout: SHELL_READY_TIMEOUT });

		const disabledBeforeWorkerResponse = await page.evaluate(async () => {
			const input = document.querySelector<HTMLInputElement>(
				'.living-aperture-lab input[aria-label="Coil tightness numeric value"]'
			);
			if (!input) throw new Error('Coil tightness input was not found.');
			input.focus();
			input.value = '3.21';
			input.dispatchEvent(new Event('input', { bubbles: true }));
			input.dispatchEvent(new Event('change', { bubbles: true }));
			await Promise.resolve();
			const buttons = Array.from(
				document.querySelectorAll<HTMLButtonElement>(
					'dialog[aria-labelledby="export-title"] button'
				)
			);
			const glb = buttons.find((button) => button.textContent?.trim().startsWith('GLB'));
			return glb?.disabled ?? false;
		});

		expect(disabledBeforeWorkerResponse).toBe(true);
		await expect(glbButton).toBeEnabled({ timeout: SHELL_READY_TIMEOUT });
	});

	test('clears comparison work without changing primary viewport readiness', async ({
		page
	}, testInfo) => {
		desktopOnly(testInfo);
		await page.addInitScript(() => {
			const NativeWorker = window.Worker;
			class DelayedWorker extends NativeWorker {
				constructor(scriptURL: string | URL, options?: WorkerOptions) {
					super(scriptURL, options);
					let listener: ((this: Worker, event: MessageEvent) => unknown) | null = null;
					this.addEventListener('message', (event) => {
						const currentListener = listener;
						if (currentListener) setTimeout(() => currentListener.call(this, event), 350);
					});
					Object.defineProperty(this, 'onmessage', {
						configurable: true,
						get: () => listener,
						set: (value) => {
							listener = value;
						}
					});
				}
			}
			Object.defineProperty(window, 'Worker', { configurable: true, value: DelayedWorker });
		});
		await openLaboratory(page);
		const exportDialog = page.locator('dialog[aria-labelledby="export-title"]');
		const glbButton = exportDialog.locator('button').filter({ hasText: /^GLB/ });
		await expect(glbButton).toBeEnabled({ timeout: SHELL_READY_TIMEOUT });

		await page.getByRole('button', { name: 'Compare' }).click();
		const comparisonSelect = page.getByLabel('Ghost specimen');
		await comparisonSelect.selectOption({ index: 1 });
		await expect(page.locator('.comparison-table')).toBeVisible();
		await expect
			.poll(() =>
				page.evaluate(
					() =>
						(
							window as Window & {
								__LIVING_APERTURE_DIAGNOSTICS__?: { activeWorkers: number };
							}
						).__LIVING_APERTURE_DIAGNOSTICS__?.activeWorkers ?? 0
				)
			)
			.toBe(2);
		await page.getByRole('button', { name: 'Close comparison' }).click();
		await expect
			.poll(() =>
				page.evaluate(
					() =>
						(
							window as Window & {
								__LIVING_APERTURE_DIAGNOSTICS__?: { activeWorkers: number };
							}
						).__LIVING_APERTURE_DIAGNOSTICS__?.activeWorkers ?? 0
				)
			)
			.toBe(1);
		await page.waitForTimeout(450);
		await expect(glbButton).toBeEnabled();
		await page.locator('.living-aperture-lab .status-button').click();
		await expect(page.locator('.living-aperture-lab .diagnostics-popover')).toContainText(
			'Current shell surface ready.'
		);
		await expect(page.locator('.living-aperture-lab .diagnostics-popover')).not.toContainText(
			'Depositing'
		);

		await page.getByRole('button', { name: 'Compare' }).click();
		await expect(comparisonSelect).toHaveValue('');
		await expect(page.locator('.comparison-table')).toHaveCount(0);
	});

	test('redraws and resizes the static fallback as lab state changes', async ({
		page
	}, testInfo) => {
		desktopOnly(testInfo);
		await page.addInitScript(() => {
			const nativeGetContext = HTMLCanvasElement.prototype.getContext;
			Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
				configurable: true,
				value(this: HTMLCanvasElement, contextId: string, ...args: unknown[]) {
					if (contextId === 'webgl' || contextId === 'webgl2' || contextId === 'experimental-webgl')
						return null;
					return Reflect.apply(nativeGetContext, this, [contextId, ...args]);
				}
			});
			const nativeStroke = CanvasRenderingContext2D.prototype.stroke;
			Object.defineProperty(CanvasRenderingContext2D.prototype, 'stroke', {
				configurable: true,
				value(this: CanvasRenderingContext2D, ...args: unknown[]) {
					const diagnosticsWindow = window as Window & { __gastropodFallbackDraws?: number };
					diagnosticsWindow.__gastropodFallbackDraws =
						(diagnosticsWindow.__gastropodFallbackDraws ?? 0) + 1;
					return Reflect.apply(nativeStroke, this, args);
				}
			});
		});
		await openLaboratory(page);
		const canvas = page.locator('.living-aperture-lab .fallback-canvas');
		await expect(canvas).toHaveAttribute('aria-label', /WebGL is unavailable/);
		const fallbackDraws = () =>
			page.evaluate(
				() =>
					(window as Window & { __gastropodFallbackDraws?: number }).__gastropodFallbackDraws ?? 0
			);
		await expect.poll(fallbackDraws).toBeGreaterThan(0);

		let previousDraws = await fallbackDraws();
		const tightness = page.getByLabel('Coil tightness numeric value');
		await tightness.fill('3.1');
		await tightness.blur();
		await expect.poll(fallbackDraws).toBeGreaterThan(previousDraws);

		await page.getByRole('tab', { name: 'Advanced' }).click();
		await page.getByRole('tab', { name: /Appearance/ }).click();
		previousDraws = await fallbackDraws();
		await page.getByLabel('Shell colour').evaluate((element: HTMLInputElement) => {
			element.value = '#ff3300';
			element.dispatchEvent(new Event('change', { bubbles: true }));
		});
		await expect.poll(fallbackDraws).toBeGreaterThan(previousDraws);

		previousDraws = await fallbackDraws();
		await page
			.getByRole('slider', { name: 'Deposited shell age' })
			.evaluate((element: HTMLInputElement) => {
				element.value = '0.5';
				element.dispatchEvent(new Event('input', { bubbles: true }));
			});
		await expect.poll(fallbackDraws).toBeGreaterThan(previousDraws);

		const initialClientWidth = await canvas.evaluate((element) => element.clientWidth);
		previousDraws = await fallbackDraws();
		await page.setViewportSize({ width: 1000, height: 900 });
		await expect
			.poll(() => canvas.evaluate((element) => element.clientWidth))
			.not.toBe(initialClientWidth);
		await expect.poll(fallbackDraws).toBeGreaterThan(previousDraws);
		const fallbackSize = await canvas.evaluate((element) => ({
			bitmapWidth: (element as HTMLCanvasElement).width,
			clientWidth: element.clientWidth,
			pixelRatio: Math.min(2, window.devicePixelRatio || 1)
		}));
		expect(fallbackSize.bitmapWidth).toBe(
			Math.round(fallbackSize.clientWidth * fallbackSize.pixelRatio)
		);
	});

	test('applies the saved reduced-motion choice independently and pauses active growth', async ({
		page
	}, testInfo) => {
		desktopOnly(testInfo);
		await page.addInitScript(() => {
			localStorage.setItem(
				'living-aperture:preferences:v1',
				JSON.stringify({ reducedMotion: false })
			);
		});
		await openLaboratory(page);
		const lab = page.locator('.living-aperture-lab');
		const reset = page.locator('.living-aperture-lab .topbar nav button.desktop-action').filter({
			hasText: /^Reset$/
		});
		const transitionSeconds = () =>
			reset.evaluate((element) => Number.parseFloat(getComputedStyle(element).transitionDuration));
		await expect(lab).toHaveAttribute('data-lab-motion', 'full');
		expect(await transitionSeconds()).toBeGreaterThan(0.1);

		await page.getByRole('button', { name: 'Restart growth' }).click();
		await page.getByRole('button', { name: 'Play growth' }).click();
		await expect(page.getByRole('button', { name: 'Pause growth' })).toBeVisible();
		await page.getByRole('button', { name: 'Overlays' }).click();
		await page.getByLabel('Reduced motion').check();
		await expect(lab).toHaveAttribute('data-lab-motion', 'reduced');
		await expect(page.getByRole('button', { name: 'Play growth' })).toBeVisible();
		expect(await transitionSeconds()).toBeLessThan(0.001);

		await page.getByLabel('Reduced motion').uncheck();
		await expect(lab).toHaveAttribute('data-lab-motion', 'full');
		expect(await transitionSeconds()).toBeGreaterThan(0.1);
	});

	test('moves keyboard focus to the viewport through the skip link', async ({ page }, testInfo) => {
		desktopOnly(testInfo);
		await openLaboratory(page);
		await page.locator('.living-aperture-lab .skip-link').focus();
		await page.keyboard.press('Enter');
		await expect(page.locator('.living-aperture-lab .specimen')).toBeFocused();
	});

	test('reports viewport export failures inside the active modal', async ({ page }, testInfo) => {
		desktopOnly(testInfo);
		await page.addInitScript(() => {
			const nativeToBlob = HTMLCanvasElement.prototype.toBlob;
			Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
				configurable: true,
				value(this: HTMLCanvasElement, callback: BlobCallback, type?: string, quality?: number) {
					if (this.classList.contains('renderer-canvas')) {
						setTimeout(() => callback(null), 0);
						return;
					}
					return nativeToBlob.call(this, callback, type, quality);
				}
			});
		});
		await openLaboratory(page);
		await page.getByRole('button', { name: 'Export' }).click();
		const dialog = page.getByRole('dialog', { name: 'Export the specimen' });
		const pngButton = dialog.getByRole('button', { name: 'Download PNG' });
		await expect(pngButton).toBeEnabled({ timeout: SHELL_READY_TIMEOUT });
		let downloadCount = 0;
		page.on('download', () => (downloadCount += 1));
		await pngButton.click();
		await expect(dialog.getByRole('alert')).toHaveText('PNG export failed: PNG encoding failed.');
		await expect(pngButton).toBeEnabled();
		await page.waitForTimeout(100);
		expect(downloadCount).toBe(0);
	});

	test('downloads a versioned recipe and aperture history', async ({ page }, testInfo) => {
		desktopOnly(testInfo);
		await openLaboratory(page);
		await page.getByRole('button', { name: 'Export' }).click();
		const dialog = page.getByRole('dialog', { name: 'Export the specimen' });
		const pngButton = dialog.getByRole('button', { name: 'Download PNG' });
		const glbButton = dialog.getByRole('button', { name: /^GLB/ });
		await expect(pngButton).toBeEnabled({ timeout: SHELL_READY_TIMEOUT });
		const viewportDownloads: Download[] = [];
		const recordViewportDownload = (download: Download) => viewportDownloads.push(download);
		page.on('download', recordViewportDownload);
		const pngDownloadPromise = page.waitForEvent('download');
		const exportButtonsDisabled = await page.evaluate(async () => {
			const currentDialog = document.querySelector<HTMLDialogElement>(
				'dialog[aria-labelledby="export-title"]'
			);
			if (!currentDialog) throw new Error('Export dialog was not found.');
			const buttons = Array.from(currentDialog.querySelectorAll('button'));
			const png = buttons.find((button) => button.textContent?.includes('Download PNG'));
			const glb = buttons.find((button) => button.textContent?.trim().startsWith('GLB'));
			png?.click();
			glb?.click();
			await Promise.resolve();
			return Boolean(png?.disabled && glb?.disabled);
		});
		expect(exportButtonsDisabled).toBe(true);
		expect((await pngDownloadPromise).suggestedFilename()).toMatch(/\.png$/);
		await expect(glbButton).toBeEnabled({ timeout: SHELL_READY_TIMEOUT });
		await expect(dialog.getByRole('status')).toHaveText('PNG export completed.');
		await page.waitForTimeout(200);
		expect(viewportDownloads).toHaveLength(1);
		page.off('download', recordViewportDownload);

		const jsonDownloadPromise = page.waitForEvent('download');
		await dialog.getByRole('button', { name: /^\.shell\.json/ }).click();
		const recipe = JSON.parse(await downloadedText(await jsonDownloadPromise)) as {
			schemaVersion: number;
			name: string;
		};
		expect(recipe).toMatchObject({ schemaVersion: 2, name: 'Living aperture' });

		const csvButton = dialog.getByRole('button', { name: /^CSV/ });
		await expect(csvButton).toBeEnabled({ timeout: SHELL_READY_TIMEOUT });
		const csvDownloadPromise = page.waitForEvent('download');
		await csvButton.click();
		const csv = await downloadedText(await csvDownloadPromise);
		expect(csv.split('\n')[0]).toContain('ring,age,theta,center_x');
		expect(csv.split('\n').length).toBeGreaterThan(100);

		const recipeSheetPromise = page.waitForEvent('popup');
		await dialog.getByRole('button', { name: /^Recipe sheet/ }).click();
		const recipeSheet = await recipeSheetPromise;
		await expect(recipeSheet).toHaveTitle(/Living aperture — recipe sheet/);
		await expect(recipeSheet.getByRole('button', { name: 'Print / Save PDF' })).toBeVisible();
		await expect(recipeSheet.getByRole('heading', { name: 'Central equations' })).toBeVisible();
		await recipeSheet.close();
	});

	test('has no serious accessibility violations in the embedded instrument', async ({
		page
	}, testInfo) => {
		desktopOnly(testInfo);
		await openLaboratory(page);
		const audit = await new AxeBuilder({ page })
			.include('.living-aperture-lab')
			.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
			.analyze();
		const serious = audit.violations.filter(
			(violation) => violation.impact === 'critical' || violation.impact === 'serious'
		);
		expect(
			serious,
			serious.map((violation) => `${violation.id}: ${violation.help}`).join('\n')
		).toEqual([]);
	});

	test('has no horizontal page overflow at desktop, tablet, or mobile width', async ({
		page
	}, testInfo) => {
		const sizes = {
			desktop: { width: 1440, height: 1000 },
			tablet: { width: 768, height: 1024 },
			mobile: { width: 360, height: 800 }
		} as const;
		await page.setViewportSize(sizes[testInfo.project.name as keyof typeof sizes]);
		await openLaboratory(page);
		if (testInfo.project.name !== 'desktop') {
			const sheet = page.locator('button.sheet-handle');
			await expect(sheet).toBeVisible();
			await sheet.click();
			await expect(page.getByRole('heading', { name: 'Quick Sculpt' })).toBeVisible();
		}
		if (testInfo.project.name === 'mobile') {
			const headerOverlap = await page.evaluate(() => {
				const title = document.querySelector('.living-aperture-lab .brand-title');
				const actions = document.querySelector('.living-aperture-lab .topbar nav');
				if (!title || !actions) return true;
				const titleRect = title.getBoundingClientRect();
				const actionsRect = actions.getBoundingClientRect();
				return !(
					titleRect.right <= actionsRect.left ||
					titleRect.left >= actionsRect.right ||
					titleRect.bottom <= actionsRect.top ||
					titleRect.top >= actionsRect.bottom
				);
			});
			expect(headerOverlap).toBe(false);
		}
		const overflow = await page.evaluate(() =>
			Math.max(
				document.documentElement.scrollWidth - document.documentElement.clientWidth,
				document.body.scrollWidth - document.body.clientWidth
			)
		);
		expect(overflow).toBeLessThanOrEqual(1);
	});

	test('mobile preset cards remain visible and operable', async ({ page }, testInfo) => {
		test.skip(testInfo.project.name !== 'mobile', 'Focused 360-pixel preset shelf regression.');
		await openLaboratory(page);

		const presetList = page.locator('.living-aperture-lab .preset-list');
		const presets = presetList.locator('.preset-card');
		const firstPreset = presets.first();
		const secondPreset = presets.nth(1);
		const containment = await page.evaluate(() => {
			const list = document.querySelector('.living-aperture-lab .preset-list');
			const card = list?.querySelector('.preset-card');
			if (!list || !card) return null;
			const listRect = list.getBoundingClientRect();
			const cardRect = card.getBoundingClientRect();
			return {
				listTop: listRect.top,
				listBottom: listRect.bottom,
				cardTop: cardRect.top,
				cardBottom: cardRect.bottom,
				cardHeight: cardRect.height
			};
		});

		expect(containment).not.toBeNull();
		expect(containment!.cardTop).toBeGreaterThanOrEqual(containment!.listTop - 1);
		expect(containment!.cardBottom).toBeLessThanOrEqual(containment!.listBottom + 1);
		expect(containment!.cardHeight).toBeGreaterThanOrEqual(100);

		await firstPreset.click();
		await expect(firstPreset).toHaveAttribute('aria-pressed', 'true');
		await secondPreset.focus();
		await page.keyboard.press('Enter');
		await expect(secondPreset).toHaveAttribute('aria-pressed', 'true');
	});

	test('mobile action and camera toolbars retain every control through horizontal scrolling', async ({
		page
	}, testInfo) => {
		test.skip(testInfo.project.name !== 'mobile', 'Focused 360-pixel toolbar regression.');
		await openLaboratory(page);

		for (const control of [
			page.getByRole('button', { name: 'Reset', exact: true }),
			page.getByRole('button', { name: 'Duplicate' }),
			page.getByRole('button', { name: 'Aperture view' }),
			page.getByRole('button', { name: 'Apex view' }),
			page.getByRole('button', { name: 'Side view' }),
			page.getByRole('button', { name: 'Top view' }),
			page.getByRole('button', { name: 'Perspective' })
		]) {
			expect(await control.evaluate((element) => getComputedStyle(element).display)).not.toBe(
				'none'
			);
		}
		const scrollState = await page.evaluate(() => {
			const actions = document.querySelector('.living-aperture-lab .topbar nav');
			const views = document.querySelector('.living-aperture-lab .primary-tools');
			if (!actions || !views) return null;
			return {
				actionsScrollable: actions.scrollWidth > actions.clientWidth,
				viewsScrollable: views.scrollWidth > views.clientWidth,
				actionsOverflow: getComputedStyle(actions).overflowX,
				viewsOverflow: getComputedStyle(views).overflowX
			};
		});
		expect(scrollState).toEqual({
			actionsScrollable: true,
			viewsScrollable: true,
			actionsOverflow: 'auto',
			viewsOverflow: 'auto'
		});

		const duplicate = page.getByRole('button', { name: 'Duplicate' });
		await duplicate.scrollIntoViewIfNeeded();
		await duplicate.click();
		await expect(page.locator('.living-aperture-lab .recipe-name')).toHaveAttribute(
			'aria-label',
			'Rename recipe Living aperture copy'
		);
		const projection = page.getByRole('button', { name: 'Perspective' });
		await projection.scrollIntoViewIfNeeded();
		await projection.click();
		await expect(page.getByRole('button', { name: 'Orthographic' })).toBeVisible();
	});
});
