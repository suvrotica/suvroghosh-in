import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, type Plugin } from 'vite';

/**
 * The catch-all +page.ts uses import.meta.glob('/src/lib/posts/*.md'),
 * which vite:import-glob expands into ~600 dynamic import() calls.
 * During esbuild's dep-scan on Vercel, all 600 resolve in parallel
 * and time out.
 *
 * This plugin runs AFTER the glob expansion (enforce: 'post') and
 * marks every .md resolve as external during the scan phase.
 * During the real build, .md files are processed normally.
 */
function skipMdDuringScan(): Plugin {
	return {
		name: 'skip-md-during-scan',
		enforce: 'post',

		resolveId(id, _importer, options) {
			if (!id.endsWith('.md')) return;
			// options.scan is true only during esbuild's initial dep-scan
			if ((options as Record<string, unknown>).scan) {
				return { id, external: true };
			}
		}
	};
}

export default defineConfig({
	plugins: [tailwindcss(), sveltekit(), skipMdDuringScan()]
});
