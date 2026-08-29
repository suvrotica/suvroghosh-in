import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, type Plugin } from 'vite';

/**
 * During the esbuild dep-scan phase (which builds the dependency
 * graph before the real build), import.meta.glob('/src/lib/posts/*.md')
 * creates 600+ parallel resolve requests. On Vercel's 1 GB runner
 * esbuild times out with "server restarted or closed" errors.
 *
 * This plugin returns a no-op stub for every .md file during the
 * scan so esbuild finishes in milliseconds. During the real build
 * and dev server, .md files resolve normally through mdsvex.
 */
function skipMdDuringScan(): Plugin {
	const VIRTUAL_ID = '\0virtual-empty-md';

	return {
		name: 'skip-md-during-scan',
		enforce: 'pre',

		resolveId(id, _importer, options) {
			if (!id.endsWith('.md')) return;
			// options.scan is true only during the initial esbuild dependency
			// scan.  During actual builds and dev, it is absent or false.
			if ((options as Record<string, unknown>).scan) {
				return { id: VIRTUAL_ID };
			}
		},

		load(id) {
			if (id === VIRTUAL_ID) {
				return 'export default {}';
			}
		}
	};
}

export default defineConfig({
	plugins: [tailwindcss(), sveltekit(), skipMdDuringScan()]
});
