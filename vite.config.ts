import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],

	// The `[category]/[slug]/+page.ts` uses `import.meta.glob('/src/lib/posts/*.md')`
	// which creates 600+ parallel resolve requests during esbuild's dep-scanner.
	// On constrained CI (like Vercel), esbuild times out and the build fails.
	// Excluding markdown files from dep-optimisation lets them be processed
	// lazily at runtime insteed of all at once during the initial scann.
	optimizeDeps: {
		exclude: ['**/*.md']
	}
});
