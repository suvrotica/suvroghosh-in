import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

const port = Number(process.env.ENQUIRY_DEMO_PORT || 4321);
const baseURL = process.env.ENQUIRY_DEMO_BASE_URL || `http://127.0.0.1:${port}`;
if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(baseURL).hostname)) {
	throw new Error('Enquiry browser tests reset fictional data and must target a loopback URL.');
}

export default defineConfig({
	testDir: './tests/browser',
	testMatch: 'enquiry-demo.spec.ts',
	fullyParallel: false,
	workers: 1,
	timeout: 90_000,
	expect: { timeout: 15_000 },
	reporter: [['list']],
	outputDir: 'test-results/enquiry-demo-browser',
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
		process.env.PLAYWRIGHT_REUSE_SERVER === '1'
			? undefined
			: {
					command: `node scripts/enquiry-demo.mjs dev --port ${port}`,
					env: {
						ENQUIRY_DEMO_ENABLED: '1',
						ENQUIRY_DEMO_PASSWORD: 'browser-demo-password-2026',
						ENQUIRY_DEMO_DB: resolve('test-results/enquiry-demo-browser.sqlite')
					},
					url: `${baseURL}/demos/customer-enquiries`,
					reuseExistingServer: false,
					timeout: 240_000
				}
});
