import { defineConfig } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT ?? 4286);
const baseURL = process.env.SPOTS_AND_STRIPES_BASE_URL || `http://127.0.0.1:${port}`;
const articleURL = `${baseURL}/blog/visualizations/how-spots-and-stripes-form`;

export default defineConfig({
	testDir: './tests/browser',
	testMatch: 'spots-and-stripes.spec.ts',
	fullyParallel: false,
	workers: 1,
	timeout: 120_000,
	expect: { timeout: 25_000 },
	reporter: [['list']],
	use: {
		baseURL,
		serviceWorkers: 'block',
		browserName: 'chromium',
		channel: process.env.PLAYWRIGHT_CHANNEL?.trim() || (process.env.CI ? undefined : 'chrome'),
		headless: true,
		viewport: { width: 1440, height: 1000 },
		acceptDownloads: true,
		contextOptions: { reducedMotion: 'no-preference' },
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure'
	},
	webServer:
		process.env.PLAYWRIGHT_REUSE_SERVER === '1'
			? undefined
			: {
					command: `npm run build:site && npx vite preview --host 127.0.0.1 --port ${port} --strictPort`,
					url: articleURL,
					reuseExistingServer: false,
					timeout: 600_000
				}
});
