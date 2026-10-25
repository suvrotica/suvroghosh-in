import { defineConfig } from '@playwright/test';

const port = Number(process.env.ENQUIRY_DEMO_PUBLIC_TEST_PORT || 4331);
const baseURL = process.env.ENQUIRY_DEMO_PUBLIC_TEST_BASE_URL || `http://127.0.0.1:${port}`;
if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(baseURL).hostname)) {
	throw new Error(
		'Public-mode isolation tests require a loopback test deployment and must never reset a live visitor workspace.'
	);
}

export default defineConfig({
	testDir: './tests/browser',
	testMatch: 'enquiry-demo-public.spec.ts',
	fullyParallel: false,
	workers: 1,
	timeout: 90_000,
	expect: { timeout: 15_000 },
	reporter: [['list']],
	outputDir: 'test-results/enquiry-demo-public',
	use: {
		baseURL,
		serviceWorkers: 'block',
		browserName: 'chromium',
		channel: process.env.PLAYWRIGHT_CHANNEL?.trim() || (process.env.CI ? undefined : 'chrome'),
		headless: true,
		viewport: { width: 1440, height: 1080 },
		locale: 'en-GB',
		reducedMotion: 'reduce',
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure'
	},
	webServer:
		process.env.ENQUIRY_DEMO_PUBLIC_TEST_REUSE === '1'
			? undefined
			: [
					{
						command: 'node tests/helpers/enquiry-demo-supabase.mjs',
						url: 'http://127.0.0.1:54331/health',
						timeout: 60_000,
						reuseExistingServer: false
					},
					{
						command: `npm run build:site && node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port ${port} --strictPort`,
						url: `${baseURL}/demos/customer-enquiries`,
						timeout: 600_000,
						reuseExistingServer: false,
						env: {
							ENQUIRY_DEMO_PUBLIC_ENABLED: '1',
							ENQUIRY_DEMO_ALLOW_TEST_BACKEND: '1',
							SUPABASE_URL: 'http://127.0.0.1:54331',
							SUPABASE_SERVICE_ROLE_KEY: 'enquiry-demo-test-service',
							NOTES_RATE_LIMIT_SALT: 'enquiry-demo-test-salt-at-least-thirty-two-characters'
						}
					}
				]
});
