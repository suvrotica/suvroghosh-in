import { defineConfig } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT ?? 4281);
const baseURL = process.env.SHAPE_OF_WAITING_BASE_URL || `http://127.0.0.1:${port}`;

export default defineConfig({
	testDir: './tests/browser',
	testMatch: 'shape-of-waiting.spec.ts',
	fullyParallel: false,
	workers: 1,
	timeout: 90_000,
	expect: { timeout: 20_000 },
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
					url: `${baseURL}/blog/visualizations/the-shape-of-waiting`,
					reuseExistingServer: false,
					timeout: 600_000
				}
});
