import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['src/lib/visualizations/human-ai-icu-prediction/**/*.test.ts'],
		environment: 'node'
	}
});
