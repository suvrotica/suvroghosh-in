import { defineConfig, type Project } from '@playwright/test';

const rawPort = process.env.PLAYWRIGHT_PORT ?? '4331';
const port = Number(rawPort);
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
	throw new Error(
		`PLAYWRIGHT_PORT must be an integer from 1024 to 65535 (received ${JSON.stringify(rawPort)}).`
	);
}
const baseURL = process.env.COLOR_FIELD_BASE_URL || `http://127.0.0.1:${port}`;
const browsers: Record<string, Project['use']> = {
	chromium: { browserName: 'chromium' },
	chrome: { browserName: 'chromium', channel: 'chrome' },
	edge: { browserName: 'chromium', channel: 'msedge' },
	firefox: { browserName: 'firefox' },
	webkit: { browserName: 'webkit' }
};

const selected = (process.env.COLOR_FIELD_BROWSERS || 'chromium')
	.split(',')
	.map((name) => name.trim())
	.filter(Boolean);

for (const name of selected) {
	if (!(name in browsers)) throw new Error(`Unknown Color Field Studio browser: ${name}`);
}

export default defineConfig({
	testDir: './tests/browser',
	testMatch: 'color-field-studio.spec.ts',
	fullyParallel: false,
	workers: 1,
	timeout: 120_000,
	expect: { timeout: 20_000 },
	reporter: [['list']],
	outputDir: 'test-results/color-field-studio',
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
		process.env.PLAYWRIGHT_REUSE_SERVER === '1' || process.env.COLOR_FIELD_BASE_URL
			? undefined
			: {
					command: 'node scripts/preview-color-field-studio.mjs --preview',
					env: { COLOR_FIELD_STUDIO_PREVIEW_PORT: String(port) },
					url: `${baseURL}/tools/color-field-studio`,
					reuseExistingServer: false,
					timeout: 120_000
				}
});
