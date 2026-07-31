import { defineConfig } from '@playwright/test';

const port = 4213;
const baseURL = `http://127.0.0.1:${port}`;
const articleURL = `${baseURL}/blog/visualizations/the-city-that-refuses-a-master-plan`;
const reuseExistingServer = process.env.PLAYWRIGHT_REUSE_SERVER === '1';

export default defineConfig({
	testDir: './tests/browser',
	testMatch: 'city-master-plan.spec.ts',
	fullyParallel: false,
	workers: 1,
	timeout: 120_000,
	expect: {
		timeout: 20_000
	},
	reporter: [['list']],
	use: {
		baseURL,
		browserName: 'chromium',
		channel: process.env.PLAYWRIGHT_CHANNEL?.trim() || (process.env.CI ? undefined : 'chrome'),
		headless: true,
		viewport: { width: 1440, height: 1000 },
		hasTouch: true,
		acceptDownloads: true,
		contextOptions: {
			reducedMotion: 'no-preference'
		},
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure'
	},
	webServer: {
		command: `npm run build:site && npx vite preview --host 127.0.0.1 --port ${port}`,
		url: articleURL,
		reuseExistingServer,
		timeout: 600_000
	}
});
