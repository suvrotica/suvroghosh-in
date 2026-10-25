import { defineConfig } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT ?? 4318);
const baseURL = process.env.LENS_MIRROR_BASE_URL || `http://127.0.0.1:${port}`;

export default defineConfig({
	testDir: './tests/browser',
	testMatch: 'lens-mirror-lab.spec.ts',
	fullyParallel: false,
	workers: 1,
	timeout: 90_000,
	expect: { timeout: 20_000 },
	reporter: [['list']],
	outputDir: 'test-results/lens-mirror',
	use: {
		baseURL,
		serviceWorkers: 'block',
		browserName: 'chromium',
		channel: process.env.PLAYWRIGHT_CHANNEL?.trim() || (process.env.CI ? undefined : 'chrome'),
		headless: true,
		viewport: { width: 1440, height: 1000 },
		deviceScaleFactor: 1,
		locale: 'en-GB',
		reducedMotion: 'reduce',
		acceptDownloads: true,
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure'
	},
	webServer:
		process.env.PLAYWRIGHT_REUSE_SERVER === '1'
			? undefined
			: {
					// Feature-only preview compiles this article and the production lab sources.
					command: 'npm run lens-mirror:dev',
					env: { LENS_MIRROR_PREVIEW_PORT: String(port) },
					url: `${baseURL}/blog/visualizations/through-a-different-glass`,
					reuseExistingServer: false,
					timeout: 120_000
				}
});
