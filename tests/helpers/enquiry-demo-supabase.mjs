// Test-only Supabase RPC facade backed by the real migration in a durable PostgreSQL WASM file.
// It binds loopback only, contains no real credentials, and is never an application route.
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

if (process.env.VERCEL) throw new Error('The enquiry test bridge must never run on Vercel.');
const require = createRequire(
	path.resolve(
		process.env.ENQUIRY_DEMO_SQL_RUNTIME || '.codex-artifacts/enquiry-demo-sql-runtime',
		'package.json'
	)
);
const { PGlite } = require('@electric-sql/pglite');
const directory = path.resolve(
	process.env.ENQUIRY_DEMO_TEST_SQL_DIR || `.codex-artifacts/enquiry-demo-browser/${randomUUID()}`
);
await mkdir(directory, { recursive: true });
const db = new PGlite(directory);
await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
await db.exec(
	await readFile('supabase/migrations/202610260001_enquiry_demo_workspaces.sql', 'utf8')
);

const functions = {
	enquiry_demo_create: [
		'p_session_hash',
		'p_scope_key',
		'p_expires_at',
		'p_staff_until',
		'p_next_due_at',
		'p_state',
		'p_admission_key'
	],
	enquiry_demo_get: ['p_session_hash'],
	enquiry_demo_cas: ['p_session_hash', 'p_version', 'p_staff_until', 'p_next_due_at', 'p_state'],
	enquiry_demo_due: ['p_limit'],
	enquiry_demo_cleanup: []
};

async function body(request) {
	let length = 0;
	const chunks = [];
	for await (const chunk of request) {
		length += chunk.length;
		if (length > 1024 * 1024) throw new Error('Test request exceeds the fixed bridge limit');
		chunks.push(chunk);
	}
	return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

const port = Number(process.env.ENQUIRY_DEMO_TEST_SQL_PORT || 54331);
const server = createServer(async (request, response) => {
	const reply = (status, value) => {
		response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
		response.end(JSON.stringify(value));
	};
	const url = new URL(request.url, `http://127.0.0.1:${port}`);
	try {
		if (url.pathname === '/health') return reply(200, { ready: true });
		if (url.pathname === '/__test/expire' && request.method === 'POST') {
			const input = await body(request);
			if (typeof input.scopeKey !== 'string' || !/^[a-f0-9]{64}$/.test(input.scopeKey))
				return reply(400, { message: 'Choose one test workspace.' });
			await db.query(
				"update public.enquiry_demo_workspaces set created_at=now()-interval '2 hours',expires_at=now()-interval '1 second',staff_until=null,next_due_at=null where scope_key=$1",
				[input.scopeKey]
			);
			return reply(200, { expired: true });
		}
		const name = url.pathname.replace('/rest/v1/rpc/', '');
		if (!Object.hasOwn(functions, name) || request.method !== 'POST')
			return reply(404, { message: 'Test RPC not found' });
		const parameters = await body(request);
		const keys = functions[name];
		const role =
			request.headers.authorization === 'Bearer enquiry-demo-test-service'
				? 'service_role'
				: 'anon';
		const result = await db.transaction(async (tx) => {
			await tx.exec(`set local role ${role}`);
			return tx.query(
				`select public.${name}(${keys.map((_, index) => `$${index + 1}`).join(',')}) as result`,
				keys.map((key) => parameters[key] ?? null)
			);
		});
		return reply(200, result.rows[0].result);
	} catch (cause) {
		return reply(cause.code === '42501' ? 403 : 400, {
			code: cause.code || 'TEST_ERROR',
			message: cause.message
		});
	}
});
server.requestTimeout = 15_000;
server.headersTimeout = 10_000;
server.listen(port, '127.0.0.1', () =>
	process.stdout.write(`Enquiry PostgreSQL test bridge ready on loopback:${port}\n`)
);

let closing = false;
for (const signal of ['SIGINT', 'SIGTERM'])
	process.on(signal, async () => {
		if (closing) return;
		closing = true;
		server.close();
		await db.close();
	});
