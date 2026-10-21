import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
	cacheDir: 'node_modules/.vite-privacy-preview',
	plugins: [tailwindcss(), svelte({ configFile: false })],
	resolve: {
		alias: {
			$lib: fileURLToPath(new URL('../src/lib', import.meta.url)),
			'$app/paths': fileURLToPath(new URL('./privacy-preview-paths.ts', import.meta.url))
		}
	},
	optimizeDeps: { entries: ['tests/privacy-preview.html'] },
	server: { host: '127.0.0.1', port: 4269, strictPort: true, hmr: false, watch: null }
});
