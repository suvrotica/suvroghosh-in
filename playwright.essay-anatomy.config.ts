import { defineConfig } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT || 4326);
export default defineConfig({
	testDir: './tests/browser',
	testMatch: 'essay-anatomy.spec.ts',
	fullyParallel: false,
	workers: 1,
	timeout: 90000,
	expect: { timeout: 20000 },
	reporter: [['list']],
	outputDir: 'test-results/essay-anatomy',
	use: {
		baseURL: process.env.ESSAY_ANATOMY_BASE_URL || `http://127.0.0.1:${port}`,
		serviceWorkers: 'block',
		browserName: 'chromium',
		channel: process.env.PLAYWRIGHT_CHANNEL?.trim() || (process.env.CI ? undefined : 'chrome'),
		headless: true,
		viewport: { width: 1440, height: 1000 },
		deviceScaleFactor: 1,
		locale: 'en-GB',
		reducedMotion: 'reduce',
		acceptDownloads: true,
		trace: 'retain-on-failure'
	},
	webServer:
		process.env.PLAYWRIGHT_REUSE_SERVER === '1'
			? undefined
			: {
					command: 'npm run essay-anatomy:preview',
					env: { ESSAY_ANATOMY_PREVIEW_PORT: String(port) },
					url: `http://127.0.0.1:${port}/blog/visualizations/anatomy-of-an-essay`,
					reuseExistingServer: false,
					timeout: 120000
				}
});
