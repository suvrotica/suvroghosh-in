import { defineConfig, type Project } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT ?? 4330);
const baseURL = process.env.DRIP_PAINTING_STUDIO_BASE_URL || `http://127.0.0.1:${port}`;
const browsers: Record<string, Project['use']> = {
	chromium: { browserName: 'chromium' },
	chrome: { browserName: 'chromium', channel: 'chrome' },
	edge: { browserName: 'chromium', channel: 'msedge' },
	firefox: { browserName: 'firefox' },
	webkit: { browserName: 'webkit' }
};

const selected = (process.env.DRIP_PAINTING_STUDIO_BROWSERS || 'chromium')
	.split(',')
	.map((name) => name.trim())
	.filter(Boolean);

for (const name of selected) {
	if (!(name in browsers)) throw new Error(`Unknown Drip Painting Studio browser: ${name}`);
}

export default defineConfig({
	testDir: './tests/browser',
	testMatch: 'drip-painting-studio.spec.ts',
	fullyParallel: false,
	workers: 1,
	timeout: 120_000,
	expect: { timeout: 20_000 },
	reporter: [['list']],
	outputDir: 'test-results/drip-painting-studio',
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
		process.env.PLAYWRIGHT_REUSE_SERVER === '1' || process.env.DRIP_PAINTING_STUDIO_BASE_URL
			? undefined
			: {
					command: 'node scripts/preview-drip-painting-studio.mjs --preview',
					env: { DRIP_PAINTING_STUDIO_PREVIEW_PORT: String(port) },
					url: `${baseURL}/tools/drip-painting-studio`,
					reuseExistingServer: false,
					timeout: 120_000
				}
});
