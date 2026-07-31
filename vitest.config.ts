import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [sveltekit()],
	test: {
		include: [
			'src/lib/motion/**/*.test.ts',
			'src/lib/notes/**/*.test.ts',
			'src/lib/server/notes/**/*.test.ts',
			'src/lib/topics/**/*.test.ts',
			'src/lib/components/sketch-museum/**/*.test.ts',
			'src/lib/visualizations/ct-reconstruction/**/*.test.ts',
			'src/lib/visualizations/domain-coloring/**/*.test.ts',
			'src/lib/visualizations/city-master-plan/**/*.test.ts',
			'src/lib/visualizations/neuron-zoo/**/*.test.ts',
			'src/lib/games/**/*.test.ts'
		],
		environment: 'node',
		coverage: {
			reporter: ['text', 'html'],
			include: ['src/lib/notes/{geometry,history,model,schema,spatial-index,strokes,export}.ts']
		}
	}
});
