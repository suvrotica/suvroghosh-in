import { expect, test } from '@playwright/test';

test.describe('COMM-LINK (/tools/radio) end-to-end verification', () => {
	test('renders faithful handheld radio UI, enforces security headers, captures desktop & mobile screenshots, and isolates Notes admin auth', async ({
		page
	}, testInfo) => {
		const startNav = Date.now();
		const response = await page.goto('/tools/radio', { waitUntil: 'domcontentloaded' });
		expect(response?.status()).toBe(200);

		const headers = response?.headers() ?? {};
		expect(headers['permissions-policy']).toBe('camera=(), microphone=(self), geolocation=()');
		expect(headers['cache-control']).toContain('private');
		expect(headers['cache-control']).toContain('no-store');
		expect(headers['x-robots-tag']).toContain('noindex');

		// Verify all mapped physical controls are interactive
		await expect(page.getByTestId('handheld-radio-unit')).toBeVisible();
		await expect(page.getByTestId('amber-screen')).toBeVisible();
		await expect(page.getByTestId('channel-select-dial')).toBeVisible();
		await expect(page.getByTestId('orange-power-switch')).toBeVisible();
		await expect(page.getByTestId('ptt-button')).toBeVisible();
		await expect(page.getByTestId('mode-button')).toBeVisible();
		await expect(page.getByTestId('scan-button')).toBeVisible();
		await expect(page.getByTestId('icon-btn-people')).toBeVisible();
		await expect(page.getByTestId('icon-btn-speaker')).toBeVisible();
		await expect(page.getByTestId('icon-btn-settings')).toBeVisible();
		await expect(page.getByTestId('icon-btn-lock')).toBeVisible();

		const interactiveMs = Date.now() - startNav;
		console.log(`[PERF] Desktop interactive controls ready in ${interactiveMs} ms`);
		expect(interactiveMs).toBeLessThan(2500);

		// Close initial join drawer to capture clean hero screenshot of the handheld radio on the beige workbench
		const closeBtn = page.locator('.close-btn').first();
		if (await closeBtn.isVisible()) {
			await closeBtn.click();
		}

		await page.screenshot({
			path: testInfo.outputPath('comm-link-desktop.png'),
			fullPage: false
		});

		// Verify mobile layout (390x844) fits width without horizontal scrolling
		await page.setViewportSize({ width: 390, height: 844 });
		const hasHorizontalOverflow = await page.evaluate(() => {
			return document.documentElement.scrollWidth > window.innerWidth;
		});
		expect(hasHorizontalOverflow).toBe(false);

		await page.screenshot({
			path: testInfo.outputPath('comm-link-mobile.png'),
			fullPage: false
		});

		// Restore desktop viewport and test High-Contrast View
		await page.setViewportSize({ width: 1280, height: 860 });
		await page.getByTestId('topbar-high-contrast-btn').click();
		await expect(page.getByTestId('high-contrast-controls')).toBeVisible();
		await page.getByTestId('topbar-high-contrast-btn').click();

		// Verify Notes owner-only isolation even after signing in as a COMM-LINK participant
		await page.getByTestId('icon-btn-invite').click();
		await page.getByTestId('local-test-auth-details').click();
		await page.getByTestId('test-auth-sub').fill('participant_sub_01');
		await page.getByTestId('test-auth-email').fill('participant01@example.com');
		await page.getByTestId('test-auth-name').fill('Participant One');
		await page.getByTestId('test-auth-submit').click();
		await expect(page.getByTestId('signed-in-operator-tag')).toContainText('Participant One');

		// Attempting to access owner-only Notes studio or API must never succeed with a COMM-LINK session
		const notesRes = await page.request.get('/notes/studio', { maxRedirects: 0 });
		expect([302, 303, 307, 308, 401, 403, 503]).toContain(notesRes.status());
		expect(notesRes.status()).not.toBe(200);
	});

	test('supports multi-user room creation, invite links, Conversation mode, Radio PTT leases, dial selection without silent join, and mic cleanup', async ({
		browser
	}, testInfo) => {
		const hostContext = await browser.newContext({
			permissions: ['microphone'],
			serviceWorkers: 'block'
		});
		const guestContext = await browser.newContext({
			permissions: ['microphone'],
			serviceWorkers: 'block'
		});
		await guestContext.addInitScript(() => {
			const tracks: MediaStreamTrack[] = [];
			Object.defineProperty(window, 'radioTestMicrophones', { value: tracks });
			const devices = navigator.mediaDevices;
			const capture = devices.getUserMedia.bind(devices);
			devices.getUserMedia = async (constraints) => {
				const stream = await capture(constraints);
				tracks.push(...stream.getAudioTracks());
				return stream;
			};
		});

		const hostPage = await hostContext.newPage();
		const guestPage = await guestContext.newPage();
		const pttRelease = () => guestPage.waitForResponse((response) =>
			response.url().endsWith('/ptt') && response.request().postDataJSON()?.action === 'release');
		const microphoneCounts = () => guestPage.evaluate(() => {
			const tracks = (window as Window & { radioTestMicrophones?: MediaStreamTrack[] }).radioTestMicrophones ?? [];
			return { live: tracks.filter((track) => track.readyState === 'live').length, total: tracks.length };
		});

		// 1. Host signs in and creates room "EVENING CHAT"
		await hostPage.goto('/tools/radio');
		await hostPage.getByTestId('local-test-auth-details').click();
		await hostPage.getByTestId('test-auth-sub').fill('host_suvro');
		await hostPage.getByTestId('test-auth-email').fill('suvro@example.com');
		await hostPage.getByTestId('test-auth-name').fill('Suvro');
		await hostPage.getByTestId('test-auth-submit').click();
		await expect(hostPage.getByTestId('signed-in-operator-tag')).toContainText('Suvro');

		await hostPage.getByTestId('scan-button').click();
		await hostPage.getByTestId('create-room-name-input').fill('EVENING CHAT');
		await hostPage.getByTestId('create-room-submit-btn').click();

		// Verify explicit microphone explanation before requesting getUserMedia
		await expect(hostPage.getByTestId('mic-permission-explanation')).toContainText(
			'Allow microphone access so people in this room can hear you when you unmute.'
		);

		const joinStartMs = Date.now();
		await hostPage.getByTestId('enable-mic-and-join-btn').click();
		await expect(hostPage.getByTestId('amber-line-1')).toHaveText('COMM-LINK [CONNECTED]');
		const joinElapsedMs = Date.now() - joinStartMs;
		console.log(
			`[PERF] Time to connected room audio after auth & permissions: ${joinElapsedMs} ms`
		);
		expect(joinElapsedMs).toBeLessThan(3000);

		// Verify joined muted by default
		await expect(hostPage.getByTestId('amber-line-2')).toHaveText('ROOM: EVENING CHAT');
		await expect(hostPage.getByTestId('amber-line-3')).toHaveText('PEOPLE: 01');
		await expect(hostPage.getByTestId('amber-line-4')).toHaveText('MIC: MUTED');

		// 2. Host copies invitation link from Lock panel
		await hostPage.getByTestId('icon-btn-lock').click();
		const inviteLink = await hostPage.getByTestId('active-invite-link-input').inputValue();
		expect(inviteLink).toContain('/tools/radio?invite=');

		// 3. Guest (Maya) opens invitation link, signs in, and joins
		await guestPage.goto(inviteLink);
		await expect(guestPage.getByTestId('invitation-preview-box')).toHaveCount(0);
		await guestPage.getByTestId('local-test-auth-details').click();
		await guestPage.getByTestId('test-auth-sub').fill('guest_maya');
		await guestPage.getByTestId('test-auth-email').fill('maya@example.com');
		await guestPage.getByTestId('test-auth-name').fill('Maya');
		await guestPage.getByTestId('test-auth-submit').click();
		await expect(guestPage.getByTestId('signed-in-operator-tag')).toContainText('Maya');
		// The production OAuth callback returns to a fresh authenticated page too.
		await guestPage.reload();
		await expect(guestPage.getByTestId('invitation-preview-box')).toContainText('EVENING CHAT');

		await guestPage.getByTestId('request-join-with-mic-btn').click();
		await expect(guestPage.getByTestId('amber-line-1')).toHaveText('COMM-LINK [CONNECTED]');
		await expect(guestPage.getByTestId('amber-line-3')).toHaveText('PEOPLE: 02');
		await expect(guestPage.getByTestId('amber-line-4')).toHaveText('MIC: MUTED');

		// 4. Guest unmutes in Conversation mode using central PTT button
		await guestPage.getByTestId('ptt-button').click();
		await expect(guestPage.getByTestId('amber-line-4')).toHaveText('MIC: TRANSMITTING');
		await guestPage.getByTestId('ptt-button').click();
		await expect(guestPage.getByTestId('amber-line-4')).toHaveText('MIC: MUTED');

		// 5. Turning channel dial selects slot without silently leaving or switching the room
		await hostPage.getByTestId('dial-next-btn').click();
		await expect(hostPage.getByTestId('dial-slot-readout')).toHaveText('CH 02');
		await expect(hostPage.getByTestId('amber-line-1')).toHaveText('COMM-LINK [CONNECTED]');
		await hostPage.getByTestId('dial-prev-btn').click();

		// 6. Host switches room to Radio (Push-to-Talk) mode via MODE button
		await hostPage.getByTestId('mode-button').click();
		await expect(hostPage.getByTestId('lcd-mode-indicator')).toHaveText('PTT');

		// Enable accessible Tap-to-Start / Tap-to-Stop PTT latch on Guest so we can test competing PTT deterministically
		await guestPage.getByTestId('icon-btn-settings').click();
		await guestPage.getByTestId('toggle-ptt-latch-checkbox').check();
		await guestPage.getByTestId('icon-btn-settings').click();

		// Wait for Guest poll to see Radio mode
		await expect(guestPage.getByTestId('lcd-mode-indicator')).toHaveText('PTT');

		// Guest taps PTT to start transmitting in Radio mode
		await guestPage.getByTestId('ptt-button').click();
		await expect(guestPage.getByTestId('amber-line-4')).toHaveText('MIC: TRANSMITTING');
		await expect(guestPage.getByTestId('amber-line-5')).toHaveText("SPEAKING: YOU'RE SPEAKING");
		await guestPage.screenshot({
			path: testInfo.outputPath('comm-link-connected.png'),
			fullPage: false
		});

		// Host attempts to press PTT while Maya holds the speaking turn -> Channel busy!
		await hostPage.getByTestId('icon-btn-settings').click();
		await hostPage.getByTestId('toggle-ptt-latch-checkbox').check();
		await hostPage.getByTestId('icon-btn-settings').click();
		await hostPage.getByTestId('ptt-button').click();
		await expect(hostPage.getByTestId('amber-line-4')).toHaveText('MIC: CHANNEL BUSY');
		await expect(hostPage.getByTestId('amber-line-5')).toHaveText('SPEAKING: MAYA');

		// Guest taps PTT again to stop transmitting
		const latchReleased = pttRelease();
		await guestPage.getByTestId('ptt-button').click();
		await expect(guestPage.getByTestId('amber-line-4')).toHaveText('MIC: HOLD PTT');
		await expect.poll(async () => (await microphoneCounts()).live).toBe(0);
		await latchReleased;

		// Hold-to-talk releases the actual capture track on pointerup.
		await guestPage.getByTestId('icon-btn-settings').click();
		await guestPage.getByTestId('toggle-ptt-latch-checkbox').uncheck();
		await guestPage.getByTestId('icon-btn-settings').click();
		await guestPage.getByTestId('ptt-button').hover();
		await guestPage.mouse.down();
		await expect(guestPage.getByTestId('amber-line-4')).toHaveText('MIC: TRANSMITTING');
		expect((await microphoneCounts()).live).toBe(1);
		const heldPressReleased = pttRelease();
		await guestPage.mouse.up();
		await expect.poll(async () => (await microphoneCounts()).live).toBe(0);
		await heldPressReleased;

		// An accepted acquire that arrives after release cannot open a new microphone track.
		let resumeAcquire!: () => void;
		let acceptedAcquire!: () => void;
		const acquireResponseHeld = new Promise<void>((resolve) => { acceptedAcquire = resolve; });
		const releaseAcquireResponse = new Promise<void>((resolve) => { resumeAcquire = resolve; });
		let releaseCount = 0;
		const countReleaseResponses = (response: import('@playwright/test').Response) => {
			if (response.url().endsWith('/ptt') && response.request().postDataJSON()?.action === 'release') {
				releaseCount++;
			}
		};
		guestPage.on('response', countReleaseResponses);
		await guestPage.route('**/api/radio/rooms/*/ptt', async (route) => {
			const action = route.request().postDataJSON()?.action;
			if (action !== 'acquire') return route.continue();
			const response = await route.fetch();
			acceptedAcquire();
			await releaseAcquireResponse;
			await route.fulfill({ response });
		});
		const beforeLateAcquire = await microphoneCounts();
		await guestPage.mouse.down();
		await acquireResponseHeld;
		await guestPage.mouse.up();
		resumeAcquire();
		await expect.poll(() => releaseCount).toBe(2);
		expect(await microphoneCounts()).toEqual(beforeLateAcquire);
		guestPage.off('response', countReleaseResponses);
		await guestPage.unroute('**/api/radio/rooms/*/ptt');

		// A healthy heartbeat delayed beyond three seconds can renew the turn. Keyup still stops capture.
		await guestPage.route('**/api/radio/rooms/*/ptt', async (route) => {
			if (route.request().postDataJSON()?.action !== 'heartbeat') return route.continue();
			const response = await route.fetch();
			await new Promise<void>((resolve) => setTimeout(resolve, 3_400));
			await route.fulfill({ response });
		});
		const keyboardHeartbeat = guestPage.waitForResponse((response) =>
			response.url().endsWith('/ptt') && response.request().postDataJSON()?.action === 'heartbeat',
			{ timeout: 8_000 }
		);
		await guestPage.getByTestId('ptt-button').focus();
		await guestPage.keyboard.down('Space');
		await expect(guestPage.getByTestId('amber-line-4')).toHaveText('MIC: TRANSMITTING');
		expect(await (await keyboardHeartbeat).json()).toMatchObject({ ok: true });
		expect((await microphoneCounts()).live).toBe(1);
		const keyboardReleased = pttRelease();
		await guestPage.keyboard.up('Space');
		await expect.poll(async () => (await microphoneCounts()).live).toBe(0);
		await keyboardReleased;
		await guestPage.unroute('**/api/radio/rooms/*/ptt');

		// Loss of connectivity releases the real mic while the button is still held.
		await guestPage.mouse.down();
		await expect(guestPage.getByTestId('amber-line-4')).toHaveText('MIC: TRANSMITTING');
		expect((await microphoneCounts()).live).toBe(1);
		await guestContext.setOffline(true);
		await expect.poll(async () => (await microphoneCounts()).live, { timeout: 6_000 }).toBe(0);
		await guestContext.setOffline(false);
		await guestPage.mouse.up();
		await expect(guestPage.getByTestId('amber-line-4')).toHaveText('MIC: HOLD PTT');

		// 7. Powering off disconnects and releases microphone
		await guestPage.getByTestId('orange-power-switch').click();
		await expect(guestPage.getByTestId('amber-line-1')).toHaveText('COMM-LINK [SELECTED]');
		await expect(guestPage.getByTestId('amber-line-4')).toHaveText('MIC: STANDBY');

		// 8. Guest rejoins in Listener-Only mode without enabling microphone
		await guestPage.getByTestId('icon-btn-invite').click();
		await guestPage.getByTestId('join-listening-only-btn').click();
		await expect(guestPage.getByTestId('amber-line-1')).toHaveText('COMM-LINK [CONNECTED]');
		await expect(guestPage.getByTestId('amber-line-4')).toHaveText('MIC: LISTENING');

		// 9. Host locks room and ends room for all participants
		await hostPage.getByTestId('icon-btn-lock').click();
		await hostPage.getByTestId('host-toggle-lock-btn').click();
		await expect(hostPage.getByTestId('host-toggle-lock-btn')).toContainText('Unlock Room');

		await hostPage.getByTestId('icon-btn-people').click();
		await hostPage.getByTestId('host-end-room-btn').click();
		await expect(hostPage.getByTestId('amber-line-1')).toHaveText('COMM-LINK [READY]');

		await hostContext.close();
		await guestContext.close();
	});
});
