import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const python =
	process.env.SYNTHETIC_LAB_PYTHON ||
	path.join(
		root,
		'.codex-artifacts/synthetic-data-lab-venv',
		process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python'
	);
const commands = [
	[python, ['-m', 'pytest', 'tests', '-q'], path.join(root, 'services/synthetic-data-lab')],
	[
		process.execPath,
		[
			path.join(root, 'node_modules/vitest/vitest.mjs'),
			'run',
			'src/lib/server/synthetic-data-lab',
			'src/lib/synthetic-data-lab',
			'--maxWorkers=2'
		],
		root
	]
];
for (const [command, args, cwd] of commands) {
	const result = spawnSync(command, args, { cwd, stdio: 'inherit', windowsHide: true });
	if (result.error) {
		console.error(result.error.message);
		process.exit(1);
	}
	if (result.status !== 0) process.exit(result.status || 1);
}
