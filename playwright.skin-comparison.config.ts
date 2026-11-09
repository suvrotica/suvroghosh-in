import { defineConfig } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT ?? 4291);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
	testDir: './tests/browser',
	testMatch: 'skin-comparison.spec.ts',
	workers: 1,
	timeout: 60_000,
	expect: { timeout: 20_000 },
	reporter: 'list',
	use: {
		baseURL,
		serviceWorkers: 'block',
		channel: process.env.PLAYWRIGHT_CHANNEL || (process.env.CI ? undefined : 'chrome'),
		viewport: { width: 1440, height: 1000 },
		trace: 'retain-on-failure'
	},
	webServer:
		process.env.PLAYWRIGHT_REUSE_SERVER === '1'
			? undefined
			: {
					command: `npm run build:site && npm run preview -- --host 127.0.0.1 --port ${port} --strictPort`,
					url: `${baseURL}/blog/visualizations/a-skin-that-paints-itself`,
					timeout: 600_000,
					reuseExistingServer: false
				}
});
