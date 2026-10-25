import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { EnquiryStore } from '../src/lib/server/enquiry-demo/store.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
const command = process.argv[2] || 'setup';
const dbPath = resolve(process.env.ENQUIRY_DEMO_DB || '.data/enquiry-demo/enquiries.sqlite');
const accessPath = resolve('.data/enquiry-demo/access.json');

function setup() {
	mkdirSync(dirname(dbPath), { recursive: true });
	mkdirSync(dirname(accessPath), { recursive: true });
	if (!existsSync(accessPath)) {
		writeFileSync(
			accessPath,
			`${JSON.stringify({ password: randomBytes(24).toString('base64url') }, null, 2)}\n`,
			{ mode: 0o600, flag: 'wx' }
		);
	}
	const store = new EnquiryStore(dbPath);
	try {
		store.seed();
	} finally {
		store.close();
	}
}

if (Number(process.versions.node.split('.')[0]) < 24)
	throw new Error('Use Node.js 24.11.1 or a compatible Node 24 release for this local prototype.');

if (command === 'setup') {
	setup();
	console.log('Local enquiry demo is ready. Database: ' + dbPath);
	console.log(
		'Use npm run enquiry-demo:password to view your local staff password. No emails can be sent.'
	);
} else if (command === 'password') {
	setup();
	const value = JSON.parse(readFileSync(accessPath, 'utf8'));
	console.log(process.env.ENQUIRY_DEMO_PASSWORD || value.password);
} else if (command === 'reset') {
	if (!process.argv.includes('--confirm'))
		throw new Error(
			'This replaces all fictional enquiry data. Run npm run enquiry-demo:reset -- --confirm to continue.'
		);
	setup();
	const store = new EnquiryStore(dbPath);
	try {
		store.reset();
	} finally {
		store.close();
	}
	console.log('Restored 30 fictional enquiries and the original demo clock.');
} else if (command === 'dev') {
	setup();
	const portIndex = process.argv.indexOf('--port');
	const port = Number(
		portIndex >= 0 ? process.argv[portIndex + 1] : process.env.ENQUIRY_DEMO_PORT || 4321
	);
	if (!Number.isInteger(port) || port < 1024 || port > 65535)
		throw new Error('Choose a local port from 1024 to 65535.');
	console.log(`Working prototype: http://127.0.0.1:${port}/demos/customer-enquiries`);
	console.log('Start the independent fake-message worker with npm run enquiry-demo:worker.');
	const child = spawn(
		process.execPath,
		[
			'node_modules/vite/bin/vite.js',
			'--config',
			'vite.enquiry-demo.config.ts',
			'--host',
			'127.0.0.1',
			'--port',
			String(port),
			'--strictPort'
		],
		{
			cwd: root,
			stdio: 'inherit',
			env: { ...process.env, ENQUIRY_DEMO_ENABLED: '1', ENQUIRY_DEMO_DB: dbPath }
		}
	);
	for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
	child.on('exit', (code) => {
		process.exitCode = code || 0;
	});
} else {
	throw new Error('Choose setup, password, reset or dev.');
}
