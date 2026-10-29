import { defineConfig, type Project } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT ?? 4326);
const baseURL = process.env.SPLAT_STUDIO_BASE_URL || `http://127.0.0.1:${port}`;
const browsers: Record<string, Project['use']> = {
	chromium: { browserName: 'chromium' },
	chrome: { browserName: 'chromium', channel: 'chrome' },
	edge: { browserName: 'chromium', channel: 'msedge' },
	firefox: { browserName: 'firefox' },
	webkit: { browserName: 'webkit' }
};
// The standard suite covers all three engines. Include installed branded browsers with
// SPLAT_STUDIO_BROWSERS=chromium,chrome,edge,firefox,webkit; narrow it for local diagnosis.
const legacyChannel = process.env.PLAYWRIGHT_CHANNEL?.trim();
const selected = (
	process.env.SPLAT_STUDIO_BROWSERS ||
	(legacyChannel === 'msedge' ? 'edge' : legacyChannel) ||
	'chromium,firefox,webkit'
)
	.split(',')
	.map((name) => name.trim());
for (const name of selected) {
	if (!(name in browsers)) throw new Error(`Unknown Splat Studio browser: ${name}`);
}

export default defineConfig({
	testDir: './tests/browser',
	testMatch: 'splat-studio.spec.ts',
	fullyParallel: false,
	workers: 1,
	timeout: 90_000,
	expect: { timeout: 20_000 },
	reporter: [['list']],
	outputDir: 'test-results/splat-studio',
	projects: selected.map((name) => ({ name, use: browsers[name] })),
	use: {
		baseURL,
		serviceWorkers: 'block',
		headless: true,
		viewport: { width: 1440, height: 1000 },
		deviceScaleFactor: 1,
		locale: 'en-GB',
		contextOptions: { reducedMotion: 'reduce' },
		acceptDownloads: true,
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure'
	},
	webServer:
		process.env.PLAYWRIGHT_REUSE_SERVER === '1'
			? undefined
			: {
					command: 'node scripts/preview-splat-studio.mjs --preview',
					env: { SPLAT_STUDIO_PREVIEW_PORT: String(port) },
					url: `${baseURL}/tools/splat-studio`,
					reuseExistingServer: false,
					timeout: 120_000
				}
});
