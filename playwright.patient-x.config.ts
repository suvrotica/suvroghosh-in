import { defineConfig } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT ?? 4337);
const baseURL = process.env.PATIENT_X_BASE_URL || `http://127.0.0.1:${port}`;

export default defineConfig({
	testDir: './tests/browser',
	testMatch: 'patient-x.spec.ts',
	fullyParallel: false,
	workers: 1,
	timeout: 60_000,
	expect: { timeout: 15_000 },
	reporter: [['list']],
	outputDir: 'test-results/patient-x',
	use: {
		baseURL,
		serviceWorkers: 'block',
		browserName: 'chromium',
		// Feature CI installs full Chromium with --no-shell.
		channel: process.env.PLAYWRIGHT_CHANNEL?.trim() || (process.env.CI ? 'chromium' : 'chrome'),
		headless: true,
		viewport: { width: 1440, height: 1100 },
		deviceScaleFactor: 1,
		locale: 'en-GB',
		contextOptions: { reducedMotion: 'reduce' },
		acceptDownloads: true,
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure'
	},
	webServer:
		process.env.PLAYWRIGHT_REUSE_SERVER === '1' || process.env.PATIENT_X_BASE_URL
			? undefined
			: {
					// Production feature bundle. Point PATIENT_X_BASE_URL at the full site's
					// loopback production preview for final route/integration verification.
					command: 'node scripts/preview-patient-x.mjs --production',
					env: { PATIENT_X_PREVIEW_PORT: String(port) },
					url: `${baseURL}/blog/visualizations/patient-x-depression-bipolar`,
					reuseExistingServer: false,
					timeout: 120_000
				}
});
