import { defineConfig } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT ?? 4321);
const baseURL = process.env.UML_BASE_URL || `http://127.0.0.1:${port}`;

export default defineConfig({
	testDir: './tests',
	testMatch: 'uml.spec.ts',
	fullyParallel: false,
	workers: 1,
	maxFailures: 1,
	timeout: 120_000,
	expect: { timeout: 30_000 },
	reporter: [['list']],
	use: {
		baseURL,
		serviceWorkers: 'block',
		browserName: 'chromium',
		channel: process.env.PLAYWRIGHT_CHANNEL?.trim() || (process.env.CI ? undefined : 'chrome'),
		headless: true,
		viewport: { width: 1440, height: 1000 },
		acceptDownloads: true,
		navigationTimeout: 90_000,
		contextOptions: { reducedMotion: 'reduce' },
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure'
	},
	// Run npm run build before this command. Never silently test an unrelated live deployment.
	webServer:
		process.env.PLAYWRIGHT_REUSE_SERVER === '1'
			? undefined
			: {
					command: `npx vite preview --host 127.0.0.1 --port ${port} --strictPort`,
					url: `${baseURL}/blog/visualizations/post-to-uml`,
					reuseExistingServer: false,
					timeout: 120_000
				}
});
