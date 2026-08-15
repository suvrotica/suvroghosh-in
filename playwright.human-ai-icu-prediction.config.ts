import { defineConfig } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT ?? 4347);
const baseURL = `http://127.0.0.1:${port}`;
const articleURL = `${baseURL}/blog/visualizations/human-ai-icu-prediction-laboratory`;

export default defineConfig({
	testDir: './tests/browser',
	testMatch: 'human-ai-icu-prediction.spec.ts',
	fullyParallel: false,
	workers: 1,
	timeout: 180_000,
	expect: { timeout: 30_000 },
	reporter: [['list']],
	outputDir: 'test-results/human-ai-icu-prediction',
	use: {
		baseURL,
		browserName: 'chromium',
		channel: process.env.PLAYWRIGHT_CHANNEL?.trim() || undefined,
		headless: true,
		navigationTimeout: 60_000,
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure'
	},
	webServer: {
		command: `npm run build:site && npx vite preview --host 127.0.0.1 --port ${port} --strictPort`,
		url: articleURL,
		reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVER === '1',
		timeout: 600_000
	},
	projects: [
		{
			name: 'chromium',
			use: { viewport: { width: 1440, height: 900 } }
		}
	]
});
