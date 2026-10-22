import { defineConfig } from '@playwright/test';

const baseURL = 'http://127.0.0.1:4268';

export default defineConfig({
	testDir: './tests/browser',
	testMatch: ['navigation-links.spec.ts'],
	workers: 1,
	timeout: 60_000,
	expect: { timeout: 10_000 },
	reporter: [['list']],
	use: {
		baseURL,
		browserName: 'chromium',
		channel: process.env.PLAYWRIGHT_CHANNEL?.trim() || (process.env.CI ? undefined : 'chrome'),
		headless: true,
		serviceWorkers: 'block',
		reducedMotion: 'reduce',
		screenshot: 'only-on-failure',
		trace: 'retain-on-failure'
	},
	projects: [
		{ name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
		{
			name: 'mobile',
			use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
		}
	],
	webServer: {
		command: 'node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4268 --strictPort',
		url: baseURL,
		timeout: 60_000,
		reuseExistingServer: !process.env.CI
	}
});
