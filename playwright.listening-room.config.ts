import { defineConfig } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT ?? 4337);
const baseURL = process.env.LISTENING_ROOM_BASE_URL || `http://127.0.0.1:${port}`;

export default defineConfig({
	testDir: './tests',
	testMatch: 'listening-room.spec.ts',
	outputDir: 'test-results/listening-room-tests',
	fullyParallel: false,
	workers: 1,
	maxFailures: 1,
	timeout: 60_000,
	expect: { timeout: 12_000 },
	reporter: [['list']],
	use: {
		baseURL,
		browserName: 'chromium',
		channel: process.env.PLAYWRIGHT_CHANNEL?.trim() || (process.env.CI ? undefined : 'chrome'),
		headless: true,
		serviceWorkers: 'block',
		viewport: { width: 1440, height: 1000 },
		reducedMotion: 'reduce',
		screenshot: 'only-on-failure',
		trace: 'retain-on-failure'
	},
	webServer:
		process.env.PLAYWRIGHT_REUSE_SERVER === '1'
			? undefined
			: {
					command: `node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port ${port} --strictPort`,
					url: `${baseURL}/blog/visualizations/listening-room`,
					reuseExistingServer: false,
					timeout: 60_000
				}
});
