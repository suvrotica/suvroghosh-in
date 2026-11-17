import v8 from 'node:v8';
import vm from 'node:vm';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, type Plugin } from 'vite';

// Vercel Basic Linux containers expose host /proc/cpuinfo core counts despite 2-vCPU cgroup limits;
// bounding Go (esbuild), Rayon (@tailwindcss/oxide), and libuv pools keeps native arenas compact.
if (process.env.VERCEL === '1') {
	process.env.GOMAXPROCS ??= '2';
	process.env.RAYON_NUM_THREADS ??= '2';
	process.env.UV_THREADPOOL_SIZE ??= '2';
}

function createBuildGc(): (() => void) | null {
	try {
		v8.setFlagsFromString('--expose_gc');
		const gcFn = vm.runInNewContext('gc');
		return typeof gcFn === 'function' ? (gcFn as () => void) : null;
	} catch {
		return null;
	}
}

function reclaimBuildHeapPlugin(): Plugin {
	const runGc = createBuildGc();
	let transformCount = 0;
	let chunkCount = 0;

	return {
		name: 'reclaim-build-heap',
		apply: 'build',
		transform() {
			transformCount += 1;
			if (runGc && transformCount % 800 === 0) {
				runGc();
			}
			return null;
		},
		buildEnd() {
			runGc?.();
		},
		renderStart() {
			runGc?.();
		},
		renderChunk() {
			chunkCount += 1;
			if (runGc && chunkCount % 250 === 0) {
				runGc();
			}
			return null;
		},
		generateBundle() {
			runGc?.();
		},
		closeBundle() {
			runGc?.();
		}
	};
}

export default defineConfig({
	plugins: [tailwindcss(), sveltekit(), reclaimBuildHeapPlugin()],
	ssr: {
		// sanitize-html is CommonJS but its parser is ESM-only. Vercel's Node loader
		// rejects require(ESM), so bundle this dependency closure with its resolved
		// versions instead of leaving runtime requires or hoisted bare imports.
		noExternal: [
			'sanitize-html',
			'htmlparser2',
			'domhandler',
			'domutils',
			'domelementtype',
			'dom-serializer',
			'entities',
			'is-plain-object',
			'escape-string-regexp',
			'parse-srcset',
			'postcss',
			'launder',
			'dayjs',
			'nanoid',
			'picocolors',
			'source-map-js'
		]
	},
	optimizeDeps: {
		esbuildOptions: {
			plugins: [
				{
					name: 'skip-md-during-scan',
					setup(build) {
						build.onResolve({ filter: /\.md$/ }, () => ({
							path: 'virtual:md-stub',
							namespace: 'md-stub'
						}));
						build.onLoad({ filter: /.*/, namespace: 'md-stub' }, () => ({
							contents: 'export default {}',
							loader: 'js'
						}));
					}
				}
			]
		}
	}
});
