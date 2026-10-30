import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, createServer, preview } from 'vite';
import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { mdsvex } from 'mdsvex';

// Authoring-only SSR preview of the actual article and feature source. This
// avoids the full site's eager article catalog while iterating, and adds no route.
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.join(project, 'node_modules/.cache/patient-x-preview');
const port = Number(process.env.PATIENT_X_PREVIEW_PORT || 4337);
const articlePath = '/blog/visualizations/patient-x-depression-bipolar';
const production = process.argv.includes('--production') || process.argv.includes('--build-only');
const buildOnly = process.argv.includes('--build-only');
await mkdir(root, { recursive: true });
const article = await readFile(
	path.join(project, 'src/lib/posts/patient-x-depression-bipolar.md'),
	'utf8'
);
const body = article.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/u, '').replace('<TTS />', '');
await writeFile(path.join(root, 'Article.md'), body);
await writeFile(
	path.join(root, 'main.js'),
	`import { hydrate } from 'svelte';
import Article from './Article.md';
import '@fontsource-variable/source-serif-4/standard.css';
import '@fontsource/courier-prime/400.css';
import '@fontsource-variable/roboto';
import './preview.css';
hydrate(Article, { target: document.getElementById('app') });
`
);
await writeFile(
	path.join(root, 'preview.css'),
	`
html{--background:#f7f2e7;--foreground:#2b241c;--muted:#eee5d5;--muted-foreground:#5c4f3e;--border:#d5c7ae;background:var(--background);color:var(--foreground);font-family:'Roboto Variable',Arial,sans-serif;color-scheme:light}
html.dark{--background:#171512;--foreground:#f0ece4;--muted:#24211d;--muted-foreground:#c7c0b5;--border:#4b463e;color-scheme:dark}
*,*::before,*::after{box-sizing:border-box}
body{margin:0;padding:28px 24px 80px}#app{max-width:1040px;margin:auto}
#app>h2,#app>h3,#app>p,#app>ul,#app>ol,#app>pre{max-width:710px;margin-left:auto;margin-right:auto;font-family:'Courier Prime',monospace;font-size:21px;line-height:1.7}
#app>h2{font-size:35px;line-height:1.15;margin-top:50px;margin-bottom:15px;font-weight:500;letter-spacing:-.025em}
#app>h3{font-size:26px;line-height:1.3;margin-top:28px;margin-bottom:12px}
#app>p{margin-top:0;margin-bottom:20px}#app>p a{color:inherit;text-underline-offset:3px}
#app>pre{padding:20px;background:#eeebe3;overflow-x:auto}#app>ul li,#app>ol li{margin-bottom:8px}
body .patient-x{margin-left:auto;margin-right:auto;width:100%;max-width:1040px}
@media(max-width:600px){body{padding:12px 10px 40px}#app>p,#app>h3,#app>ul,#app>ol{font-size:19px;padding:0 14px}#app>h2{font-size:29px;padding:0 14px}}
`
);
const template =
	'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><title>Depression, bipolar disorder, and what the scores leave out</title><!--head--></head><body><main id="app"><!--body--></main><script type="module" src="/main.js"></script></body></html>';
await writeFile(path.join(root, 'index.html'), template);
const sourceConfig = () => ({
	configFile: false,
	root,
	plugins: [
		svelte({
			configFile: false,
			extensions: ['.svelte', '.md'],
			// HMR rewrites scoped hashes. Disable it for the production SSR pass
			// so its HTML matches the scoped CSS emitted by the client build.
			compilerOptions: { hmr: !production },
			preprocess: [mdsvex({ extensions: ['.md'] }), vitePreprocess()]
		})
	],
	resolve: { alias: { $lib: path.join(project, 'src/lib') }, dedupe: ['svelte'] },
	ssr: { noExternal: ['svelte'] }
});

async function renderArticle(server) {
	const module = await server.ssrLoadModule('/Article.md');
	const { render } = await server.ssrLoadModule('svelte/server');
	const output = render(module.default);
	return template.replace('<!--head-->', output.head).replace('<!--body-->', output.body);
}

if (production) {
	const dist = path.join(root, 'dist');
	if (!dist.startsWith(root + path.sep))
		throw new Error('Preview output escaped its cache folder.');
	const ssrServer = await createServer({
		...sourceConfig(),
		publicDir: false,
		server: { middlewareMode: true, fs: { allow: [project] } },
		appType: 'custom'
	});
	try {
		await writeFile(path.join(root, 'index.html'), await renderArticle(ssrServer));
	} finally {
		await ssrServer.close();
	}
	await build({
		...sourceConfig(),
		publicDir: false,
		build: { outDir: dist, emptyOutDir: true },
		appType: 'spa'
	});
	console.log(`Patient X production feature build: ${dist}`);
	if (!buildOnly) {
		const server = await preview({
			configFile: false,
			root,
			build: { outDir: dist },
			preview: { host: '127.0.0.1', port, strictPort: true },
			appType: 'spa'
		});
		console.log(`Patient X production feature preview: http://127.0.0.1:${port}${articlePath}`);
		for (const signal of ['SIGINT', 'SIGTERM'])
			process.on(signal, () => {
				server.httpServer.close(() => process.exit(0));
			});
	}
} else {
	const server = await createServer({
		...sourceConfig(),
		publicDir: path.join(project, 'static'),
		server: { host: '127.0.0.1', port, strictPort: true, fs: { allow: [project] } },
		appType: 'custom'
	});
	server.middlewares.use(async (request, response, next) => {
		const pathname = new URL(request.url || '/', 'http://localhost').pathname;
		if (!['/', articlePath].includes(pathname)) return next();
		try {
			const html = await server.transformIndexHtml(pathname, await renderArticle(server));
			response.statusCode = 200;
			response.setHeader('content-type', 'text/html; charset=utf-8');
			response.end(html);
		} catch (error) {
			server.ssrFixStacktrace(error);
			next(error);
		}
	});
	await server.listen();
	console.log(`Patient X preview: http://127.0.0.1:${port}${articlePath}`);
	for (const signal of ['SIGINT', 'SIGTERM'])
		process.on(signal, async () => {
			await server.close();
			process.exit(0);
		});
}
