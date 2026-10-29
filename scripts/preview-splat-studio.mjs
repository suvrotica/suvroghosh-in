import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, createServer, preview } from 'vite';
import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// Local authoring preview of the production component. Keeping its output in the
// ignored cache avoids rewriting the full site's generated publication files.
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.join(project, 'node_modules/.cache/splat-studio-preview');
const port = Number(process.env.SPLAT_STUDIO_PREVIEW_PORT || 4326);
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
	throw new Error('SPLAT_STUDIO_PREVIEW_PORT must be an integer from 1024 to 65535.');
}
await mkdir(root, { recursive: true });
await writeFile(
	path.join(root, 'tsconfig.json'),
	JSON.stringify(
		{
			extends: '../../../tsconfig.json',
			include: [
				'../../../src/lib/components/visualizations/splat-studio/**/*.svelte',
				'../../../src/lib/visualizations/splat-studio/**/*.ts',
				'../../../src/routes/tools/splat-studio/**/*.svelte',
				'../../../src/routes/tools/splat-studio/**/*.ts',
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
import SplatStudio from '$lib/components/visualizations/splat-studio/SplatStudio.svelte';
mount(SplatStudio, { target: document.getElementById('app') });
`
);
await writeFile(
	path.join(root, 'index.html'),
	`<!doctype html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><link rel="icon" href="data:,"><title>Splat Studio — Local Preview</title><style>html,body{margin:0;min-width:320px;background:#08090e;color:#f4f2f7}*{box-sizing:border-box}button,input,select{font:inherit}</style></head>
<body><div id="app"></div><noscript>Splat Studio needs JavaScript to render its interactive sculptures.</noscript><script type="module" src="/main.js"></script></body>
</html>`
);

const config = {
	configFile: false,
	root,
	publicDir: false,
	plugins: [svelte({ configFile: false, preprocess: vitePreprocess() })],
	resolve: { alias: { $lib: path.join(project, 'src/lib') }, dedupe: ['svelte'] },
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
		`Splat Studio ${process.argv.includes('--preview') ? 'production ' : ''}preview: http://127.0.0.1:${port}/tools/splat-studio`
	);
	for (const signal of ['SIGINT', 'SIGTERM']) {
		process.on(signal, async () => {
			if ('close' in server) await server.close();
			else await new Promise((resolve) => server.httpServer.close(resolve));
			process.exit(0);
		});
	}
}
