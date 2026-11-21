import { defineConfig } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT?.trim() || 4264);
const baseURL = `http://127.0.0.1:${port}`;
const existingNodeOptions = process.env.NODE_OPTIONS?.trim();
const hasOldSpaceFlag = existingNodeOptions
	? /--max[-_]old[-_]space[-_]size(?:=|\s|$)/u.test(existingNodeOptions)
	: false;
const webServerNodeOptions = existingNodeOptions
	? hasOldSpaceFlag
		? existingNodeOptions
		: `${existingNodeOptions} --max-old-space-size=8192`
	: '--max-old-space-size=8192';

export default defineConfig({
	testDir: './tests/browser',
	testMatch: 'acoustic-wavefield.spec.ts',
	fullyParallel: false,
	workers: 1,
	timeout: 180_000,
	expect: { timeout: 30_000 },
	reporter: [['list']],
	use: {
		baseURL,
		browserName: 'chromium',
		channel: process.env.PLAYWRIGHT_CHANNEL?.trim() || undefined,
		headless: true,
		viewport: { width: 1440, height: 1000 },
		serviceWorkers: 'block',
		acceptDownloads: true,
		contextOptions: { reducedMotion: 'no-preference' },
		launchOptions: {
			args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
		},
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure'
	},
	webServer:
		process.env.PLAYWRIGHT_REUSE_SERVER === '1'
			? undefined
			: {
					command:
						process.env.PLAYWRIGHT_SKIP_BUILD === '1'
							? `npx vite preview --host 127.0.0.1 --port ${port} --strictPort`
							: `npm run build:site && npx vite preview --host 127.0.0.1 --port ${port} --strictPort`,
					env: {
						NODE_OPTIONS: webServerNodeOptions
					},
					url: `${baseURL}/blog/visualizations/the-room-that-remembers-every-clap`,
					reuseExistingServer: false,
					timeout: 600_000
				}
});
