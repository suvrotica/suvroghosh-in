import { defineConfig } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT ?? 4291);
const baseURL = process.env.AQI_SCALES_BASE_URL || `http://127.0.0.1:${port}`;
const articleURL = `${baseURL}/blog/visualizations/why-two-aqi-apps-show-different-numbers`;

export default defineConfig({
	testDir: './tests/browser',
	testMatch: 'aqi-scales.spec.ts',
	fullyParallel: false,
	workers: 1,
	timeout: 120_000,
	expect: { timeout: 25_000 },
	reporter: [['list']],
	use: {
		baseURL,
		serviceWorkers: 'block',
		browserName: 'chromium',
		channel: process.env.PLAYWRIGHT_CHANNEL?.trim() || (process.env.CI ? 'chromium' : 'chrome'),
		headless: true,
		viewport: { width: 1440, height: 1000 },
		acceptDownloads: true,
		locale: 'en-GB',
		contextOptions: { reducedMotion: 'reduce' },
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure'
	},
	webServer:
		process.env.PLAYWRIGHT_REUSE_SERVER === '1'
			? undefined
			: {
					command:
						process.env.PLAYWRIGHT_SKIP_BUILD === '1'
							? `npx vite preview --host 127.0.0.1 --port ${port} --strictPort`
							: `npm run build:site && npx vite preview --host 127.0.0.1 --port ${port} --strictPort`,
					url: articleURL,
					reuseExistingServer: false,
					timeout: 600_000
				}
});
