// Disposable PostgreSQL WASM only: no hosted URL, provider call or optional skipped runtime.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const migration = await readFile(
	new URL('../migrations/202610250001_prompt_atlas_usage.sql', import.meta.url),
	'utf8'
);

test('UML and Prompt Atlas share service-only PostgreSQL request admission', async (t) => {
	const db = new PGlite();
	// Distinct opaque test identities; server unit tests cover the actual salted owner-hour HMAC.
	const identity = (feature, value) =>
		createHash('sha256').update(`${feature}:${value}`).digest('hex');
	const reserve = async (key) =>
		(await db.query('select public.reserve_prompt_atlas_usage($1,50,5) as result', [key])).rows[0]
			.result;
	const asRole = async (role, operation) => {
		await db.exec(`set role ${role}`);
		try {
			return await operation();
		} finally {
			await db.exec('reset role');
		}
	};
	const reset = () => db.exec('truncate public.prompt_atlas_usage');
	const counters = async () =>
		(
			await db.query(
				'select bucket_key, reservations from public.prompt_atlas_usage order by bucket_key'
			)
		).rows;
	const denied = (error) => error.code === '42501';

	try {
		await db.exec(
			'create role anon; create role authenticated; create role service_role bypassrls;'
		);
		await db.exec(migration);

		await t.test(
			'only the service role can reserve; no caller can bypass admission through the table',
			async () => {
				for (const role of ['anon', 'authenticated', 'service_role']) {
					await asRole(role, async () => {
						for (const statement of [
							'select * from public.prompt_atlas_usage',
							"insert into public.prompt_atlas_usage values ('bypass',now(),1,now()+interval '1 hour')",
							'update public.prompt_atlas_usage set reservations=1',
							'delete from public.prompt_atlas_usage',
							'truncate public.prompt_atlas_usage'
						]) {
							await assert.rejects(db.exec(statement), denied, `${role}: ${statement}`);
						}
						if (role === 'service_role') {
							const result = await reserve(identity('uml', 'owner'));
							assert.equal(result.allowed, true);
							assert.equal(result.dailyReservations, 1);
							assert.equal(result.hourlyClientReservations, 1);
						} else {
							await assert.rejects(reserve(identity('uml', 'owner')), denied);
						}
					});
				}
				assert.equal((await counters()).length, 2);
			}
		);

		await t.test(
			'UML owners and Prompt Atlas visitors exhaust one shared 50-request daily pool',
			async () => {
				await reset();
				await asRole('service_role', async () => {
					// Five UML identities and five Atlas identities each reserve five requests.
					// Alternating features proves neither caller receives a separate daily pool.
					for (let index = 0; index < 50; index++) {
						const feature = index % 2 === 0 ? 'uml' : 'prompt-atlas';
						const result = await reserve(identity(feature, index % 10));
						assert.equal(result.allowed, true, `${feature} reservation ${index + 1}`);
						assert.equal(result.dailyReservations, index + 1);
						assert.equal(result.hourlyClientReservations, Math.floor(index / 10) + 1);
						assert.equal(result.retryAfterSeconds, 0);
					}
				});
				const full = await counters();
				assert.equal(full.length, 11);
				assert.equal(full.find((row) => row.bucket_key.startsWith('day:')).reservations, 50);
				assert.equal(
					full
						.filter((row) => row.bucket_key.startsWith('client:'))
						.reduce((sum, row) => sum + row.reservations, 0),
					50
				);
				await asRole('service_role', async () => {
					for (const feature of ['uml', 'prompt-atlas']) {
						const result = await reserve(identity(feature, 'new-identity-after-daily-cap'));
						assert.equal(result.allowed, false);
						assert.equal(result.dailyReservations, 50);
						assert.equal(result.hourlyClientReservations, 0);
						assert.ok(result.retryAfterSeconds >= 1 && result.retryAfterSeconds <= 86_400);
					}
				});
				assert.deepEqual(
					await counters(),
					full,
					'Denied callers must not allocate or increment quota rows'
				);
			}
		);

		await t.test(
			'the sixth UML owner request in the UTC hour is refused without spending the shared pool',
			async () => {
				await reset();
				const owner = identity('uml', 'same-owner-hour');
				await asRole('service_role', async () => {
					for (let count = 1; count <= 5; count++) {
						const result = await reserve(owner);
						assert.equal(result.allowed, true);
						assert.equal(result.hourlyClientReservations, count);
					}
				});
				const before = await counters();
				await asRole('service_role', async () => {
					const result = await reserve(owner);
					assert.equal(result.allowed, false);
					assert.equal(result.dailyReservations, 5);
					assert.equal(result.hourlyClientReservations, 5);
					assert.ok(result.retryAfterSeconds >= 1 && result.retryAfterSeconds <= 3_600);
				});
				assert.deepEqual(await counters(), before);
				await asRole('service_role', async () => {
					const atlas = await reserve(identity('prompt-atlas', 'independent-visitor'));
					assert.equal(atlas.allowed, true);
					assert.equal(atlas.dailyReservations, 6);
					assert.equal(atlas.hourlyClientReservations, 1);
				});
			}
		);
	} finally {
		await db.close();
	}
});
