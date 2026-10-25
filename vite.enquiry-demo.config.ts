import { mergeConfig } from 'vite';
import base from './vite.config';

// SvelteKit otherwise scans every science/game/article route on a cold start.
// Inherit the same application plugins, CSP, hooks and route implementation.
export default mergeConfig(base, {
	optimizeDeps: { noDiscovery: true },
	server: {
		watch: {
			// Local authoring environments contain thousands of files unrelated to this
			// desk. In particular, database writes must never trigger page reloads.
			ignored: [
				'**/.codex-artifacts/**',
				'**/.codex/**',
				'**/.audit-private/**',
				'**/gastropod-shell-lab/**',
				'**/suvroghosh-post-backups/**',
				'**/.data/**',
				'**/.venv/**',
				'**/__pycache__/**',
				'**/artifacts/**',
				'**/test-results/**',
				'**/services/**',
				'**/.vercel/**'
			]
		}
	}
});
