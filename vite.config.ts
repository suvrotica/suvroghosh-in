import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	ssr: {
		// sanitize-html is CommonJS but its parser is ESM-only. Vercel's Node loader
		// rejects require(ESM), so bundle this dependency closure with its resolved
		// versions instead of leaving runtime requires or hoisted bare imports.
		noExternal: [
			'sanitize-html',
			'htmlparser2',
			'domhandler',
			'domutils',
			'domelementtype',
			'dom-serializer',
			'entities',
			'is-plain-object',
			'escape-string-regexp',
			'parse-srcset',
			'postcss',
			'launder',
			'dayjs',
			'nanoid',
			'picocolors',
			'source-map-js'
		]
	},
	optimizeDeps: {
		esbuildOptions: {
			plugins: [
				{
					name: 'skip-md-during-scan',
					setup(build) {
						build.onResolve({ filter: /\.md$/ }, () => ({
							path: 'virtual:md-stub',
							namespace: 'md-stub'
						}));
						build.onLoad({ filter: /.*/, namespace: 'md-stub' }, () => ({
							contents: 'export default {}',
							loader: 'js'
						}));
					}
				}
			]
		}
	}
});
