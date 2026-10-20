import { expect, test, type Page } from '@playwright/test';

const article = '/blog/visualizations/the-piano-that-forgives';
const root = (page: Page) => page.locator('[data-piano-root]');
const key = (page: Page, pitch: number) => root(page).locator(`[data-piano-key="${pitch}"]`);

async function openPiano(page: Page) {
	await page.goto(article);
	await expect(root(page)).toBeVisible();
	await expect(root(page).getByRole('button', { name: 'Enable sound' })).toBeEnabled();
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
	const before = await readAudit(page);
	await root(page).getByRole('combobox', { name: 'Current chord' }).selectOption('1');
	await expect(root(page).locator('.piano-world-top')).toContainText('G13');
	// No new note-on and no release during chord selection: the held pitch is frozen.
	expect((await readAudit(page)).started).toBe(before.started);
	expect((await readAudit(page)).stops).toBe(before.stops);
	await root(page).getByRole('checkbox', { name: 'Hold pedal' }).uncheck();
	await expect.poll(async () => (await readAudit(page)).stops).toBe(before.stops + 5);
	await expect.poll(async () => (await readAudit(page)).ended).toBe(5);
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
