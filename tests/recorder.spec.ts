import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import { inspectMediaContainer } from '../src/lib/recorder/mp4-parser';

test.describe('Recorder — by Suvro Ghosh (/tools/recorder)', () => {
	test('renders above the fold without requesting microphone permission on initial load and sets microphone=(self) header', async ({
		page
	}) => {
		await page.addInitScript(() => {
			(window as unknown as { __getUserMediaCalls: number }).__getUserMediaCalls = 0;
			if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
				const orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
				navigator.mediaDevices.getUserMedia = async (constraints) => {
					(window as unknown as { __getUserMediaCalls: number }).__getUserMediaCalls++;
					return orig(constraints);
				};
			}
		});

		const response = await page.goto('/tools/recorder', { waitUntil: 'domcontentloaded' });
		expect(response?.ok()).toBe(true);
		const permissionsPolicy = response?.headers()['permissions-policy'] ?? '';
		expect(permissionsPolicy).toContain('microphone=(self)');

		await expect(page.getByTestId('recorder-hero-tagline')).toHaveText(
			'Record something. Make it clearer. Keep it.'
		);
		await expect(page.getByTestId('record-start-btn')).toBeVisible();

		const callsOnLoad = await page.evaluate(
			() => (window as unknown as { __getUserMediaCalls: number }).__getUserMediaCalls
		);
		expect(callsOnLoad).toBe(0);
	});

	test('shows clear recovery guidance when microphone permission is denied', async ({ page }) => {
		await page.addInitScript(() => {
			if (navigator.mediaDevices) {
				navigator.mediaDevices.getUserMedia = async () => {
					throw new DOMException('Permission denied', 'NotAllowedError');
				};
			}
		});

		await page.goto('/tools/recorder', { waitUntil: 'domcontentloaded' });
		await page.getByTestId('record-start-btn').click();

		const errorCard = page.getByTestId('capture-error-card');
		await expect(errorCard).toBeVisible();
		await expect(errorCard).toContainText('Microphone access was blocked');
	});

	test('completes the worked example: Fan-noise speech -> Improve sound -> Local Neural Model -> Trim -> Export genuine MP4 & Video-MP4', async ({
		page
	}) => {
		await page.goto('/tools/recorder', { waitUntil: 'domcontentloaded' });

		const dismissPrivacy = page.getByRole('button', {
			name: /Dismiss privacy notice/i
		});
		if (await dismissPrivacy.isVisible()) {
			await dismissPrivacy.click();
		}

		// 1. Load worked example ("Voice Note Beside Running Fan")
		await page.getByTestId('load-worked-example-btn').click();

		await expect(page.getByTestId('editor-saved-badge')).toContainText('SAVED');
		await expect(page.getByTestId('original-integrity-badge')).toContainText('Original Safe');

		// 2. Click Improve sound
		await page.getByTestId('improve-sound-btn').click();
		const analysisBox = page.getByTestId('enhancement-analysis-box');
		await expect(analysisBox).toBeVisible();
		await expect(analysisBox).toContainText('Noise floor');
		await expect(analysisBox).toContainText('LUFS');

		// Capture screenshot of the finished Recorder interface for the blog post & social preview
		await page.setViewportSize({ width: 1200, height: 760 });
		fs.mkdirSync('static/images/visualizations/recorder', { recursive: true });
		await page.screenshot({
			path: 'static/images/visualizations/recorder/social.png',
			clip: { x: 0, y: 0, width: 1200, height: 760 }
		});

		// 3. Toggle Hear original / Hear improved
		await page.getByTestId('hear-original-btn').click();
		await expect(page.getByTestId('hear-original-btn')).toHaveClass(/is-selected/);
		await page.getByTestId('hear-improved-btn').click();
		await expect(page.getByTestId('hear-improved-btn')).toHaveClass(/is-selected/);

		// 4. Test keyboard accessibility on the RotaryControl slider
		const dial = page.getByRole('slider', { name: 'Enhancement amount', exact: true });
		await dial.focus();
		await page.keyboard.press('ArrowUp');

		// 5. Open More adjustments & test on-demand Local Neural Speech Model download and removal
		await page.locator('summary', { hasText: 'More adjustments & Local Neural Speech Model' }).click();
		const downloadBtn = page.getByTestId('download-neural-model-btn');
		await expect(downloadBtn).toBeVisible();
		await downloadBtn.click();

		const removeBtn = page.getByTestId('remove-neural-model-btn');
		await expect(removeBtn).toBeVisible();
		await removeBtn.click();
		await expect(page.getByTestId('download-neural-model-btn')).toBeVisible();

		// 6. Trim beginning and end via numeric inputs
		const trimStartInput = page.getByTestId('trim-start-input');
		const trimEndInput = page.getByTestId('trim-end-input');
		await trimStartInput.fill('1.4');
		await trimStartInput.dispatchEvent('change');
		await trimEndInput.fill('10.6');
		await trimEndInput.dispatchEvent('change');

		await expect(page.getByTestId('export-size-estimate')).toContainText('9.20s');

		// 7. Preview silence shortening explicitly before applying
		await page.getByTestId('preview-silence-btn').click();
		await expect(page.getByTestId('silence-preview-summary')).toBeVisible();

		// 8. Verify original SHA-256 integrity remains intact after all edits
		await expect(page.getByTestId('original-integrity-badge')).toContainText('Original Safe');

		// 9. Export MP4 Audio (.mp4) and verify downloaded binary container
		const downloadPromiseMp4 = page.waitForEvent('download');
		await page.getByTestId('export-mp4-btn').click();
		const mp4Download = await downloadPromiseMp4;
		expect(mp4Download.suggestedFilename().endsWith('.mp4')).toBe(true);
		const mp4Path = await mp4Download.path();
		expect(mp4Path).toBeTruthy();
		if (mp4Path) {
			const bytes = new Uint8Array(fs.readFileSync(mp4Path));
			const inspection = inspectMediaContainer(bytes);
			expect(inspection.valid).toBe(true);
			expect(inspection.container).toBe('mp4');
			expect(inspection.audioCodec).toBe('mp4a.40.2');
			expect(inspection.hasAudio).toBe(true);
		}
		await expect(page.getByTestId('export-verification-card')).toContainText('Container: MP4');

		// 10. Export MP4 Video with Title Card (.mp4) and verify both H.264 video and AAC audio tracks
		await page.getByTestId('export-format-select').selectOption('mp4-video');
		const downloadPromiseVideo = page.waitForEvent('download');
		await page.getByTestId('export-mp4-btn').click();
		const videoDownload = await downloadPromiseVideo;
		const videoPath = await videoDownload.path();
		expect(videoPath).toBeTruthy();
		if (videoPath) {
			const bytes = new Uint8Array(fs.readFileSync(videoPath));
			const inspection = inspectMediaContainer(bytes);
			expect(inspection.valid).toBe(true);
			expect(inspection.hasAudio).toBe(true);
			expect(inspection.hasVideo).toBe(true);
			expect(inspection.videoCodec).toBe('avc1.42c01e');
		}

		// 11. Switch to Library, soft-delete, undo delete, and permanently delete
		await page.getByRole('button', { name: /03 Library/i }).click();
		await expect(page.getByTestId('library-list')).toContainText('Voice Note Beside Running Fan');
		await page.getByRole('button', { name: 'Delete', exact: true }).first().click();
		await page.getByRole('button', { name: 'Undo delete' }).click();
		await expect(page.getByTestId('library-list')).toContainText('Voice Note Beside Running Fan');
	});

	test('is discoverable from /blog/apps and companion article /blog/visualizations/recorder', async ({
		page
	}) => {
		await page.goto('/blog/apps', { waitUntil: 'domcontentloaded' });
		const openRecorderLink = page.getByRole('link', { name: 'Open Recorder', exact: true });
		await expect(openRecorderLink).toBeVisible();
		await openRecorderLink.click();
		await expect(page).toHaveURL(/\/tools\/recorder$/);

		const articleRes = await page.goto('/blog/visualizations/recorder', {
			waitUntil: 'domcontentloaded'
		});
		expect(articleRes?.ok()).toBe(true);
		await expect(page.locator('h1')).toContainText('Recorder');
	});
});
