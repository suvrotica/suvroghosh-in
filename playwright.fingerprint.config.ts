import { defineConfig } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT ?? 4341);
const baseURL = process.env.FINGERPRINT_BASE_URL || `http://127.0.0.1:${port}`;

export default defineConfig({
	testDir: './tests/browser',
	testMatch: 'fingerprint.spec.ts',
	workers: 1,
	timeout: 120_000,
	expect: { timeout: 30_000 },
	reporter: 'list',
	outputDir: 'test-results/fingerprint',
	use: {
		baseURL,
		serviceWorkers: 'block',
		browserName: 'chromium',
		channel: process.env.PLAYWRIGHT_CHANNEL?.trim() || (process.env.CI ? 'chromium' : 'chrome'),
		headless: true,
		viewport: { width: 1440, height: 1050 },
		contextOptions: { reducedMotion: 'reduce' },
		locale: 'en-GB',
		actionTimeout: 15_000,
		acceptDownloads: true,
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure'
	},
	webServer: process.env.FINGERPRINT_BASE_URL
		? undefined
		: {
				command: `npm run preview -- --host 127.0.0.1 --port ${port} --strictPort`,
				url: `${baseURL}/blog/visualizations/how-fingerprints-form`,
				reuseExistingServer: false,
				timeout: 120_000
			}
});
