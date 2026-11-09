// Runs only against an isolated, in-memory PostgreSQL (PGlite) instance.
// Set RADIO_SQL_TEST_MODULE_PATH to an installed @electric-sql/pglite dist/index.js
// when the test dependency is kept outside the application checkout.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';

const moduleName = process.env.RADIO_SQL_TEST_MODULE_PATH
	? pathToFileURL(process.env.RADIO_SQL_TEST_MODULE_PATH).href
	: '@electric-sql/pglite';
const { PGlite } = await import(moduleName);

test('radio PostgreSQL lease fences concurrent workers, rejects stale commits, and restricts privileges', async () => {
	const db = new PGlite();
	try {
		await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;');
		await db.exec(
			await readFile(
				new URL('../migrations/202611080001_comm_link_radio.sql', import.meta.url),
				'utf8'
			)
		);
		await db.exec(
			await readFile(
				new URL('../migrations/202611090001_comm_link_durable_state.sql', import.meta.url),
				'utf8'
			)
		);
		const acquire = async (owner) =>
			(await db.query('SELECT public.comm_link_state_acquire($1) AS result', [owner])).rows[0]
				.result;
		const commit = async (owner, version, snapshot) =>
			(
				await db.query('SELECT public.comm_link_state_commit($1,$2,$3::jsonb) AS result', [
					owner,
					version,
					JSON.stringify(snapshot)
				])
			).rows[0].result;
		const ownerA = randomUUID(),
			ownerB = randomUUID(),
			ownerC = randomUUID();
		const leaseA = await acquire(ownerA);
		assert.equal(leaseA.acquired, true);
		assert.equal((await acquire(ownerB)).acquired, false);
		assert.equal(await commit(ownerB, leaseA.version, leaseA.snapshot), false);
		assert.equal(await commit(ownerA, leaseA.version + 1, leaseA.snapshot), false);
		const snapshot = {
			...leaseA.snapshot,
			accounts: [
				{
					id: 'usr_one',
					googleSub: 'one',
					email: 'one@example.com',
					displayName: 'One',
					avatarUrl: null,
					authenticatedAt: new Date().toISOString()
				}
			]
		};
		assert.equal(await commit(ownerA, leaseA.version, snapshot), true);
		const leaseB = await acquire(ownerB);
		assert.equal(leaseB.version, leaseA.version + 1);
		assert.deepEqual(leaseB.snapshot.accounts, snapshot.accounts);
		assert.equal(await commit(ownerA, leaseA.version, leaseA.snapshot), false);
		await db.exec("UPDATE public.comm_link_state SET lock_until = now() - interval '1 second'");
		const leaseC = await acquire(ownerC);
		assert.equal(leaseC.acquired, true);
		assert.equal(await commit(ownerB, leaseB.version, leaseB.snapshot), false);
		await assert.rejects(
			commit(ownerC, leaseC.version, {
				...snapshot,
				accounts: Array.from({ length: 2001 }, () => snapshot.accounts[0])
			}),
			/capacity/i
		);
		assert.equal(await commit(ownerC, leaseC.version, snapshot), true);
		await db.exec('SET ROLE anon');
		await assert.rejects(acquire(randomUUID()), /permission denied/i);
		await assert.rejects(db.query('SELECT * FROM public.comm_link_state'), /permission denied/i);
		await db.exec('RESET ROLE; SET ROLE service_role');
		await assert.rejects(db.query('SELECT * FROM public.comm_link_state'), /permission denied/i);
		assert.equal((await acquire(randomUUID())).acquired, true);
		await db.exec('RESET ROLE');
	} finally {
		await db.close();
	}
});
