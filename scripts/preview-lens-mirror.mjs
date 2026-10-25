import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { mdsvex } from 'mdsvex';

// Authoring-only preview: the same source article and lab, without compiling the
// full site's eager article metadata registry. Nothing here is a production route.
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.join(project, 'node_modules/.cache/lens-mirror-preview');
const port = Number(process.env.LENS_MIRROR_PREVIEW_PORT || 4318);
await mkdir(root, { recursive: true });
const article = await readFile(
	path.join(project, 'src/lib/posts/through-a-different-glass.md'),
	'utf8'
);
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
html{background:#faf9f5;color:#242c2a;font-family:'Archivo Variable',Arial,sans-serif;scroll-behavior:smooth}
body{margin:0;padding:35px 24px 80px}#app{max-width:1400px;margin:auto}
#app>h2,#app>h3,#app>p,#app>ul,#app>ol,#app>pre{max-width:710px;margin-left:auto;margin-right:auto;font-family:'Newsreader Variable',Georgia,serif;font-size:21px;line-height:1.7}
#app>h2{font-size:35px;line-height:1.15;margin-top:50px;margin-bottom:15px;font-weight:500;letter-spacing:-.025em}
#app>h3{font-size:26px;line-height:1.3;margin-top:28px;margin-bottom:12px}
#app>p{margin-top:0;margin-bottom:20px}#app>p a{color:#1c6558;text-underline-offset:3px}
#app>pre{padding:20px;background:#eeebe3;overflow-x:auto}#app>ul li,#app>ol li{margin-bottom:8px}
body .optics-lab{margin-left:auto;margin-right:auto;width:100%;max-width:1400px}
@media(max-width:600px){body{padding:12px 10px 40px}#app>p,#app>h3,#app>ul,#app>ol{font-size:19px;padding:0 14px}#app>h2{font-size:29px;padding:0 14px}}
`
);
const template =
	'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Through a Different Glass: The Lens and Mirror Lab</title><!--head--></head><body><main id="app"><!--body--></main><script type="module" src="/main.js"></script></body></html>';
await writeFile(path.join(root, 'index.html'), template);
const server = await createServer({
	configFile: false,
	root,
	publicDir: path.join(project, 'static'),
	plugins: [
		svelte({
			configFile: false,
			extensions: ['.svelte', '.md'],
			preprocess: [mdsvex({ extensions: ['.md'] }), vitePreprocess()]
		})
	],
	resolve: { alias: { $lib: path.join(project, 'src/lib') }, dedupe: ['svelte'] },
	ssr: { noExternal: ['svelte'] },
	server: { host: '127.0.0.1', port, strictPort: true, fs: { allow: [project] } },
	appType: 'custom'
});
server.middlewares.use(async (request, response, next) => {
	const pathname = new URL(request.url || '/', 'http://localhost').pathname;
	if (!['/', '/blog/visualizations/through-a-different-glass'].includes(pathname)) return next();
	try {
		const module = await server.ssrLoadModule('/Article.md');
		const { render } = await server.ssrLoadModule('svelte/server');
		const output = render(module.default);
		const html = await server.transformIndexHtml(
			pathname,
			template.replace('<!--head-->', output.head).replace('<!--body-->', output.body)
		);
		response.statusCode = 200;
		response.setHeader('content-type', 'text/html; charset=utf-8');
		response.end(html);
	} catch (error) {
		server.ssrFixStacktrace(error);
		next(error);
	}
});
await server.listen();
console.log(
	`Lens and Mirror Lab preview: http://127.0.0.1:${port}/blog/visualizations/through-a-different-glass`
);
for (const signal of ['SIGINT', 'SIGTERM'])
	process.on(signal, async () => {
		await server.close();
		process.exit(0);
	});
