import { defineConfig } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT ?? 4330);
const baseURL = `http://127.0.0.1:${port}`;
const articleURL = `${baseURL}/blog/visualizations/the-living-aperture`;

export default defineConfig({
	testDir: './tests/browser',
	testMatch: 'gastropod-shell-lab.spec.ts',
	fullyParallel: false,
	workers: 1,
	timeout: 120_000,
	expect: { timeout: 25_000 },
	reporter: [['list']],
	use: {
		baseURL,
		browserName: 'chromium',
		channel: process.env.PLAYWRIGHT_CHANNEL?.trim() || (process.env.CI ? undefined : 'chrome'),
		headless: true,
		acceptDownloads: true,
		contextOptions: { reducedMotion: 'reduce' },
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
			name: 'desktop',
			use: { viewport: { width: 1440, height: 1000 } }
		},
		{
			name: 'tablet',
			use: { viewport: { width: 768, height: 1024 } }
		},
		{
			name: 'mobile',
			use: {
				viewport: { width: 360, height: 800 },
				isMobile: true,
				hasTouch: true
			}
		}
	]
});
