import { expect, test, type Locator, type Page } from '@playwright/test';

const article = '/blog/visualizations/the-piano-that-forgives';
const root = (page: Page) => page.locator('[data-piano-root]');
const key = (page: Page, pitch: number) => root(page).locator(`[data-piano-key="${pitch}"]`);

async function openPiano(page: Page) {
	await page.goto(article);
	await expect(root(page)).toBeVisible();
	await expect(root(page).getByRole('button', { name: 'Enable sound' })).toBeEnabled();
	const privacy = page
		.getByRole('button', {
			name: /^(?:Reject optional|Keep videos paused|Dismiss privacy notice without choosing)$/
		})
		.first();
	if (await privacy.isVisible()) await privacy.click();
}
async function workbench(page: Page) {
	const details = root(page).locator('.piano-workbench');
	if (!(await details.evaluate((element) => (element as HTMLDetailsElement).open))) {
		await details.locator('summary').first().click();
	}
}
async function keyPoint(page: Page, pitch: number) {
	await key(page, pitch).evaluate((element) =>
		element.scrollIntoView({ block: 'center', inline: 'center' })
	);
	const box = await key(page, pitch).boundingBox();
	if (!box) throw new Error('Playable key has no rectangle.');
	// Lower white-key area avoids overlaid black keys; black keys use their centre.
	const black = await key(page, pitch).evaluate((element) => element.classList.contains('black'));
	return { x: box.x + box.width / 2, y: box.y + box.height * (black ? 0.45 : 0.8) };
}
async function playKey(page: Page, pitch: number) {
	await page.mouse.click(...(Object.values(await keyPoint(page, pitch)) as [number, number]));
}

type AudioAudit = {
	created: number;
	closed: number;
	started: number;
	ended: number;
	stops: number;
};
type AuditedWindow = Window & { __pianoAudit: AudioAudit };
async function auditAudio(page: Page) {
	await page.addInitScript(() => {
		const audit: AudioAudit = { created: 0, closed: 0, started: 0, ended: 0, stops: 0 };
		(window as unknown as AuditedWindow).__pianoAudit = audit;
		const Native = window.AudioContext;
		if (!Native) return;
		Object.defineProperty(window, 'AudioContext', {
			configurable: true,
			value: new Proxy(Native, {
				construct(target, args) {
					audit.created++;
					const context = Reflect.construct(target, args) as AudioContext;
					const close = context.close.bind(context);
					context.close = () => {
						audit.closed++;
						return close();
					};
					return context;
				}
			})
		});
		const start = OscillatorNode.prototype.start;
		const stop = OscillatorNode.prototype.stop;
		OscillatorNode.prototype.start = function (when?: number) {
			audit.started++;
			this.addEventListener(
				'ended',
				() => {
					audit.ended++;
				},
				{ once: true }
			);
			return start.call(this, when);
		};
		OscillatorNode.prototype.stop = function (when?: number) {
			audit.stops++;
			return stop.call(this, when);
		};
	});
}
const readAudit = (page: Page) =>
	page.evaluate(() => ({ ...(window as unknown as AuditedWindow).__pianoAudit }));

test.describe('Baseline Invariants', () => {
	test('all 88 correctly grouped keys fit on desktop and both range boundaries are playable', async ({
		page
	}) => {
		await openPiano(page);
		await expect(root(page)).toHaveAttribute('data-view', 'fit');
		const keys = root(page).locator('.painted-key');
		await expect(keys).toHaveCount(88);
		await expect(root(page).locator('.painted-key:not(.black)')).toHaveCount(52);
		await expect(root(page).locator('.painted-key.black')).toHaveCount(36);
		await expect(keys.first()).toHaveAttribute('aria-label', 'Play A0');
		await expect(keys.last()).toHaveAttribute('aria-label', 'Play C8');
		await root(page).getByRole('button', { name: 'Fit all 88 keys', exact: true }).click();
		await expect(root(page)).toHaveAttribute('data-view', 'fit');
		const geometry = await root(page)
			.locator('.keyboard-window')
			.evaluate((window) => {
				const viewport = window.getBoundingClientRect();
				return {
					left: viewport.left,
					right: viewport.right,
					width: window.clientWidth,
					scrollWidth: window.scrollWidth,
					keys: Array.from(window.querySelectorAll<HTMLElement>('.painted-key')).map((key) => {
						const rect = key.getBoundingClientRect();
						return {
							pitch: Number(key.dataset.pianoKey),
							black: key.classList.contains('black'),
							left: rect.left,
							right: rect.right,
							width: rect.width
						};
					})
				};
			});
		expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.width + 1);
		expect(geometry.keys[0].left).toBeGreaterThanOrEqual(geometry.left - 1);
		expect(geometry.keys.at(-1)!.right).toBeLessThanOrEqual(geometry.right + 1);
		const whites = geometry.keys.filter((item) => !item.black);
		expect(
			Math.max(...whites.map((item) => item.width)) - Math.min(...whites.map((item) => item.width))
		).toBeLessThan(1);
		for (const black of geometry.keys.filter((item) => item.black)) {
			const lower = geometry.keys.find((item) => item.pitch === black.pitch - 1)!;
			const upper = geometry.keys.find((item) => item.pitch === black.pitch + 1)!;
			expect(lower.black).toBe(false);
			expect(upper.black).toBe(false);
			const centre = (black.left + black.right) / 2;
			expect(centre).toBeGreaterThan((lower.left + lower.right) / 2);
			expect(centre).toBeLessThan((upper.left + upper.right) / 2);
		}
		await root(page).getByRole('button', { name: 'Raw', exact: true }).click();
		await playKey(page, 21);
		await expect(root(page).locator('.piano-whisper')).toContainText('A0 → A0');
		await playKey(page, 108);
		await expect(root(page).locator('.piano-whisper')).toContainText('C8 → C8');
		await expect(root(page)).toHaveAttribute('data-held', '0');
	});

	test('phone overview and octave navigation reach the full keyboard without moving an active touch', async ({
		page
	}) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await openPiano(page);
		await expect(root(page)).toHaveAttribute('data-view', 'playing');
		const window = root(page).locator('.keyboard-window');
		const inWindow = async (pitch: number) => {
			const view = await window.boundingBox();
			const note = await key(page, pitch).boundingBox();
			return Boolean(
				view && note && note.x >= view.x - 1 && note.x + note.width <= view.x + view.width + 1
			);
		};
		await expect.poll(() => inWindow(60)).toBe(true);
		const overview = root(page).getByRole('slider', { name: 'Keyboard overview', exact: true });
		await overview.focus();
		await overview.press('Home');
		await expect.poll(() => inWindow(21)).toBe(true);
		await overview.press('End');
		await expect.poll(() => inWindow(108)).toBe(true);
		await expect(root(page)).toHaveAttribute('data-held', '0');
		await root(page).getByRole('button', { name: 'Return to middle C', exact: true }).click();
		await expect.poll(() => inWindow(60)).toBe(true);
		const before = await window.evaluate((element) => element.scrollLeft);
		await root(page)
			.getByRole('button', { name: /Higher octave/ })
			.click();
		await expect
			.poll(() => window.evaluate((element) => element.scrollLeft))
			.toBeGreaterThan(before);
		await root(page).getByRole('button', { name: 'Return to middle C', exact: true }).click();
		const point = await keyPoint(page, 60);
		await page.mouse.move(point.x, point.y);
		await page.mouse.down();
		await expect(root(page)).toHaveAttribute('data-held', '1');
		const heldScroll = await window.evaluate((element) => element.scrollLeft);
		await page.mouse.wheel(180, 0);
		await page.evaluate(
			() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
		);
		expect(await window.evaluate((element) => element.scrollLeft)).toBe(heldScroll);
		await root(page)
			.getByRole('button', { name: /Higher octave/ })
			.dispatchEvent('click');
		expect(await window.evaluate((element) => element.scrollLeft)).toBe(heldScroll);
		await page.mouse.up();
		await expect(root(page)).toHaveAttribute('data-held', '0');
		expect((await key(page, 60).boundingBox())!.width).toBeGreaterThanOrEqual(35);
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
			true
		);
	});

	test('one keyboard tab stop roves across 88 notes and octave shortcuts move the computer playing range', async ({
		page
	}) => {
		await openPiano(page);
		await expect(root(page).locator('.painted-key[tabindex="0"]')).toHaveCount(1);
		await expect(root(page)).toHaveAttribute('data-keyboard-base', '60');
		await key(page, 60).focus();
		await page.keyboard.press('ArrowRight');
		await expect(key(page, 61)).toBeFocused();
		await page.keyboard.press('ArrowLeft');
		await expect(key(page, 60)).toBeFocused();
		await page.keyboard.press('PageDown');
		await expect(key(page, 48)).toBeFocused();
		await page.keyboard.press('PageUp');
		await expect(key(page, 60)).toBeFocused();
		await page.keyboard.press('Home');
		await expect(key(page, 21)).toBeFocused();
		await page.keyboard.press('ArrowLeft');
		await expect(key(page, 21)).toBeFocused();
		await page.keyboard.press('End');
		await expect(key(page, 108)).toBeFocused();
		await page.keyboard.press('ArrowRight');
		await expect(key(page, 108)).toBeFocused();
		await expect(root(page).locator('.painted-key[tabindex="0"]')).toHaveCount(1);
		await key(page, 60).focus();
		await page.keyboard.press('[');
		await expect(root(page)).toHaveAttribute('data-keyboard-base', '48');
		await page.keyboard.press('a');
		await expect(root(page).locator('.piano-whisper')).toContainText('C3 → C3');
		await page.keyboard.press(']');
		await expect(root(page)).toHaveAttribute('data-keyboard-base', '60');
		await page.keyboard.press('a');
		await expect(root(page).locator('.piano-whisper')).toContainText('C4 → C4');
		await expect(root(page)).toHaveAttribute('data-held', '0');
	});

	test('focus view keeps essential controls reachable and Escape returns to the article', async ({
		page
	}) => {
		await openPiano(page);
		await root(page).getByRole('button', { name: 'Enter focus view', exact: true }).click();
		await expect(root(page)).toHaveAttribute('data-focus', 'true');
		await expect(
			root(page).getByRole('button', { name: 'Exit focus view', exact: true })
		).toBeVisible();
		await expect(root(page).getByRole('button', { name: 'Enable sound' })).toBeVisible();
		await expect(root(page).getByRole('button', { name: 'Stop all sound' })).toBeVisible();
		await playKey(page, 60);
		await expect(root(page).locator('.piano-whisper')).toContainText('C4 → C4');
		await key(page, 60).focus();
		await page.keyboard.press('Escape');
		await expect(root(page)).toHaveAttribute('data-focus', 'false');
		await expect(
			root(page).getByRole('button', { name: 'Enter focus view', exact: true })
		).toBeVisible();
		await expect(root(page)).toHaveAttribute('data-held', '0');
	});

	test('note ripples and paint trails settle, stop offscreen and retain stable marks in Still', async ({
		page
	}) => {
		await openPiano(page);
		const effects = root(page).locator('canvas.piano-effects');
		const pixels = () =>
			effects.evaluate((element) => {
				const canvas = element as HTMLCanvasElement;
				const bytes = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
				let painted = 0;
				let checksum = 0;
				for (let index = 3; index < bytes.length; index += 4) {
					if (bytes[index]) painted++;
					checksum = (checksum + bytes[index] * index) >>> 0;
				}
				return { painted, checksum };
			});
		await root(page)
			.getByRole('button', { name: /Try the space between/ })
			.click();
		await expect
			.poll(async () => Number(await effects.getAttribute('data-effects-count')))
			.toBeGreaterThan(0);
		await expect(effects).toHaveAttribute('data-effects-running', 'true');
		await expect.poll(async () => (await pixels()).painted).toBeGreaterThan(0);
		await expect(effects).toHaveAttribute('data-effects-running', 'false');
		await expect(effects).toHaveAttribute('data-effects-count', '0');
		await playKey(page, 60);
		await expect(effects).toHaveAttribute('data-effects-running', 'true');
		await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
		await expect(effects).toHaveAttribute('data-effects-running', 'false');
		await expect(root(page)).toHaveAttribute('data-held', '0');
		await expect(root(page).locator('.sound-status')).toContainText('Paused outside the viewport');
		await page.evaluate(() => {
			document.documentElement.dataset.motion = 'still';
		});
		await expect(root(page)).toHaveClass(/still/);
		await root(page)
			.getByRole('button', { name: /Try the space between/ })
			.click();
		await expect(root(page).locator('.sound-status')).not.toContainText(
			'Paused outside the viewport'
		);
		await expect(effects).toHaveAttribute('data-effects-running', 'false');
		await expect.poll(async () => (await pixels()).painted).toBeGreaterThan(0);
		const stable = await pixels();
		await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 180)));
		expect(await pixels()).toEqual(stable);
		await expect(root(page).locator('.possibility-fan')).toContainText('55.0%');
		await root(page).getByRole('button', { name: 'Stop all sound' }).click();
		await expect(effects).toHaveAttribute('data-effects-count', '0');
		await expect(effects).toHaveAttribute('data-effects-running', 'false');
	});

	test('probability light uses the sampler weights and stays aligned through zoom, scroll and resize', async ({
		page
	}) => {
		await openPiano(page);
		await root(page)
			.getByRole('button', { name: /Try the space between/ })
			.click();
		const paths = root(page).locator('.probability-light path[data-probability]');
		await expect(paths).toHaveCount(2);
		const probabilities = await paths.evaluateAll((elements) =>
			elements.map((element) => Number(element.getAttribute('data-probability')))
		);
		expect(probabilities.map((value) => (value * 100).toFixed(2))).toEqual(['54.98', '45.02']);
		expect(probabilities.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 12);
		await expect(root(page).locator('.probability-light path.selected')).toHaveCount(1);
		await expect(paths.first()).toHaveClass(/selected/);
		await expect(root(page).locator('.piano-whisper')).toContainText('C♯4 → C4');
		const alignmentError = () =>
			root(page)
				.locator('.probability-light')
				.evaluate((element) => {
					const svg = element as SVGSVGElement;
					const bounds = svg.getBoundingClientRect();
					const scale = bounds.width / svg.viewBox.baseVal.width;
					return Array.from(svg.querySelectorAll('path[data-probability]')).map((path, index) => {
						const values =
							(path.getAttribute('d') ?? '')
								.match(/[-+]?(?:\d*\.?\d+)(?:e[-+]?\d+)?/gi)
								?.map(Number) ?? [];
						const pitch = [60, 62][index];
						const key = document
							.querySelector(`[data-piano-key="${pitch}"]`)!
							.getBoundingClientRect();
						const endpoint = bounds.left + values.at(-2)! * scale;
						return Math.abs(endpoint - (key.left + key.width / 2));
					});
				});
		const aligned = async () =>
			expect.poll(async () => Math.max(...(await alignmentError()))).toBeLessThan(2);
		await root(page).getByRole('button', { name: 'Fit all 88 keys', exact: true }).click();
		await aligned();
		await root(page).getByRole('button', { name: 'Playing view', exact: true }).click();
		await aligned();
		const overview = root(page).getByRole('slider', { name: 'Keyboard overview', exact: true });
		await overview.focus();
		await overview.press('End');
		await aligned();
		await page.setViewportSize({ width: 768, height: 1000 });
		await aligned();
		await root(page).getByRole('button', { name: 'Return to middle C', exact: true }).click();
		await aligned();
		await workbench(page);
		await expect(root(page).getByRole('table')).toContainText('54.98%');
		await expect(root(page).getByRole('table')).toContainText('45.02%');
	});

	test('starts silent, preserves home notes and shows the actual C♯ tie distribution', async ({
		page
	}) => {
		await auditAudio(page);
		await openPiano(page);
		await expect(root(page)).toHaveAttribute('data-sound', 'false');
		expect((await readAudit(page)).created).toBe(0);
		await root(page)
			.getByRole('button', { name: /Find a home note/ })
			.click();
		await expect(root(page).locator('.piano-whisper')).toContainText('C4 → C4');
		await expect(root(page).locator('.possibility-fan')).toContainText('100.0%');
		await root(page)
			.getByRole('button', { name: /Try the space between/ })
			.click();
		await expect(root(page).locator('.piano-whisper')).toContainText(/C♯4 → (C4|D4)/);
		await workbench(page);
		await expect(root(page).getByRole('table')).toContainText('54.98%');
		await expect(root(page).getByRole('table')).toContainText('45.02%');
		await expect(root(page).locator('[data-decision-reason]')).toContainText(
			'Nearest distance 1 semitone'
		);
		await root(page).getByRole('button', { name: 'Raw', exact: true }).click();
		await playKey(page, 61);
		await expect(root(page).locator('.piano-whisper')).toContainText('C♯4 → C♯4');
		await expect(root(page).locator('[data-decision-reason]')).toContainText('outside');
		expect((await readAudit(page)).created).toBe(0);
	});

	test('two physical inputs corrected to one output release independently; repeat and modifier keys are ignored', async ({
		page
	}) => {
		await openPiano(page);
		const point = await keyPoint(page, 65);
		await page.mouse.move(point.x, point.y);
		await page.mouse.down();
		await expect(root(page)).toHaveAttribute('data-held', '1');
		await expect(key(page, 64)).toHaveClass(/sounded/);
		await page.keyboard.down('d');
		await expect(root(page)).toHaveAttribute('data-held', '2');
		await page.keyboard.down('d');
		await expect(root(page)).toHaveAttribute('data-held', '2');
		await page.mouse.up();
		await expect(root(page)).toHaveAttribute('data-held', '1');
		await expect(key(page, 64)).toHaveClass(/sounded/);
		await page.keyboard.up('d');
		await expect(root(page)).toHaveAttribute('data-held', '0');
		await key(page, 60).focus();
		await page.keyboard.press('Control+a');
		await expect(root(page)).toHaveAttribute('data-held', '0');
		await workbench(page);
		await root(page).getByRole('spinbutton', { name: 'Musical seed' }).focus();
		await page.keyboard.press('a');
		await expect(root(page)).toHaveAttribute('data-held', '0');
		await key(page, 60).focus();
		await page.keyboard.press('Enter');
		await expect(root(page).locator('.piano-whisper')).toContainText('C4 → C4');
	});

	test('pointer cancellation, focus loss, Stop and a new preset clear physical ownership', async ({
		page
	}) => {
		await openPiano(page);
		let point = await keyPoint(page, 60);
		await page.mouse.move(point.x, point.y);
		await page.mouse.down();
		await expect(root(page)).toHaveAttribute('data-held', '1');
		await key(page, 60).dispatchEvent('pointercancel', { pointerId: 1, pointerType: 'mouse' });
		await expect(root(page)).toHaveAttribute('data-held', '0');
		await page.mouse.up();
		await key(page, 60).focus();
		await page.keyboard.down('a');
		await page.evaluate(() => window.dispatchEvent(new Event('blur')));
		await expect(root(page)).toHaveAttribute('data-held', '0');
		await page.keyboard.up('a');
		await key(page, 60).focus();
		await page.keyboard.down('a');
		await root(page).getByRole('button', { name: 'Stop all sound' }).click();
		await expect(root(page)).toHaveAttribute('data-held', '0');
		await page.keyboard.up('a');
		point = await keyPoint(page, 60);
		await page.mouse.move(point.x, point.y);
		await page.mouse.down();
		await root(page)
			.getByRole('combobox', { name: 'Painting and harmony preset' })
			.selectOption('1');
		await expect(root(page)).toHaveAttribute('data-held', '0');
		await page.mouse.up();
		await workbench(page);
		await expect(
			root(page).getByRole('combobox', { name: 'Current chord' }).locator('option')
		).toHaveText(['Dm9', 'G13', 'Cmaj9']);
		await root(page)
			.getByRole('combobox', { name: 'Painting and harmony preset' })
			.selectOption('2');
		await expect(
			root(page).getByRole('combobox', { name: 'Current chord' }).locator('option')
		).toHaveText(['Fmaj9', 'Fm6', 'C6/9']);
	});

	test('audio pedal retains its chosen note through harmony changes and releases it on pedal-up', async ({
		page
	}) => {
		await auditAudio(page);
		await openPiano(page);
		await root(page).getByRole('button', { name: 'Enable sound' }).click();
		await expect(root(page)).toHaveAttribute('data-sound', 'true');
		await root(page)
			.getByRole('combobox', { name: 'Painting and harmony preset' })
			.selectOption('1');
		await workbench(page);
		await root(page).getByRole('checkbox', { name: 'Hold pedal' }).check();
		await playKey(page, 61);
		await expect.poll(async () => (await readAudit(page)).started).toBe(5);
		await playKey(page, 64);
		await expect.poll(async () => (await readAudit(page)).started).toBe(10);
		const effects = root(page).locator('canvas.piano-effects');
		await expect(effects).toHaveAttribute('data-effects-held', '2');
		const before = await readAudit(page);
		await root(page).getByRole('combobox', { name: 'Current chord' }).selectOption('1');
		await expect(root(page).locator('.piano-world-top')).toContainText('G13');
		// No new note-on and no release during chord selection: the held pitch is frozen.
		expect((await readAudit(page)).started).toBe(before.started);
		expect((await readAudit(page)).stops).toBe(before.stops);
		await expect(effects).toHaveAttribute('data-effects-held', '2');
		await root(page).getByRole('checkbox', { name: 'Hold pedal' }).uncheck();
		await expect(effects).toHaveAttribute('data-effects-held', '0');
		await expect.poll(async () => (await readAudit(page)).stops).toBe(before.stops + 10);
		await expect.poll(async () => (await readAudit(page)).ended).toBe(10);
		await expect(root(page)).toHaveAttribute('data-held', '0');
		await playKey(page, 64);
		expect(Number(await root(page).getAttribute('data-schedule-ms'))).toBeLessThan(20);
		await root(page).getByRole('button', { name: 'Stop all sound' }).click();
		await expect
			.poll(async () => {
				const audit = await readAudit(page);
				return audit.started - audit.ended;
			})
			.toBe(0);
		await page
			.getByRole('navigation', { name: 'Primary navigation' })
			.getByRole('link', { name: 'Writing', exact: true })
			.click();
		await expect(root(page)).toHaveCount(0);
		await expect.poll(async () => (await readAudit(page)).closed).toBe(1);
	});

	test('freezes an inspected decision and replays identical authored rhythm under Raw and Nearest', async ({
		page
	}) => {
		await openPiano(page);
		await root(page)
			.getByRole('button', { name: /Try the space between/ })
			.click();
		await workbench(page);
		await root(page).getByRole('checkbox', { name: 'Freeze decision' }).check();
		await playKey(page, 67);
		await expect(root(page).locator('.piano-whisper')).toContainText(/C♯4 → (C4|D4)/);
		await root(page).getByRole('checkbox', { name: 'Freeze decision' }).uncheck();
		await expect(root(page).locator('.piano-whisper')).toContainText('G4 → G4');
		await root(page).getByRole('button', { name: 'Replay phrase', exact: true }).click();
		await expect(
			root(page).getByRole('button', { name: 'Replay phrase', exact: true })
		).toBeEnabled({
			timeout: 12_000
		});
		await root(page).locator('.decision-inspector details > summary').click();
		const assisted = await root(page).locator('.decision-inspector ol li').allTextContents();
		expect(assisted.length).toBeGreaterThanOrEqual(12);
		expect(assisted.some((line) => /C♯4 → (C4|D4)/.test(line))).toBe(true);
		await root(page).getByRole('button', { name: 'Raw', exact: true }).click();
		await root(page).getByRole('button', { name: 'Replay phrase', exact: true }).click();
		await expect(
			root(page).getByRole('button', { name: 'Replay phrase', exact: true })
		).toBeEnabled({
			timeout: 12_000
		});
		const raw = await root(page).locator('.decision-inspector ol li').allTextContents();
		expect(raw.some((line) => /C♯4 → C♯4/.test(line))).toBe(true);
		expect(raw.slice(0, 12).every((line) => line.includes('raw'))).toBe(true);
	});

	test('invalid settings are visible and a denied AudioContext leaves silent playing available', async ({
		page
	}) => {
		await page.addInitScript(() => {
			Object.defineProperty(window, 'AudioContext', {
				configurable: true,
				value: class {
					constructor() {
						throw new Error('Audio activation denied for this test.');
					}
				}
			});
		});
		await openPiano(page);
		await root(page).getByRole('button', { name: 'Enable sound' }).click();
		await expect(root(page).locator('.sound-status')).toContainText('Audio activation denied');
		await expect(root(page)).toHaveAttribute('data-sound', 'false');
		await playKey(page, 60);
		await expect(root(page).locator('.piano-whisper')).toContainText('C4 → C4');
		await workbench(page);
		await root(page).getByRole('spinbutton', { name: 'Musical seed' }).fill('-1');
		await playKey(page, 61);
		await expect(root(page).locator('.sound-status')).toContainText('Seed must be an integer');
		await expect(root(page)).toHaveAttribute('data-held', '0');
	});

	test('portrait phone, tablet and both themes keep touch keys local and Still remains readable', async ({
		page
	}) => {
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await openPiano(page);
		for (const width of [390, 768, 1440]) {
			await page.setViewportSize({ width, height: 1000 });
			for (const theme of ['light', 'night']) {
				await page.evaluate((value) => {
					document.documentElement.dataset.theme = value;
				}, theme);
				await expect
					.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
					.toBe(true);
				await expect(root(page)).toHaveClass(/still/);
				await playKey(page, 61);
				await expect(root(page).locator('.possibility-fan')).toContainText('%');
			}
		}
		await page.setViewportSize({ width: 390, height: 844 });
		const box = await key(page, 60).boundingBox();
		expect(box?.width).toBeGreaterThanOrEqual(35);
		await workbench(page);
		await root(page).getByRole('combobox', { name: 'Painting detail' }).selectOption('simple');
		await expect(root(page).locator('.piano-world')).toHaveClass(/simple/);
		await playKey(page, 60);
		await expect(root(page).locator('.piano-whisper')).toContainText('C4 → C4');
	});

	test('no-JavaScript reading includes a real poster, controls disabled and the worked example', async ({
		browser,
		baseURL
	}) => {
		const context = await browser.newContext({
			javaScriptEnabled: false,
			viewport: { width: 390, height: 844 }
		});
		const page = await context.newPage();
		try {
			await page.goto(`${baseURL}${article}`);
			await expect(root(page).locator('.piano-poster')).toBeVisible();
			await expect(root(page).getByRole('button', { name: 'Enable sound' })).toBeDisabled();
			await expect(root(page).locator('.piano-noscript')).toContainText('still view');
			await expect(page.locator('body')).toContainText('54.98');
			expect(
				await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)
			).toBe(true);
		} finally {
			await context.close();
		}
	});

	test('native multi-touch owns fingers separately and glissando releases the previous note', async ({
		page,
		context
	}) => {
		await openPiano(page);
		const first = await keyPoint(page, 60);
		const second = await keyPoint(page, 64);
		const third = await keyPoint(page, 67);
		const session = await context.newCDPSession(page);
		const finger = (id: number, point: { x: number; y: number }) => ({
			id,
			x: point.x,
			y: point.y,
			radiusX: 7,
			radiusY: 7,
			force: 0.65
		});
		try {
			await session.send('Input.dispatchTouchEvent', {
				type: 'touchStart',
				touchPoints: [finger(1, first)]
			});
			await expect(root(page)).toHaveAttribute('data-held', '1');
			await session.send('Input.dispatchTouchEvent', {
				type: 'touchStart',
				touchPoints: [finger(1, first), finger(2, second)]
			});
			await expect(root(page)).toHaveAttribute('data-held', '2');
			await session.send('Input.dispatchTouchEvent', {
				type: 'touchMove',
				touchPoints: [finger(1, third), finger(2, second)]
			});
			await expect(root(page)).toHaveAttribute('data-held', '2');
			await expect(key(page, 60)).not.toHaveClass(/requested/);
			await expect(key(page, 67)).toHaveClass(/requested/);
			await expect(key(page, 64)).toHaveClass(/requested/);
			await session.send('Input.dispatchTouchEvent', {
				type: 'touchEnd',
				touchPoints: []
			});
			await expect(root(page)).toHaveAttribute('data-held', '0');
			await session.send('Input.dispatchTouchEvent', {
				type: 'touchStart',
				touchPoints: [finger(2, second)]
			});
			await expect(root(page)).toHaveAttribute('data-held', '1');
			await expect(key(page, 64)).toHaveClass(/requested/);
			await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
			await expect(root(page)).toHaveAttribute('data-held', '0');
		} finally {
			await session.detach();
		}
	});

	test('a captured pointer can leave the keybed and resume its phrase without navigating beneath the finger', async ({
		page
	}) => {
		await openPiano(page);
		const first = await keyPoint(page, 60);
		const second = await keyPoint(page, 62);
		const keyboard = await root(page).locator('.keyboard-window').boundingBox();
		if (!keyboard) throw new Error('Keyboard window has no rectangle.');
		await page.mouse.move(first.x, first.y);
		await page.mouse.down();
		await expect(root(page)).toHaveAttribute('data-held', '1');
		await page.mouse.move(first.x, keyboard.y - 20);
		await expect(root(page)).toHaveAttribute('data-held', '0');
		await expect(root(page).getByRole('button', { name: /Higher octave/ })).toBeDisabled();
		await expect(
			root(page).getByRole('slider', { name: 'Keyboard overview', exact: true })
		).toBeDisabled();
		await page.mouse.move(second.x, second.y);
		await expect(root(page)).toHaveAttribute('data-held', '1');
		await expect(key(page, 62)).toHaveClass(/requested/);
		await expect(key(page, 60)).not.toHaveClass(/requested/);
		await page.mouse.up();
		await expect(root(page)).toHaveAttribute('data-held', '0');
		await expect(root(page).getByRole('button', { name: /Higher octave/ })).toBeEnabled();
	});

	test('Stop and navigation invalidate pending audio activation without resurrecting a disposed piano', async ({
		page
	}) => {
		type PendingWindow = Window & {
			__pianoPending: { made: number; closed: number; complete?: () => void };
		};
		await page.addInitScript(() => {
			const audit: { made: number; closed: number; complete?: () => void } = {
				made: 0,
				closed: 0
			};
			(window as unknown as PendingWindow).__pianoPending = audit;
			const Native = window.AudioContext;
			Object.defineProperty(window, 'AudioContext', {
				configurable: true,
				value: new Proxy(Native, {
					construct(target, args) {
						audit.made++;
						const audio = Reflect.construct(target, args) as AudioContext;
						let state = 'suspended';
						Object.defineProperty(audio, 'state', { configurable: true, get: () => state });
						audio.resume = () =>
							new Promise<void>((resolve) => {
								audit.complete = () => {
									state = 'running';
									resolve();
								};
							});
						const close = audio.close.bind(audio);
						audio.close = () => {
							audit.closed++;
							state = 'closed';
							return close();
						};
						return audio;
					}
				})
			});
		});
		await openPiano(page);
		await root(page).getByRole('button', { name: 'Enable sound' }).click();
		await expect(root(page).getByRole('button', { name: /Opening sound/ })).toBeDisabled();
		await root(page).getByRole('button', { name: 'Stop all sound' }).click();
		await page.evaluate(() => (window as unknown as PendingWindow).__pianoPending.complete?.());
		await expect(root(page)).toHaveAttribute('data-sound', 'false');
		await expect(root(page).getByRole('button', { name: 'Enable sound' })).toBeEnabled();
		await page
			.getByRole('navigation', { name: 'Primary navigation' })
			.getByRole('link', { name: 'Writing', exact: true })
			.click();
		await expect(root(page)).toHaveCount(0);
		expect(
			await page.evaluate(() => (window as unknown as PendingWindow).__pianoPending.closed)
		).toBe(1);
		await page.goBack();
		await expect(root(page).getByRole('button', { name: 'Enable sound' })).toBeEnabled();
		await root(page).getByRole('button', { name: 'Enable sound' }).click();
		await page
			.getByRole('navigation', { name: 'Primary navigation' })
			.getByRole('link', { name: 'Writing', exact: true })
			.click();
		await expect(root(page)).toHaveCount(0);
		await page.evaluate(() => (window as unknown as PendingWindow).__pianoPending.complete?.());
		expect(
			await page.evaluate(() => (window as unknown as PendingWindow).__pianoPending.closed)
		).toBe(2);
		await expect(root(page)).toHaveCount(0);
	});
});

// ---------------------------------------------------------------------------
// Tier 1–4 Shared Opaque-Box Helpers & Semantic Locators
// ---------------------------------------------------------------------------

const SYNTH_STORAGE_KEY = 'suvro-synth-patches:v1';
const ALL_THEMES = ['paper', 'light', 'night', 'high-contrast'] as const;
type SiteTheme = (typeof ALL_THEMES)[number];

type CspWindow = Window & {
	__cspViolations?: string[];
	__reportCspViolation?: (msg: string) => void;
};
type RuntimeMonitor = {
	pageErrors: string[];
	consoleErrors: string[];
	cspViolations: string[];
	failedRequests: string[];
	assertClean: () => Promise<void>;
};

async function attachRuntimeMonitor(page: Page): Promise<RuntimeMonitor> {
	const monitor: RuntimeMonitor = {
		pageErrors: [],
		consoleErrors: [],
		cspViolations: [],
		failedRequests: [],
		async assertClean() {
			try {
				const collected = await page.evaluate(
					() => (window as unknown as CspWindow).__cspViolations ?? []
				);
				for (const item of collected) {
					if (!monitor.cspViolations.includes(item)) monitor.cspViolations.push(item);
				}
			} catch {
				// Page may already be closed or mid-navigation; exposed callback still holds earlier events.
			}
			expect(monitor.pageErrors, 'uncaught pageerrors').toEqual([]);
			expect(monitor.consoleErrors, 'console.error messages').toEqual([]);
			expect(monitor.cspViolations, 'CSP securitypolicyviolation events').toEqual([]);
			expect(monitor.failedRequests, 'failed local HTTP/worker requests').toEqual([]);
		}
	};
	await page.exposeFunction('__reportCspViolation', (msg: string) => {
		if (!monitor.cspViolations.includes(msg)) monitor.cspViolations.push(msg);
	});
	await page.addInitScript(() => {
		const violations: string[] = [];
		const w = window as unknown as CspWindow;
		w.__cspViolations = violations;
		document.addEventListener('securitypolicyviolation', (event) => {
			const formatted = `${event.violatedDirective}: ${event.blockedURI || event.effectiveDirective}`;
			violations.push(formatted);
			w.__reportCspViolation?.(formatted);
		});
	});
	page.on('pageerror', (err) => monitor.pageErrors.push(err.message));
	page.on('console', (msg) => {
		if (msg.type() !== 'error') return;
		const text = msg.text();
		const locationUrl = msg.location().url;
		if (/\/_vercel\/|favicon/iu.test(`${locationUrl} ${text}`)) return;
		monitor.consoleErrors.push(text);
	});
	page.on('requestfailed', (req) => {
		const url = req.url();
		if (!url.startsWith('http://127.0.0.1') && !url.startsWith('http://localhost')) return;
		if (/\/_vercel\/|favicon/iu.test(url)) return;
		if (req.failure()?.errorText === 'net::ERR_ABORTED' && req.isNavigationRequest()) return;
		monitor.failedRequests.push(`${req.method()} ${url} — ${req.failure()?.errorText ?? 'failed'}`);
	});
	page.on('response', (res) => {
		const url = res.url();
		if (!url.startsWith('http://127.0.0.1') && !url.startsWith('http://localhost')) return;
		if (/\/_vercel\/|favicon/iu.test(url)) return;
		if (res.status() >= 400) {
			monitor.failedRequests.push(`${res.request().method()} ${url} — HTTP ${res.status()}`);
		}
	});
	await page.route('**/api/comments*', (route) =>
		route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({
				comments: [],
				total: 0,
				commentCount: 0,
				page: 1,
				pageSize: 20
			})
		})
	);
	return monitor;
}

const telemetryBar = (page: Page) =>
	root(page)
		.locator('[data-synth-telemetry]')
		.or(root(page).getByRole('region', { name: /Telemetry|Patch/i }))
		.first();

const oledScope = (page: Page) =>
	root(page)
		.locator('[data-oled-scope]')
		.or(root(page).getByRole('region', { name: /OLED|Scope|Oscilloscope/i }))
		.first();

const controlDeck = (page: Page) =>
	root(page)
		.locator('[data-synth-deck]')
		.or(root(page).getByRole('region', { name: /Control Deck|Synthesis/i }))
		.first();

const modMatrixRegion = (page: Page) =>
	root(page)
		.locator('[data-mod-matrix]')
		.or(root(page).getByRole('region', { name: /Mod(?:ulation)? Matrix/i }))
		.first();

const arpSeqRegion = (page: Page) =>
	root(page)
		.locator('[data-synth-arp]')
		.or(root(page).getByRole('region', { name: /Arp|Sequencer/i }))
		.first();

const fxRackRegion = (page: Page) =>
	root(page)
		.locator('[data-synth-fx]')
		.or(root(page).getByRole('region', { name: /FX|Effects/i }))
		.first();

const performanceBay = (page: Page) =>
	root(page)
		.locator('[data-performance-bay]')
		.or(root(page).getByRole('region', { name: /Performance/i }))
		.first();

const mixerFader = (deck: Locator, channel: 'Osc\\s*1' | 'Osc\\s*2' | 'Sub' | 'Noise') =>
	deck
		.getByRole('slider', {
			name: new RegExp(`^(?:(?:Source\\s*)?Mix\\s*)?${channel}(?:\\s*(?:Mix|Level))?$`, 'i')
		})
		.first();

async function enableSound(page: Page) {
	await root(page).getByRole('button', { name: 'Enable sound' }).click();
	await expect(root(page)).toHaveAttribute('data-sound', 'true');
}

async function readSlider(slider: Locator) {
	const [minRaw, maxRaw, nowRaw, text] = await Promise.all([
		slider.getAttribute('aria-valuemin'),
		slider.getAttribute('aria-valuemax'),
		slider.getAttribute('aria-valuenow'),
		slider.getAttribute('aria-valuetext')
	]);
	expect(minRaw?.trim().length ?? 0, 'aria-valuemin must be non-empty').toBeGreaterThan(0);
	expect(maxRaw?.trim().length ?? 0, 'aria-valuemax must be non-empty').toBeGreaterThan(0);
	expect(nowRaw?.trim().length ?? 0, 'aria-valuenow must be non-empty').toBeGreaterThan(0);
	const min = Number(minRaw);
	const max = Number(maxRaw);
	const now = Number(nowRaw);
	expect(Number.isFinite(min), 'aria-valuemin must be finite').toBe(true);
	expect(Number.isFinite(max), 'aria-valuemax must be finite').toBe(true);
	expect(Number.isFinite(now), 'aria-valuenow must be finite').toBe(true);
	return { min, max, now, text: text ?? '' };
}

async function canvasSnapshot(canvas: Locator) {
	return canvas.evaluate((element) => {
		const el = element as HTMLCanvasElement;
		const ctx = el.getContext('2d');
		if (!ctx || el.width === 0 || el.height === 0) {
			return { width: el.width, height: el.height, nonZero: 0, brightPixels: 0, checksum: 0 };
		}
		const bytes = ctx.getImageData(0, 0, el.width, el.height).data;
		let nonZero = 0;
		let brightPixels = 0;
		let checksum = 0;
		for (let i = 0; i < bytes.length; i += 4) {
			const lum = bytes[i] + bytes[i + 1] + bytes[i + 2];
			if (bytes[i + 3] > 0 && lum > 0) nonZero++;
			if (bytes[i + 3] > 0 && lum > 40) brightPixels++;
			checksum =
				(checksum + bytes[i] * 3 + bytes[i + 1] * 5 + bytes[i + 2] * 7 + bytes[i + 3]) >>> 0;
		}
		return { width: el.width, height: el.height, nonZero, brightPixels, checksum };
	});
}

async function setThemeViaDom(page: Page, theme: SiteTheme) {
	await page.evaluate((value) => {
		document.documentElement.dataset.theme = value;
		document.documentElement.dataset.themePreference = value;
		document.documentElement.classList.toggle('dark', value === 'night');
	}, theme);
	await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

type MidiMockMessageEvent = Event & { data: Uint8Array };
type MidiMockWindow = Window & {
	__midiMock: {
		requestCount: number;
		lastOptions: { sysex?: boolean } | undefined;
		emit: (bytes: number[]) => void;
	};
};

async function installMidiMock(
	page: Page,
	mode: 'supported' | 'denied' | 'unsupported' = 'supported'
) {
	await page.addInitScript((mockMode) => {
		const state: MidiMockWindow['__midiMock'] = {
			requestCount: 0,
			lastOptions: undefined,
			emit: () => {}
		};
		(window as unknown as MidiMockWindow).__midiMock = state;

		if (mockMode === 'unsupported') {
			Object.defineProperty(Navigator.prototype, 'requestMIDIAccess', {
				configurable: true,
				value: undefined
			});
			return;
		}

		const listeners = new Set<(ev: MidiMockMessageEvent) => void>();
		const inputObj = {
			id: 'mock-studio-controller',
			name: 'Mock Studio 88',
			manufacturer: 'TestBench',
			type: 'input',
			state: 'connected',
			connection: 'open',
			onmidimessage: null as ((ev: MidiMockMessageEvent) => void) | null,
			addEventListener(type: string, cb: EventListenerOrEventListenerObject) {
				if (type === 'midimessage' && typeof cb === 'function') {
					listeners.add(cb as (ev: MidiMockMessageEvent) => void);
				}
			},
			removeEventListener(type: string, cb: EventListenerOrEventListenerObject) {
				if (type === 'midimessage' && typeof cb === 'function') {
					listeners.delete(cb as (ev: MidiMockMessageEvent) => void);
				}
			},
			open() {
				return Promise.resolve(this);
			},
			close() {
				return Promise.resolve(this);
			}
		};

		state.emit = (bytes: number[]) => {
			const ev = Object.assign(new Event('midimessage'), {
				data: new Uint8Array(bytes)
			}) as MidiMockMessageEvent;
			inputObj.onmidimessage?.(ev);
			for (const cb of listeners) cb(ev);
		};

		Object.defineProperty(Navigator.prototype, 'requestMIDIAccess', {
			configurable: true,
			value: (options?: { sysex?: boolean }) => {
				state.requestCount++;
				state.lastOptions = options;
				if (mockMode === 'denied') {
					return Promise.reject(new DOMException('MIDI access denied by test', 'NotAllowedError'));
				}
				return Promise.resolve({
					inputs: new Map([[inputObj.id, inputObj]]),
					outputs: new Map(),
					sysexEnabled: false,
					onstatechange: null,
					addEventListener() {},
					removeEventListener() {}
				});
			}
		});
	}, mode);
}

async function captureExportedWavBytes(page: Page, triggerStopExport: () => Promise<void>) {
	const downloadPromise = page.waitForEvent('download', { timeout: 6_000 }).catch(() => null);
	await triggerStopExport();
	const download = await downloadPromise;
	if (download) {
		const stream = await download.createReadStream();
		if (!stream) throw new Error('Download had no readable stream.');
		const chunks: Buffer[] = [];
		for await (const chunk of stream) {
			chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
		}
		return Array.from(Buffer.concat(chunks));
	}
	const blobLink = root(page).locator('a[download][href^="blob:"], audio[src^="blob:"]').first();
	await expect(blobLink).toBeVisible({ timeout: 10_000 });
	const blobUrl = await blobLink.evaluate(
		(el) => el.getAttribute('href') ?? el.getAttribute('src') ?? ''
	);
	expect(blobUrl.startsWith('blob:')).toBe(true);
	return page.evaluate(async (url) => {
		const res = await fetch(url);
		return Array.from(new Uint8Array(await res.arrayBuffer()));
	}, blobUrl);
}

function assertValidRiffWave(bytes: number[]) {
	expect(bytes.length).toBeGreaterThan(44);
	const magic = String.fromCharCode(...bytes.slice(0, 4));
	const format = String.fromCharCode(...bytes.slice(8, 12));
	expect(magic).toBe('RIFF');
	expect(format).toBe('WAVE');
}

// ---------------------------------------------------------------------------
// Tier 1: Feature Coverage
// ---------------------------------------------------------------------------

test.describe('Tier 1: Feature Coverage', () => {
	test('ARIA sliders expose role="slider" semantics, bounds and formatted aria-valuetext across knobs and vertical faders', async ({
		page
	}) => {
		const monitor = await attachRuntimeMonitor(page);
		await openPiano(page);

		const deck = controlDeck(page);
		const cutoff = deck.getByRole('slider', { name: /Cutoff/i });
		const resonance = deck.getByRole('slider', { name: /Resonance/i });
		const osc1Mix = mixerFader(deck, 'Osc\\s*1');
		const attack = deck.getByRole('slider', { name: /Attack/i }).first();
		const bpm = arpSeqRegion(page).getByRole('slider', { name: /BPM/i });

		for (const slider of [cutoff, resonance, osc1Mix, attack, bpm]) {
			await expect(slider).toBeVisible();
			await expect(slider).toHaveAttribute('tabindex', '0');
			const { min, max, now, text } = await readSlider(slider);
			expect(max).toBeGreaterThan(min);
			expect(now).toBeGreaterThanOrEqual(min);
			expect(now).toBeLessThanOrEqual(max);
			expect(text.trim().length).toBeGreaterThan(0);
		}
		const cutoffState = await readSlider(cutoff);
		expect(cutoffState.min).toBe(20);
		expect(cutoffState.max).toBe(18000);
		expect(cutoffState.text).toMatch(/Hz|kHz/i);

		await monitor.assertClean();
	});

	test('ARIA sliders respond to Arrow keys and PageUp/PageDown with larger coarse steps', async ({
		page
	}) => {
		const monitor = await attachRuntimeMonitor(page);
		await openPiano(page);

		const deck = controlDeck(page);
		const resonance = deck.getByRole('slider', { name: /Resonance/i });
		await resonance.focus();
		await resonance.press('Home');
		const atMin = (await readSlider(resonance)).now;
		await resonance.press('ArrowRight');
		const afterArrow = (await readSlider(resonance)).now;
		expect(afterArrow).toBeGreaterThan(atMin);

		await resonance.press('PageUp');
		const afterPageUp = (await readSlider(resonance)).now;
		expect(afterPageUp - afterArrow).toBeGreaterThan(afterArrow - atMin);

		await resonance.press('ArrowLeft');
		const afterArrowLeft = (await readSlider(resonance)).now;
		expect(afterArrowLeft).toBeLessThan(afterPageUp);

		const attack = deck.getByRole('slider', { name: /Attack/i }).first();
		await attack.focus();
		const attackStart = (await readSlider(attack)).now;
		await attack.press('ArrowUp');
		const attackUp = (await readSlider(attack)).now;
		expect(attackUp).toBeGreaterThan(attackStart);
		await attack.press('ArrowDown');
		const attackDown = (await readSlider(attack)).now;
		expect(attackDown).toBeLessThan(attackUp);

		await monitor.assertClean();
	});

	test('ARIA sliders support vertical pointer drag and double-click resets to default', async ({
		page
	}) => {
		const monitor = await attachRuntimeMonitor(page);
		await openPiano(page);

		const cutoff = controlDeck(page).getByRole('slider', { name: /Cutoff/i });
		const defaultVal = (await readSlider(cutoff)).now;
		const box = await cutoff.boundingBox();
		if (!box) throw new Error('Filter Cutoff knob has no bounding box.');

		// Preset 01 starts at max Cutoff (18000 Hz), so drag downward to verify vertical tracking.
		const cx = box.x + box.width / 2;
		const cy = box.y + box.height / 2;
		await page.mouse.move(cx, cy);
		await page.mouse.down();
		await page.mouse.move(cx, cy + 70, { steps: 6 });
		await page.mouse.up();
		const draggedVal = (await readSlider(cutoff)).now;
		expect(draggedVal).toBeLessThan(defaultVal);
		expect(draggedVal).not.toBe(defaultVal);

		await cutoff.dblclick();
		await expect.poll(async () => (await readSlider(cutoff)).now).toBeCloseTo(defaultVal, 1);

		await monitor.assertClean();
	});

	test('ARIA slider focus isolates Arrow and QWERTY keys from triggering piano notes', async ({
		page
	}) => {
		const monitor = await attachRuntimeMonitor(page);
		await openPiano(page);

		const cutoff = controlDeck(page).getByRole('slider', { name: /Cutoff/i });
		await cutoff.focus();
		await expect(cutoff).toBeFocused();
		await page.keyboard.press('ArrowLeft');
		await page.keyboard.press('a');
		await page.keyboard.press('w');
		await page.keyboard.press('d');
		await expect(root(page)).toHaveAttribute('data-held', '0');
		await expect(cutoff).toBeFocused();

		await monitor.assertClean();
	});

	test('adjusting a Knob or VerticalFader displays transient numeric echo in OledScope', async ({
		page
	}) => {
		const monitor = await attachRuntimeMonitor(page);
		await openPiano(page);

		const cutoff = controlDeck(page).getByRole('slider', { name: /Cutoff/i });
		await cutoff.focus();
		await cutoff.press('PageDown');
		expect((await readSlider(cutoff)).now).toBeLessThan(18000);
		await expect(oledScope(page)).toContainText(/Cutoff/i);
		await expect(oledScope(page)).toContainText(/Hz|kHz/i);

		const attack = controlDeck(page)
			.getByRole('slider', { name: /Attack/i })
			.first();
		await attack.focus();
		await attack.press('PageUp');
		await expect(oledScope(page)).toContainText(/Attack/i);

		await monitor.assertClean();
	});

	test('loads 01 Forgiving Grand by default and preserves 5/10 oscillator audit invariant', async ({
		page
	}) => {
		const monitor = await attachRuntimeMonitor(page);
		await auditAudio(page);
		await openPiano(page);
		await enableSound(page);

		const bank = telemetryBar(page).getByRole('combobox', { name: /Patch|Preset/i });
		await expect(bank).toContainText(/01.*Forgiving Grand/i);

		await playKey(page, 60);
		await expect.poll(async () => (await readAudit(page)).started).toBe(5);
		await playKey(page, 64);
		await expect.poll(async () => (await readAudit(page)).started).toBe(10);

		await root(page).getByRole('button', { name: 'Stop all sound' }).click();
		await expect
			.poll(async () => {
				const a = await readAudit(page);
				return a.started - a.ended;
			})
			.toBe(0);

		await monitor.assertClean();
	});

	test('patch bank selector and < > buttons step through 14+ factory presets and update deck values', async ({
		page
	}) => {
		const monitor = await attachRuntimeMonitor(page);
		await openPiano(page);

		const bank = telemetryBar(page).getByRole('combobox', { name: /Patch|Preset/i });
		const optionCount = await bank.locator('option').count();
		expect(optionCount).toBeGreaterThanOrEqual(14);
		const initialValue = await bank.inputValue();
		const initialCutoff = (
			await readSlider(controlDeck(page).getByRole('slider', { name: /Cutoff/i }))
		).now;

		await telemetryBar(page)
			.getByRole('button', { name: /Next (patch|preset)/i })
			.click();
		await expect.poll(() => bank.inputValue()).not.toBe(initialValue);

		// Step through several presets to verify Cutoff or patch parameters differ from Preset 01.
		let sawDifferentCutoff = false;
		for (let i = 0; i < 4; i++) {
			const c = (await readSlider(controlDeck(page).getByRole('slider', { name: /Cutoff/i }))).now;
			if (Math.abs(c - initialCutoff) > 1) {
				sawDifferentCutoff = true;
				break;
			}
			await telemetryBar(page)
				.getByRole('button', { name: /Next (patch|preset)/i })
				.click();
		}
		expect(sawDifferentCutoff).toBe(true);

		await telemetryBar(page)
			.getByRole('button', { name: /Previous (patch|preset)/i })
			.click();
		await bank.selectOption(initialValue);
		await expect(bank).toHaveValue(initialValue);

		await monitor.assertClean();
	});

	test('Poly, Lead, Bass and Pad audition pills switch category patches cleanly', async ({
		page
	}) => {
		const monitor = await attachRuntimeMonitor(page);
		await openPiano(page);

		const audition = telemetryBar(page).getByRole('group', { name: /Audition/i });
		const bank = telemetryBar(page).getByRole('combobox', { name: /Patch|Preset/i });
		const seenIds = new Set<string>();

		for (const pillName of ['Poly', 'Lead', 'Bass', 'Pad'] as const) {
			const pill = audition.getByRole('button', { name: pillName, exact: true });
			await pill.click();
			await expect(pill).toHaveAttribute('aria-pressed', 'true');
			seenIds.add(await bank.inputValue());
		}
		expect(seenIds.size).toBeGreaterThanOrEqual(3);

		await enableSound(page);
		await audition.getByRole('button', { name: 'Lead', exact: true }).click();
		await playKey(page, 64);
		await root(page).getByRole('button', { name: 'Stop all sound' }).click();

		await monitor.assertClean();
	});

	test('Voice Mode switches Poly, Mono, Legato and Unison with Glide slider control', async ({
		page
	}) => {
		const monitor = await attachRuntimeMonitor(page);
		await auditAudio(page);
		await openPiano(page);
		await enableSound(page);

		const voiceControl = telemetryBar(page)
			.getByRole('combobox', { name: /Voice mode/i })
			.or(telemetryBar(page).getByRole('group', { name: /Voice mode/i }))
			.first();

		const selectVoiceMode = async (mode: 'Poly' | 'Mono' | 'Legato' | 'Unison') => {
			const tag = await voiceControl.evaluate((el) => el.tagName.toLowerCase());
			if (tag === 'select') {
				await voiceControl.selectOption({ label: mode });
			} else {
				await voiceControl.getByRole('button', { name: mode, exact: true }).click();
			}
		};

		const glide = telemetryBar(page)
			.getByRole('slider', { name: /Glide/i })
			.or(performanceBay(page).getByRole('slider', { name: /Glide/i }))
			.first();
		await glide.focus();
		await glide.press('PageUp');
		expect((await readSlider(glide)).now).toBeGreaterThan(0);

		await selectVoiceMode('Mono');
		await playKey(page, 60);
		await playKey(page, 64);
		expect((await readAudit(page)).started).toBeGreaterThan(0);

		await selectVoiceMode('Legato');
		await playKey(page, 65);
		await selectVoiceMode('Unison');
		await playKey(page, 67);
		await selectVoiceMode('Poly');

		await root(page).getByRole('button', { name: 'Stop all sound' }).click();
		await expect
			.poll(async () => {
				const a = await readAudit(page);
				return a.started - a.ended;
			})
			.toBe(0);

		await monitor.assertClean();
	});

	test('custom patch saves to localStorage across reload and shares via #patch= hash independently of Assist', async ({
		page
	}) => {
		const monitor = await attachRuntimeMonitor(page);
		await openPiano(page);
		await page.evaluate((k) => localStorage.removeItem(k), SYNTH_STORAGE_KEY);

		const deck = controlDeck(page);
		const osc1Wave = deck.getByRole('combobox', { name: /Osc\s*1\s*wave/i });
		await osc1Wave.selectOption({ label: 'Saw' });
		const cutoff = deck.getByRole('slider', { name: /Cutoff/i });
		await cutoff.focus();
		await cutoff.press('PageDown');
		await cutoff.press('PageDown');
		const editedCutoff = (await readSlider(cutoff)).now;
		expect(editedCutoff).toBeLessThan(18000);

		const reverbSelect = fxRackRegion(page).getByRole('combobox', { name: /Reverb|Room/i });
		await reverbSelect.selectOption({ label: 'Hall' });

		const patchNameInput = telemetryBar(page).getByRole('textbox', { name: /Patch name/i });
		await patchNameInput.fill('Studio Test Pad');
		await telemetryBar(page)
			.getByRole('button', { name: /Save patch/i })
			.click();

		const stored = await page.evaluate((k) => localStorage.getItem(k), SYNTH_STORAGE_KEY);
		expect(stored).toContain('Studio Test Pad');

		await page.reload();
		await expect(root(page)).toBeVisible();
		await expect(root(page).getByRole('button', { name: 'Enable sound' })).toBeEnabled();
		const bank = telemetryBar(page).getByRole('combobox', { name: /Patch|Preset/i });
		await expect(bank).toContainText('Studio Test Pad');

		// Share / encode #patch= URL hash and verify cold-load restoration isolated from localStorage.
		const shareBtn = telemetryBar(page).getByRole('button', { name: /Share|Copy.*patch/i });
		await shareBtn.click();
		await expect.poll(() => page.evaluate(() => window.location.hash)).toMatch(/^#patch=/);
		const patchHash = await page.evaluate(() => window.location.hash);

		await root(page).getByRole('button', { name: 'Raw', exact: true }).click();
		await page.evaluate((k) => localStorage.removeItem(k), SYNTH_STORAGE_KEY);
		await page.goto('about:blank');
		await page.goto(`${article}${patchHash}`);
		await expect(root(page)).toBeVisible();
		await expect(root(page).getByRole('button', { name: 'Enable sound' })).toBeEnabled();

		const restoredCutoff = (
			await readSlider(controlDeck(page).getByRole('slider', { name: /Cutoff/i }))
		).now;
		expect(restoredCutoff).toBeCloseTo(editedCutoff, 0);
		await expect(controlDeck(page).getByRole('combobox', { name: /Osc\s*1\s*wave/i })).toHaveValue(
			/saw/i
		);
		await expect(fxRackRegion(page).getByRole('combobox', { name: /Reverb|Room/i })).toHaveValue(
			/hall/i
		);
		await expect(root(page).getByRole('button', { name: 'Nearest', exact: true })).toHaveAttribute(
			'aria-pressed',
			'true'
		);

		await monitor.assertClean();
	});

	test('ControlDeck updates Osc 1/2 waveforms, Ring Mod, Sub/Noise and 4-Ch Source Mixer faders', async ({
		page
	}) => {
		const monitor = await attachRuntimeMonitor(page);
		await auditAudio(page);
		await openPiano(page);
		await enableSound(page);

		const deck = controlDeck(page);
		const osc1Wave = deck.getByRole('combobox', { name: /Osc\s*1\s*wave/i });
		await osc1Wave.selectOption({ label: 'Supersaw' });
		const shape = deck.getByRole('slider', { name: /Shape|PWM|FM/i }).first();
		await shape.focus();
		await shape.press('PageUp');

		const ringMod = deck
			.getByRole('button', { name: /Ring Mod/i })
			.or(deck.getByRole('checkbox', { name: /Ring Mod/i }));
		await ringMod.first().click();

		// Sub (-1/-2 Oct, Sine/Square) & Noise (White/Pink) controls.
		const subOct = deck
			.getByRole('combobox', { name: /Sub\s*Oct/i })
			.or(deck.getByRole('button', { name: /-2\s*Oct|Sub.*-2/i }))
			.first();
		if ((await subOct.evaluate((el) => el.tagName.toLowerCase())) === 'select') {
			await subOct.selectOption({ index: 1 });
		} else {
			await subOct.click();
		}
		const subWave = deck
			.getByRole('combobox', { name: /Sub\s*Wave/i })
			.or(deck.getByRole('button', { name: /Sub.*Sq|Square/i }))
			.first();
		if ((await subWave.evaluate((el) => el.tagName.toLowerCase())) === 'select') {
			await subWave.selectOption({ label: 'Square' });
		} else {
			await subWave.click();
		}
		const noiseType = deck
			.getByRole('combobox', { name: /Noise\s*(Type|Color|Colour)?/i })
			.or(deck.getByRole('button', { name: /Pink/i }))
			.first();
		if ((await noiseType.evaluate((el) => el.tagName.toLowerCase())) === 'select') {
			await noiseType.selectOption({ label: 'Pink' });
		} else {
			await noiseType.click();
		}

		// 4-Ch Source Mixer faders: Osc 1 starts at max (1), Osc 2/Sub/Noise start at 0.
		const osc1Fader = mixerFader(deck, 'Osc\\s*1');
		await osc1Fader.focus();
		await osc1Fader.press('PageDown');
		expect((await readSlider(osc1Fader)).now).toBeLessThan(1);

		for (const ch of ['Osc\\s*2', 'Sub', 'Noise'] as const) {
			const fader = mixerFader(deck, ch);
			await fader.focus();
			await fader.press('PageUp');
			expect((await readSlider(fader)).now).toBeGreaterThan(0);
		}

		await playKey(page, 60);
		await expect.poll(async () => (await readAudit(page)).started).toBeGreaterThan(1);
		await root(page).getByRole('button', { name: 'Stop all sound' }).click();
		await expect
			.poll(async () => {
				const a = await readAudit(page);
				return a.started - a.ended;
			})
			.toBe(0);

		await monitor.assertClean();
	});

	test('ControlDeck switches Multimode Filter slopes, Pre-Drive/EnvAmt/KeyTrack and Dual ADSR faders', async ({
		page
	}) => {
		const monitor = await attachRuntimeMonitor(page);
		await openPiano(page);

		const deck = controlDeck(page);
		const filterType = deck
			.getByRole('combobox', { name: /Filter (mode|type)/i })
			.or(deck.getByRole('group', { name: /Filter (mode|type)/i }))
			.first();
		const isSelect = (await filterType.evaluate((el) => el.tagName.toLowerCase())) === 'select';

		for (const slope of ['LP12', 'LP24', 'BP12', 'HP12']) {
			if (isSelect) {
				await filterType.selectOption({ label: slope });
				await expect(filterType).toHaveValue(new RegExp(slope, 'i'));
			} else {
				const btn = filterType.getByRole('button', { name: new RegExp(slope, 'i') });
				await btn.click();
				await expect(btn).toHaveAttribute('aria-pressed', 'true');
			}
		}

		for (const filterParam of [/Pre-?Drive|Filter\s*Drive/i, /Env\s*Amt/i, /Key\s*Track/i]) {
			const slider = deck.getByRole('slider', { name: filterParam }).first();
			const before = (await readSlider(slider)).now;
			await slider.focus();
			await slider.press('PageUp');
			expect((await readSlider(slider)).now).toBeGreaterThan(before);
		}

		for (const envTab of ['Amp', 'Filter'] as const) {
			const tabBtn = deck
				.getByRole('tab', { name: envTab })
				.or(deck.getByRole('button', { name: new RegExp(`^${envTab}(?:\\s*Env)?$`, 'i') }))
				.first();
			await tabBtn.click();
			await expect
				.poll(
					async () =>
						(await tabBtn.getAttribute('aria-selected')) === 'true' ||
						(await tabBtn.getAttribute('aria-pressed')) === 'true'
				)
				.toBe(true);

			for (const stage of [/Attack/i, /Decay/i, /Sustain/i, /Release/i]) {
				const fader = deck.getByRole('slider', { name: stage }).first();
				const beforeState = await readSlider(fader);
				await fader.focus();
				if (beforeState.now >= beforeState.max) {
					await fader.press('ArrowDown');
					expect((await readSlider(fader)).now).toBeLessThan(beforeState.now);
				} else {
					await fader.press('ArrowUp');
					expect((await readSlider(fader)).now).toBeGreaterThan(beforeState.now);
				}
			}
		}

		await monitor.assertClean();
	});

	test('ControlDeck configures LFO 1 and LFO 2 Wave, Rate, Depth, BPM Sync and Key Sync', async ({
		page
	}) => {
		const monitor = await attachRuntimeMonitor(page);
		await openPiano(page);

		const deck = controlDeck(page);
		for (const lfoNum of [1, 2] as const) {
			const wave = deck.getByRole('combobox', { name: new RegExp(`LFO\\s*${lfoNum}.*Wave`, 'i') });
			await wave.selectOption({ label: lfoNum === 1 ? 'Saw' : 'Square' });
			await expect(wave).toHaveValue(lfoNum === 1 ? /saw/i : /sq/i);

			const rate = deck.getByRole('slider', { name: new RegExp(`LFO\\s*${lfoNum}.*Rate`, 'i') });
			const rateBefore = (await readSlider(rate)).now;
			await rate.focus();
			await rate.press('PageUp');
			expect((await readSlider(rate)).now).toBeGreaterThan(rateBefore);

			const depth = deck.getByRole('slider', { name: new RegExp(`LFO\\s*${lfoNum}.*Depth`, 'i') });
			const depthBefore = (await readSlider(depth)).now;
			await depth.focus();
			await depth.press('PageUp');
			expect((await readSlider(depth)).now).toBeGreaterThan(depthBefore);

			for (const syncKind of ['BPM\\s*Sync', 'Key\\s*Sync'] as const) {
				const toggle = deck
					.getByRole('button', { name: new RegExp(`LFO\\s*${lfoNum}.*${syncKind}`, 'i') })
					.or(
						deck.getByRole('checkbox', { name: new RegExp(`LFO\\s*${lfoNum}.*${syncKind}`, 'i') })
					)
					.first();
				const wasPressed = await toggle.getAttribute('aria-pressed');
				await toggle.click();
				if (wasPressed !== null) {
					await expect(toggle).toHaveAttribute(
						'aria-pressed',
						wasPressed === 'true' ? 'false' : 'true'
					);
				} else {
					await expect(toggle).toBeChecked();
				}
			}
		}

		await monitor.assertClean();
	});

	test('ModMatrix 5x5 interactive LED grid toggles routes and sets bipolar positive/negative depth', async ({
		page
	}) => {
		const monitor = await attachRuntimeMonitor(page);
		await openPiano(page);

		const mod = modMatrixRegion(page);
		await expect(mod).toBeVisible();
		const cells = mod
			.locator('[data-mod-cell]')
			.or(mod.getByRole('button', { name: /LFO|Env|Vel|Mod/i }));
		expect(await cells.count()).toBeGreaterThanOrEqual(25);

		const routeCell = mod.getByRole('button', { name: /LFO\s*1.*Cutoff/i });
		await routeCell.click();

		const depth = mod.getByRole('slider', { name: /Mod depth|Depth/i });
		await depth.focus();
		await depth.press('End');
		const maxDepth = (await readSlider(depth)).now;
		expect(maxDepth).toBeGreaterThan(0);
		await expect(routeCell).toHaveAttribute('data-polarity', 'positive');

		await depth.press('Home');
		const minDepth = (await readSlider(depth)).now;
		expect(minDepth).toBeLessThan(0);
		await expect(routeCell).toHaveAttribute('data-polarity', 'negative');

		await depth.dblclick();
		await expect.poll(async () => (await readSlider(depth)).now).toBe(0);

		await monitor.assertClean();
	});

	test('FxRack configures Chorus, Bit-Depth Crush & Drive, Stereo Multi-Delay and Procedural Reverb', async ({
		page
	}) => {
		const monitor = await attachRuntimeMonitor(page);
		await auditAudio(page);
		await openPiano(page);
		await enableSound(page);

		const fx = fxRackRegion(page);
		const bypassButtons = fx.getByRole('button', { name: /Bypass/i });
		const bypassCount = await bypassButtons.count();
		for (let i = 0; i < bypassCount; i++) {
			const btn = bypassButtons.nth(i);
			if ((await btn.getAttribute('aria-pressed')) === 'true') {
				await btn.click();
				await expect(btn).toHaveAttribute('aria-pressed', 'false');
			}
		}

		const reverbSelect = fx.getByRole('combobox', { name: /Reverb|Room/i });
		for (const room of ['Room', 'Studio', 'Chamber', 'Hall', 'Canyon']) {
			await reverbSelect.selectOption({ label: room });
		}

		const crushBits = fx.getByRole('slider', { name: /Bit/i });
		await crushBits.focus();
		await crushBits.press('ArrowDown');
		expect((await readSlider(crushBits)).now).toBeLessThan(16);

		const delayMix = fx.getByRole('slider', { name: /Delay.*Mix/i });
		await delayMix.focus();
		await delayMix.press('PageUp');
		expect((await readSlider(delayMix)).now).toBeGreaterThan(0);

		const chorusMix = fx.getByRole('slider', { name: /Chorus.*Mix/i });
		await chorusMix.focus();
		await chorusMix.press('PageUp');
		expect((await readSlider(chorusMix)).now).toBeGreaterThan(0);

		await playKey(page, 60);
		await expect.poll(async () => (await readAudit(page)).started).toBeGreaterThan(0);
		await root(page).getByRole('button', { name: 'Stop all sound' }).click();
		await expect
			.poll(async () => {
				const a = await readAudit(page);
				return a.started - a.ended;
			})
			.toBe(0);

		await monitor.assertClean();
	});

	test('OledScope switches Oscilloscope, Spectrum and Filter+ADSR Curve modes and draws live activity', async ({
		page
	}) => {
		const monitor = await attachRuntimeMonitor(page);
		await openPiano(page);
		await enableSound(page);

		const scope = oledScope(page);
		const canvas = scope.locator('canvas').first();
		await expect(canvas).toBeVisible();
		expect(await canvas.evaluate((el) => (el as HTMLCanvasElement).width)).toBeGreaterThan(0);

		for (const modeName of [/Oscilloscope|Scope/i, /Spectrum|FFT/i, /Curve|Filter.*ADSR/i]) {
			await scope.getByRole('button', { name: modeName }).click();
			const idleSnap = await canvasSnapshot(canvas);
			const pt = await keyPoint(page, 60);
			await page.mouse.move(pt.x, pt.y);
			await page.mouse.down();
			await expect
				.poll(async () => {
					const snap = await canvasSnapshot(canvas);
					return snap.width > 0 && snap.height > 0 && snap.brightPixels > 0;
				})
				.toBe(true);
			if (!/Curve/i.test(modeName.source)) {
				await expect
					.poll(async () => (await canvasSnapshot(canvas)).checksum)
					.not.toBe(idleSnap.checksum);
			}
			await page.mouse.up();
		}

		await root(page).getByRole('button', { name: 'Stop all sound' }).click();
		await monitor.assertClean();
	});

	test('ArpSequencerBar Play/Stop transport advances steps and schedules lookahead audio notes', async ({
		page
	}) => {
		const monitor = await attachRuntimeMonitor(page);
		await auditAudio(page);
		await openPiano(page);
		await enableSound(page);

		const arp = arpSeqRegion(page);
		const holdToggle = arp
			.getByRole('button', { name: /Hold|Latch/i })
			.or(arp.getByRole('checkbox', { name: /Hold|Latch/i }))
			.first();
		await holdToggle.click();

		await playKey(page, 60);
		await playKey(page, 64);
		await playKey(page, 67);
		const beforeArp = (await readAudit(page)).started;

		await arp.getByRole('button', { name: /Play|Start/i }).click();
		await expect.poll(async () => (await readAudit(page)).started).toBeGreaterThan(beforeArp + 5);

		await arp.getByRole('button', { name: /Stop/i }).click();
		const stoppedCount = (await readAudit(page)).started;
		await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 250)));
		expect((await readAudit(page)).started).toBe(stoppedCount);

		await root(page).getByRole('button', { name: 'Stop all sound' }).click();
		await expect
			.poll(async () => {
				const a = await readAudit(page);
				return a.started - a.ended;
			})
			.toBe(0);

		await monitor.assertClean();
	});

	test('ArpSequencerBar BPM 40-220 changes note scheduling cadence cleanly', async ({ page }) => {
		const monitor = await attachRuntimeMonitor(page);
		await auditAudio(page);
		await openPiano(page);
		await enableSound(page);

		const arp = arpSeqRegion(page);
		await arp
			.getByRole('button', { name: /Hold|Latch/i })
			.or(arp.getByRole('checkbox', { name: /Hold|Latch/i }))
			.first()
			.click();
		await playKey(page, 60);
		await playKey(page, 67);

		const bpm = arp.getByRole('slider', { name: /BPM/i });
		await bpm.focus();
		await bpm.press('Home');
		expect((await readSlider(bpm)).now).toBe(40);

		await arp.getByRole('button', { name: /Play|Start/i }).click();
		const startSlow = (await readAudit(page)).started;
		await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 750)));
		const slowDelta = (await readAudit(page)).started - startSlow;

		await bpm.focus();
		await bpm.press('End');
		expect((await readSlider(bpm)).now).toBe(220);
		const startFast = (await readAudit(page)).started;
		await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 750)));
		const fastDelta = (await readAudit(page)).started - startFast;

		expect(fastDelta).toBeGreaterThan(slowDelta);
		await root(page).getByRole('button', { name: 'Stop all sound' }).click();

		await monitor.assertClean();
	});

	test('ArpSequencerBar switches Arp Mode (Up/Down/Up+Down/Random/Chord/Order) and Octave 1-3', async ({
		page
	}) => {
		const monitor = await attachRuntimeMonitor(page);
		await openPiano(page);

		const arp = arpSeqRegion(page);
		const modeSelect = arp.getByRole('combobox', { name: /Arp mode|Mode/i });
		for (const mode of ['Up', 'Down', 'Up+Down', 'Random', 'Chord', 'Order']) {
			await modeSelect.selectOption({ label: mode });
		}

		const octControl = arp
			.getByRole('combobox', { name: /Oct/i })
			.or(arp.getByRole('slider', { name: /Oct/i }))
			.first();
		const tag = await octControl.evaluate((el) => el.tagName.toLowerCase());
		if (tag === 'select') {
			await octControl.selectOption('3');
		} else {
			await octControl.focus();
			await octControl.press('End');
			expect((await readSlider(octControl)).now).toBe(3);
		}

		await monitor.assertClean();
	});

	test('ArpSequencerBar 16-step LED ribbon toggles steps and edits Note, Gate/Tie and Accent inline', async ({
		page
	}) => {
		const monitor = await attachRuntimeMonitor(page);
		await openPiano(page);

		const arp = arpSeqRegion(page);
		const steps = arp.locator('[data-step-index]');
		await expect(steps).toHaveCount(16);

		const step3 = arp.locator('[data-step-index="2"]');
		const wasActive = await step3.getAttribute('aria-pressed');
		await step3.click();
		await expect(step3).toHaveAttribute('aria-pressed', wasActive === 'true' ? 'false' : 'true');

		const noteOffset = arp
			.getByRole('slider', { name: /Step.*(?:Note|Offset|Pitch)|Note\s*Offset/i })
			.or(arp.getByRole('spinbutton', { name: /Step.*(?:Note|Offset|Pitch)|Note\s*Offset/i }))
			.or(arp.getByRole('combobox', { name: /Step.*(?:Note|Offset|Pitch)|Note\s*Offset/i }))
			.first();
		const noteRole = await noteOffset.evaluate(
			(el) => el.getAttribute('role') ?? el.tagName.toLowerCase()
		);
		if (noteRole === 'select') {
			const beforeVal = await noteOffset.inputValue();
			await noteOffset.selectOption({ index: 1 });
			expect(await noteOffset.inputValue()).not.toBe(beforeVal);
		} else if (noteRole === 'slider') {
			const beforeNote = (await readSlider(noteOffset)).now;
			await noteOffset.focus();
			await noteOffset.press('ArrowUp');
			expect((await readSlider(noteOffset)).now).toBeGreaterThan(beforeNote);
		} else {
			const beforeVal = await noteOffset.inputValue();
			await noteOffset.focus();
			await noteOffset.press('ArrowUp');
			expect(await noteOffset.inputValue()).not.toBe(beforeVal);
		}

		const stepGate = arp.getByRole('slider', { name: /Step\s*Gate|Gate/i }).last();
		const gateState = await readSlider(stepGate);
		await stepGate.focus();
		if (gateState.now >= gateState.max) {
			await stepGate.press('ArrowDown');
			expect((await readSlider(stepGate)).now).toBeLessThan(gateState.now);
		} else {
			await stepGate.press('ArrowUp');
			expect((await readSlider(stepGate)).now).toBeGreaterThan(gateState.now);
		}

		const accentToggle = arp
			.getByRole('button', { name: /Accent/i })
			.or(arp.getByRole('checkbox', { name: /Accent/i }))
			.first();
		const wasAccent = await accentToggle.getAttribute('aria-pressed');
		await accentToggle.click();
		if (wasAccent !== null) {
			await expect(accentToggle).toHaveAttribute(
				'aria-pressed',
				wasAccent === 'true' ? 'false' : 'true'
			);
		} else {
			await expect(accentToggle).toBeChecked();
		}

		const tieToggle = arp
			.getByRole('button', { name: /Tie/i })
			.or(arp.getByRole('checkbox', { name: /Tie/i }))
			.first();
		const wasTie = await tieToggle.getAttribute('aria-pressed');
		await tieToggle.click();
		if (wasTie !== null) {
			await expect(tieToggle).toHaveAttribute('aria-pressed', wasTie === 'true' ? 'false' : 'true');
		} else {
			await expect(tieToggle).toBeChecked();
		}

		await monitor.assertClean();
	});

	test('ArpSequencerBar Step Rec captures live key presses into consecutive sequencer steps', async ({
		page
	}) => {
		const monitor = await attachRuntimeMonitor(page);
		await openPiano(page);

		const arp = arpSeqRegion(page);
		const stepRec = arp.getByRole('button', { name: /Step Rec/i });
		await stepRec.click();
		await expect(stepRec).toHaveAttribute('aria-pressed', 'true');

		await playKey(page, 60);
		await playKey(page, 64);
		await playKey(page, 67);

		await expect(arp.locator('[data-step-index="0"]')).toHaveAttribute('aria-pressed', 'true');
		await expect(arp.locator('[data-step-index="1"]')).toHaveAttribute('aria-pressed', 'true');
		await expect(arp.locator('[data-step-index="2"]')).toHaveAttribute('aria-pressed', 'true');

		await stepRec.click();
		await expect(stepRec).toHaveAttribute('aria-pressed', 'false');

		await monitor.assertClean();
	});

	test('desktop >= 1220px container docks PerformanceBay left of keybed while preserving >= 1080px fit view', async ({
		page
	}) => {
		const monitor = await attachRuntimeMonitor(page);
		await page.setViewportSize({ width: 1440, height: 1000 });
		await openPiano(page);

		await expect(root(page)).toHaveAttribute('data-view', 'fit');
		const bayBox = await performanceBay(page).boundingBox();
		const windowBox = await root(page).locator('.keyboard-window').boundingBox();
		if (!bayBox || !windowBox) throw new Error('Missing PerformanceBay or keyboard window.');

		expect(bayBox.x + bayBox.width).toBeLessThanOrEqual(windowBox.x + 4);
		expect(bayBox.width).toBeLessThanOrEqual(180);
		expect(windowBox.width).toBeGreaterThanOrEqual(1080);
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
			true
		);

		await monitor.assertClean();
	});

	test('mid-desktop < 1220px collapses PerformanceBay into a horizontal strip above the keybed', async ({
		page
	}) => {
		const monitor = await attachRuntimeMonitor(page);
		await page.setViewportSize({ width: 1024, height: 900 });
		await openPiano(page);

		const bayBox = await performanceBay(page).boundingBox();
		const windowBox = await root(page).locator('.keyboard-window').boundingBox();
		if (!bayBox || !windowBox) throw new Error('Missing PerformanceBay or keyboard window.');

		expect(bayBox.y + bayBox.height).toBeLessThanOrEqual(windowBox.y + 4);
		expect(bayBox.width).toBeGreaterThan(300);
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
			true
		);

		await monitor.assertClean();
	});

	test('mobile < 960px collapses Zones 2 and 3 into a 5-tab drawer with playable keybed', async ({
		page
	}) => {
		const monitor = await attachRuntimeMonitor(page);
		await page.setViewportSize({ width: 390, height: 844 });
		await openPiano(page);

		const tablist = root(page).getByRole('tablist');
		await expect(tablist).toBeVisible();
		const expectedTabs = ['OSC/MIX', 'FILTER/ENV', 'MOD/FX', 'ARP/SEQ', 'INSPECT'] as const;
		await expect(tablist.getByRole('tab')).toHaveCount(5);

		for (const tabName of expectedTabs) {
			const tab = tablist.getByRole('tab', { name: tabName, exact: true });
			await tab.click();
			await expect(tab).toHaveAttribute('aria-selected', 'true');
			await expect(root(page).getByRole('tabpanel')).toBeVisible();
		}

		const c4Box = await key(page, 60).boundingBox();
		expect(c4Box?.width).toBeGreaterThanOrEqual(35);
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
			true
		);

		await monitor.assertClean();
	});

	test('ThemeSelect switches across paper, light, night and high-contrast with reload persistence and zero overflow', async ({
		page
	}) => {
		const monitor = await attachRuntimeMonitor(page);
		await openPiano(page);

		const themeSelect = page
			.getByLabel('Colour theme', { exact: true })
			.filter({ visible: true })
			.first();
		for (const theme of ALL_THEMES) {
			await themeSelect.selectOption(theme);
			await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
			expect(
				await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)
			).toBe(true);
		}

		// Verify ThemeSelect persists across reload (last selected: high-contrast).
		expect(await page.evaluate(() => localStorage.getItem('site-theme'))).toBe('high-contrast');
		await page.reload();
		await expect(root(page)).toBeVisible();
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'high-contrast');

		await monitor.assertClean();
	});

	test('PerformanceBay Pitch Bend, Mod Wheel, Hold, Chord Memory and 3x3 Pads trigger cleanly', async ({
		page
	}) => {
		const monitor = await attachRuntimeMonitor(page);
		await auditAudio(page);
		await openPiano(page);
		await enableSound(page);

		const bay = performanceBay(page);
		const pitchBend = bay.getByRole('slider', { name: /Pitch Bend/i });
		await pitchBend.focus();
		await pitchBend.press('PageUp');
		expect((await readSlider(pitchBend)).now).not.toBe(0);

		const modWheel = bay.getByRole('slider', { name: /Mod Wheel/i });
		await modWheel.focus();
		await modWheel.press('PageUp');
		expect((await readSlider(modWheel)).now).toBeGreaterThan(0);

		const chordSelect = bay.getByRole('combobox', { name: /Chord Memory/i });
		await chordSelect.selectOption({ label: 'Maj7' });
		await playKey(page, 60);
		await expect.poll(async () => (await readAudit(page)).started).toBeGreaterThanOrEqual(4);

		const pads = bay.locator('[data-chord-pad], [data-pad-index]');
		await expect(pads).toHaveCount(9);
		const beforePad = (await readAudit(page)).started;
		await pads.first().click();
		await expect(root(page).locator('.piano-whisper')).toContainText(/→/);
		await expect.poll(async () => (await readAudit(page)).started).toBeGreaterThan(beforePad);

		await root(page).getByRole('button', { name: 'Stop all sound' }).click();
		await expect
			.poll(async () => {
				const a = await readAudit(page);
				return a.started - a.ended;
			})
			.toBe(0);

		await monitor.assertClean();
	});

	test('symmetric [24, 96] octave shift moves C4 cleanly down to C1 and back to C4 without 21 drift', async ({
		page
	}) => {
		const monitor = await attachRuntimeMonitor(page);
		await openPiano(page);

		await expect(root(page)).toHaveAttribute('data-keyboard-base', '60');
		await key(page, 60).focus();
		await page.keyboard.press('[');
		await expect(root(page)).toHaveAttribute('data-keyboard-base', '48');
		await page.keyboard.press('[');
		await expect(root(page)).toHaveAttribute('data-keyboard-base', '36');
		await page.keyboard.press('[');
		await expect(root(page)).toHaveAttribute('data-keyboard-base', '24');

		await page.keyboard.press(']');
		await expect(root(page)).toHaveAttribute('data-keyboard-base', '36');
		await page.keyboard.press(']');
		await expect(root(page)).toHaveAttribute('data-keyboard-base', '48');
		await page.keyboard.press(']');
		await expect(root(page)).toHaveAttribute('data-keyboard-base', '60');

		await page.keyboard.press('a');
		await expect(root(page).locator('.piano-whisper')).toContainText('C4 → C4');

		await monitor.assertClean();
	});

	test('Dynamic Y-position velocity scales strike strength vertically while Fixed velocity stays uniform', async ({
		page
	}) => {
		const monitor = await attachRuntimeMonitor(page);
		await openPiano(page);

		const velToggle = performanceBay(page)
			.getByRole('button', { name: /Dynamic.*Vel|Fixed.*Vel|Velocity/i })
			.or(telemetryBar(page).getByRole('button', { name: /Dynamic.*Vel|Fixed.*Vel|Velocity/i }))
			.first();

		const box = await key(page, 60).boundingBox();
		if (!box) throw new Error('Key 60 missing bounding box.');

		const measureVerticalSpread = async () => {
			await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.15);
			const topVel = Number(await root(page).getAttribute('data-last-velocity'));
			await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.9);
			const bottomVel = Number(await root(page).getAttribute('data-last-velocity'));
			return { topVel, bottomVel, diff: bottomVel - topVel };
		};

		const stateA = await measureVerticalSpread();
		const labelBefore = (await velToggle.innerText()).trim();
		const pressedBefore = await velToggle.getAttribute('aria-pressed');

		await velToggle.click();
		const labelAfter = (await velToggle.innerText()).trim();
		const pressedAfter = await velToggle.getAttribute('aria-pressed');
		expect(pressedAfter !== pressedBefore || labelAfter !== labelBefore).toBe(true);

		const stateB = await measureVerticalSpread();
		if (/Dynamic/i.test(labelBefore) && !/Fixed/i.test(labelBefore)) {
			expect(stateA.bottomVel).toBeGreaterThan(stateA.topVel);
			expect(stateA.diff).toBeGreaterThan(0.15);
			expect(stateB.topVel).toBeCloseTo(stateB.bottomVel, 2);
		} else if (/Fixed/i.test(labelBefore) && !/Dynamic/i.test(labelBefore)) {
			expect(stateA.topVel).toBeCloseTo(stateA.bottomVel, 2);
			expect(stateB.bottomVel).toBeGreaterThan(stateB.topVel);
			expect(stateB.diff).toBeGreaterThan(0.15);
		} else {
			// Verify exactly one state is Dynamic (bottom > top) and the toggled state is Fixed (uniform).
			expect(Math.max(stateA.diff, stateB.diff)).toBeGreaterThan(0.15);
			expect(Math.min(Math.abs(stateA.diff), Math.abs(stateB.diff))).toBeLessThan(0.02);
		}

		await monitor.assertClean();
	});

	test('Visual Mode toggles between default Ambient Pond and OLED Focus without dropping keys or probability arcs', async ({
		page
	}) => {
		const monitor = await attachRuntimeMonitor(page);
		await openPiano(page);

		await expect(root(page).locator('[data-piano-stage] canvas').first()).toBeVisible();
		const oledToggle = telemetryBar(page).getByRole('button', { name: /OLED Focus/i });
		await oledToggle.click();
		await expect(root(page)).toHaveAttribute('data-visual-mode', /oled/i);

		await root(page)
			.getByRole('button', { name: /Try the space between/ })
			.click();
		await expect(root(page).locator('.probability-light path[data-probability]')).toHaveCount(2);
		await playKey(page, 60);
		await expect(root(page).locator('.piano-whisper')).toContainText('C4 → C4');

		await telemetryBar(page)
			.getByRole('button', { name: /Ambient Pond/i })
			.click();
		await expect(root(page)).toHaveAttribute('data-visual-mode', /pond/i);

		await monitor.assertClean();
	});

	test('[MIDI] gesture-gates Web MIDI access and routes mock Note, CC1, CC64 and Pitch Bend', async ({
		page
	}) => {
		const monitor = await attachRuntimeMonitor(page);
		await installMidiMock(page, 'supported');
		await auditAudio(page);
		await openPiano(page);
		await enableSound(page);

		// Zero auto-prompt on initial page load.
		expect(
			await page.evaluate(() => (window as unknown as MidiMockWindow).__midiMock.requestCount)
		).toBe(0);

		await telemetryBar(page).getByRole('button', { name: /MIDI/i }).click();
		await expect
			.poll(() =>
				page.evaluate(() => (window as unknown as MidiMockWindow).__midiMock.requestCount)
			)
			.toBe(1);
		expect(
			await page.evaluate(() => (window as unknown as MidiMockWindow).__midiMock.lastOptions?.sysex)
		).toBe(false);

		// Send Note On C4 (vel 100), CC1 Mod, CC64 Sustain (127), Pitch Bend.
		await page.evaluate(() => {
			const midi = (window as unknown as MidiMockWindow).__midiMock;
			midi.emit([0x90, 60, 100]);
			midi.emit([0xb0, 1, 96]);
			midi.emit([0xb0, 64, 127]);
			midi.emit([0xe0, 0x00, 0x60]);
		});
		await expect(root(page).locator('.piano-whisper')).toContainText('C4 → C4');
		await expect.poll(async () => (await readAudit(page)).started).toBeGreaterThanOrEqual(5);

		const stopsBeforeNoteOff = (await readAudit(page)).stops;

		// Send Note Off while CC64=127 -> note must remain sustained (stops unchanged and ended stays 0).
		await page.evaluate(() => {
			const midi = (window as unknown as MidiMockWindow).__midiMock;
			midi.emit([0x80, 60, 0]);
		});
		await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 120)));
		const sustainedAudit = await readAudit(page);
		expect(sustainedAudit.stops).toBe(stopsBeforeNoteOff);
		expect(sustainedAudit.ended).toBe(0);

		// Release Sustain (CC64=0) -> sustained voice releases cleanly.
		await page.evaluate(() => {
			const midi = (window as unknown as MidiMockWindow).__midiMock;
			midi.emit([0xb0, 64, 0]);
		});
		await expect
			.poll(async () => (await readAudit(page)).stops)
			.toBeGreaterThan(stopsBeforeNoteOff);
		await expect.poll(async () => (await readAudit(page)).ended).toBeGreaterThanOrEqual(5);

		await root(page).getByRole('button', { name: 'Stop all sound' }).click();
		await expect
			.poll(async () => {
				const a = await readAudit(page);
				return a.started - a.ended;
			})
			.toBe(0);

		await monitor.assertClean();
	});

	test('[Rec WAV] records live performance and exports a valid 16-bit PCM RIFF/WAVE blob cleanly', async ({
		page
	}) => {
		const monitor = await attachRuntimeMonitor(page);
		await openPiano(page);
		await enableSound(page);

		const recBtn = telemetryBar(page).getByRole('button', { name: /Rec WAV/i });
		await recBtn.click();
		await expect(recBtn).toHaveAttribute('aria-pressed', 'true');

		await playKey(page, 60);
		await playKey(page, 64);

		const wavBytes = await captureExportedWavBytes(page, async () => {
			await telemetryBar(page)
				.getByRole('button', { name: /Rec WAV|Stop Rec|Export/i })
				.click();
		});
		assertValidRiffWave(wavBytes);

		await monitor.assertClean();
	});
});

// ---------------------------------------------------------------------------
// Tier 2: Boundary & Corner Cases
// ---------------------------------------------------------------------------

test.describe('Tier 2: Boundary & Corner Cases', () => {
	test('slider Home/End bounds, Shift+Arrow fine steps and Filter Cutoff 20..18000 Hz clamping', async ({
		page
	}) => {
		const monitor = await attachRuntimeMonitor(page);
		await openPiano(page);

		const cutoff = controlDeck(page).getByRole('slider', { name: /Cutoff/i });
		await cutoff.focus();
		await cutoff.press('Home');
		const minState = await readSlider(cutoff);
		expect(minState.now).toBe(20);

		await cutoff.press('End');
		const maxState = await readSlider(cutoff);
		expect(maxState.now).toBe(18000);

		const resonance = controlDeck(page).getByRole('slider', { name: /Resonance/i });
		await resonance.focus();
		await resonance.press('Home');
		const rMin = (await readSlider(resonance)).now;
		await resonance.press('Shift+ArrowUp');
		const rShift = (await readSlider(resonance)).now;
		await resonance.press('Home');
		await resonance.press('ArrowUp');
		const rNormal = (await readSlider(resonance)).now;
		expect(rShift - rMin).toBeGreaterThan(0);
		expect(rShift - rMin).toBeLessThan(rNormal - rMin);

		await monitor.assertClean();
	});

	test('extreme pointer drag beyond viewport clamps slider cleanly without NaN', async ({
		page
	}) => {
		const monitor = await attachRuntimeMonitor(page);
		await openPiano(page);

		const cutoff = controlDeck(page).getByRole('slider', { name: /Cutoff/i });
		const box = await cutoff.boundingBox();
		if (!box) throw new Error('Cutoff knob has no bounding box.');
		const cx = box.x + box.width / 2;
		const cy = box.y + box.height / 2;

		// Preset 01 starts at max (18000 Hz): drag far down to clamp at 20, then far up to clamp at 18000.
		await page.mouse.move(cx, cy);
		await page.mouse.down();
		await page.mouse.move(cx, 1800, { steps: 5 });
		await page.mouse.up();
		expect((await readSlider(cutoff)).now).toBe(20);

		await page.mouse.move(cx, cy);
		await page.mouse.down();
		await page.mouse.move(cx, -400, { steps: 5 });
		await page.mouse.up();
		expect((await readSlider(cutoff)).now).toBe(18000);

		await monitor.assertClean();
	});

	test('#patch= oversized (> 4096 chars) and malformed hashes fall back safely to Preset 01', async ({
		page
	}) => {
		const monitor = await attachRuntimeMonitor(page);

		await page.goto(`${article}#patch=${'A'.repeat(4200)}`);
		await expect(root(page)).toBeVisible();
		await expect(root(page).getByRole('button', { name: 'Enable sound' })).toBeEnabled();
		await expect(telemetryBar(page).getByRole('combobox', { name: /Patch|Preset/i })).toContainText(
			/01.*Forgiving Grand/i
		);
		await expect(root(page).locator('.sound-status')).toBeVisible();

		await page.goto('about:blank');
		await page.goto(`${article}#patch=!!!malformed_base64!!!`);
		await expect(root(page)).toBeVisible();
		await expect(root(page).getByRole('button', { name: 'Enable sound' })).toBeEnabled();
		await expect(telemetryBar(page).getByRole('combobox', { name: /Patch|Preset/i })).toContainText(
			/01.*Forgiving Grand/i
		);

		const nonJson = Buffer.from('not-json-at-all', 'utf8').toString('base64url');
		await page.goto('about:blank');
		await page.goto(`${article}#patch=${nonJson}`);
		await expect(root(page)).toBeVisible();
		await expect(root(page).getByRole('button', { name: 'Enable sound' })).toBeEnabled();
		await expect(telemetryBar(page).getByRole('combobox', { name: /Patch|Preset/i })).toContainText(
			/01.*Forgiving Grand/i
		);

		await monitor.assertClean();
	});

	test('#patch= valid JSON with extreme out-of-range numbers clamps safely to parameter bounds', async ({
		page
	}) => {
		const monitor = await attachRuntimeMonitor(page);
		const highExtremePayload = {
			version: 1,
			id: 'extreme-high',
			name: 'Extreme High',
			filter: { cutoffHz: 999999, resonance: -10, drive: 500 },
			fx: {
				delay: { feedback: 0.99 },
				crush: { bitDepth: 1 }
			},
			arpSeq: { bpm: 999 }
		};
		const encodedHigh = Buffer.from(JSON.stringify(highExtremePayload), 'utf8').toString(
			'base64url'
		);
		await page.goto(`${article}#patch=${encodedHigh}`);
		await expect(root(page)).toBeVisible();
		await expect(root(page).getByRole('button', { name: 'Enable sound' })).toBeEnabled();

		expect((await readSlider(controlDeck(page).getByRole('slider', { name: /Cutoff/i }))).now).toBe(
			18000
		);
		const highResonance = (
			await readSlider(controlDeck(page).getByRole('slider', { name: /Resonance/i }))
		).now;
		expect(highResonance).toBeGreaterThanOrEqual(0.5);
		expect(highResonance).toBeLessThanOrEqual(0.51);
		const highDrive = await readSlider(
			controlDeck(page)
				.getByRole('slider', { name: /Pre-?Drive|Filter\s*Drive/i })
				.first()
		);
		expect(highDrive.now).toBeGreaterThan(0);
		expect(highDrive.now).toBeCloseTo(highDrive.max, 2);
		expect(highDrive.max).toBeLessThanOrEqual(100);
		const highDelayFb = (
			await readSlider(
				fxRackRegion(page).getByRole('slider', { name: /Delay.*Feedback|Feedback/i })
			)
		).now;
		expect(highDelayFb).toBeGreaterThanOrEqual(0.87);
		expect(highDelayFb).toBeLessThanOrEqual(0.88);
		expect((await readSlider(fxRackRegion(page).getByRole('slider', { name: /Bit/i }))).now).toBe(
			3
		);
		const highBpm = (await readSlider(arpSeqRegion(page).getByRole('slider', { name: /BPM/i })))
			.now;
		expect(highBpm).toBeGreaterThanOrEqual(219);
		expect(highBpm).toBeLessThanOrEqual(220);

		// Also verify opposite-end extreme clamping (low cutoff/drive/feedback/bpm, high resonance/bitDepth).
		const lowExtremePayload = {
			version: 1,
			id: 'extreme-low',
			name: 'Extreme Low',
			filter: { cutoffHz: 1, resonance: 999, drive: -5 },
			fx: {
				delay: { feedback: -2 },
				crush: { bitDepth: 99 }
			},
			arpSeq: { bpm: 5 }
		};
		const encodedLow = Buffer.from(JSON.stringify(lowExtremePayload), 'utf8').toString('base64url');
		await page.goto('about:blank');
		await page.goto(`${article}#patch=${encodedLow}`);
		await expect(root(page)).toBeVisible();
		await expect(root(page).getByRole('button', { name: 'Enable sound' })).toBeEnabled();

		expect((await readSlider(controlDeck(page).getByRole('slider', { name: /Cutoff/i }))).now).toBe(
			20
		);
		const lowResonance = (
			await readSlider(controlDeck(page).getByRole('slider', { name: /Resonance/i }))
		).now;
		expect(lowResonance).toBeGreaterThanOrEqual(19.9);
		expect(lowResonance).toBeLessThanOrEqual(20);
		expect(
			(
				await readSlider(
					controlDeck(page)
						.getByRole('slider', { name: /Pre-?Drive|Filter\s*Drive/i })
						.first()
				)
			).now
		).toBe(0);
		expect(
			(
				await readSlider(
					fxRackRegion(page).getByRole('slider', { name: /Delay.*Feedback|Feedback/i })
				)
			).now
		).toBe(0);
		expect((await readSlider(fxRackRegion(page).getByRole('slider', { name: /Bit/i }))).now).toBe(
			16
		);
		expect((await readSlider(arpSeqRegion(page).getByRole('slider', { name: /BPM/i }))).now).toBe(
			40
		);

		await monitor.assertClean();
	});

	test('localStorage corrupt JSON and throwing storage access recover cleanly to Preset 01', async ({
		page
	}) => {
		const monitor = await attachRuntimeMonitor(page);
		await page.addInitScript((storageKey) => {
			try {
				localStorage.setItem(storageKey, '{corrupt-json');
			} catch {
				// Ignore if storage unavailable
			}
		}, SYNTH_STORAGE_KEY);
		await openPiano(page);
		await expect(telemetryBar(page).getByRole('combobox', { name: /Patch|Preset/i })).toContainText(
			/01.*Forgiving Grand/i
		);

		// Also verify throwing localStorage never triggers uncaught pageerror.
		await page.addInitScript(() => {
			Object.defineProperty(Storage.prototype, 'getItem', {
				configurable: true,
				value: () => {
					throw new DOMException('Storage blocked', 'SecurityError');
				}
			});
			Object.defineProperty(Storage.prototype, 'setItem', {
				configurable: true,
				value: () => {
					throw new DOMException('Storage blocked', 'SecurityError');
				}
			});
		});
		await openPiano(page);
		await playKey(page, 60);
		await expect(root(page).locator('.piano-whisper')).toContainText('C4 → C4');

		await monitor.assertClean();
	});

	test('octave shift clamps at [24, 96] with disabled boundary buttons while A0 and Home remain playable', async ({
		page
	}) => {
		const monitor = await attachRuntimeMonitor(page);
		await openPiano(page);

		const lowerBtn = root(page).getByRole('button', { name: 'Lower computer-keyboard octave' });
		const higherBtn = root(page).getByRole('button', { name: 'Higher computer-keyboard octave' });

		for (let i = 0; i < 4; i++) {
			await key(page, 60).focus();
			await page.keyboard.press('[');
		}
		await expect(root(page)).toHaveAttribute('data-keyboard-base', '24');
		await expect(lowerBtn).toBeDisabled();

		for (let i = 0; i < 7; i++) {
			await key(page, 60).focus();
			await page.keyboard.press(']');
		}
		await expect(root(page)).toHaveAttribute('data-keyboard-base', '96');
		await expect(higherBtn).toBeDisabled();

		await root(page).getByRole('button', { name: 'Raw', exact: true }).click();
		await key(page, 60).focus();
		await page.keyboard.press('Home');
		await expect(key(page, 21)).toBeFocused();
		await playKey(page, 21);
		await expect(root(page).locator('.piano-whisper')).toContainText('A0 → A0');

		await monitor.assertClean();
	});

	test('lazy LFO hygiene keeps Preset 01 at 5 oscs, starts LFO on active ModMatrix route and ends all on Stop', async ({
		page
	}) => {
		const monitor = await attachRuntimeMonitor(page);
		await auditAudio(page);
		await openPiano(page);
		await enableSound(page);

		// Preset 01: zero active mod routes -> exactly 5 oscillators.
		await playKey(page, 60);
		await expect.poll(async () => (await readAudit(page)).started).toBe(5);
		await root(page).getByRole('button', { name: 'Stop all sound' }).click();
		await expect
			.poll(async () => {
				const a = await readAudit(page);
				return a.started - a.ended;
			})
			.toBe(0);

		// Raise LFO 1 Depth > 0 and enable LFO 1 -> Cutoff route -> lazy LFO oscillator starts.
		const lfo1Depth = controlDeck(page).getByRole('slider', { name: /LFO\s*1.*Depth/i });
		await lfo1Depth.focus();
		await lfo1Depth.press('End');
		expect((await readSlider(lfo1Depth)).now).toBeGreaterThan(0);

		const mod = modMatrixRegion(page);
		await mod.getByRole('button', { name: /LFO\s*1.*Cutoff/i }).click();
		const depth = mod.getByRole('slider', { name: /Mod depth|Depth/i });
		await depth.focus();
		await depth.press('End');

		const beforeModNote = (await readAudit(page)).started;
		await playKey(page, 60);
		await expect
			.poll(async () => (await readAudit(page)).started)
			.toBeGreaterThan(beforeModNote + 5);

		await root(page).getByRole('button', { name: 'Stop all sound' }).click();
		await expect
			.poll(async () => {
				const a = await readAudit(page);
				return a.started - a.ended;
			})
			.toBe(0);

		await monitor.assertClean();
	});

	test('FxRack Delay Feedback caps <= 0.88 and Crush Bit Depth bounds [3, 16]', async ({
		page
	}) => {
		const monitor = await attachRuntimeMonitor(page);
		await openPiano(page);

		const fx = fxRackRegion(page);
		const feedback = fx.getByRole('slider', { name: /Delay.*Feedback|Feedback/i });
		await feedback.focus();
		await feedback.press('End');
		const fbMax = await readSlider(feedback);
		expect(fbMax.max).toBeLessThanOrEqual(0.88);
		expect(fbMax.now).toBeLessThanOrEqual(0.88);

		const bitDepth = fx.getByRole('slider', { name: /Bit/i });
		await bitDepth.focus();
		await bitDepth.press('Home');
		const minBits = await readSlider(bitDepth);
		expect(minBits.now).toBe(3);
		await bitDepth.press('End');
		const maxBits = await readSlider(bitDepth);
		expect(maxBits.now).toBe(16);

		await monitor.assertClean();
	});

	test('Unison voice budget and rapid > 24 node triggers steal tails cleanly without leaks', async ({
		page
	}) => {
		const monitor = await attachRuntimeMonitor(page);
		await auditAudio(page);
		await openPiano(page);
		await enableSound(page);

		// Use sustained non-self-stopping Preset 03 (Saw/Saw/Sub, defaultStop = Infinity) + Raw mapping
		// so oscillator stop() calls can only come from explicit release or voice stealing.
		await telemetryBar(page).getByLabel('Patch preset').selectOption('03-warm-analog-poly');
		await root(page).getByRole('button', { name: 'Raw', exact: true }).click();

		const voiceControl = telemetryBar(page)
			.getByRole('combobox', { name: /Voice mode/i })
			.or(telemetryBar(page).getByRole('group', { name: /Voice mode/i }))
			.first();
		const isSelect = (await voiceControl.evaluate((el) => el.tagName.toLowerCase())) === 'select';
		const setVoiceMode = async (mode: 'Unison' | 'Poly') => {
			if (isSelect) {
				await voiceControl.selectOption({ label: mode });
			} else {
				await voiceControl.getByRole('button', { name: mode, exact: true }).click();
			}
		};
		const readActiveVoices = async () => {
			const text = (await oledScope(page).getByLabel('Active voice count').textContent()) ?? '';
			return Number.parseInt(text, 10);
		};

		// Hold 9 simultaneous notes in Unison mode (> 6 note Unison cap, 2 layers x 3 oscs = 6 oscs/note)
		// and verify >= 3 stolen notes (>= 18 osc stops) occur immediately without self-expiry.
		await setVoiceMode('Unison');
		const unisonBase = await readAudit(page);
		const holdPedal = root(page).getByRole('checkbox', { name: 'Hold pedal' });
		await holdPedal.check();
		for (let pitch = 48; pitch < 57; pitch++) {
			await playKey(page, pitch);
		}
		await expect
			.poll(
				async () => {
					const a = await readAudit(page);
					const dStarted = a.started - unisonBase.started;
					const dStops = a.stops - unisonBase.stops;
					const voices = await readActiveVoices();
					return dStarted >= 54 && dStops >= 18 && dStops <= dStarted && voices <= 6;
				},
				{ timeout: 1000 }
			)
			.toBe(true);

		await holdPedal.uncheck();
		await root(page).getByRole('button', { name: 'Stop all sound' }).click();
		await expect
			.poll(async () => {
				const a = await readAudit(page);
				return a.started - a.ended;
			})
			.toBe(0);
		await expect.poll(readActiveVoices, { timeout: 1000 }).toBe(0);

		// Switch to Poly and verify tail-first stealing under MAX_NODE_VOICES (24):
		// 1) Raise Amp Release to 6s so released notes enter long tails with 0 natural stops.
		// 2) Release 6 tail notes (48..53), actively hold C4 (60) via QWERTY 'a', then trigger 25
		//    pedal-sustained notes (61..85 -> 32 total voices > 24).
		// 3) Verify all 6 releasing tails (>= 18 oscs) are stolen before actively held C4.
		await setVoiceMode('Poly');
		const releaseSlider = controlDeck(page).getByRole('slider', { name: 'Release', exact: true });
		await releaseSlider.focus();
		await releaseSlider.press('End');
		expect((await readSlider(releaseSlider)).now).toBe(6);

		const polyBase = await readAudit(page);
		for (let pitch = 48; pitch < 54; pitch++) {
			await playKey(page, pitch);
		}
		const preOverflow = await readAudit(page);
		expect(preOverflow.stops - polyBase.stops).toBe(0);

		await holdPedal.check();
		await key(page, 60).focus();
		await page.keyboard.down('a');
		await expect(key(page, 60)).toHaveClass(/requested/);
		await expect(key(page, 60)).toHaveClass(/sounded/);

		for (let pitch = 61; pitch < 86; pitch++) {
			await playKey(page, pitch);
		}
		await expect
			.poll(
				async () => {
					const a = await readAudit(page);
					const dStarted = a.started - polyBase.started;
					const dStops = a.stops - polyBase.stops;
					const voices = await readActiveVoices();
					return dStarted >= 96 && dStops >= 18 && dStops <= dStarted && voices <= 24;
				},
				{ timeout: 1000 }
			)
			.toBe(true);
		await expect(key(page, 60)).toHaveClass(/requested/);
		await expect(key(page, 60)).toHaveClass(/sounded/);

		await page.keyboard.up('a');
		await holdPedal.uncheck();
		await root(page).getByRole('button', { name: 'Stop all sound' }).click();
		await expect
			.poll(async () => {
				const a = await readAudit(page);
				return a.started - a.ended;
			})
			.toBe(0);
		await expect.poll(readActiveVoices, { timeout: 1000 }).toBe(0);

		await monitor.assertClean();
	});

	test('ArpSequencerBar clamps BPM [40, 220], guards empty held notes and freezes step LEDs in Still mode', async ({
		page
	}) => {
		const monitor = await attachRuntimeMonitor(page);
		await openPiano(page);

		const arp = arpSeqRegion(page);
		const bpm = arp.getByRole('slider', { name: /BPM/i });
		await bpm.focus();
		await bpm.press('Home');
		expect((await readSlider(bpm)).now).toBe(40);
		await bpm.press('End');
		expect((await readSlider(bpm)).now).toBe(220);

		// Activate step 0 and start transport, then switch to Still mode and verify step LEDs & canvas freeze.
		await arp.locator('[data-step-index="0"]').click();
		await arp.getByRole('button', { name: /Play|Start/i }).click();
		await page.evaluate(() => {
			document.documentElement.dataset.motion = 'still';
		});
		await expect(root(page)).toHaveClass(/still/);

		const readStepStates = () =>
			arp.locator('[data-step-index]').evaluateAll((els) =>
				els.map((el) => ({
					pressed: el.getAttribute('aria-pressed'),
					current: el.getAttribute('aria-current') ?? el.getAttribute('data-current'),
					cls: el.className
				}))
			);

		const scopeCanvas = oledScope(page).locator('canvas').first();
		const snap1 = await canvasSnapshot(scopeCanvas);
		expect(snap1.width).toBeGreaterThan(0);
		expect(snap1.height).toBeGreaterThan(0);
		expect(snap1.brightPixels).toBeGreaterThan(0);
		const stepsBefore = await readStepStates();

		await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 220)));

		const snap2 = await canvasSnapshot(scopeCanvas);
		const stepsAfter = await readStepStates();
		expect(snap2).toEqual(snap1);
		expect(stepsAfter).toEqual(stepsBefore);

		await root(page).getByRole('button', { name: 'Stop all sound' }).click();
		await monitor.assertClean();
	});

	test('OledScope stops requestAnimationFrame in Still mode and when scrolled offscreen', async ({
		page
	}) => {
		const monitor = await attachRuntimeMonitor(page);
		await openPiano(page);
		await enableSound(page);

		const scopeCanvas = oledScope(page).locator('canvas').first();
		await page.evaluate(() => {
			document.documentElement.dataset.motion = 'still';
		});
		await expect(root(page)).toHaveClass(/still/);
		await playKey(page, 60);
		const snapA = await canvasSnapshot(scopeCanvas);
		expect(snapA.width).toBeGreaterThan(0);
		expect(snapA.height).toBeGreaterThan(0);
		expect(snapA.brightPixels).toBeGreaterThan(0);
		await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 220)));
		const snapB = await canvasSnapshot(scopeCanvas);
		expect(snapB).toEqual(snapA);

		await page.evaluate(() => {
			document.documentElement.dataset.motion = 'gentle';
			window.scrollTo(0, document.documentElement.scrollHeight);
		});
		await expect(root(page).locator('.sound-status')).toContainText('Paused outside the viewport');
		const snapOff1 = await canvasSnapshot(scopeCanvas);
		await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 220)));
		const snapOff2 = await canvasSnapshot(scopeCanvas);
		expect(snapOff2).toEqual(snapOff1);
		await root(page).getByRole('button', { name: 'Stop all sound' }).click();

		await monitor.assertClean();
	});

	test('[MIDI] shows graceful fallback status when unsupported or permission denied with zero auto-prompt', async ({
		page,
		browser
	}) => {
		const monitor = await attachRuntimeMonitor(page);
		await installMidiMock(page, 'unsupported');
		await openPiano(page);

		await telemetryBar(page).getByRole('button', { name: /MIDI/i }).click();
		await expect(root(page).locator('.sound-status')).toContainText(/MIDI/i);
		await monitor.assertClean();

		const context2 = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
		const page2 = await context2.newPage();
		try {
			const monitor2 = await attachRuntimeMonitor(page2);
			await installMidiMock(page2, 'denied');
			await openPiano(page2);
			expect(
				await page2.evaluate(() => (window as unknown as MidiMockWindow).__midiMock.requestCount)
			).toBe(0);
			await telemetryBar(page2).getByRole('button', { name: /MIDI/i }).click();
			await expect
				.poll(() =>
					page2.evaluate(() => (window as unknown as MidiMockWindow).__midiMock.requestCount)
				)
				.toBe(1);
			await expect(root(page2).locator('.sound-status')).toContainText(/MIDI|denied/i);
			await monitor2.assertClean();
		} finally {
			await context2.close();
		}
	});

	test('[Rec WAV] handles empty recording and route navigation cleanup without CSP or runtime errors', async ({
		page
	}) => {
		const monitor = await attachRuntimeMonitor(page);
		await openPiano(page);

		const recBtn = telemetryBar(page).getByRole('button', { name: /Rec WAV/i });
		await recBtn.click();
		await telemetryBar(page)
			.getByRole('button', { name: /Rec WAV|Stop Rec|Export/i })
			.click();
		await expect(root(page).locator('.sound-status')).toBeVisible();

		// Start recording and navigate away immediately to verify clean teardown.
		await recBtn.click();
		await page
			.getByRole('navigation', { name: 'Primary navigation' })
			.getByRole('link', { name: 'Writing', exact: true })
			.click();
		await expect(root(page)).toHaveCount(0);

		await monitor.assertClean();
	});

	test('PerformanceBay docking geometry, 1280px mid-desktop, 390px key width, high-contrast borders/focus and zero overflow', async ({
		page
	}) => {
		const monitor = await attachRuntimeMonitor(page);
		await openPiano(page);

		for (const width of [390, 768, 1024, 1280, 1440]) {
			await page.setViewportSize({ width, height: 1000 });
			for (const theme of ALL_THEMES) {
				await setThemeViaDom(page, theme);
				await expect
					.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
					.toBe(true);
			}
			if (width === 1440 || width === 1280) {
				await expect(root(page)).toHaveAttribute('data-view', 'fit');
			}
			const bayBox = await performanceBay(page).boundingBox();
			const winBox = await root(page).locator('.keyboard-window').boundingBox();
			if (!bayBox || !winBox) throw new Error('Missing layout bounding box.');
			if (width === 1440) {
				expect(bayBox.x + bayBox.width).toBeLessThanOrEqual(winBox.x + 4);
			} else if (width === 1280) {
				expect(winBox.width).toBeGreaterThanOrEqual(1080);
			} else if (width === 1024) {
				expect(bayBox.y + bayBox.height).toBeLessThanOrEqual(winBox.y + 4);
			}
		}

		// Verify high-contrast theme preserves visible borders and keyboard focus rings.
		await setThemeViaDom(page, 'high-contrast');
		const cardBorder = await controlDeck(page).evaluate((el) => {
			const cs = getComputedStyle(el);
			return {
				width: parseFloat(cs.borderTopWidth) || parseFloat(cs.borderLeftWidth) || 0,
				color: cs.borderTopColor
			};
		});
		expect(cardBorder.width).toBeGreaterThanOrEqual(1);
		expect(cardBorder.color).not.toBe('rgba(0, 0, 0, 0)');

		const cutoff = controlDeck(page).getByRole('slider', { name: /Cutoff/i });
		await cutoff.focus();
		await page.keyboard.press('Tab');
		const focusOutline = await page.evaluate(() => {
			const active = document.activeElement as HTMLElement | null;
			if (!active) return { style: 'none', width: 0 };
			const cs = getComputedStyle(active);
			return { style: cs.outlineStyle, width: parseFloat(cs.outlineWidth) || 0 };
		});
		expect(focusOutline.style).not.toBe('none');
		expect(focusOutline.width).toBeGreaterThanOrEqual(2);

		await page.setViewportSize({ width: 390, height: 844 });
		await root(page).getByRole('tablist').getByRole('tab', { name: 'MOD/FX', exact: true }).click();
		expect((await key(page, 60).boundingBox())!.width).toBeGreaterThanOrEqual(35);

		await monitor.assertClean();
	});

	test('no-JavaScript fallback keeps .piano-poster visible and synth controls disabled at 390px', async ({
		browser,
		baseURL
	}) => {
		const context = await browser.newContext({
			javaScriptEnabled: false,
			viewport: { width: 390, height: 844 }
		});
		const page = await context.newPage();
		try {
			await page.goto(`${baseURL}${article}`);
			await expect(root(page).locator('.piano-poster')).toBeVisible();
			await expect(root(page).getByRole('button', { name: 'Enable sound' })).toBeDisabled();
			expect(
				await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)
			).toBe(true);
		} finally {
			await context.close();
		}
	});
});

// ---------------------------------------------------------------------------
// Tier 3: Cross-Feature Combinations
// ---------------------------------------------------------------------------

test.describe('Tier 3: Cross-Feature Combinations', () => {
	test('#patch= restore preserves Harmonic Assist mode and temperature independence', async ({
		page
	}) => {
		const monitor = await attachRuntimeMonitor(page);
		await openPiano(page);

		const cutoff = controlDeck(page).getByRole('slider', { name: /Cutoff/i });
		await cutoff.focus();
		await cutoff.press('PageDown');
		const targetCutoff = (await readSlider(cutoff)).now;
		expect(targetCutoff).toBeLessThan(18000);

		await workbench(page);
		const temperature = root(page).getByRole('slider', { name: 'Temperature' });
		await temperature.fill('1.25');
		await expect(temperature).toHaveValue('1.25');

		await telemetryBar(page)
			.getByRole('button', { name: /Share|Copy.*patch/i })
			.click();
		await expect.poll(() => page.evaluate(() => window.location.hash)).toMatch(/^#patch=/);
		const patchHash = await page.evaluate(() => window.location.hash);

		await root(page).getByRole('button', { name: 'Raw', exact: true }).click();
		await expect(root(page).getByRole('button', { name: 'Raw', exact: true })).toHaveAttribute(
			'aria-pressed',
			'true'
		);

		// Cold-load #patch= without localStorage and verify synth restores Cutoff while Assist & Temperature reset.
		await page.evaluate((k) => localStorage.removeItem(k), SYNTH_STORAGE_KEY);
		await page.goto('about:blank');
		await page.goto(`${article}${patchHash}`);
		await expect(root(page)).toBeVisible();
		await expect(root(page).getByRole('button', { name: 'Enable sound' })).toBeEnabled();
		expect(
			(await readSlider(controlDeck(page).getByRole('slider', { name: /Cutoff/i }))).now
		).toBeCloseTo(targetCutoff, 0);
		await expect(root(page).getByRole('button', { name: 'Nearest', exact: true })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
		await workbench(page);
		await expect(root(page).getByRole('slider', { name: 'Temperature' })).toHaveValue('0.7');

		await monitor.assertClean();
	});

	test('Hold sustain pedal retains voices across preset and chord switches and releases on pedal-up', async ({
		page
	}) => {
		const monitor = await attachRuntimeMonitor(page);
		await auditAudio(page);
		await openPiano(page);
		await enableSound(page);

		await workbench(page);
		await root(page).getByRole('checkbox', { name: 'Hold pedal' }).check();
		await playKey(page, 60);
		await playKey(page, 64);
		await expect.poll(async () => (await readAudit(page)).started).toBe(10);

		await root(page)
			.getByRole('combobox', { name: 'Painting and harmony preset' })
			.selectOption('1');
		await root(page).getByRole('combobox', { name: 'Current chord' }).selectOption('1');

		await root(page).getByRole('checkbox', { name: 'Hold pedal' }).uncheck();
		await expect.poll(async () => (await readAudit(page)).ended).toBe(10);
		await expect(root(page)).toHaveAttribute('data-held', '0');

		await root(page).getByRole('button', { name: 'Stop all sound' }).click();
		await monitor.assertClean();
	});

	test('ArpSequencerBar routes scheduled notes through Harmonic Assist (Nearest vs Raw)', async ({
		page
	}) => {
		const monitor = await attachRuntimeMonitor(page);
		await auditAudio(page);
		await openPiano(page);
		await enableSound(page);

		const arp = arpSeqRegion(page);
		await arp
			.getByRole('button', { name: /Hold|Latch/i })
			.or(arp.getByRole('checkbox', { name: /Hold|Latch/i }))
			.first()
			.click();
		await root(page).getByRole('button', { name: 'Nearest', exact: true }).click();
		await playKey(page, 61);
		await expect(root(page).locator('.piano-whisper')).toContainText(/C♯4 → (C4|D4)/);

		await arp.getByRole('button', { name: /Play|Start/i }).click();
		await expect.poll(async () => (await readAudit(page)).started).toBeGreaterThan(5);

		await root(page).getByRole('button', { name: 'Raw', exact: true }).click();
		await playKey(page, 61);
		await expect(root(page).locator('.piano-whisper')).toContainText('C♯4 → C♯4');

		await root(page).getByRole('button', { name: 'Stop all sound' }).click();
		await expect
			.poll(async () => {
				const a = await readAudit(page);
				return a.started - a.ended;
			})
			.toBe(0);

		await monitor.assertClean();
	});

	test('ModMatrix (LFO 1 to Cutoff) + LP24 Filter + OledScope parameter echo and live trace', async ({
		page
	}) => {
		const monitor = await attachRuntimeMonitor(page);
		await auditAudio(page);
		await openPiano(page);
		await enableSound(page);

		const deck = controlDeck(page);
		const cutoff = deck.getByRole('slider', { name: /Cutoff/i });
		await cutoff.focus();
		await cutoff.press('PageDown');
		await expect(oledScope(page)).toContainText(/Cutoff/i);

		const lfo1Depth = deck.getByRole('slider', { name: /LFO\s*1.*Depth/i });
		await lfo1Depth.focus();
		await lfo1Depth.press('End');
		expect((await readSlider(lfo1Depth)).now).toBeGreaterThan(0);

		const mod = modMatrixRegion(page);
		await mod.getByRole('button', { name: /LFO\s*1.*Cutoff/i }).click();
		const depth = mod.getByRole('slider', { name: /Mod depth|Depth/i });
		await depth.focus();
		await depth.press('End');

		const pt = await keyPoint(page, 60);
		await page.mouse.move(pt.x, pt.y);
		await page.mouse.down();
		await expect
			.poll(async () => {
				const snap = await canvasSnapshot(oledScope(page).locator('canvas').first());
				return snap.width > 0 && snap.height > 0 && snap.brightPixels > 0;
			})
			.toBe(true);
		await page.mouse.up();

		await root(page).getByRole('button', { name: 'Stop all sound' }).click();
		await expect
			.poll(async () => {
				const a = await readAudit(page);
				return a.started - a.ended;
			})
			.toBe(0);

		await monitor.assertClean();
	});

	test('Theme x Viewport x Still matrix preserves 5-tab mobile drawer and OledScope stability', async ({
		page
	}) => {
		const monitor = await attachRuntimeMonitor(page);
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await openPiano(page);

		for (const width of [390, 1024, 1440]) {
			await page.setViewportSize({ width, height: 1000 });
			for (const theme of ALL_THEMES) {
				await setThemeViaDom(page, theme);
				await expect(root(page)).toHaveClass(/still/);
				expect(
					await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)
				).toBe(true);
			}
		}

		await page.setViewportSize({ width: 390, height: 844 });
		await root(page)
			.getByRole('tablist')
			.getByRole('tab', { name: 'ARP/SEQ', exact: true })
			.click();
		await expect(arpSeqRegion(page)).toBeVisible();
		const snap1 = await canvasSnapshot(oledScope(page).locator('canvas').first());
		expect(snap1.width).toBeGreaterThan(0);
		expect(snap1.height).toBeGreaterThan(0);
		expect(snap1.brightPixels).toBeGreaterThan(0);
		await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 200)));
		const snap2 = await canvasSnapshot(oledScope(page).locator('canvas').first());
		expect(snap2).toEqual(snap1);

		await monitor.assertClean();
	});

	test('Mobile 5-tab drawer x Keybed glissando switches panels without blocking multi-key slide', async ({
		page
	}) => {
		const monitor = await attachRuntimeMonitor(page);
		await page.setViewportSize({ width: 390, height: 844 });
		await openPiano(page);

		const tablist = root(page).getByRole('tablist');
		await tablist.getByRole('tab', { name: 'OSC/MIX', exact: true }).click();
		await expect(controlDeck(page)).toBeVisible();
		await tablist.getByRole('tab', { name: 'MOD/FX', exact: true }).click();
		await expect(fxRackRegion(page)).toBeVisible();

		expect((await key(page, 60).boundingBox())!.width).toBeGreaterThanOrEqual(35);

		await key(page, 62).evaluate((element) =>
			element.scrollIntoView({ block: 'center', inline: 'center' })
		);
		const boxPoint = async (pitch: number) => {
			const box = await key(page, pitch).boundingBox();
			if (!box) throw new Error(`Key ${pitch} has no rectangle.`);
			return { x: box.x + box.width / 2, y: box.y + box.height * 0.8 };
		};
		const c4 = await boxPoint(60);
		const d4 = await boxPoint(62);
		const e4 = await boxPoint(64);
		expect(c4.x).toBeLessThan(d4.x);
		expect(d4.x).toBeLessThan(e4.x);

		await page.mouse.move(c4.x, c4.y);
		await page.mouse.down();
		await expect(root(page)).toHaveAttribute('data-held', '1');
		await expect(root(page).locator('.piano-whisper')).toContainText('C4 → C4');
		await page.mouse.move(d4.x, d4.y, { steps: 6 });
		await expect(root(page).locator('.piano-whisper')).toContainText('D4 → D4');
		await page.mouse.move(e4.x, e4.y, { steps: 6 });
		await expect(root(page).locator('.piano-whisper')).toContainText('E4 → E4');
		await page.mouse.up();
		await expect(root(page)).toHaveAttribute('data-held', '0');

		expect(
			await page.evaluate(
				() => window.scrollX === 0 && document.documentElement.scrollWidth <= innerWidth + 1
			)
		).toBe(true);

		await monitor.assertClean();
	});

	test('Chord Memory x [Rec WAV] x OLED Focus exports valid WAV while keeping probability arcs aligned', async ({
		page
	}) => {
		const monitor = await attachRuntimeMonitor(page);
		await openPiano(page);
		await enableSound(page);

		await telemetryBar(page)
			.getByRole('button', { name: /OLED Focus/i })
			.click();
		await expect(root(page)).toHaveAttribute('data-visual-mode', /oled/i);

		await performanceBay(page)
			.getByRole('combobox', { name: /Chord Memory/i })
			.selectOption({
				label: 'Maj7'
			});
		await telemetryBar(page)
			.getByRole('button', { name: /Rec WAV/i })
			.click();
		await playKey(page, 61);
		await expect(root(page).locator('.probability-light path[data-probability]')).toHaveCount(2);

		const wavBytes = await captureExportedWavBytes(page, async () => {
			await telemetryBar(page)
				.getByRole('button', { name: /Rec WAV|Stop Rec|Export/i })
				.click();
		});
		assertValidRiffWave(wavBytes);
		await root(page).getByRole('button', { name: 'Stop all sound' }).click();

		await monitor.assertClean();
	});
});

// ---------------------------------------------------------------------------
// Tier 4: Real-World Application Scenarios
// ---------------------------------------------------------------------------

test.describe('Tier 4: Real-World Application Scenarios', () => {
	test('Scenario 1: Preset auditioning and sound-design patching session with OledScope echo', async ({
		page
	}) => {
		const monitor = await attachRuntimeMonitor(page);
		await auditAudio(page);
		await openPiano(page);
		await enableSound(page);

		const audition = telemetryBar(page).getByRole('group', { name: /Audition/i });
		await audition.getByRole('button', { name: 'Pad', exact: true }).click();
		await audition.getByRole('button', { name: 'Lead', exact: true }).click();
		await telemetryBar(page)
			.getByRole('button', { name: /Next (patch|preset)/i })
			.click();

		const cutoff = controlDeck(page).getByRole('slider', { name: /Cutoff/i });
		await cutoff.focus();
		await cutoff.press('PageDown');
		await expect(oledScope(page)).toContainText(/Cutoff/i);

		const resonance = controlDeck(page).getByRole('slider', { name: /Resonance/i });
		await resonance.focus();
		await resonance.press('PageUp');

		await playKey(page, 60);
		await playKey(page, 64);
		await playKey(page, 67);
		await expect.poll(async () => (await readAudit(page)).started).toBeGreaterThan(0);

		// Return to 01 Forgiving Grand and confirm clean stop.
		await telemetryBar(page)
			.getByRole('combobox', { name: /Patch|Preset/i })
			.selectOption({ index: 0 });
		await root(page).getByRole('button', { name: 'Stop all sound' }).click();
		await expect
			.poll(async () => {
				const a = await readAudit(page);
				return a.started - a.ended;
			})
			.toBe(0);

		await monitor.assertClean();
	});

	test('Scenario 2: Custom patch creation, localStorage save, URL #patch= share and fresh reload', async ({
		page
	}) => {
		const monitor = await attachRuntimeMonitor(page);
		await openPiano(page);
		await page.evaluate((k) => localStorage.removeItem(k), SYNTH_STORAGE_KEY);

		const deck = controlDeck(page);
		await deck.getByRole('combobox', { name: /Osc\s*1\s*wave/i }).selectOption({ label: 'Saw' });
		const cutoff = deck.getByRole('slider', { name: /Cutoff/i });
		await cutoff.focus();
		await cutoff.press('PageDown');
		const savedCutoff = (await readSlider(cutoff)).now;
		expect(savedCutoff).toBeLessThan(18000);

		const lfo1Depth = deck.getByRole('slider', { name: /LFO\s*1.*Depth/i });
		await lfo1Depth.focus();
		await lfo1Depth.press('End');
		expect((await readSlider(lfo1Depth)).now).toBeGreaterThan(0);

		const mod = modMatrixRegion(page);
		const lfoCutoffCell = mod.getByRole('button', { name: /LFO\s*1.*Cutoff/i });
		await lfoCutoffCell.click();
		const depth = mod.getByRole('slider', { name: /Mod depth|Depth/i });
		await depth.focus();
		await depth.press('End');

		await fxRackRegion(page)
			.getByRole('combobox', { name: /Reverb|Room/i })
			.selectOption({
				label: 'Hall'
			});

		await telemetryBar(page)
			.getByRole('textbox', { name: /Patch name/i })
			.fill('Evening Pluck');
		await telemetryBar(page)
			.getByRole('button', { name: /Save patch/i })
			.click();
		const savedJson = await page.evaluate((k) => localStorage.getItem(k), SYNTH_STORAGE_KEY);
		expect(savedJson).toContain('Evening Pluck');

		await telemetryBar(page)
			.getByRole('button', { name: /Share|Copy.*patch/i })
			.click();
		await expect.poll(() => page.evaluate(() => window.location.hash)).toMatch(/^#patch=/);
		const hash = await page.evaluate(() => window.location.hash);

		// Isolate #patch= restoration from localStorage and perform a true cold navigation.
		await page.evaluate((k) => localStorage.removeItem(k), SYNTH_STORAGE_KEY);
		await page.goto('about:blank');
		await page.goto(`${article}${hash}`);
		await expect(root(page)).toBeVisible();
		await expect(root(page).getByRole('button', { name: 'Enable sound' })).toBeEnabled();
		expect(
			(await readSlider(controlDeck(page).getByRole('slider', { name: /Cutoff/i }))).now
		).toBeCloseTo(savedCutoff, 0);
		await expect(controlDeck(page).getByRole('combobox', { name: /Osc\s*1\s*wave/i })).toHaveValue(
			/saw/i
		);
		await expect(
			modMatrixRegion(page).getByRole('button', { name: /LFO\s*1.*Cutoff/i })
		).toHaveAttribute('data-polarity', 'positive');
		await expect(fxRackRegion(page).getByRole('combobox', { name: /Reverb|Room/i })).toHaveValue(
			/hall/i
		);
		await expect(telemetryBar(page).getByRole('combobox', { name: /Patch|Preset/i })).toContainText(
			'Evening Pluck'
		);

		await monitor.assertClean();
	});

	test('Scenario 3: Live Chord Memory + 3x3 Pads + ArpSequencerBar performance under Harmonic Assist', async ({
		page
	}) => {
		const monitor = await attachRuntimeMonitor(page);
		await auditAudio(page);
		await openPiano(page);
		await enableSound(page);

		const bay = performanceBay(page);
		await bay.getByRole('combobox', { name: /Chord Memory/i }).selectOption({ label: 'Maj7' });
		const padBefore = (await readAudit(page)).started;
		await bay.locator('[data-chord-pad], [data-pad-index]').first().click();
		await expect.poll(async () => (await readAudit(page)).started).toBeGreaterThan(padBefore);

		const arp = arpSeqRegion(page);
		await arp.getByRole('button', { name: /Step Rec/i }).click();
		await playKey(page, 60);
		await playKey(page, 64);
		await playKey(page, 67);
		await arp.getByRole('button', { name: /Step Rec/i }).click();

		await root(page).getByRole('button', { name: 'Nearest', exact: true }).click();
		await arp
			.getByRole('button', { name: /Hold|Latch/i })
			.or(arp.getByRole('checkbox', { name: /Hold|Latch/i }))
			.first()
			.click();
		await playKey(page, 60);

		const beforeTransport = (await readAudit(page)).started;
		await arp.getByRole('button', { name: /Play|Start/i }).click();
		await expect
			.poll(async () => (await readAudit(page)).started)
			.toBeGreaterThan(beforeTransport + 2);

		await root(page).getByRole('button', { name: 'Stop all sound' }).click();
		await expect(root(page)).toHaveAttribute('data-held', '0');
		await expect
			.poll(async () => {
				const a = await readAudit(page);
				return a.started - a.ended;
			})
			.toBe(0);

		await monitor.assertClean();
	});

	test('Scenario 4: Live recording and offline .wav bounce export with zero CSP violations', async ({
		page
	}) => {
		const monitor = await attachRuntimeMonitor(page);
		await openPiano(page);
		await enableSound(page);

		await telemetryBar(page)
			.getByRole('group', { name: /Audition/i })
			.getByRole('button', { name: 'Pad', exact: true })
			.click();
		await telemetryBar(page)
			.getByRole('button', { name: /Rec WAV/i })
			.click();

		await playKey(page, 60);
		await playKey(page, 64);
		await playKey(page, 67);

		const wavBytes = await captureExportedWavBytes(page, async () => {
			await telemetryBar(page)
				.getByRole('button', { name: /Rec WAV|Stop Rec|Export/i })
				.click();
		});
		assertValidRiffWave(wavBytes);

		await root(page).getByRole('button', { name: 'Stop all sound' }).click();
		await monitor.assertClean();
	});

	test('Scenario 5: Cross-device responsive continuity from 390px mobile drawer to 1440px studio across all themes', async ({
		page
	}) => {
		const monitor = await attachRuntimeMonitor(page);

		// 390px mobile playing view + 5-tab drawer.
		await page.setViewportSize({ width: 390, height: 844 });
		await openPiano(page);
		await expect(root(page)).toHaveAttribute('data-view', 'playing');
		const tablist = root(page).getByRole('tablist');
		await tablist.getByRole('tab', { name: 'ARP/SEQ', exact: true }).click();
		await expect(arpSeqRegion(page)).toBeVisible();
		await playKey(page, 60);
		expect((await key(page, 60).boundingBox())!.width).toBeGreaterThanOrEqual(35);

		// 1024px mid-desktop top-strip collapse.
		await page.setViewportSize({ width: 1024, height: 900 });
		const stripBox = await performanceBay(page).boundingBox();
		const keysBoxMid = await root(page).locator('.keyboard-window').boundingBox();
		if (!stripBox || !keysBoxMid) throw new Error('Missing mid-desktop bounding boxes.');
		expect(stripBox.y + stripBox.height).toBeLessThanOrEqual(keysBoxMid.y + 4);

		// 1440px desktop left-docked PerformanceBay + fit view + OLED Focus + all 4 themes.
		await page.setViewportSize({ width: 1440, height: 1000 });
		await expect(root(page)).toHaveAttribute('data-view', 'fit');
		const dockBox = await performanceBay(page).boundingBox();
		const keysBoxDesk = await root(page).locator('.keyboard-window').boundingBox();
		if (!dockBox || !keysBoxDesk) throw new Error('Missing desktop bounding boxes.');
		expect(dockBox.x + dockBox.width).toBeLessThanOrEqual(keysBoxDesk.x + 4);

		await telemetryBar(page)
			.getByRole('button', { name: /OLED Focus/i })
			.click();
		for (const theme of ALL_THEMES) {
			await setThemeViaDom(page, theme);
			expect(
				await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)
			).toBe(true);
		}
		await telemetryBar(page)
			.getByRole('button', { name: /Ambient Pond/i })
			.click();

		await monitor.assertClean();
	});

	test('Scenario 6: Gesture-gated Web MIDI live performance and clean AudioContext disposal on navigation', async ({
		page
	}) => {
		const monitor = await attachRuntimeMonitor(page);
		await installMidiMock(page, 'supported');
		await auditAudio(page);
		await openPiano(page);

		expect(
			await page.evaluate(() => (window as unknown as MidiMockWindow).__midiMock.requestCount)
		).toBe(0);
		await enableSound(page);
		await telemetryBar(page).getByRole('button', { name: /MIDI/i }).click();
		await expect
			.poll(() =>
				page.evaluate(() => (window as unknown as MidiMockWindow).__midiMock.requestCount)
			)
			.toBe(1);

		await page.evaluate(() => {
			const midi = (window as unknown as MidiMockWindow).__midiMock;
			midi.emit([0x90, 60, 110]);
			midi.emit([0xb0, 1, 80]);
			midi.emit([0xb0, 64, 127]);
			midi.emit([0xe0, 0x00, 0x70]);
			midi.emit([0x80, 60, 0]);
			midi.emit([0xb0, 64, 0]);
		});
		await expect.poll(async () => (await readAudit(page)).started).toBeGreaterThanOrEqual(5);

		await page
			.getByRole('navigation', { name: 'Primary navigation' })
			.getByRole('link', { name: 'Writing', exact: true })
			.click();
		await expect(root(page)).toHaveCount(0);
		await expect.poll(async () => (await readAudit(page)).closed).toBe(1);

		await monitor.assertClean();
	});
});

// ---------------------------------------------------------------------------
// Tier 5: Adversarial Hardening
// ---------------------------------------------------------------------------

test.describe('Tier 5: Adversarial Hardening', () => {
	test('T5-01: ControlDeck has zero card overflow and zero control occlusion at 1260px, 1280px, and 1440px', async ({
		page
	}) => {
		const monitor = await attachRuntimeMonitor(page);
		await openPiano(page);

		const deck = controlDeck(page);
		for (const viewport of [
			{ width: 1260, height: 900 },
			{ width: 1280, height: 900 },
			{ width: 1440, height: 1000 }
		]) {
			await page.setViewportSize(viewport);
			const cardOverflows = await deck.evaluate((el) =>
				Array.from(el.querySelectorAll<HTMLElement>('.synth-card')).map((card) => ({
					cls: card.className,
					scrollWidth: card.scrollWidth,
					clientWidth: card.clientWidth
				}))
			);
			for (const card of cardOverflows) {
				expect(
					card.scrollWidth,
					`${card.cls} overflowed at ${viewport.width}x${viewport.height}`
				).toBeLessThanOrEqual(card.clientWidth + 1);
			}

			const targets = [
				mixerFader(deck, 'Noise'),
				deck.getByRole('button', { name: 'LP12', exact: true }),
				deck.getByRole('button', { name: 'LP24', exact: true }),
				deck.getByRole('button', { name: 'BP12', exact: true }),
				deck.getByRole('button', { name: 'HP12', exact: true }),
				deck.getByRole('button', { name: 'LFO 2 BPM Sync', exact: true }),
				deck.getByRole('button', { name: 'LFO 2 Key Sync', exact: true }),
				deck.getByRole('slider', { name: 'LFO 2 Depth', exact: true })
			];
			for (const loc of targets) {
				const hit = await loc.evaluate((el) => {
					const rect = el.getBoundingClientRect();
					const cx = rect.left + rect.width / 2;
					const cy = rect.top + rect.height / 2;
					const topEl = document.elementFromPoint(cx, cy);
					return {
						width: rect.width,
						height: rect.height,
						matched: Boolean(topEl && (topEl === el || el.contains(topEl)))
					};
				});
				expect(hit.width).toBeGreaterThan(0);
				expect(hit.height).toBeGreaterThan(0);
				expect(hit.matched, `Control occluded at ${viewport.width}px`).toBe(true);
			}

			const hp12 = deck.getByRole('button', { name: 'HP12', exact: true });
			await hp12.click();
			await expect(hp12).toHaveAttribute('aria-pressed', 'true');
			await deck.getByRole('button', { name: 'LP12', exact: true }).click();
		}

		await monitor.assertClean();
	});

	test('T5-02: Current chord <select> override updates running chord progression immediately', async ({
		page
	}) => {
		const monitor = await attachRuntimeMonitor(page);
		await openPiano(page);

		await root(page)
			.getByRole('combobox', { name: 'Painting and harmony preset' })
			.selectOption('1');
		await workbench(page);
		await root(page).getByRole('button', { name: 'Start progression', exact: true }).click();
		await expect(root(page).locator('.piano-world-top')).toContainText('Dm9');

		await root(page).getByRole('combobox', { name: 'Current chord' }).selectOption('2');
		await expect(root(page).locator('.piano-world-top')).toContainText('Cmaj9');

		// Next 3s progression step must advance 2 -> 0 (Cmaj9 -> Dm9), not stale 0 -> 1 (G13)
		await expect(root(page).locator('.piano-world-top')).toContainText('Dm9', { timeout: 5500 });
		await root(page).getByRole('button', { name: 'Stop progression', exact: true }).click();
		await monitor.assertClean();
	});

	test('T5-03: Legato voice mode with Chord Memory keeps all 4 chord tones held without pruning', async ({
		page
	}) => {
		const monitor = await attachRuntimeMonitor(page);
		await auditAudio(page);
		await openPiano(page);
		await enableSound(page);

		await telemetryBar(page)
			.getByRole('combobox', { name: /Voice mode/i })
			.selectOption('legato');
		await performanceBay(page)
			.getByRole('combobox', { name: /Chord Memory/i })
			.selectOption('maj7');

		const c4 = await keyPoint(page, 60);
		await page.mouse.move(c4.x, c4.y);
		await page.mouse.down();

		await expect(root(page)).toHaveAttribute('data-held', '4');
		await expect(root(page).locator('.painted-key.sounded')).toHaveCount(4);

		await page.mouse.up();
		await expect(root(page)).toHaveAttribute('data-held', '0');
		await root(page).getByRole('button', { name: 'Stop all sound' }).click();
		await expect
			.poll(async () => {
				const a = await readAudit(page);
				return a.started - a.ended;
			})
			.toBe(0);
		await monitor.assertClean();
	});

	test('T5-04: Mobile < 960px 5-tab role="tablist" supports WAI-ARIA keyboard navigation and roving tabindex', async ({
		page
	}) => {
		const monitor = await attachRuntimeMonitor(page);
		await page.setViewportSize({ width: 390, height: 844 });
		await openPiano(page);

		const tablist = root(page).getByRole('tablist');
		const oscTab = tablist.getByRole('tab', { name: 'OSC/MIX', exact: true });
		const filterTab = tablist.getByRole('tab', { name: 'FILTER/ENV', exact: true });
		const inspectTab = tablist.getByRole('tab', { name: 'INSPECT', exact: true });

		await expect(oscTab).toHaveAttribute('tabindex', '0');
		await expect(filterTab).toHaveAttribute('tabindex', '-1');
		const panelId = await oscTab.getAttribute('aria-controls');
		expect(panelId).toBeTruthy();
		await expect(root(page).locator(`#${panelId}`)).toHaveAttribute('role', 'tabpanel');

		await oscTab.focus();
		await page.keyboard.press('ArrowRight');
		await expect(filterTab).toHaveAttribute('aria-selected', 'true');
		await expect(filterTab).toHaveAttribute('tabindex', '0');
		await expect(oscTab).toHaveAttribute('tabindex', '-1');
		await expect(filterTab).toBeFocused();
		await expect(controlDeck(page).getByRole('slider', { name: /Cutoff/i })).toBeVisible();

		await page.keyboard.press('End');
		await expect(inspectTab).toHaveAttribute('aria-selected', 'true');
		await expect(inspectTab).toBeFocused();

		await page.keyboard.press('Home');
		await expect(oscTab).toHaveAttribute('aria-selected', 'true');
		await expect(oscTab).toBeFocused();

		await page.keyboard.press('ArrowLeft');
		await expect(inspectTab).toHaveAttribute('aria-selected', 'true');
		await expect(inspectTab).toBeFocused();

		await monitor.assertClean();
	});

	test('T5-05: ModMatrix column 4 label accurately reports Amp (not Amp/Pan)', async ({ page }) => {
		const monitor = await attachRuntimeMonitor(page);
		await openPiano(page);

		const mod = modMatrixRegion(page);
		const ampCell = mod.locator('[data-source="0"][data-dest="4"]');
		await expect(ampCell).toHaveAttribute('aria-label', 'LFO 1 to Amp');
		await ampCell.click();
		await expect(mod.locator('.module-sub')).toHaveText('LFO 1 → Amp');

		await monitor.assertClean();
	});

	test('T5-06: Patch save rejects whitespace, prevents punctuation slug collisions, and restores factory ID from sessionStorage', async ({
		page
	}) => {
		const monitor = await attachRuntimeMonitor(page);
		await openPiano(page);
		await page.evaluate((k) => {
			localStorage.removeItem(k);
			sessionStorage.removeItem('suvro-synth-last-id');
		}, SYNTH_STORAGE_KEY);

		const bank = telemetryBar(page).getByRole('combobox', { name: /Patch|Preset/i });
		const nameInput = telemetryBar(page).getByRole('textbox', { name: /Patch name/i });
		const saveBtn = telemetryBar(page).getByRole('button', { name: /Save patch/i });

		// 1. Whitespace-only draft must preserve active preset and never revert to 01 Forgiving Grand
		await bank.selectOption('04-neon-supersaw');
		await nameInput.fill('   ');
		await saveBtn.click();
		await expect(bank).toHaveValue('04-neon-supersaw');
		await expect(nameInput).toHaveValue('04 Neon Supersaw');

		// 2. Punctuation slug collisions must produce distinct user patch IDs
		await bank.selectOption('02-electric-tines');
		await nameInput.fill('Studio!One');
		await saveBtn.click();
		await bank.selectOption('08-sub-octave-bass');
		await nameInput.fill('Studio?One');
		await saveBtn.click();

		const savedPatches = await page.evaluate((k) => {
			const raw = localStorage.getItem(k);
			return raw ? (JSON.parse(raw) as Array<{ id: string; name: string }>) : [];
		}, SYNTH_STORAGE_KEY);
		expect(savedPatches).toHaveLength(2);
		expect(new Set(savedPatches.map((p) => p.id)).size).toBe(2);
		expect(savedPatches.map((p) => p.name)).toEqual(
			expect.arrayContaining(['Studio!One', 'Studio?One'])
		);

		// 3. Factory preset selection persists via sessionStorage across reload without #patch=
		await bank.selectOption('03-warm-analog-poly');
		await page.reload();
		await expect(root(page)).toBeVisible();
		await expect(root(page).getByRole('button', { name: 'Enable sound' })).toBeEnabled();
		await expect(telemetryBar(page).getByRole('combobox', { name: /Patch|Preset/i })).toHaveValue(
			'03-warm-analog-poly'
		);

		await monitor.assertClean();
	});

	test('T5-07: Step Rec syncs cursor to clicked step and Stop all sound resets Step Rec cursor and Arp Hold Latch', async ({
		page
	}) => {
		const monitor = await attachRuntimeMonitor(page);
		await openPiano(page);

		const arp = arpSeqRegion(page);
		const step5 = arp.locator('[data-step-index="4"]');
		await step5.click();
		await expect(step5).toHaveAttribute('aria-pressed', 'true');
		// Toggle back off so Step Rec sets it cleanly
		await step5.click();
		await expect(step5).toHaveAttribute('aria-pressed', 'false');

		const stepRecBtn = arp.getByRole('button', { name: /Step Rec/i });
		await stepRecBtn.click();
		await playKey(page, 60);
		await expect(step5).toHaveAttribute('aria-pressed', 'true');

		await stepRecBtn.click();
		await arp.locator('[data-step-index="0"]').click();
		if ((await arp.locator('[data-step-index="0"]').getAttribute('aria-pressed')) === 'true') {
			await arp.locator('[data-step-index="0"]').click();
		}
		await expect(arp.locator('[data-step-index="0"]')).toHaveAttribute('aria-pressed', 'false');

		const latchBtn = arp.getByRole('button', { name: /Arp Hold Latch/i });
		await latchBtn.click();
		await expect(latchBtn).toHaveAttribute('aria-pressed', 'true');
		await playKey(page, 60);
		await arp.getByRole('button', { name: /Play|Start/i }).click();

		await root(page).getByRole('button', { name: 'Stop all sound' }).click();
		await expect(latchBtn).toHaveAttribute('aria-pressed', 'false');

		await stepRecBtn.click();
		await playKey(page, 62);
		await expect(arp.locator('[data-step-index="0"]')).toHaveAttribute('aria-pressed', 'true');

		await monitor.assertClean();
	});

	test('T5-08: Integer knobs distinguish Arrow vs Shift+Arrow and mid-drag Shift stays monotonic', async ({
		page
	}) => {
		const monitor = await attachRuntimeMonitor(page);
		await openPiano(page);

		for (const slider of [
			performanceBay(page).getByRole('slider', { name: /Glide/i }),
			fxRackRegion(page).getByRole('slider', { name: /Delay Time/i }),
			arpSeqRegion(page).getByRole('slider', { name: /BPM/i })
		]) {
			await slider.focus();
			await slider.press('Home');
			const atMin = (await readSlider(slider)).now;
			await slider.press('Shift+ArrowUp');
			const afterShift = (await readSlider(slider)).now;
			await slider.press('Home');
			await slider.press('ArrowUp');
			const afterArrow = (await readSlider(slider)).now;
			expect(afterShift - atMin).toBe(1);
			expect(afterArrow - atMin).toBeGreaterThan(1);
		}

		// Mid-drag Shift on Master volume must not jump backwards
		const master = telemetryBar(page).getByRole('slider', { name: /Master volume/i });
		await master.focus();
		await master.press('Home');
		const box = await master.boundingBox();
		if (!box) throw new Error('Master volume knob missing bounding box.');
		const cx = box.x + box.width / 2;
		const cy = box.y + box.height / 2;
		await page.mouse.move(cx, cy);
		await page.mouse.down();
		await page.mouse.move(cx, cy - 150, { steps: 6 });
		const beforeShift = (await readSlider(master)).now;
		expect(beforeShift).toBeCloseTo(0.8, 2);

		await page.keyboard.down('Shift');
		await page.mouse.move(cx, cy - 151);
		const afterShiftDrag = (await readSlider(master)).now;
		await page.keyboard.up('Shift');
		await page.mouse.up();
		expect(afterShiftDrag).toBeGreaterThanOrEqual(beforeShift - 0.001);

		await monitor.assertClean();
	});

	test('T5-09: high-contrast a.wav-download:focus-visible shows 3px white outline and Patch name fits without clipping', async ({
		page
	}) => {
		const monitor = await attachRuntimeMonitor(page);
		await openPiano(page);

		const nameInput = telemetryBar(page).getByRole('textbox', { name: /Patch name/i });
		const fitCheck = await nameInput.evaluate((el) => {
			const input = el as HTMLInputElement;
			return {
				value: input.value,
				clientWidth: input.clientWidth,
				scrollWidth: input.scrollWidth
			};
		});
		expect(fitCheck.value).toBe('01 Forgiving Grand');
		expect(fitCheck.scrollWidth).toBeLessThanOrEqual(fitCheck.clientWidth + 2);

		await enableSound(page);
		await telemetryBar(page)
			.getByRole('button', { name: /Rec WAV/i })
			.click();
		await playKey(page, 60);
		await captureExportedWavBytes(page, async () => {
			await telemetryBar(page)
				.getByRole('button', { name: /Rec WAV|Stop Rec|Export/i })
				.click();
		});

		await setThemeViaDom(page, 'high-contrast');
		const recBtn = telemetryBar(page).getByRole('button', { name: /Rec WAV/i });
		await recBtn.focus();
		await page.keyboard.press('Tab');
		const wavLink = telemetryBar(page).locator('a.wav-download');
		await expect(wavLink).toBeFocused();
		await expect(wavLink).toHaveCSS('outline-color', 'rgb(255, 255, 255)');
		await expect(wavLink).toHaveCSS('outline-width', '3px');

		await root(page).getByRole('button', { name: 'Stop all sound' }).click();
		await monitor.assertClean();
	});

	test('T5-10: A0 5-partial reap latency, Preset 02 Legato+Arp isolation, window.blur during Rec WAV, and TTS claimPlayback', async ({
		page
	}) => {
		const monitor = await attachRuntimeMonitor(page);
		await auditAudio(page);
		await openPiano(page);
		await enableSound(page);

		// 1. A0 (pitch 21) 5-partial must reap promptly in <= 1s (not hang 5.425s)
		await root(page).getByRole('button', { name: 'Raw', exact: true }).click();
		await playKey(page, 21);
		await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 100)));
		await root(page).getByRole('button', { name: 'Stop all sound' }).click();
		await expect(root(page)).toHaveAttribute('data-held', '0');
		await expect
			.poll(
				async () => {
					const a = await readAudit(page);
					return a.started - a.ended;
				},
				{ timeout: 1000 }
			)
			.toBe(0);

		// 2. Preset 02 (filterEnv.release < ampEnv.release) + Legato + Arp isolation
		await telemetryBar(page)
			.getByRole('combobox', { name: /Patch|Preset/i })
			.selectOption('02-electric-tines');
		await telemetryBar(page)
			.getByRole('combobox', { name: /Voice mode/i })
			.selectOption('legato');
		const arp = arpSeqRegion(page);
		await arp.getByRole('button', { name: /Arp Hold Latch/i }).click();
		await playKey(page, 60);
		await arp.getByRole('button', { name: /Play|Start/i }).click();
		const e4Pt = await keyPoint(page, 64);
		await page.mouse.move(e4Pt.x, e4Pt.y);
		await page.mouse.down();
		await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 300)));
		expect(Number(await root(page).getAttribute('data-held'))).toBeGreaterThanOrEqual(1);
		await page.mouse.up();
		await root(page).getByRole('button', { name: 'Stop all sound' }).click();
		await expect
			.poll(
				async () => {
					const a = await readAudit(page);
					return a.started - a.ended;
				},
				{ timeout: 1500 }
			)
			.toBe(0);

		// 3. window.blur keeps Rec WAV active and exports valid RIFF/WAVE
		await telemetryBar(page)
			.getByRole('combobox', { name: /Patch|Preset/i })
			.selectOption('01-forgiving-grand');
		const recBtn = telemetryBar(page).getByRole('button', { name: /Rec WAV/i });
		await recBtn.click();
		await playKey(page, 60);
		await page.evaluate(() => window.dispatchEvent(new Event('blur')));
		await expect(recBtn).toHaveAttribute('aria-pressed', 'true');
		await playKey(page, 64);
		const wavBytes = await captureExportedWavBytes(page, async () => {
			await telemetryBar(page)
				.getByRole('button', { name: /Rec WAV|Stop Rec|Export/i })
				.click();
		});
		assertValidRiffWave(wavBytes);

		// 4. TTS <-> Synth claimPlayback mutual exclusion
		await root(page).getByRole('button', { name: 'Nearest', exact: true }).click();
		await root(page).locator('[data-piano-key="60"]').focus();
		await page.keyboard.down('a');
		await expect(root(page)).toHaveAttribute('data-held', '1');

		const tts = page.locator('[data-testid="article-tts"]');
		await tts.getByRole('button', { name: 'Listen to article', exact: true }).click();
		await expect(tts.getByRole('button', { name: 'Pause article audio' })).toBeVisible();
		await expect(root(page)).toHaveAttribute('data-held', '0');
		await expect(root(page).locator('.sound-status')).toContainText(
			'Paused for article narration.'
		);
		await page.keyboard.up('a');

		await playKey(page, 64);
		await expect(tts.getByRole('button', { name: 'Listen to article', exact: true })).toBeVisible();
		await root(page).getByRole('button', { name: 'Stop all sound' }).click();

		await monitor.assertClean();
	});
});
