import { defineConfig } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT ?? 4296);
const baseURL = process.env.HTTP_TCP_BASE_URL || `http://127.0.0.1:${port}`;
const reuseServer =
	Boolean(process.env.HTTP_TCP_BASE_URL) || process.env.PLAYWRIGHT_REUSE_SERVER === '1';

export default defineConfig({
	testDir: './tests/browser',
	testMatch: 'http-tcp.spec.ts',
	fullyParallel: false,
	workers: 1,
	timeout: 60_000,
	expect: { timeout: 15_000 },
	reporter: [['list']],
	outputDir: '.codex-artifacts/http-tcp/test-results',
	use: {
		baseURL,
		serviceWorkers: 'block',
		browserName: 'chromium',
		// Feature CI installs full Chromium with --no-shell, not chromium-headless-shell.
		channel: process.env.PLAYWRIGHT_CHANNEL?.trim() || (process.env.CI ? 'chromium' : 'chrome'),
		headless: true,
		viewport: { width: 1440, height: 1000 },
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure'
	},
	webServer: reuseServer
		? undefined
		: {
				command: `npx vite preview --host 127.0.0.1 --port ${port} --strictPort`,
				url: `${baseURL}/blog/visualizations/between-a-click-and-a-page`,
				reuseExistingServer: false,
				timeout: 90_000
			}
});
