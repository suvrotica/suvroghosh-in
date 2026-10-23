// Test-only Supabase HTTP facade backed by the real comments migration in PostgreSQL WASM.
// The application uses its normal cookie authentication, PostgREST RPCs and authorization.
// This server binds loopback only and must never be deployed with the application.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(path.resolve('.codex-artifacts/comments-sql-runtime/package.json'));
const { PGlite } = require('@electric-sql/pglite');
const db = new PGlite();
const ownerId = 'd66ad910-1e06-4bb7-8f0c-fcf107193d73';
await db.exec(`
  create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
  $$;
  grant usage on schema auth to anon,authenticated,service_role;
  create table public.note_owners (user_id uuid primary key references auth.users(id));
`);
await db.query('insert into auth.users values ($1)', [ownerId]);
await db.query('insert into public.note_owners values ($1)', [ownerId]);
await db.exec(await readFile('supabase/migrations/202610230001_post_comments.sql', 'utf8'));
await db.exec(
	await readFile('supabase/migrations/202610230002_post_comments_legacy_slugs.sql', 'utf8')
);
const user = {
	id: ownerId,
	aud: 'authenticated',
	role: 'authenticated',
	email: 'owner@example.test',
	app_metadata: {},
	user_metadata: {},
	created_at: new Date().toISOString()
};
const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const expires = Math.floor(Date.now() / 1000) + 7200;
const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: ownerId, aud: 'authenticated', role: 'authenticated', exp: expires, iat: expires - 7200 })}.test-only-signature`;
const session = {
	access_token: token,
	refresh_token: 'test-only-owner-refresh',
	expires_at: expires,
	expires_in: 7200,
	token_type: 'bearer',
	user
};
const functions = {
	get_post_comments: ['p_post_slug', 'p_parent_id', 'p_page'],
	submit_post_comment: [
		'p_post_slug',
		'p_parent_id',
		'p_display_name',
		'p_body',
		'p_submission_id',
		'p_rate_key'
	],
	get_comment_moderation_counts: [],
	get_comment_moderation_queue: ['p_status', 'p_post_slug', 'p_page'],
	moderate_post_comment: ['p_id', 'p_status', 'p_mark_read'],
	reply_to_post_comment: ['p_parent_id', 'p_body', 'p_submission_id']
};

async function body(request) {
	const chunks = [];
	let bytes = 0;
	for await (const chunk of request) {
		bytes += chunk.length;
		if (bytes > 20_000) throw new Error('Test request too large');
		chunks.push(chunk);
	}
	return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

createServer(async (request, response) => {
	const reply = (status, data) => {
		response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
		response.end(JSON.stringify(data));
	};
	const url = new URL(request.url, 'http://127.0.0.1:54329');
	try {
		if (url.pathname === '/health') return reply(200, { ready: true });
		if (url.pathname === '/__test/session')
			return reply(200, {
				cookie: {
					name: 'sb-127-auth-token',
					value: `base64-${encode(session)}`,
					domain: '127.0.0.1',
					path: '/',
					httpOnly: true,
					sameSite: 'Lax'
				}
			});
		if (url.pathname === '/__test/reset' && request.method === 'POST') {
			await db.exec(
				'truncate public.post_comment_history, public.post_comments, public.post_comment_limits restart identity cascade'
			);
			return reply(200, { reset: true });
		}
		const bearer = request.headers.authorization?.replace(/^Bearer /, '');
		if (url.pathname === '/auth/v1/user')
			return bearer === token
				? reply(200, user)
				: reply(401, { message: 'Unauthorized', code: 'bad_jwt' });
		const name = url.pathname.replace('/rest/v1/rpc/', '');
		if (!Object.hasOwn(functions, name) || request.method !== 'POST')
			return reply(404, { message: 'Test route not found' });
		const role =
			bearer === 'comments-test-service'
				? 'service_role'
				: bearer === token
					? 'authenticated'
					: 'anon';
		const parameters = await body(request);
		const keys = functions[name];
		const result = await db.transaction(async (tx) => {
			await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [
				role === 'authenticated' ? ownerId : ''
			]);
			await tx.exec(`set local role ${role}`);
			return await tx.query(
				`select public.${name}(${keys.map((_, i) => `$${i + 1}`).join(',')}) as result`,
				keys.map((key) => parameters[key] ?? null)
			);
		});
		return reply(200, result.rows[0].result);
	} catch (cause) {
		return reply(cause.code === '42501' ? 403 : 400, {
			code: cause.code ?? 'TEST_ERROR',
			message: cause.message
		});
	}
}).listen(54329, '127.0.0.1', () =>
	process.stdout.write('Comments PostgreSQL test bridge ready on loopback:54329\n')
);
