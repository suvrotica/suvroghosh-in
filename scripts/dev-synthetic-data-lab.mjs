import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const service = path.join(root, 'services/synthetic-data-lab');
const venv = path.join(root, '.codex-artifacts/synthetic-data-lab-venv');
const python =
	process.env.SYNTHETIC_LAB_PYTHON ||
	path.join(venv, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');

function run(command, args, cwd = root, env = process.env) {
	return spawn(command, args, { cwd, env, stdio: 'inherit', windowsHide: true });
}

async function finish(child) {
	return new Promise((resolve, reject) => {
		child.once('error', reject);
		child.once('exit', (code) =>
			code === 0 ? resolve() : reject(new Error(`Command exited with code ${code}.`))
		);
	});
}

if (process.argv.includes('--setup')) {
	await mkdir(path.dirname(venv), { recursive: true });
	if (!existsSync(python)) await finish(run(process.env.PYTHON || 'python', ['-m', 'venv', venv]));
	await finish(run(python, ['-m', 'pip', 'install', '-r', path.join(service, 'requirements.txt')]));
	await finish(run(python, ['-m', 'pip', 'install', '--no-deps', '-e', service]));
	console.log('Synthetic Data Lab is ready. Run npm run synthetic-data:dev.');
} else {
	if (!existsSync(python))
		throw new Error(
			'Run npm run synthetic-data:setup first, or set SYNTHETIC_LAB_PYTHON to the prepared Python executable.'
		);
	const token = randomBytes(32).toString('hex');
	const backendPort = Number(process.env.SYNTHETIC_LAB_PORT || 8765);
	const frontendPort = Number(process.env.SYNTHETIC_LAB_WEB_PORT || 5175);
	if (
		![backendPort, frontendPort].every(
			(port) => Number.isInteger(port) && port >= 1024 && port <= 65535
		)
	)
		throw new Error('Choose valid local ports.');
	const env = {
		...process.env,
		SYNTHETIC_DATA_SERVICE_TOKEN: token,
		SYNTHETIC_DATA_API_URL: `http://127.0.0.1:${backendPort}`,
		SYNTHETIC_DATA_ALLOW_LOOPBACK: 'true'
	};
	const children = [];
	let stopping = false;
	function stop(code = 0) {
		if (stopping) return;
		stopping = true;
		for (const child of children) child.kill();
		process.exitCode = code;
	}
	for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop());
	const backend = run(
		python,
		[
			'-m',
			'uvicorn',
			'app:app',
			'--host',
			'127.0.0.1',
			'--port',
			String(backendPort),
			'--no-access-log'
		],
		service,
		env
	);
	children.push(backend);
	backend.on('error', (error) => {
		console.error(error.message);
		stop(1);
	});
	backend.on('exit', (code) => {
		if (!stopping) stop(code || 1);
	});
	let ready = false;
	for (let attempt = 0; attempt < 80 && !stopping; attempt++) {
		try {
			const response = await fetch(`${env.SYNTHETIC_DATA_API_URL}/health`, {
				signal: AbortSignal.timeout(1000)
			});
			if (response.ok) {
				ready = true;
				break;
			}
		} catch {
			/* Wait for the owned service to load the scientific runtime. */
		}
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
	if (!ready) {
		console.error('The simulation service did not start. Check the service error above.');
		stop(1);
	} else {
		const frontend = run(
			process.execPath,
			[
				path.join(root, 'node_modules/vite/bin/vite.js'),
				...(process.argv.includes('--preview') ? ['preview'] : []),
				'--host',
				'127.0.0.1',
				'--port',
				String(frontendPort),
				'--strictPort'
			],
			root,
			env
		);
		children.push(frontend);
		frontend.on('error', (error) => {
			console.error(error.message);
			stop(1);
		});
		frontend.on('exit', (code) => {
			if (!stopping) stop(code || 0);
		});
		console.log(`Synthetic Data Lab: http://127.0.0.1:${frontendPort}/tools/synthetic-data-lab`);
	}
}
