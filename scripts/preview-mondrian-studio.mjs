import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, createServer, preview } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import svelteConfig from '../svelte.config.js';

// Isolated local authoring & Playwright preview for Mondrian Studio + embedded mdsvex essay.
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.join(project, 'node_modules/.cache/mondrian-studio-preview');
const publicDir = path.join(root, 'public');
const port = Number(process.env.MONDRIAN_STUDIO_PREVIEW_PORT || 4328);

if (!Number.isInteger(port) || port < 1024 || port > 65535) {
	throw new Error('MONDRIAN_STUDIO_PREVIEW_PORT must be an integer from 1024 to 65535.');
}

await mkdir(root, { recursive: true });
await rm(publicDir, { recursive: true, force: true });
await mkdir(path.join(publicDir, 'images/visualizations/mondrian-studio'), { recursive: true });
await cp(
	path.join(project, 'static/images/visualizations/mondrian-studio'),
	path.join(publicDir, 'images/visualizations/mondrian-studio'),
	{ recursive: true }
);

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
	url: new URL(typeof location !== 'undefined' ? location.href : 'http://127.0.0.1/tools/mondrian-studio'),
	params: {},
	data: {},
	status: 200,
	error: null,
	form: null,
	route: { id: '/tools/mondrian-studio' },
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
	path.join(root, 'tsconfig.json'),
	JSON.stringify(
		{
			extends: '../../../tsconfig.json',
			include: [
				'../../../src/lib/components/visualizations/mondrian-studio/**/*.svelte',
				'../../../src/lib/visualizations/mondrian-studio/**/*.ts',
				'../../../src/routes/tools/mondrian-studio/**/*.svelte',
				'../../../src/routes/tools/mondrian-studio/**/*.ts',
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
import MondrianStudio from '$lib/components/visualizations/mondrian-studio/MondrianStudio.svelte';
mount(MondrianStudio, { target: document.getElementById('app') });
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
<title>Piet Mondrian: A Pioneer of Abstract Art — Studio Preview</title>
<style>html,body{margin:0;padding:0;min-width:320px;background:#dedad0;color:#171714}*{box-sizing:border-box}button,input,select{font:inherit}</style>
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
		`Mondrian Studio ${process.argv.includes('--preview') ? 'production ' : ''}preview: http://127.0.0.1:${port}/tools/mondrian-studio`
	);
	for (const signal of ['SIGINT', 'SIGTERM']) {
		process.on(signal, async () => {
			if ('close' in server) await server.close();
			else await new Promise((resolve) => server.httpServer.close(resolve));
			process.exit(0);
		});
	}
}
