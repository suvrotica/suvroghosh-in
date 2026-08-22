import { defineConfig } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT ?? 4267);
const baseURL = `http://127.0.0.1:${port}`;
const articleURL = `${baseURL}/blog/visualizations/domain-coloring-complex-functions-explorer`;

export default defineConfig({
	testDir: './tests/browser',
	testMatch: 'domain-coloring.spec.ts',
	fullyParallel: false,
	workers: 1,
	timeout: 120_000,
	expect: { timeout: 30_000 },
	reporter: [['list']],
	outputDir: 'test-results/domain-coloring',
	use: {
		baseURL,
		browserName: 'chromium',
		channel: process.env.PLAYWRIGHT_CHANNEL?.trim() || (process.env.CI ? undefined : 'chrome'),
		headless: true,
		viewport: { width: 1440, height: 1_000 },
		deviceScaleFactor: 1,
		colorScheme: 'dark',
		locale: 'en-GB',
		acceptDownloads: true,
		contextOptions: {
			reducedMotion: 'reduce'
		},
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure',
		video: 'retain-on-failure'
	},
	webServer: {
		command: `npm run build:site && npx vite preview --host 127.0.0.1 --port ${port}`,
		url: articleURL,
		reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVER === '1',
		timeout: 600_000
	}
});
