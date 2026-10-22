import { expect, test, type Page } from '@playwright/test';

const article = '/blog/visualizations/the-piano-that-forgives';
const root = (page: Page) => page.locator('[data-piano-root]');
const key = (page: Page, pitch: number) => root(page).locator(`[data-piano-key="${pitch}"]`);

async function openPiano(page: Page) {
	await page.goto(article);
	await expect(root(page)).toBeVisible();
	await expect(root(page).getByRole('button', { name: 'Enable sound' })).toBeEnabled();
	const privacy = page.getByRole('button', { name: 'Reject optional', exact: true });
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
	await expect.poll(() => window.evaluate((element) => element.scrollLeft)).toBeGreaterThan(before);
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
	await root(page).getByRole('combobox', { name: 'Painting and harmony preset' }).selectOption('1');
	await expect(root(page)).toHaveAttribute('data-held', '0');
	await page.mouse.up();
	await workbench(page);
	await expect(
		root(page).getByRole('combobox', { name: 'Current chord' }).locator('option')
	).toHaveText(['Dm9', 'G13', 'Cmaj9']);
	await root(page).getByRole('combobox', { name: 'Painting and harmony preset' }).selectOption('2');
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
	await root(page).getByRole('combobox', { name: 'Painting and harmony preset' }).selectOption('1');
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
	await expect(root(page).getByRole('button', { name: 'Replay phrase', exact: true })).toBeEnabled({
		timeout: 12_000
	});
	await root(page).locator('.decision-inspector details > summary').click();
	const assisted = await root(page).locator('.decision-inspector ol li').allTextContents();
	expect(assisted.length).toBeGreaterThanOrEqual(12);
	expect(assisted.some((line) => /C♯4 → (C4|D4)/.test(line))).toBe(true);
	await root(page).getByRole('button', { name: 'Raw', exact: true }).click();
	await root(page).getByRole('button', { name: 'Replay phrase', exact: true }).click();
	await expect(root(page).getByRole('button', { name: 'Replay phrase', exact: true })).toBeEnabled({
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
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
			true
		);
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
		const audit: { made: number; closed: number; complete?: () => void } = { made: 0, closed: 0 };
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
