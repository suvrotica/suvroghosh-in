import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: './tests/browser',
	testMatch: 'bengali-impressionism.spec.ts',
	workers: 1,
	timeout: 90000,
	expect: { timeout: 12000 },
	use: {
		baseURL: process.env.BENGALI_PAINTING_BASE_URL ?? 'http://127.0.0.1:4198',
		channel: process.env.PLAYWRIGHT_CHANNEL?.trim() || (process.env.CI ? undefined : 'chrome'),
		serviceWorkers: 'block',
		reducedMotion: 'reduce',
		viewport: { width: 1024, height: 720 },
		deviceScaleFactor: 1
	}
});
