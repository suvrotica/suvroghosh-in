import { existsSync } from 'node:fs';
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, createServer, preview } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import svelteConfig from '../svelte.config.js';

// Isolated local authoring & Playwright preview for Drip Painting Studio + embedded mdsvex companion essay.
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.join(project, 'node_modules/.cache/drip-painting-studio-preview');
const publicDir = path.join(root, 'public');
const port = Number(process.env.DRIP_PAINTING_STUDIO_PREVIEW_PORT || 4330);

if (!Number.isInteger(port) || port < 1024 || port > 65535) {
	throw new Error('DRIP_PAINTING_STUDIO_PREVIEW_PORT must be an integer from 1024 to 65535.');
}

await mkdir(root, { recursive: true });
await rm(publicDir, { recursive: true, force: true });
const staticImagesDir = path.join(project, 'static/images/visualizations/drip-painting-studio');
const publicImagesDir = path.join(publicDir, 'images/visualizations/drip-painting-studio');
await mkdir(publicImagesDir, { recursive: true });
if (existsSync(staticImagesDir)) {
	await cp(staticImagesDir, publicImagesDir, { recursive: true });
}

await writeFile(
	path.join(root, 'app-environment.js'),
	`export const browser = typeof window !== 'undefined';
export const dev = true;
export const building = false;
export const version = 'preview';
`
);

await writeFile(
	path.join(root, 'app-state.js'),
	`export const page = {
	url: new URL(typeof location !== 'undefined' ? location.href : 'http://127.0.0.1/tools/drip-painting-studio'),
	params: {},
	data: {},
	status: 200,
	error: null,
	form: null,
	route: { id: '/tools/drip-painting-studio' },
	state: {}
};
`
);

await writeFile(
	path.join(root, 'app-paths.js'),
	`export const base = '';
export const assets = '';
export function resolve(route) {
	return route;
}
`
);

await writeFile(
	path.join(root, 'env-dynamic-public.js'),
	`export const env = {};
`
);

await writeFile(
	path.join(root, 'app-navigation.js'),
	`export function beforeNavigate() {}
export function afterNavigate() {}
export function onNavigate() {}
export function goto() {
	return Promise.resolve();
}
`
);

await writeFile(
	path.join(root, 'tsconfig.json'),
	JSON.stringify(
		{
			extends: '../../../tsconfig.json',
			include: [
				'../../../src/lib/components/privacy/**/*.svelte',
				'../../../src/lib/components/visualizations/drip-painting-studio/**/*.svelte',
				'../../../src/lib/privacy/**/*.ts',
				'../../../src/lib/visualizations/drip-painting-studio/**/*.ts',
				'../../../src/routes/tools/drip-painting-studio/**/*.svelte',
				'../../../src/routes/tools/drip-painting-studio/**/*.ts',
				'../../../.svelte-kit/ambient.d.ts'
			]
		},
		null,
		2
	) + '\n'
);

await writeFile(
	path.join(root, 'main.js'),
	`import { mount } from 'svelte';
import PrivacyConsent from '$lib/components/privacy/PrivacyConsent.svelte';
import DripPaintingStudio from '$lib/components/visualizations/drip-painting-studio/DripPaintingStudio.svelte';
const target = document.getElementById('app');
mount(PrivacyConsent, {
	target: document.body,
	anchor: target,
	props: { compactTrigger: false, deferNotice: true }
});
mount(DripPaintingStudio, { target });
`
);

await writeFile(
	path.join(root, 'index.html'),
	`<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<link rel="icon" href="data:,">
<title>Abstract Expressionist Drip Painting: Corruption in India — Studio Preview</title>
<style>:root{--paper:#f7f2e7;--paper-soft:#eee5d5;--paper-raised:#fdfaf3;--rule:#d5c7ae;--control-border:#8d7c63;--ink:#2b241c;--ink-muted:#5c4f3e;--ink-faint:#725f49;--accent:#2f4a43;--focus:#2b241c;--shadow-overlay:0 8px 30px rgb(43 36 28 / 18%);--font-sans:'Roboto Variable',ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI Variable Text','Segoe UI',sans-serif;--font-serif:'Source Serif 4 Variable','Noto Serif Bengali Variable',Georgia,'Times New Roman',serif;--font-mono:ui-monospace,'Cascadia Code','SFMono-Regular',Consolas,'Liberation Mono',monospace}html,body{margin:0;padding:0;min-width:320px;background:#1c1b1a;color:#f6f3eb}*{box-sizing:border-box}button,input,select{font:inherit}:where(button){background:transparent;border:0;color:inherit}:where(a){color:inherit}</style>
</head>
<body>
<main id="app"></main>
<script type="module" src="/main.js"></script>
</body>
</html>`
);

const config = {
	configFile: false,
	root,
	publicDir,
	plugins: [
		svelte({
			configFile: false,
			extensions: ['.svelte', '.md'],
			preprocess: svelteConfig.preprocess
		})
	],
	resolve: {
		alias: {
			$lib: path.join(project, 'src/lib'),
			'$app/environment': path.join(root, 'app-environment.js'),
			'$app/state': path.join(root, 'app-state.js'),
			'$app/paths': path.join(root, 'app-paths.js'),
			'$app/navigation': path.join(root, 'app-navigation.js'),
			'$env/dynamic/public': path.join(root, 'env-dynamic-public.js')
		},
		dedupe: ['svelte']
	},
	server: { host: '127.0.0.1', port, strictPort: true, fs: { allow: [project] } },
	preview: { host: '127.0.0.1', port, strictPort: true },
	build: { outDir: path.join(root, 'dist'), emptyOutDir: true },
	appType: 'spa'
};

if (process.argv.includes('--build') || process.argv.includes('--preview')) {
	await build(config);
}
if (!process.argv.includes('--build') || process.argv.includes('--preview')) {
	const server = process.argv.includes('--preview')
		? await preview(config)
		: await createServer(config);
	if ('listen' in server) await server.listen();
	console.log(
		`Drip Painting Studio ${process.argv.includes('--preview') ? 'production ' : ''}preview: http://127.0.0.1:${port}/tools/drip-painting-studio`
	);
	for (const signal of ['SIGINT', 'SIGTERM']) {
		process.on(signal, async () => {
			if ('close' in server) await server.close();
			else await new Promise((resolve) => server.httpServer.close(resolve));
			process.exit(0);
		});
	}
}
