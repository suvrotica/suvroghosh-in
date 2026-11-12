import { defineConfig, type Project } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT ?? 4329);
const baseURL = process.env.POINTILLISM_STUDIO_BASE_URL || `http://127.0.0.1:${port}`;
const browsers: Record<string, Project['use']> = {
	chromium: { browserName: 'chromium' },
	chrome: { browserName: 'chromium', channel: 'chrome' },
	edge: { browserName: 'chromium', channel: 'msedge' },
	firefox: { browserName: 'firefox' },
	webkit: { browserName: 'webkit' }
};

const selected = (process.env.POINTILLISM_STUDIO_BROWSERS || 'chromium')
	.split(',')
	.map((name) => name.trim())
	.filter(Boolean);

for (const name of selected) {
	if (!(name in browsers)) throw new Error(`Unknown Pointillism Studio browser: ${name}`);
}

export default defineConfig({
	testDir: './tests/browser',
	testMatch: 'pointillism-studio.spec.ts',
	fullyParallel: false,
	workers: 1,
	timeout: 90_000,
	expect: { timeout: 20_000 },
	reporter: [['list']],
	outputDir: 'test-results/pointillism-studio',
	projects: selected.map((name) => ({ name, use: browsers[name] })),
	use: {
		baseURL,
		serviceWorkers: 'block',
		headless: true,
		viewport: { width: 1440, height: 900 },
		deviceScaleFactor: 1,
		locale: 'en-US',
		acceptDownloads: true,
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure'
	},
	webServer:
		process.env.PLAYWRIGHT_REUSE_SERVER === '1'
			? undefined
			: {
					command: 'node scripts/preview-pointillism-studio.mjs --preview',
					env: { POINTILLISM_STUDIO_PREVIEW_PORT: String(port) },
					url: `${baseURL}/tools/pointillism-studio`,
					reuseExistingServer: false,
					timeout: 120_000
				}
});
