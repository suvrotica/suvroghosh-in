import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const vitestEntry = fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url));
const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const result = spawnSync(
	process.execPath,
	[
		vitestEntry,
		'run',
		'src/lib/visualizations/barnum-lab/core/stress.test.ts',
		'--reporter=verbose'
	],
	{
		cwd: repositoryRoot,
		env: { ...process.env, BARNUM_STRESS: '1' },
		stdio: 'inherit',
		shell: false
	}
);

process.exitCode = result.status ?? 1;
