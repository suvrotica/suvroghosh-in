import { defineConfig } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT ?? 4349);
const baseURL = process.env.CIRCUIT_BENCH_BASE_URL || `http://127.0.0.1:${port}`;

export default defineConfig({
	testDir: './tests/browser',
	testMatch: 'circuit-bench.spec.ts',
	fullyParallel: false,
	workers: 1,
	timeout: 90_000,
	expect: { timeout: 20_000 },
	reporter: [['list']],
	outputDir: 'test-results/circuit-bench',
	use: {
		baseURL,
		serviceWorkers: 'block',
		browserName: 'chromium',
		channel: process.env.PLAYWRIGHT_CHANNEL?.trim() || (process.env.CI ? 'chromium' : 'chrome'),
		headless: true,
		viewport: { width: 1440, height: 1050 },
		deviceScaleFactor: 1,
		locale: 'en-GB',
		acceptDownloads: true,
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure'
	},
	webServer:
		process.env.PLAYWRIGHT_REUSE_SERVER === '1' || process.env.CIRCUIT_BENCH_BASE_URL
			? undefined
			: {
					command: 'node scripts/preview-circuit-bench.mjs --production',
					env: { CIRCUIT_BENCH_PREVIEW_PORT: String(port) },
					url: `${baseURL}/blog/visualizations/circuit-bench`,
					reuseExistingServer: false,
					timeout: 120_000
				}
});
