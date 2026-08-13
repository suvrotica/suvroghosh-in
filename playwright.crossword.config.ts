import { defineConfig } from '@playwright/test';

const port = 4321;
const baseURL = `http://127.0.0.1:${port}`;
const crosswordURL = `${baseURL}/blog/games/healthcare-it-crossword-systems-rounds`;
const reuseExistingServer = process.env.PLAYWRIGHT_REUSE_SERVER === '1';

export default defineConfig({
	testDir: './tests/browser',
	testMatch: 'healthcare-it-crossword.spec.ts',
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
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure'
	},
	webServer: {
		command: `npm run build:site && npx vite preview --host 127.0.0.1 --port ${port}`,
		url: crosswordURL,
		reuseExistingServer,
		timeout: 600_000
	}
});
