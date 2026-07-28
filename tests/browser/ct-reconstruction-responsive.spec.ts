import { expect, test, type Page } from '@playwright/test';

const articlePath = '/blog/visualizations/how-a-scanner-sees-reconstructing-a-body-from-shadows';
const breakpointWidths = [
	360, 390, 412, 430, 431, 560, 620, 621, 720, 721, 768, 900, 901, 1024, 1180, 1181, 1200, 1240,
	1256, 1257, 1300, 1440
];

async function openLaboratory(page: Page, width = 1440, height = 1000) {
	await page.setViewportSize({ width, height });
	await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
	await page.evaluate(() => document.fonts.ready);
	await expect(page.locator('.ct-laboratory')).toBeVisible();
}

async function dispatchTouchDrag(
	page: Page,
	start: { x: number; y: number },
	end: { x: number; y: number }
) {
	const session = await page.context().newCDPSession(page);
	await session.send('Input.dispatchTouchEvent', {
		type: 'touchStart',
		touchPoints: [{ x: start.x, y: start.y, radiusX: 2, radiusY: 2, force: 1 }]
	});
	for (let step = 1; step <= 8; step += 1) {
		const progress = step / 8;
		await session.send('Input.dispatchTouchEvent', {
			type: 'touchMove',
			touchPoints: [
				{
					x: start.x + (end.x - start.x) * progress,
					y: start.y + (end.y - start.y) * progress,
					radiusX: 2,
					radiusY: 2,
					force: 1
				}
			]
		});
		await page.waitForTimeout(16);
	}
	await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
	await session.detach();
	await page.waitForTimeout(150);
}

async function phantomDragPoints(page: Page) {
	const canvas = page.locator('.phantom-editor canvas');
	await canvas.scrollIntoViewIfNeeded();
	const box = await canvas.boundingBox();
	expect(box).not.toBeNull();
	const startY = box!.y + Math.min(box!.height - 30, Math.max(130, box!.height * 0.72));
	return {
		start: { x: box!.x + box!.width * 0.5, y: startY },
		up: { x: box!.x + box!.width * 0.5, y: Math.max(box!.y + 24, startY - 120) },
		paint: { x: box!.x + box!.width * 0.72, y: Math.max(box!.y + 32, startY - 42) }
	};
}

async function setComparisonWidth(page: Page, width: number) {
	const comparison = page.locator('.comparison');
	await comparison.evaluate((element, nextWidth) => {
		const borderWidth = element.getBoundingClientRect().width - element.clientWidth;
		element.style.width = `${nextWidth + borderWidth}px`;
		element.style.maxWidth = 'none';
		element.style.justifySelf = 'start';
	}, width);
	await expect
		.poll(() => comparison.evaluate((element) => Math.round(element.clientWidth)))
		.toBe(width);
}

test('the interactive laboratory leads the article and reference material follows it', async ({
	page
}) => {
	await openLaboratory(page, 1024);
	const order = await page.evaluate(() => {
		const prose = document.querySelector('.article-prose');
		const lab = document.querySelector('.ct-laboratory');
		const audio = prose?.querySelector('section[aria-label="Audio article"]');
		const deferredFaq = document.querySelector('#faq');
		const leadImage = prose?.querySelector('figure img');
		const all = Array.from(document.querySelectorAll('*'));
		return {
			labIndex: lab ? all.indexOf(lab) : -1,
			audioIndex: audio ? all.indexOf(audio) : -1,
			faqIndex: deferredFaq ? all.indexOf(deferredFaq) : -1,
			leadImagePresent: Boolean(leadImage),
			quickAnswerBeforeLab: Boolean(
				Array.from(document.querySelectorAll('h2')).find(
					(heading) =>
						heading.textContent?.trim() === 'Quick Answer' &&
						heading.compareDocumentPosition(lab!) & Node.DOCUMENT_POSITION_FOLLOWING
				)
			)
		};
	});

	expect(order.labIndex).toBeGreaterThan(-1);
	expect(order.audioIndex).toBeGreaterThan(order.labIndex);
	expect(order.faqIndex).toBeGreaterThan(order.labIndex);
	expect(order.leadImagePresent).toBe(false);
	expect(order.quickAnswerBeforeLab).toBe(false);
});

test('all breakpoint cliffs remain free of panel collisions and horizontal overflow', async ({
	page
}) => {
	await openLaboratory(page);

	for (const width of breakpointWidths) {
		await page.setViewportSize({ width, height: 1000 });
		await page.waitForTimeout(80);
		const geometry = await page.evaluate(() => {
			const lab = document.querySelector<HTMLElement>('.ct-laboratory')!;
			const body = lab.querySelector<HTMLElement>('.laboratory-body')!;
			const visualStage = lab.querySelector<HTMLElement>('.measurement-stage')!;
			const controls = lab.querySelector<HTMLElement>('.advanced-region')!;
			const measurement = lab.querySelector<HTMLElement>('.measurement-layout')!;
			const visualRect = visualStage.getBoundingClientRect();
			const controlsRect = controls.getBoundingClientRect();
			const measurementRect = measurement.getBoundingClientRect();
			const intersects =
				visualRect.left < controlsRect.right - 1 &&
				visualRect.right > controlsRect.left + 1 &&
				visualRect.top < controlsRect.bottom - 1 &&
				visualRect.bottom > controlsRect.top + 1;
			return {
				documentOverflow:
					document.documentElement.scrollWidth - document.documentElement.clientWidth,
				labOverflow: lab.scrollWidth - lab.clientWidth,
				bodyOverflow: body.scrollWidth - body.clientWidth,
				measurementOverflow: measurementRect.right - visualRect.right,
				intersects
			};
		});

		expect.soft(geometry.documentOverflow, `${width}px document overflow`).toBeLessThanOrEqual(1);
		expect.soft(geometry.labOverflow, `${width}px laboratory overflow`).toBeLessThanOrEqual(1);
		expect.soft(geometry.bodyOverflow, `${width}px body overflow`).toBeLessThanOrEqual(1);
		expect
			.soft(geometry.measurementOverflow, `${width}px measurement overflow`)
			.toBeLessThanOrEqual(1);
		expect.soft(geometry.intersects, `${width}px controls/workbench intersection`).toBe(false);
	}
});

test('collapsed layouts keep transport first, the visual stage second, and settings last', async ({
	page
}) => {
	await openLaboratory(page, 1024);
	const positions = await page.evaluate(() => {
		const top = (selector: string) =>
			document.querySelector<HTMLElement>(selector)?.getBoundingClientRect().top ?? -1;
		const body = document.querySelector<HTMLElement>('.laboratory-body')!;
		const children = Array.from(body.children);
		return {
			transport: top('.transport-region'),
			workbench: top('.measurement-stage'),
			settings: top('.advanced-region'),
			transportDomIndex: children.indexOf(body.querySelector('.transport-region')!),
			workbenchDomIndex: children.indexOf(body.querySelector('.workbench')!),
			settingsDomIndex: children.indexOf(body.querySelector('.advanced-region')!)
		};
	});
	expect(positions.transport).toBeGreaterThanOrEqual(0);
	expect(positions.transport).toBeLessThan(positions.workbench);
	expect(positions.workbench).toBeLessThan(positions.settings);
	expect(positions.transportDomIndex).toBeLessThan(positions.workbenchDomIndex);
	expect(positions.workbenchDomIndex).toBeLessThan(positions.settingsDomIndex);
});

test('phone reconstruction uses one accessible selected stage and tablet defaults to BP ↔ FBP', async ({
	page
}) => {
	await openLaboratory(page, 390);
	const tabs = page.locator('.comparison [role="tab"]');
	await expect(tabs).toHaveCount(4);
	await expect(
		page.getByRole('tab', { name: 'Filtered back-projection', exact: true })
	).toHaveAttribute('aria-selected', 'true');
	await expect(page.locator('.comparison .stage:visible')).toHaveCount(1);
	await expect(page.locator('.comparison .stage-filtered')).toBeVisible();

	await page.getByRole('tab', { name: 'Ordinary back-projection', exact: true }).click();
	await expect(page.locator('.comparison .stage:visible')).toHaveCount(1);
	await expect(page.locator('.comparison .stage-backprojection')).toBeVisible();

	await page.setViewportSize({ width: 768, height: 1000 });
	await page.reload({ waitUntil: 'domcontentloaded' });
	await expect(page.locator('.comparison')).toBeVisible();
	await expect(
		page.getByRole('tab', {
			name: 'Compare ordinary and filtered back-projection',
			exact: true
		})
	).toHaveAttribute('aria-selected', 'true');
	await expect(page.locator('.comparison .stage:visible')).toHaveCount(2);
	await expect(page.locator('.comparison .stage-backprojection')).toBeVisible();
	await expect(page.locator('.comparison .stage-filtered')).toBeVisible();
});

test('reconstruction container cliffs preserve tabs, focus, panels, and metric width', async ({
	page
}) => {
	await openLaboratory(page, 1440);

	await setComparisonWidth(page, 900);
	await expect(page.locator('.comparison .view-switcher')).toBeHidden();
	await expect(page.locator('.comparison .stage:visible')).toHaveCount(4);

	await setComparisonWidth(page, 700);
	const tabs = page.locator('.comparison [role="tab"]');
	await expect(tabs).toHaveCount(5);
	await expect(
		page.getByRole('tab', {
			name: 'Compare ordinary and filtered back-projection',
			exact: true
		})
	).toHaveAttribute('aria-selected', 'true');
	await expect(page.locator('.comparison .stage:visible')).toHaveCount(2);

	const filteredTab = page.getByRole('tab', {
		name: 'Filtered back-projection',
		exact: true
	});
	await filteredTab.focus();
	await page.keyboard.press('ArrowRight');
	await expect(page.getByRole('tab', { name: 'Filtered error', exact: true })).toBeFocused();
	await page.keyboard.press('Home');
	await expect(page.getByRole('tab', { name: 'Ground truth', exact: true })).toBeFocused();
	await page.keyboard.press('End');
	const compareTab = page.getByRole('tab', {
		name: 'Compare ordinary and filtered back-projection',
		exact: true
	});
	await expect(compareTab).toBeFocused();
	await page.keyboard.press('ArrowDown');
	await expect(compareTab).toBeFocused();

	const missingControlledPanels = await tabs.evaluateAll((elements) =>
		elements.flatMap((element) =>
			(element.getAttribute('aria-controls') ?? '')
				.split(/\s+/)
				.filter(Boolean)
				.filter((id) => !document.getElementById(id))
		)
	);
	expect(missingControlledPanels).toEqual([]);

	await setComparisonWidth(page, 543);
	await expect(page.locator('.comparison [role="tab"]')).toHaveCount(4);
	await expect(filteredTab).toBeFocused();
	await expect(filteredTab).toHaveAttribute('aria-selected', 'true');
	await expect(page.locator('.comparison .stage:visible')).toHaveCount(1);

	await setComparisonWidth(page, 545);
	await expect(page.locator('.comparison [role="tab"]')).toHaveCount(5);
	const metricGeometry = await page.locator('.comparison .metrics').evaluate((element) => ({
		scrollWidth: element.scrollWidth,
		clientWidth: element.clientWidth
	}));
	expect(metricGeometry.scrollWidth).toBeLessThanOrEqual(metricGeometry.clientWidth + 1);
});

test('text-only scaling keeps CSS and ARIA reconstruction modes aligned', async ({ page }) => {
	await openLaboratory(page, 2000);
	await expect(page.locator('.comparison .view-switcher')).toBeHidden();

	await page.evaluate(() => {
		document.documentElement.style.fontSize = '200%';
	});
	await setComparisonWidth(page, 1500);
	await expect(page.locator('.comparison .view-switcher')).toBeVisible();
	await expect(
		page.getByRole('tab', {
			name: 'Compare ordinary and filtered back-projection',
			exact: true
		})
	).toHaveAttribute('aria-selected', 'true');
	await expect(page.locator('.comparison .stage:visible')).toHaveCount(2);
	await expect(page.locator('.comparison .stage-backprojection')).toHaveAttribute(
		'role',
		'tabpanel'
	);

	const geometry = await page.evaluate(() => {
		const lab = document.querySelector<HTMLElement>('.ct-laboratory')!;
		const comparison = document.querySelector<HTMLElement>('.comparison')!;
		const metrics = comparison.querySelector<HTMLElement>('.metrics')!;
		return {
			documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
			labOverflow: lab.scrollWidth - lab.clientWidth,
			comparisonOverflow: comparison.scrollWidth - comparison.clientWidth,
			metricsOverflow: metrics.scrollWidth - metrics.clientWidth
		};
	});
	for (const [name, overflow] of Object.entries(geometry)) {
		expect.soft(overflow, `${name} at 200% text`).toBeLessThanOrEqual(1);
	}
});

test('inspect and shape gestures scroll, while a brush drag paints without scrolling', async ({
	page
}) => {
	await openLaboratory(page, 390, 760);
	const canvas = page.locator('.phantom-editor canvas');
	await expect(canvas).toHaveAttribute('data-tool', 'inspect');
	let points = await phantomDragPoints(page);
	const inspectStartY = await page.evaluate(() => window.scrollY);
	await dispatchTouchDrag(page, points.start, points.up);
	expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(inspectStartY + 20);

	await page.getByRole('button', { name: 'Circle' }).click();
	points = await phantomDragPoints(page);
	const circleStartY = await page.evaluate(() => window.scrollY);
	await dispatchTouchDrag(page, points.start, points.up);
	expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(circleStartY + 20);
	await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();

	await page.getByRole('button', { name: 'Brush' }).click();
	points = await phantomDragPoints(page);
	const brushStartY = await page.evaluate(() => window.scrollY);
	await dispatchTouchDrag(page, points.start, points.paint);
	expect(Math.abs((await page.evaluate(() => window.scrollY)) - brushStartY)).toBeLessThanOrEqual(
		2
	);
	await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled();
});

test('fullscreen keeps progress, pause/resume, step, settings, and exit persistently available', async ({
	page
}) => {
	await openLaboratory(page, 1024, 760);
	const openButton = page.getByRole('button', { name: 'Open laboratory', exact: true });
	await expect(openButton).toBeEnabled();
	await openButton.click();
	await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);

	const toolbar = page.locator('.fullscreen-toolbar');
	await expect(toolbar).toBeVisible();
	for (const name of ['Step', 'Settings', 'Exit']) {
		await expect(toolbar.getByRole('button', { name, exact: true })).toBeInViewport();
	}
	await toolbar.getByRole('button', { name: 'Start', exact: true }).click();
	await expect(toolbar.getByRole('button', { name: 'Pause', exact: true })).toBeInViewport();
	await toolbar.getByRole('button', { name: 'Pause', exact: true }).click();
	await expect(toolbar.getByRole('button', { name: 'Resume', exact: true })).toBeInViewport();
	await expect(toolbar.getByRole('button', { name: 'Step', exact: true })).toBeInViewport();
	await expect(toolbar.getByRole('button', { name: 'Exit', exact: true })).toBeInViewport();

	await toolbar.getByRole('button', { name: 'Settings', exact: true }).click();
	const settings = page.locator('#ct-fullscreen-settings');
	const workbench = page.locator('.ct-laboratory:fullscreen .workbench');
	await expect(settings).toBeVisible();
	await expect(workbench).toHaveAttribute('inert', '');
	const backgroundAcceptedFocus = await page.evaluate(() => {
		const workbenchElement = document.querySelector<HTMLElement>(
			'.ct-laboratory:fullscreen .workbench'
		)!;
		const backgroundButton =
			workbenchElement.querySelector<HTMLButtonElement>('button:not([disabled])')!;
		backgroundButton.focus();
		return workbenchElement.contains(document.activeElement);
	});
	expect(backgroundAcceptedFocus).toBe(false);
	await page.keyboard.press('Escape');
	await expect(toolbar.getByRole('button', { name: 'Settings', exact: true })).toBeFocused();
	await toolbar.getByRole('button', { name: 'Exit', exact: true }).click();
	await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
	await expect(openButton).toBeFocused();
});

test('fullscreen exposes Worker errors and keeps recovery available', async ({ page }) => {
	await page.addInitScript(() => {
		Object.defineProperty(window, 'Worker', {
			configurable: true,
			value: class FailingWorker {
				constructor() {
					throw new Error('Synthetic Worker failure');
				}
			}
		});
	});
	await openLaboratory(page, 1024, 760);
	await page.getByRole('button', { name: 'Open laboratory', exact: true }).click();
	await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
	const toolbar = page.locator('.fullscreen-toolbar');
	await expect(toolbar.locator('.fullscreen-progress span')).toContainText('Error:');
	await expect(toolbar.getByRole('button', { name: 'Reconnect', exact: true })).toBeEnabled();
	await toolbar.getByRole('button', { name: 'Reconnect', exact: true }).click();
	await expect(toolbar.locator('.fullscreen-progress span')).toContainText('Error:');
	await toolbar.getByRole('button', { name: 'Exit', exact: true }).click();
});

test('forced colours retain a visible phantom keyboard focus outline', async ({ page }) => {
	await page.emulateMedia({ forcedColors: 'active' });
	await openLaboratory(page, 390);
	const canvasHost = page.locator('.phantom-editor .canvas-frame');
	await canvasHost.focus();
	const outline = await canvasHost.evaluate((element) => {
		const style = getComputedStyle(element);
		return {
			style: style.outlineStyle,
			width: Number.parseFloat(style.outlineWidth)
		};
	});
	expect(outline.style).not.toBe('none');
	expect(outline.width).toBeGreaterThanOrEqual(2);
});

test('open disclosures, long labels, 200% zoom, and all themes retain focus and panel boundaries', async ({
	page
}) => {
	await openLaboratory(page, 1440, 1000);
	await page.locator('.ct-laboratory details').evaluateAll((details) => {
		for (const detail of details as HTMLDetailsElement[]) detail.open = true;
	});
	// A 1440px device viewport at 200% browser zoom exposes roughly 720 CSS pixels.
	await page.setViewportSize({ width: 720, height: 1000 });
	await page.evaluate(() => {
		for (const element of Array.from(
			document.querySelectorAll<HTMLElement>(
				'.ct-laboratory button, .ct-laboratory summary, .ct-laboratory label > span'
			)
		).slice(0, 18)) {
			element.append(' — extended translated laboratory instruction');
		}
	});
	await page.waitForTimeout(100);

	const reflow = await page.evaluate(() => ({
		documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
		labOverflow:
			document.querySelector<HTMLElement>('.ct-laboratory')!.scrollWidth -
			document.querySelector<HTMLElement>('.ct-laboratory')!.clientWidth
	}));
	expect(reflow.documentOverflow).toBeLessThanOrEqual(1);
	expect(reflow.labOverflow).toBeLessThanOrEqual(1);

	const clippedFocusableElements = await page.evaluate(() => {
		const focusables = Array.from(
			document.querySelectorAll<HTMLElement>(
				'.ct-laboratory button:not([disabled]), .ct-laboratory input:not([disabled]), .ct-laboratory select:not([disabled]), .ct-laboratory summary, .ct-laboratory [tabindex="0"]'
			)
		).filter((element) => element.getClientRects().length > 0 && !element.closest('[inert]'));
		const clipped: string[] = [];
		for (const element of focusables) {
			element.focus();
			const rect = element.getBoundingClientRect();
			for (let parent = element.parentElement; parent; parent = parent.parentElement) {
				const style = getComputedStyle(parent);
				if (
					!/(hidden|clip|auto|scroll)/.test(
						`${style.overflow} ${style.overflowX} ${style.overflowY}`
					)
				) {
					continue;
				}
				const parentRect = parent.getBoundingClientRect();
				if (
					rect.left < parentRect.left - 1 ||
					rect.right > parentRect.right + 1 ||
					rect.top < parentRect.top - 1 ||
					rect.bottom > parentRect.bottom + 1
				) {
					clipped.push(
						element.getAttribute('aria-label') || element.textContent?.trim() || element.tagName
					);
					break;
				}
			}
		}
		return clipped;
	});
	expect(clippedFocusableElements).toEqual([]);

	for (const theme of ['paper', 'night', 'high-contrast']) {
		const result = await page.evaluate((nextTheme) => {
			const root = document.documentElement;
			root.dataset.theme = nextTheme;
			root.classList.toggle('dark', nextTheme === 'night');
			const panel = document.querySelector<HTMLElement>('.ct-laboratory .controls')!;
			const style = getComputedStyle(panel);
			const parse = (value: string) =>
				(value.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number) as [number, number, number];
			const luminance = ([red, green, blue]: [number, number, number]) => {
				const linear = [red, green, blue].map((channel) => {
					const value = channel / 255;
					return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
				});
				return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
			};
			const foreground = luminance(parse(style.color));
			const background = luminance(parse(style.backgroundColor));
			const contrast =
				(Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
			return {
				borderWidth: Number.parseFloat(style.borderTopWidth),
				borderColor: style.borderTopColor,
				backgroundColor: style.backgroundColor,
				contrast
			};
		}, theme);
		expect.soft(result.borderWidth, `${theme} panel border`).toBeGreaterThanOrEqual(1);
		expect.soft(result.borderColor, `${theme} boundary colour`).not.toBe(result.backgroundColor);
		expect.soft(result.contrast, `${theme} control contrast`).toBeGreaterThanOrEqual(4.5);
	}
});
