import { defineConfig } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT ?? 4337);
const baseURL = process.env.STRANGE_MATTER_BASE_URL || `http://127.0.0.1:${port}`;

export default defineConfig({
	testDir: './tests/browser',
	testMatch: 'strange-matter*.spec.ts',
	fullyParallel: false,
	workers: 1,
	timeout: 60_000,
	expect: { timeout: 15_000 },
	reporter: [['list']],
	outputDir: 'test-results/strange-matter',
	use: {
		baseURL,
		serviceWorkers: 'block',
		browserName: 'chromium',
		channel: process.env.PLAYWRIGHT_CHANNEL?.trim() || (process.env.CI ? 'chromium' : 'chrome'),
		headless: true,
		viewport: { width: 1440, height: 1000 },
		deviceScaleFactor: 1,
		locale: 'en-GB',
		contextOptions: { reducedMotion: 'reduce' },
		acceptDownloads: true,
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure'
	},
	webServer:
		process.env.PLAYWRIGHT_REUSE_SERVER === '1' || process.env.STRANGE_MATTER_BASE_URL
			? undefined
			: {
					command: 'node scripts/preview-strange-matter.mjs --production',
					env: { STRANGE_MATTER_PREVIEW_PORT: String(port) },
					url: `${baseURL}/blog/visualizations/strange-matter`,
					reuseExistingServer: false,
					timeout: 120_000
				}
});
