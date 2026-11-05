import { defineConfig } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT ?? 4354);
const suppliedURL = process.env.BINAURAL_SOUNDBOARD_BASE_URL?.trim();
const baseURL = suppliedURL || `http://127.0.0.1:${port}`;

export default defineConfig({
	testDir: './tests',
	testMatch: 'binaural-acoustic-soundboard.spec.ts',
	outputDir: 'test-results/binaural-acoustic-soundboard',
	fullyParallel: false,
	workers: 1,
	maxFailures: 1,
	timeout: 60_000,
	expect: { timeout: 15_000 },
	reporter: [['list']],
	use: {
		baseURL,
		browserName: 'chromium',
		channel: process.env.PLAYWRIGHT_CHANNEL?.trim() || (process.env.CI ? undefined : 'chrome'),
		headless: true,
		serviceWorkers: 'block',
		viewport: { width: 1440, height: 1050 },
		contextOptions: { reducedMotion: 'reduce' },
		screenshot: 'only-on-failure',
		trace: 'retain-on-failure'
	},
	webServer:
		suppliedURL || process.env.PLAYWRIGHT_REUSE_SERVER === '1'
			? undefined
			: {
					command: `node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port ${port} --strictPort`,
					url: `${baseURL}/blog/visualizations/binaural-acoustic-soundboard`,
					reuseExistingServer: false,
					timeout: 60_000
				}
});
