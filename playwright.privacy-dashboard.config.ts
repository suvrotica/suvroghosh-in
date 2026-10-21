import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: './tests',
	testMatch: 'privacy-dashboard.spec.ts',
	fullyParallel: false,
	workers: 1,
	reporter: 'list',
	use: { baseURL: 'http://127.0.0.1:4269', serviceWorkers: 'block' },
	webServer: {
		command: 'npx vite --config tests/privacy-preview.vite.config.ts',
		url: 'http://127.0.0.1:4269/tests/privacy-preview.html',
		reuseExistingServer: false,
		timeout: 60_000
	}
});
