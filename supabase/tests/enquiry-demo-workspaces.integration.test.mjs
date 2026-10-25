// Execute the actual migration under PostgreSQL roles; no hosted database is contacted.
// npm install --prefix .codex-artifacts/enquiry-demo-sql-runtime --no-save --ignore-scripts @electric-sql/pglite@0.5.11
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { EnquiryStore } from '../../src/lib/server/enquiry-demo/store.ts';

const require = createRequire(
	path.resolve(
		process.env.ENQUIRY_DEMO_SQL_RUNTIME || '.codex-artifacts/enquiry-demo-sql-runtime',
		'package.json'
	)
);
const { PGlite } = require('@electric-sql/pglite');
const migration = await readFile(
	new URL('../migrations/202610260001_enquiry_demo_workspaces.sql', import.meta.url),
	'utf8'
);
const hash = (value) => value.toString(16).padStart(64, '0');
const firstHash = hash(1),
	secondHash = hash(2);
const seed = new EnquiryStore(':memory:');
seed.seed();
const state = seed.exportSnapshot();
seed.close();

test('visitor workspace migration enforces private grants, revision writes, expiry, quotas and persistence', async (t) => {
	const directory = await mkdtemp(path.join(tmpdir(), 'enquiry-demo-sql-'));
	let db = new PGlite(directory);
	const result = async (sql, values = []) => (await db.query(sql, values)).rows[0].result;
	const as = async (role = '') => {
		await db.exec('reset role');
		if (role) await db.exec(`set role ${role}`);
	};
	const reset = async () => {
		await as();
		await db.exec('truncate public.enquiry_demo_workspaces, public.enquiry_demo_admission');
		await as('service_role');
	};
	const create = (
		id = 1,
		admission = 90,
		snapshot = state,
		staffUntil = null,
		expiresAt = new Date(Date.now() + 23 * 3_600_000).toISOString(),
		nextDueAt = new Date(Date.now() - 60_000).toISOString()
	) =>
		result('select public.enquiry_demo_create($1,$2,$3,$4,$5,$6,$7) as result', [
			hash(id),
			hash(id + 1000),
			expiresAt,
			staffUntil,
			nextDueAt,
			snapshot,
			hash(admission)
		]);
	const load = (key = firstHash) => result('select public.enquiry_demo_get($1) as result', [key]);
	const cas = (key, revision, snapshot, staffUntil = null, nextDueAt = null) =>
		result('select public.enquiry_demo_cas($1,$2,$3,$4,$5) as result', [
			key,
			revision,
			staffUntil,
			nextDueAt,
			snapshot
		]);
	try {
		await db.exec(
			'create role anon; create role authenticated; create role service_role bypassrls;'
		);
		await db.exec(migration);

		await t.test(
			'all visitor tables use forced RLS and deny direct reads/writes even to the service role',
			async () => {
				for (const table of ['enquiry_demo_workspaces', 'enquiry_demo_admission']) {
					const row = (
						await db.query(
							'select relrowsecurity,relforcerowsecurity from pg_class where oid=$1::regclass',
							[`public.${table}`]
						)
					).rows[0];
					assert.deepEqual(row, { relrowsecurity: true, relforcerowsecurity: true });
					for (const role of ['anon', 'authenticated', 'service_role']) {
						await as(role);
						await assert.rejects(db.query(`select * from public.${table}`), /permission denied/);
						await assert.rejects(db.query(`delete from public.${table}`), /permission denied/);
					}
					await as();
				}
				for (const role of ['anon', 'authenticated']) {
					await as(role);
					await assert.rejects(load(), /permission denied/);
					await assert.rejects(create(), /permission denied/);
					await assert.rejects(cas(firstHash, 1, state), /permission denied/);
					await assert.rejects(db.query('select public.enquiry_demo_due(1)'), /permission denied/);
					await assert.rejects(
						db.query('select public.enquiry_demo_cleanup()'),
						/permission denied/
					);
				}
				await as();
				const functions = (
					await db.query(
						"select proname,prosecdef,proconfig from pg_proc where pronamespace='public'::regnamespace and proname in ('enquiry_demo_create','enquiry_demo_get','enquiry_demo_cas','enquiry_demo_due','enquiry_demo_cleanup')"
					)
				).rows;
				assert.equal(functions.length, 5);
				for (const entry of functions) {
					assert.equal(entry.prosecdef, true);
					assert.ok(entry.proconfig.includes('search_path=""'));
				}
			}
		);

		await t.test(
			'CAS updates only the selected capability and rejects stale revisions without changing either workspace',
			async () => {
				await reset();
				const a = await create(1),
					b = await create(2);
				assert.equal(a.version, 1);
				assert.equal(b.version, 1);
				const updatedState = structuredClone(state);
				updatedState.tables.demo_history[0].message =
					'A fictional changed history entry in visitor A only.';
				const expiry = a.expiresAt;
				const committed = await cas(firstHash, a.version, updatedState);
				assert.equal(committed.version, 2);
				assert.equal(committed.expiresAt, expiry);
				assert.deepEqual(await load(secondHash), b);
				assert.equal(await cas(firstHash, a.version, state), null);
				assert.deepEqual(await load(), committed);
				assert.equal(await load(hash(9999)), null);
				assert.equal(await cas(hash(9999), 1, state), null);
			}
		);

		await t.test(
			'rejects malformed, oversized and excessive-lifetime inputs before inserting or changing state',
			async () => {
				await reset();
				await assert.rejects(
					create(1, 90, { schemaVersion: 2, tables: {} }),
					/Invalid demonstration workspace/
				);
				await assert.rejects(
					create(1, 90, { schemaVersion: 1, tables: {}, padding: 'x'.repeat(655_360) }),
					/Invalid demonstration workspace/
				);
				await assert.rejects(
					create(1, 90, state, new Date(Date.now() + 60_000).toISOString()),
					/Invalid demonstration workspace/
				);
				await assert.rejects(
					create(1, 90, state, null, new Date(Date.now() + 25 * 3_600_000).toISOString()),
					/Invalid demonstration workspace/
				);
				assert.equal(await load(), null);
				const a = await create();
				await assert.rejects(
					cas(firstHash, a.version, state, new Date(Date.now() + 9 * 3_600_000).toISOString()),
					/Invalid demonstration staff expiry/
				);
				assert.deepEqual(await load(), a);
				await assert.rejects(
					result('select public.enquiry_demo_due($1) as result', [0]),
					/Invalid demonstration worker batch/
				);
				await assert.rejects(
					result('select public.enquiry_demo_due($1) as result', [21]),
					/Invalid demonstration worker batch/
				);
			}
		);

		await t.test(
			'real SQL admission rejects the ninth workspace for one key and active/global limits without partial creation',
			async () => {
				await reset();
				for (let index = 1; index <= 8; index += 1) assert.ok(await create(index));
				assert.equal(await create(9), null);
				assert.equal(await load(hash(9)), null);
				assert.ok(await create(10, 91));
				await as();
				assert.equal(
					(
						await db.query(
							'select sum(attempts)::int as attempts from public.enquiry_demo_admission'
						)
					).rows[0].attempts,
					9
				);
				await reset();
				await as();
				await db.query(
					"insert into public.enquiry_demo_admission select date_trunc('hour',now()), lpad(to_hex(i),64,'0'),8 from generate_series(1,15) i"
				);
				await as('service_role');
				assert.equal(await create(1, 500), null);
				assert.equal(await load(), null);
				await reset();
				await as();
				await db.query(
					"insert into public.enquiry_demo_workspaces(session_hash,scope_key,state,state_bytes,expires_at) select lpad(to_hex(i),64,'0'),lpad(to_hex(i+1000),64,'0'),$1::jsonb,octet_length($1::jsonb::text),now()+interval '1 hour' from generate_series(1,200) i",
					[{ schemaVersion: 1, tables: {} }]
				);
				await as('service_role');
				assert.equal(await create(999, 500), null);
				assert.equal(await load(hash(999)), null);
			}
		);

		await t.test(
			'due work excludes expired visitors and cleanup removes only ended sessions',
			async () => {
				await reset();
				await create(1);
				await create(2);
				await as();
				await db.query(
					"update public.enquiry_demo_workspaces set created_at=now()-interval '2 hours',expires_at=now()-interval '1 second',staff_until=null where session_hash=$1",
					[firstHash]
				);
				await as('service_role');
				assert.equal(await load(), null);
				assert.equal(await cas(firstHash, 1, state), null);
				const due = await result('select public.enquiry_demo_due(20) as result');
				assert.deepEqual(
					due.map((entry) => entry.sessionHash),
					[secondHash]
				);
				assert.equal(await result('select public.enquiry_demo_cleanup() as result'), 1);
				assert.equal(await result('select public.enquiry_demo_cleanup() as result'), 0);
				assert.ok(await load(secondHash));
			}
		);

		await t.test(
			'committed snapshot and revision survive closing and reopening the actual database',
			async () => {
				const before = await load(secondHash);
				await db.close();
				db = new PGlite(directory);
				await as('service_role');
				assert.deepEqual(await load(secondHash), before);
			}
		);
		// PGlite serializes statements on one engine. This verifies CAS semantics and persisted
		// role grants, not multi-connection PostgreSQL lock contention on the hosted database.
	} finally {
		await db.close();
		if (!directory.startsWith(path.join(tmpdir(), 'enquiry-demo-sql-')))
			throw new Error('Unexpected SQL test directory');
		await rm(directory, { recursive: true, force: true });
	}
});
