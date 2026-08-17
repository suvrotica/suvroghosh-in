import { defineConfig } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT ?? 4351);
const baseURL = `http://127.0.0.1:${port}`;
const articleURL = `${baseURL}/blog/visualizations/the-profile-that-knows-almost-nothing-about-you`;

export default defineConfig({
	testDir: './tests/browser',
	testMatch: 'barnum-lab.spec.ts',
	fullyParallel: false,
	workers: 1,
	timeout: 180_000,
	expect: { timeout: 30_000 },
	reporter: [['list']],
	outputDir: 'test-results/barnum-lab',
	use: {
		baseURL,
		headless: true,
		navigationTimeout: 60_000,
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure'
	},
	webServer: {
		command: `npm run build:site && npx vite preview --host 127.0.0.1 --port ${port} --strictPort`,
		url: articleURL,
		reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVER === '1',
		timeout: 600_000
	},
	projects: [
		{
			name: 'chromium',
			use: {
				browserName: 'chromium',
				channel: process.env.PLAYWRIGHT_CHANNEL?.trim() || undefined,
				viewport: { width: 1440, height: 900 }
			}
		},
		{
			name: 'firefox-contracts',
			grep: /@cross-browser/u,
			use: { browserName: 'firefox', viewport: { width: 1280, height: 800 } }
		},
		{
			name: 'webkit-contracts',
			grep: /@cross-browser/u,
			use: { browserName: 'webkit', viewport: { width: 1280, height: 800 } }
		}
	]
});
