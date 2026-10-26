import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from 'node:http';
import { build } from 'vite';
import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { mdsvex } from 'mdsvex';

// A loopback production bundle of the actual article and feature. This authoring
// harness does not add a site route, fetch production content or install a worker.
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.join(project, 'node_modules/.cache/essay-anatomy-preview');
const output = path.join(root, 'client');
const port = Number(process.env.ESSAY_ANATOMY_PREVIEW_PORT || 4326);
await mkdir(root, { recursive: true });
const article = await readFile(path.join(project, 'src/lib/posts/anatomy-of-an-essay.md'), 'utf8');
await writeFile(
	path.join(root, 'Article.md'),
	article.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/u, '').replace('<TTS />', '')
);
await writeFile(
	path.join(root, 'server.js'),
	"export { default } from './Article.md'; export { render } from 'svelte/server';"
);
await writeFile(
	path.join(root, 'main.js'),
	`import { hydrate } from 'svelte';
import Article from './Article.md';
import '@fontsource-variable/newsreader';
import '@fontsource-variable/archivo';
import './preview.css';
hydrate(Article, { target: document.getElementById('app') });`
);
await writeFile(
	path.join(root, 'preview.css'),
	`html{background:#faf9f5;color:#2e3731;font-family:Arial,sans-serif}body{margin:0;padding:30px 20px 70px}#app{max-width:1320px;margin:auto}#app>h2,#app>h3,#app>p,#app>ul,#app>ol{max-width:720px;margin:20px auto;font-family:'Newsreader Variable',Georgia,serif;font-size:21px;line-height:1.65}#app>h2{font-size:36px;line-height:1.15;margin-top:45px}#app>h3{font-size:27px}body .essay-atlas{left:auto;transform:none;width:100%;max-width:1400px;margin:auto auto 50px}body.dark{background:#15201b} @media(max-width:600px){body{padding:10px 8px 45px}#app>h2,#app>h3,#app>p,#app>ul,#app>ol{padding-inline:14px;font-size:19px}}`
);
const plugins = () => [
	svelte({
		configFile: false,
		extensions: ['.svelte', '.md'],
		preprocess: [mdsvex({ extensions: ['.md'] }), vitePreprocess()]
	})
];
const common = {
	configFile: false,
	root,
	publicDir: false,
	plugins: plugins(),
	logLevel: 'warn',
	resolve: { alias: { $lib: path.join(project, 'src/lib') }, dedupe: ['svelte'] },
	ssr: { noExternal: ['svelte'] }
};
await build({
	...common,
	build: {
		ssr: path.join(root, 'server.js'),
		outDir: path.join(root, 'server'),
		emptyOutDir: true,
		rollupOptions: { output: { entryFileNames: 'server.mjs' } }
	}
});
const compiled = await import(pathToFileURL(path.join(root, 'server/server.mjs')).href);
const rendered = compiled.render(compiled.default);
await writeFile(
	path.join(root, 'index.html'),
	`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>The Anatomy of an Essay</title>${rendered.head}</head><body><main id="app">${rendered.body}</main><script type="module" src="/main.js"></script></body></html>`
);
await build({
	...common,
	plugins: plugins(),
	build: { outDir: output, emptyOutDir: true, chunkSizeWarningLimit: 700 }
});
const mime = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.json': 'application/json',
	'.woff2': 'font/woff2'
};
const server = createServer(async (request, response) => {
	try {
		const pathname = decodeURIComponent(new URL(request.url || '/', 'http://localhost').pathname);
		const articleRoute =
			pathname === '/' || pathname === '/blog/visualizations/anatomy-of-an-essay';
		const base =
			pathname.startsWith('/assets/') || articleRoute ? output : path.join(project, 'static');
		const file = path.resolve(base, articleRoute ? 'index.html' : `.${pathname}`);
		if (!file.startsWith(`${base}${path.sep}`)) {
			response.writeHead(403).end();
			return;
		}
		const bytes = await readFile(file);
		response.writeHead(200, {
			'content-type': mime[path.extname(file)] || 'application/octet-stream',
			'cache-control': 'no-store'
		});
		response.end(bytes);
	} catch {
		response.writeHead(404).end('Not found');
	}
});
server.listen(port, '127.0.0.1', () =>
	console.log(
		`Essay anatomy production preview: http://127.0.0.1:${port}/blog/visualizations/anatomy-of-an-essay`
	)
);
for (const signal of ['SIGINT', 'SIGTERM'])
	process.on(signal, () => server.close(() => process.exit(0)));
