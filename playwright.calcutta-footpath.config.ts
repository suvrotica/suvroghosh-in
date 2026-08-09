import { defineConfig } from '@playwright/test';

const requestedPort = Number(
	process.env.CALCUTTA_FOOTPATH_PORT ?? process.env.PLAYWRIGHT_PORT ?? 4247
);
const port =
	Number.isInteger(requestedPort) && requestedPort > 0 && requestedPort <= 65_535
		? requestedPort
		: 4247;
const baseURL = 'http://127.0.0.1:' + port;
const gameURL = baseURL + '/blog/games/calcutta-footpath-simulator-ekdom-side-diye-jaan';

export default defineConfig({
	testDir: './tests/browser',
	testMatch: 'calcutta-footpath.spec.ts',
	fullyParallel: false,
	workers: 1,
	timeout: 120_000,
	expect: { timeout: 20_000 },
	reporter: [['list']],
	use: {
		baseURL,
		browserName: 'chromium',
		channel: process.env.PLAYWRIGHT_CHANNEL?.trim() || (process.env.CI ? undefined : 'chrome'),
		headless: true,
		viewport: { width: 1_440, height: 900 },
		reducedMotion: 'no-preference',
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure',
		launchOptions: {
			args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
		}
	},
	webServer: {
		command: 'npx vite dev --host 127.0.0.1 --port ' + port + ' --strictPort',
		url: gameURL,
		reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVER === '1',
		timeout: 600_000
	}
});
