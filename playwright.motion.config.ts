import { defineConfig } from '@playwright/test';

const port = 4211;
const baseURL = `http://127.0.0.1:${port}`;
const reuseExistingServer = process.env.PLAYWRIGHT_REUSE_SERVER === '1';

export default defineConfig({
	testDir: './tests/browser',
	testMatch: [
		'motion.spec.ts',
		'home-motion.spec.ts',
		'phase3-motion.spec.ts',
		'phase4-topic-map.spec.ts',
		'phase5-performance.spec.ts'
	],
	fullyParallel: false,
	workers: 1,
	timeout: 60_000,
	expect: {
		timeout: 10_000
	},
	reporter: [['list']],
	use: {
		baseURL,
		browserName: 'chromium',
		channel: process.env.PLAYWRIGHT_CHANNEL?.trim() || (process.env.CI ? undefined : 'chrome'),
		headless: true,
		viewport: { width: 1440, height: 1000 },
		reducedMotion: 'no-preference',
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure'
	},
	webServer: {
		command: `npm run build:site && npx vite preview --host 127.0.0.1 --port ${port}`,
		url: baseURL,
		reuseExistingServer,
		timeout: 600_000
	}
});
