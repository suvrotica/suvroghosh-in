import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, createServer, preview } from 'vite';
import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { mdsvex } from 'mdsvex';

// Authoring-only SSR preview of the actual article and feature source. This
// avoids the full site's eager article catalog while iterating, and adds no route.
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.join(project, 'node_modules/.cache/strange-matter-preview');
const port = Number(process.env.STRANGE_MATTER_PREVIEW_PORT || 4337);
const articlePath = '/blog/visualizations/strange-matter';
const production = process.argv.includes('--production') || process.argv.includes('--build-only');
const buildOnly = process.argv.includes('--build-only');
await mkdir(root, { recursive: true });
const article = await readFile(path.join(project, 'src/lib/posts/strange-matter.md'), 'utf8');
const body = article.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/u, '').replace('<TTS />', '');
await writeFile(path.join(root, 'Article.md'), body);
await writeFile(
	path.join(root, 'main.js'),
	`import { hydrate } from 'svelte';
import Article from './Article.md';
import '@fontsource-variable/newsreader';
import '@fontsource-variable/archivo';
import './preview.css';
hydrate(Article, { target: document.getElementById('app') });
`
);
await writeFile(
	path.join(root, 'preview.css'),
	`
html{background:#090b0e;color:#e9e9e4;font-family:'Archivo Variable',Arial,sans-serif;scroll-behavior:smooth}
body{margin:0;padding:0 0 64px}#app{margin:auto}
#app>h2,#app>h3,#app>p,#app>ul,#app>ol,#app>pre{max-width:710px;margin-left:auto;margin-right:auto;font-family:'Newsreader Variable',Georgia,serif;font-size:21px;line-height:1.7}
#app>h2{font-size:35px;line-height:1.15;margin-top:50px;margin-bottom:15px;font-weight:500;letter-spacing:-.025em}
#app>h3{font-size:26px;line-height:1.3;margin-top:28px;margin-bottom:12px}
#app>p{margin-top:0;margin-bottom:20px}#app>p a{color:#1c6558;text-underline-offset:3px}
#app>pre{padding:20px;background:#eeebe3;overflow-x:auto}#app>ul li,#app>ol li{margin-bottom:8px}
body .sm-shell{left:auto;transform:none;margin-left:auto;margin-right:auto}
@media(max-width:600px){body{padding:0 0 40px}#app>p,#app>h3,#app>ul,#app>ol{font-size:19px;padding:0 14px}#app>h2{font-size:29px;padding:0 14px}}
`
);
const template =
	'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Strange Matter — Make Something Impossible</title><!--head--></head><body><main id="app"><!--body--></main><script type="module" src="/main.js"></script></body></html>';
await writeFile(path.join(root, 'index.html'), template);
const sourceConfig = () => ({
	configFile: false,
	root,
	plugins: [
		svelte({
			configFile: false,
			extensions: ['.svelte', '.md'],
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
	const poster = path.join('images', 'visualizations', 'strange-matter', 'poster.png');
	await mkdir(path.dirname(path.join(dist, poster)), { recursive: true });
	try {
		await copyFile(path.join(project, 'static', poster), path.join(dist, poster));
	} catch (error) {
		if (error.code !== 'ENOENT') throw error;
		console.warn('Poster not captured yet; the interactive app remains available.');
	}
	console.log(`Strange Matter production feature build: ${dist}`);
	if (!buildOnly) {
		const server = await preview({
			configFile: false,
			root,
			build: { outDir: dist },
			preview: { host: '127.0.0.1', port, strictPort: true },
			appType: 'spa'
		});
		console.log(
			`Strange Matter production feature preview: http://127.0.0.1:${port}${articlePath}`
		);
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
	console.log(`Strange Matter preview: http://127.0.0.1:${port}${articlePath}`);
	for (const signal of ['SIGINT', 'SIGTERM'])
		process.on(signal, async () => {
			await server.close();
			process.exit(0);
		});
}
