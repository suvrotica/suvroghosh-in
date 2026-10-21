import { defineConfig } from '@playwright/test';

const baseURL = process.env.SPACETIME_TEST_BASE_URL || 'http://127.0.0.1:4329';

export default defineConfig({
	testDir: './tests/browser',
	testMatch: 'spacetime.spec.ts',
	workers: 1,
	fullyParallel: false,
	timeout: 90_000,
	expect: { timeout: 20_000 },
	reporter: [['list']],
	use: {
		baseURL,
		serviceWorkers: 'block',
		viewport: { width: 1280, height: 900 },
		reducedMotion: 'no-preference',
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure'
	},
	projects: [
		{ name: 'desktop-gpu', use: { channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' } },
		{
			name: 'software-gpu',
			grep: /all nine models/,
			use: {
				channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge',
				launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }
			}
		}
	],
	webServer: process.env.SPACETIME_TEST_BASE_URL
		? undefined
		: {
				command: 'npm run build:site && npx vite preview --host 127.0.0.1 --port 4329 --strictPort',
				url: `${baseURL}/blog/visualizations/spacetime-laboratory-einstein-equations`,
				reuseExistingServer: false,
				timeout: 600_000
			}
});
