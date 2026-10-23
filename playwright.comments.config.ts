import { defineConfig } from '@playwright/test';

const baseURL = 'http://127.0.0.1:5184';

export default defineConfig({
	testDir: './tests/browser',
	testMatch: ['**/comments*.spec.ts'],
	workers: 1,
	timeout: 180_000,
	expect: { timeout: 15_000 },
	reporter: [['list']],
	use: {
		baseURL,
		browserName: 'chromium',
		channel: process.env.PLAYWRIGHT_CHANNEL?.trim() || (process.env.CI ? undefined : 'chrome'),
		headless: true,
		serviceWorkers: 'block',
		viewport: { width: 1440, height: 1000 },
		screenshot: 'only-on-failure',
		trace: 'retain-on-failure'
	},
	webServer: [
		{
			command: 'node tests/helpers/comments-supabase.mjs',
			url: 'http://127.0.0.1:54329/__test/session',
			timeout: 90_000,
			reuseExistingServer: false
		},
		{
			command:
				'npm run build:site && node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 5184 --strictPort',
			url: `${baseURL}/notes/sign-in`,
			timeout: 600_000,
			reuseExistingServer: false,
			env: {
				SUPABASE_URL: 'http://127.0.0.1:54329',
				SUPABASE_PUBLISHABLE_KEY: 'comments-test-public',
				SUPABASE_SERVICE_ROLE_KEY: 'comments-test-service',
				NOTES_OWNER_USER_ID: 'd66ad910-1e06-4bb7-8f0c-fcf107193d73',
				NOTES_RATE_LIMIT_SALT: 'comments-test-salt-at-least-thirty-two-characters'
			}
		}
	]
});
