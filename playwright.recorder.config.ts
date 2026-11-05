import { defineConfig } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT ?? 4215);
const baseURL = process.env.RECORDER_BASE_URL || `http://127.0.0.1:${port}`;

export default defineConfig({
	testDir: './tests',
	testMatch: ['recorder.spec.ts'],
	fullyParallel: false,
	workers: 1,
	retries: 0,
	timeout: 90_000,
	expect: {
		timeout: 15_000
	},
	reporter: [['list']],
	use: {
		baseURL,
		serviceWorkers: 'block',
		browserName: 'chromium',
		channel: process.env.PLAYWRIGHT_CHANNEL?.trim() || (process.env.CI ? undefined : 'chrome'),
		headless: true,
		viewport: { width: 1280, height: 840 },
		acceptDownloads: true,
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure'
	},
	webServer:
		process.env.PLAYWRIGHT_REUSE_SERVER === '1'
			? undefined
			: {
					command: `node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port ${port} --strictPort`,
					url: `${baseURL}/tools/recorder`,
					reuseExistingServer: !process.env.CI,
					timeout: 90_000
				}
});
