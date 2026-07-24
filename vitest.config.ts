import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [sveltekit()],
	test: {
		include: [
			'src/lib/notes/**/*.test.ts',
			'src/lib/server/notes/**/*.test.ts',
			'src/lib/components/sketch-museum/**/*.test.ts'
		],
		environment: 'node',
		coverage: {
			reporter: ['text', 'html'],
			include: ['src/lib/notes/{geometry,history,model,schema,spatial-index,strokes,export}.ts']
		}
	}
});
