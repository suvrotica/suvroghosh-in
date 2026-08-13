import { defineConfig } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT ?? 4340);
const baseURL = `http://127.0.0.1:${port}`;
const articleURL = `${baseURL}/blog/visualizations/the-matrix-is-random-why-does-it-have-a-shape`;

export default defineConfig({
	testDir: './tests/browser',
	testMatch: 'random-matrix.spec.ts',
	fullyParallel: false,
	workers: 1,
	timeout: 120_000,
	expect: { timeout: 30_000 },
	reporter: [['list']],
	use: {
		baseURL,
		browserName: 'chromium',
		channel: process.env.PLAYWRIGHT_CHANNEL?.trim() || (process.env.CI ? undefined : 'chrome'),
		headless: true,
		acceptDownloads: true,
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
			name: 'desktop',
			use: { viewport: { width: 1440, height: 900 } }
		},
		{
			name: 'desktop-1366',
			use: { viewport: { width: 1366, height: 768 } }
		},
		{
			name: 'large-4k',
			use: { viewport: { width: 3840, height: 2160 } }
		},
		{
			name: 'tablet-portrait',
			use: { viewport: { width: 768, height: 1024 } }
		},
		{
			name: 'tablet-landscape',
			use: { viewport: { width: 1024, height: 768 } }
		},
		{
			name: 'mobile',
			use: {
				viewport: { width: 390, height: 844 },
				isMobile: true,
				hasTouch: true
			}
		},
		{
			name: 'mobile-360',
			use: {
				viewport: { width: 360, height: 800 },
				isMobile: true,
				hasTouch: true
			}
		},
		{
			name: 'phone-landscape',
			use: {
				viewport: { width: 844, height: 390 },
				isMobile: true,
				hasTouch: true
			}
		},
		{
			name: 'compact-mobile',
			use: {
				viewport: { width: 320, height: 568 },
				isMobile: true,
				hasTouch: true
			}
		}
	]
});
