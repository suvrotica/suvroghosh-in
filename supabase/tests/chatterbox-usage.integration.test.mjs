// Real PostgreSQL semantics in disposable WASM storage; never reads a hosted database URL.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const migration = await readFile(
	new URL('../migrations/202610280001_chatterbox_usage.sql', import.meta.url),
	'utf8'
);

test('Chatterbox resource admission executes with isolated PostgreSQL roles and transactions', async (t) => {
	const db = new PGlite();
	const hash = (value) => value.toString(16).padStart(64, '0');
	const reserve = async (key = hash(1), characters = 30) =>
		(await db.query('select public.reserve_chatterbox_usage($1,$2) as result', [key, characters]))
			.rows[0].result;
	const reset = () =>
		db.exec(
			'reset role; truncate public.chatterbox_usage restart identity; set role service_role;'
		);
	const rowCount = async () => {
		await db.exec('reset role');
		return (await db.query('select count(*)::integer as count from public.chatterbox_usage'))
			.rows[0].count;
	};
	try {
		await db.exec(
			'create role anon; create role authenticated; create role service_role bypassrls;'
		);
		await db.exec(migration);
		await t.test(
			'denies client RPC and all direct table/sequence access, including service-role bypass of admission',
			async () => {
				for (const role of ['anon', 'authenticated', 'service_role']) {
					await db.exec(`set role ${role}`);
					await assert.rejects(
						db.query('select * from public.chatterbox_usage'),
						/permission denied/
					);
					await assert.rejects(
						db.query(
							"insert into public.chatterbox_usage(reserved_at,client_hash,text_characters) values(now(),repeat('a',64),30)"
						),
						/permission denied/
					);
					await assert.rejects(
						db.query("select nextval('public.chatterbox_usage_id_seq')"),
						/permission denied/
					);
					if (role !== 'service_role') await assert.rejects(reserve(), /permission denied/);
					else assert.deepEqual(await reserve(), { allowed: true, retryAfterSeconds: 0 });
					await db.exec('reset role');
				}
			}
		);
		await t.test('rejects invalid inputs without allocating reservations', async () => {
			await reset();
			for (const key of [null, '', 'raw client address', 'A'.repeat(64), 'a'.repeat(63)])
				await assert.rejects(reserve(key), /Invalid Chatterbox quota parameters/);
			for (const chars of [null, -1, 0, 3001])
				await assert.rejects(reserve(hash(1), chars), /Invalid Chatterbox quota parameters/);
			assert.equal(await rowCount(), 0);
		});
		await t.test(
			'caps queued distinct-client admissions at two starts and allocates no denied identities',
			async () => {
				await reset();
				const results = await Promise.all(
					Array.from({ length: 15 }, (_, i) => reserve(hash(i + 1)))
				);
				assert.equal(results.filter((value) => value.allowed).length, 2);
				assert.ok(
					results
						.filter((value) => !value.allowed)
						.every((value) => value.retryAfterSeconds >= 1 && value.retryAfterSeconds <= 150)
				);
				assert.equal(await rowCount(), 2);
			}
		);
		await t.test(
			'expired start slots retain daily usage and do not require a release RPC',
			async () => {
				await reset();
				await reserve(hash(1));
				await reserve(hash(2));
				await db.exec(
					"reset role; update public.chatterbox_usage set reserved_at=clock_timestamp()-interval '151 seconds'; set role service_role;"
				);
				assert.equal((await reserve(hash(3))).allowed, true);
				assert.equal(await rowCount(), 3);
			}
		);
		await t.test(
			'enforces per-client hourly admission before start slots and returns the UTC reset delay',
			async () => {
				await reset();
				await db.exec(
					"reset role; insert into public.chatterbox_usage(reserved_at,client_hash,text_characters) select clock_timestamp(),repeat('a',64),30 from generate_series(1,3); set role service_role;"
				);
				const result = await reserve('a'.repeat(64));
				const expected = (
					await db.query(
						"select greatest(1,ceil(extract(epoch from ((date_trunc('hour',clock_timestamp() at time zone 'UTC') at time zone 'UTC')+interval '1 hour'-clock_timestamp())))::integer) as seconds"
					)
				).rows[0].seconds;
				assert.equal(result.allowed, false);
				assert.ok(Math.abs(result.retryAfterSeconds - expected) <= 1);
				assert.equal(await rowCount(), 3);
			}
		);
		await t.test(
			'enforces aggregate character budget across all identities and allows the exact boundary',
			async () => {
				await reset();
				await db.exec(
					"reset role; insert into public.chatterbox_usage(reserved_at,client_hash,text_characters) select date_trunc('day',clock_timestamp() at time zone 'UTC') at time zone 'UTC',repeat('a',64),3000 from generate_series(1,20); set role service_role;"
				);
				const denied = await reserve(hash(55), 1);
				assert.equal(denied.allowed, false);
				assert.ok(denied.retryAfterSeconds >= 1 && denied.retryAfterSeconds <= 86400);
				assert.equal(await rowCount(), 20);
				await db.exec(
					'update public.chatterbox_usage set text_characters=2999 where id=1; set role service_role;'
				);
				// If the test runs in the first 150 seconds of the UTC day, the seeded daily
				// records also occupy start slots. Check the arithmetic boundary directly then.
				const elapsed = (
					await db.query(
						"select extract(epoch from clock_timestamp()-(date_trunc('day',clock_timestamp() at time zone 'UTC') at time zone 'UTC')) as seconds"
					)
				).rows[0].seconds;
				const exact = await reserve(hash(55), 1);
				assert.equal(exact.allowed, Number(elapsed) >= 150);
			}
		);
		await t.test(
			'enforces the daily request cap independently of text size and client identity',
			async () => {
				await reset();
				await db.exec(
					"reset role; insert into public.chatterbox_usage(reserved_at,client_hash,text_characters) select date_trunc('day',clock_timestamp() at time zone 'UTC') at time zone 'UTC',repeat('a',64),1 from generate_series(1,100); set role service_role;"
				);
				assert.equal((await reserve(hash(70), 1)).allowed, false);
				assert.equal(await rowCount(), 100);
			}
		);
		await t.test('uses UTC windows regardless of the database session timezone', async () => {
			await reset();
			await db.exec(
				"set timezone='Asia/Kolkata'; reset role; insert into public.chatterbox_usage(reserved_at,client_hash,text_characters) select date_trunc('day',clock_timestamp() at time zone 'UTC') at time zone 'UTC',repeat('a',64),1 from generate_series(1,100); set role service_role;"
			);
			const result = await reserve(hash(80));
			const expected = (
				await db.query(
					"select greatest(1,ceil(extract(epoch from ((date_trunc('day',clock_timestamp() at time zone 'UTC') at time zone 'UTC')+interval '24 hours'-clock_timestamp())))::integer) as seconds"
				)
			).rows[0].seconds;
			assert.equal(result.allowed, false);
			assert.ok(Math.abs(result.retryAfterSeconds - expected) <= 1);
			await db.exec("reset role; set timezone='UTC';");
		});
		await t.test('cleans only a bounded batch of expired feature reservations', async () => {
			await reset();
			await db.exec(
				"reset role; insert into public.chatterbox_usage(reserved_at,client_hash,text_characters) select clock_timestamp()-interval '3 days',repeat('a',64),1 from generate_series(1,140); set role service_role;"
			);
			assert.equal((await reserve()).allowed, true);
			assert.equal(await rowCount(), 13);
		});
		await t.test(
			'failed writes roll back and migration reruns preserve existing reservations',
			async () => {
				await reset();
				await db.exec(
					"reset role; create function public.test_tts_failure() returns trigger language plpgsql as $$ begin raise exception 'forced write failure'; end $$; create trigger test_tts_failure before insert on public.chatterbox_usage for each row execute function public.test_tts_failure(); set role service_role;"
				);
				await assert.rejects(reserve(), /forced write failure/);
				assert.equal(await rowCount(), 0);
				await db.exec(
					'drop trigger test_tts_failure on public.chatterbox_usage; drop function public.test_tts_failure(); set role service_role;'
				);
				assert.equal((await reserve()).allowed, true);
				await db.exec('reset role');
				await db.exec(migration);
				assert.equal(await rowCount(), 1);
			}
		);
	} finally {
		await db.close();
	}
});
