import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['src/lib/visualizations/city-master-plan/engine/**/*.stress.ts'],
		environment: 'node',
		fileParallelism: false,
		testTimeout: 300_000,
		hookTimeout: 300_000
	}
});
