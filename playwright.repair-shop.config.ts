import { defineConfig } from '@playwright/test';

const requestedPort = Number(process.env.REPAIR_SHOP_PORT ?? process.env.PLAYWRIGHT_PORT ?? 4255);
const port =
	Number.isInteger(requestedPort) && requestedPort > 0 && requestedPort <= 65_535
		? requestedPort
		: 4255;
const baseURL = `http://127.0.0.1:${port}`;
const gameURL = `${baseURL}/blog/games/the-repair-shop-on-the-corner`;

export default defineConfig({
	testDir: './tests/browser',
	testMatch: 'the-repair-shop-on-the-corner.spec.ts',
	fullyParallel: false,
	workers: 1,
	timeout: 180_000,
	expect: { timeout: 25_000 },
	reporter: [['list']],
	use: {
		baseURL,
		serviceWorkers: 'block',
		browserName: 'chromium',
		channel: process.env.PLAYWRIGHT_CHANNEL?.trim() || (process.env.CI ? undefined : 'chrome'),
		headless: true,
		viewport: { width: 1_440, height: 900 },
		reducedMotion: 'no-preference',
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure',
		launchOptions: {
			args: process.env.CI
				? ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
				: ['--enable-webgl']
		}
	},
	webServer:
		process.env.PLAYWRIGHT_REUSE_SERVER === '1'
			? undefined
			: {
					command:
						process.env.PLAYWRIGHT_SKIP_BUILD === '1'
							? `"${process.execPath}" ./node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port ${port} --strictPort`
							: `"${process.execPath}" ./node_modules/vite/bin/vite.js build && "${process.execPath}" ./node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port ${port} --strictPort`,
					env: {
						NODE_OPTIONS: '--max-old-space-size=8192'
					},
					url: gameURL,
					reuseExistingServer: false,
					timeout: 600_000
				}
});
