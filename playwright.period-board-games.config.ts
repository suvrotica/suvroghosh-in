import { defineConfig } from '@playwright/test';

const port = Number(process.env.PERIOD_BOARD_GAMES_PORT ?? 4263);
const baseURL = `http://127.0.0.1:${port}`;
const gameURL = `${baseURL}/blog/games/ludo-and-saap-ludo`;
const reuseExistingServer = process.env.PLAYWRIGHT_REUSE_SERVER === '1';

export default defineConfig({
	testDir: './tests/browser',
	testMatch: 'period-board-games.spec.ts',
	fullyParallel: false,
	workers: 1,
	timeout: 120_000,
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
		url: gameURL,
		reuseExistingServer,
		timeout: 600_000
	}
});
