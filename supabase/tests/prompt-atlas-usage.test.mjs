// Isolated PostgreSQL WASM tests. No hosted database or provider is contacted.
// Optional runtime: npm install --prefix .codex-artifacts/prompt-atlas-sql --no-save --ignore-scripts @electric-sql/pglite@0.5.11
// Alternatively set PROMPT_ATLAS_SQL_RUNTIME to an existing pinned runtime folder.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { test } from 'node:test';

const migration = await readFile(
	new URL('../migrations/202610250001_prompt_atlas_usage.sql', import.meta.url),
	'utf8'
);
const require = createRequire(
	path.resolve(
		process.env.PROMPT_ATLAS_SQL_RUNTIME ?? '.codex-artifacts/prompt-atlas-sql',
		'package.json'
	)
);
let PGlite;
try {
	({ PGlite } = require('@electric-sql/pglite'));
} catch (cause) {
	if (process.env.PROMPT_ATLAS_SQL_RUNTIME) throw cause;
}

test('quota migration keeps service-only admission bounded and separate from provider-cost guarantees', () => {
	assert.match(migration, /enable row level security/);
	assert.match(migration, /force row level security/);
	assert.match(
		migration,
		/revoke all on public\.prompt_atlas_usage from public, anon, authenticated, service_role/
	);
	assert.match(
		migration,
		/grant execute on function public\.reserve_prompt_atlas_usage\(text,integer,integer\)\s+to service_role/
	);
	assert.match(migration, /set search_path = ''/);
	assert.match(migration, /set statement_timeout = '3s'/);
	assert.match(migration, /set lock_timeout = '1s'/);
	assert.match(migration, /pg_catalog\.pg_advisory_xact_lock\(849225, 1\)/);
	assert.match(migration, /daily_request_limit not between 1 and 100/);
	assert.match(migration, /hourly_client_limit not between 1 and 10/);
	assert.match(migration, /limit 128/);
	assert.match(migration, /not provider cost/);
	assert.doesNotMatch(migration, /create (?:or replace )?function[^;]*execute\s+/i);
});

test(
	'quota migration executes with real PostgreSQL semantics in an isolated local database',
	{
		skip: !PGlite && 'Install the pinned temporary PGlite runtime to execute SQL integration.'
	},
	async (t) => {
		const db = new PGlite();
		const hash = (value) => value.toString(16).padStart(64, '0');
		const reserve = async (key = hash(1), daily = 100, hourly = 10) =>
			(
				await db.query('select public.reserve_prompt_atlas_usage($1,$2,$3) as result', [
					key,
					daily,
					hourly
				])
			).rows[0].result;
		const reset = async () => {
			await db.exec('reset role; truncate public.prompt_atlas_usage; set role service_role;');
		};
		try {
			await db.exec(
				'create role anon; create role authenticated; create role service_role bypassrls;'
			);
			await db.exec(migration);
			await t.test(
				'is additive and idempotent while preserving existing reservations',
				async () => {
					await db.exec('set role service_role');
					assert.equal((await reserve()).dailyReservations, 1);
					await db.exec('reset role');
					await db.exec(migration);
					assert.equal(
						(
							await db.query(
								'select sum(reservations)::integer as total from public.prompt_atlas_usage'
							)
						).rows[0].total,
						2
					);
				}
			);
			await t.test(
				'denies anonymous and authenticated function and table access, with RPC-only service access',
				async () => {
					for (const role of ['anon', 'authenticated', 'service_role']) {
						const grants = await db.query(
							"select has_table_privilege($1,'public.prompt_atlas_usage','SELECT,INSERT,UPDATE,DELETE') as table_access, has_function_privilege($1,'public.reserve_prompt_atlas_usage(text,integer,integer)','EXECUTE') as rpc",
							[role]
						);
						assert.deepEqual(grants.rows[0], { table_access: false, rpc: role === 'service_role' });
						await db.exec(`set role ${role}`);
						await assert.rejects(
							db.query('select * from public.prompt_atlas_usage'),
							/permission denied/
						);
						if (role !== 'service_role') await assert.rejects(reserve(), /permission denied/);
						await db.exec('reset role');
					}
				}
			);
			await t.test(
				'rejects malformed identity and disabled or above-ceiling quota parameters without allocating rows',
				async () => {
					await reset();
					for (const key of ['', 'raw address', 'a'.repeat(63), 'A'.repeat(64), null])
						await assert.rejects(reserve(key), /Invalid Prompt Atlas quota parameters/);
					for (const daily of [null, -1, 0, 101])
						await assert.rejects(reserve(hash(1), daily), /Invalid Prompt Atlas quota parameters/);
					for (const hourly of [null, -1, 0, 11])
						await assert.rejects(
							reserve(hash(1), 100, hourly),
							/Invalid Prompt Atlas quota parameters/
						);
					await db.exec('reset role');
					assert.equal(
						(await db.query('select count(*)::integer as count from public.prompt_atlas_usage'))
							.rows[0].count,
						0
					);
				}
			);
			await t.test(
				'reserves both counters once and refuses an exhausted client without spending the global counter',
				async () => {
					await reset();
					const first = await reserve(hash(1), 10, 2);
					assert.deepEqual(
						{
							allowed: first.allowed,
							daily: first.dailyReservations,
							hourly: first.hourlyClientReservations,
							retry: first.retryAfterSeconds
						},
						{ allowed: true, daily: 1, hourly: 1, retry: 0 }
					);
					assert.match(first.dayResetAt, /^\d{4}-\d{2}-\d{2}T00:00:00Z$/);
					assert.match(first.hourResetAt, /^\d{4}-\d{2}-\d{2}T\d{2}:00:00Z$/);
					assert.equal((await reserve(hash(1), 10, 2)).hourlyClientReservations, 2);
					const denied = await reserve(hash(1), 10, 2);
					assert.equal(denied.allowed, false);
					assert.equal(denied.dailyReservations, 2);
					assert.equal(denied.hourlyClientReservations, 2);
					assert.ok(denied.retryAfterSeconds >= 1 && denied.retryAfterSeconds <= 3600);
					assert.equal((await reserve(hash(2), 10, 2)).dailyReservations, 3);
				}
			);
			await t.test(
				'shared global admission caps queued calls using different client keys and does not allocate denied identities',
				async () => {
					await reset();
					const results = await Promise.all(
						Array.from({ length: 30 }, (_, index) => reserve(hash(index + 1), 7, 10))
					);
					assert.equal(results.filter((result) => result.allowed).length, 7);
					assert.ok(
						results
							.filter((result) => !result.allowed)
							.every(
								(result) =>
									result.dailyReservations === 7 &&
									result.retryAfterSeconds >= 1 &&
									result.retryAfterSeconds <= 86400
							)
					);
					await db.exec('reset role');
					assert.deepEqual(
						(
							await db.query(
								'select count(*)::integer as rows, sum(reservations)::integer as counts from public.prompt_atlas_usage'
							)
						).rows[0],
						{ rows: 8, counts: 14 }
					);
				}
			);
			await t.test(
				'quota windows use UTC independently of the database session time zone',
				async () => {
					await reset();
					await db.exec("set timezone = 'America/New_York'");
					const result = await reserve();
					await db.exec('reset role');
					const expected = (
						await db.query(
							"select to_char((date_trunc('day',clock_timestamp() at time zone 'UTC') at time zone 'UTC' + interval '24 hours') at time zone 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') as reset"
						)
					).rows[0].reset;
					assert.equal(result.dayResetAt, expected);
					const rows = await db.query(
						"select extract(hour from bucket_start at time zone 'UTC')::integer as hour from public.prompt_atlas_usage where bucket_key like 'day:%'"
					);
					assert.equal(rows.rows[0].hour, 0);
					await db.exec("set timezone = 'UTC'");
				}
			);
			await t.test(
				'automatically deletes only a bounded batch of expired feature rows',
				async () => {
					await reset();
					await db.exec('reset role');
					await db.exec(
						"insert into public.prompt_atlas_usage (bucket_key,bucket_start,reservations,expires_at) select 'expired:'||n,clock_timestamp()-interval '5 days',1,clock_timestamp()-interval '4 days' from generate_series(1,140) n"
					);
					await db.exec('set role service_role');
					await reserve();
					await db.exec('reset role');
					assert.equal(
						(
							await db.query(
								"select count(*)::integer as count from public.prompt_atlas_usage where bucket_key like 'expired:%'"
							)
						).rows[0].count,
						12
					);
					await db.exec('set role service_role');
					await reserve();
					await db.exec('reset role');
					assert.equal(
						(
							await db.query(
								"select count(*)::integer as count from public.prompt_atlas_usage where bucket_key like 'expired:%'"
							)
						).rows[0].count,
						0
					);
				}
			);
			await t.test('rolls back both counters if the client increment fails', async () => {
				await reset();
				await db.exec('reset role');
				await db.exec(
					"create function public.test_atlas_failure() returns trigger language plpgsql as $$ begin if new.bucket_key like 'client:%' then raise exception 'forced client write failure'; end if; return new; end $$; create trigger test_atlas_failure before insert on public.prompt_atlas_usage for each row execute function public.test_atlas_failure();"
				);
				await db.exec('set role service_role');
				await assert.rejects(reserve(), /forced client write failure/);
				await db.exec('reset role');
				assert.equal(
					(await db.query('select count(*)::integer as count from public.prompt_atlas_usage'))
						.rows[0].count,
					0
				);
				await db.exec(
					'drop trigger test_atlas_failure on public.prompt_atlas_usage; drop function public.test_atlas_failure();'
				);
			});
		} finally {
			await db.close();
		}
	}
);
