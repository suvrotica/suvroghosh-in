import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['src/lib/visualizations/openhie/**/*.test.ts'],
		environment: 'node'
	}
});
