import { defineConfig } from '@playwright/test';

const baseURL = 'http://127.0.0.1:4268';
export default defineConfig({
	testDir: './tests/browser',
	testMatch: ['privacy.spec.ts'],
	workers: 1,
	timeout: 60000,
	expect: { timeout: 10000 },
	reporter: [['list']],
	use: {
		baseURL,
		browserName: 'chromium',
		channel: process.env.PLAYWRIGHT_CHANNEL?.trim() || (process.env.CI ? undefined : 'chrome'),
		headless: true,
		serviceWorkers: 'block',
		viewport: { width: 1440, height: 1000 },
		screenshot: 'only-on-failure',
		trace: 'retain-on-failure'
	},
	webServer: {
		command: 'node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4268 --strictPort',
		url: baseURL,
		timeout: 60000,
		reuseExistingServer: false
	}
});
