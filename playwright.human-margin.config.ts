import { defineConfig } from '@playwright/test';

const port = Number(process.env.HUMAN_MARGIN_PLAYWRIGHT_PORT ?? 4358);
const baseURL = `http://127.0.0.1:${port}`;
const reuseExistingServer = process.env.PLAYWRIGHT_REUSE_SERVER === '1';

export default defineConfig({
	testDir: './tests/browser/human-margin',
	testMatch: 'human-margin.spec.ts',
	fullyParallel: false,
	workers: 1,
	timeout: 90_000,
	expect: {
		timeout: 15_000
	},
	reporter: [['list']],
	outputDir: 'artifacts/human-margin/playwright-results',
	use: {
		baseURL,
		browserName: 'chromium',
		channel: process.env.PLAYWRIGHT_CHANNEL?.trim() || (process.env.CI ? undefined : 'chrome'),
		headless: true,
		locale: 'en-GB',
		timezoneId: 'Asia/Kolkata',
		viewport: { width: 1_440, height: 900 },
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure'
	},
	webServer: {
		command: `npm run build:site && npx vite preview --host 127.0.0.1 --port ${port}`,
		url: baseURL,
		reuseExistingServer,
		timeout: 600_000
	}
});
