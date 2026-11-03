import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT ?? 4276);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
	testDir: './tests/browser',
	testMatch: 'sketch-museum.spec.ts',
	workers: 1,
	timeout: 60_000,
	use: {
		baseURL,
		serviceWorkers: 'block',
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure'
	},
	projects: [
		{ name: 'chromium-desktop', use: { ...devices['Desktop Chrome'] } },
		{ name: 'chrome-desktop', use: { ...devices['Desktop Chrome'], channel: 'chrome' } },
		{ name: 'edge-desktop', use: { ...devices['Desktop Edge'], channel: 'msedge' } },
		{ name: 'firefox-desktop', use: { ...devices['Desktop Firefox'] } },
		{ name: 'webkit-desktop', use: { ...devices['Desktop Safari'] } },
		{ name: 'chromium-mobile', use: { ...devices['Pixel 7'] } },
		{ name: 'webkit-mobile', use: { ...devices['iPhone 13'] } }
	],
	webServer:
		process.env.PLAYWRIGHT_REUSE_SERVER === '1'
			? undefined
			: {
					command: `npm run build:site && npx vite preview --host 127.0.0.1 --port ${port} --strictPort`,
					url: `${baseURL}/images/sketches`,
					reuseExistingServer: false,
					timeout: 600_000
				}
});
