import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, type Plugin } from 'vite';

/**
 * import.meta.glob('/src/lib/posts/*.md') in +page.ts gets expanded
 * by vite:import-glob into ~600 dynamic import()s. During esbuild's
 * dep-scan on Vercel, all 600 resolve in parallel and time out.
 *
 * This plugin (enforce: 'pre') transforms the source BEFORE
 * vite:import-glob, replacing the glob with a single Proxy that
 * lazily calls import(). Result: 1 import instead of 600.
 */
function lazyPostGlob(): Plugin {
	return {
		name: 'lazy-post-glob',
		enforce: 'pre',
		transform(code, id) {
			const marker = 'src/routes/blog/[category]/[slug]/+page.ts';
			if (!id.includes(marker)) return;

			const globMatch = /const\s+postModules\s*=\s*import\.meta\.glob[^;]+;/.exec(code);
			if (!globMatch) return;

			const before = code.slice(0, globMatch.index);
			const after = code.slice(globMatch.index + globMatch[0].length);

			const replacement = `const postModules = new Proxy({}, { get(_, key) { if (typeof key !== 'string') return; const p = key; return () => import(/* @vite-ignore */ p + '?raw'); } });`;

			return { code: before + replacement + after, map: null };
		}
	};
}

export default defineConfig({
	plugins: [tailwindcss(), sveltekit(), lazyPostGlob()]
});
