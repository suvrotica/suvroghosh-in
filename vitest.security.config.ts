import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

// These suites use in-process requests, fake timers and mocked providers.
// Database-role fixtures are separate; this suite must never imply they ran.
export default defineConfig({
	plugins: [sveltekit()],
	test: {
		include: [
			'scripts/security-*.test.ts',
			'src/lib/server/http/**/*.test.ts',
			'src/lib/server/notes/**/*.test.ts',
			'src/lib/server/tts/**/*.test.ts',
			'src/lib/server/uml/**/*.test.ts',
			'src/lib/visualizations/post-to-uml/**/*.test.ts',
			'src/routes/viz/uml/**/*.test.ts',
			'src/lib/server/prompt-atlas/**/*.test.ts',
			'src/lib/server/synthetic-data-lab/**/*.test.ts',
			'src/lib/server/comments/**/*.test.ts',
			'src/lib/server/analytics/**/*.test.ts',
			'src/routes/api/**/*.test.ts',
			'src/routes/contact/**/*.test.ts'
		],
		setupFiles: ['scripts/security-test-setup.ts'],
		environment: 'node',
		maxWorkers: 2
	}
});
