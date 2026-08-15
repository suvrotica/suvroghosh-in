import { defineConfig } from 'vitest/config';

export default defineConfig({
	root: import.meta.dirname,
	test: {
		cache: false,
		environment: 'node',
		include: ['**/*.test.ts']
	}
});
