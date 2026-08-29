import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
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
