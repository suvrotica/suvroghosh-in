import { defineConfig } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT ?? 4173);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
	testDir: './tests/browser',
	testMatch: [
		'visualization-review.spec.ts',
		'domain-coloring.spec.ts',
		'fractal-atlas.spec.ts',
		'bias-archipelago.spec.ts',
		'visualization-responsive-biology.spec.ts',
		'bz-laboratory.spec.ts',
		'reaction-diffusion.spec.ts',
		'lightning-atlas.spec.ts',
		'prior-authorization.spec.ts',
		'random-matrix.spec.ts',
		'gastropod-shell-lab.spec.ts',
		'gradient-descent.spec.ts'
	],
	projects: [{ name: 'desktop' }],
	grep: [
		/GPU powers/u,
		/partial imported/u,
		/introductory shader/u,
		/Observable wave/u,
		/Brownian diagnostic axes/u,
		/Meaning Map composes/u,
		/terrain follows/u,
		/mobile opening and guided maps/u,
		/shell preset drawer/u,
		/nucleus opening/u,
		/complete artificial-life/u,
		/calcium chart/u,
		/mobile Gallery stays/u,
		/guided sequence/u,
		/mobile and no-JavaScript readers/u,
		/field-map headings/u,
		/phone and zoom-proxy/u,
		/theory captions/u,
		/loads inside the canonical article/u,
		/serious accessibility violations/u,
		/no horizontal page overflow/u,
		/mobile and no-script fallbacks/u,
		/webgl=off/u,
		/single-step, reset and replay/u,
		/WebGL failure promotes/u
	],
	fullyParallel: false,
	workers: 1,
	timeout: 120_000,
	expect: { timeout: 30_000 },
	reporter: [['list']],
	outputDir: 'test-results/visualization-review',
	use: {
		baseURL,
		browserName: 'chromium',
		channel: process.env.PLAYWRIGHT_CHANNEL?.trim() || (process.env.CI ? undefined : 'chrome'),
		headless: true,
		viewport: { width: 1440, height: 1000 },
		deviceScaleFactor: 1,
		reducedMotion: 'reduce',
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure'
	},
	webServer: {
		command: `npm run build:full && npx vite preview --host 127.0.0.1 --port ${port}`,
		url: `${baseURL}/blog/visualizations/hello-fragment-your-first-shader-from-scratch`,
		reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVER === '1',
		timeout: 600_000
	}
});
