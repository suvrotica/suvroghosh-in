import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHmac, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';

const moduleName = process.env.RADIO_SQL_TEST_MODULE_PATH
	? pathToFileURL(process.env.RADIO_SQL_TEST_MODULE_PATH).href
	: '@electric-sql/pglite';
const { PGlite } = await import(moduleName);
const { pgcrypto } = await import(
	process.env.RADIO_SQL_TEST_MODULE_PATH
		? new URL('./contrib/pgcrypto.js', moduleName).href
		: '@electric-sql/pglite/contrib/pgcrypto'
);
const fixtureSecret = 'fixture-only-not-a-production-secret-0123456789';

test('watchdog dispatch is independent, idle-free, fenced, and requires fresh verified health', async () => {
	const db = new PGlite({ extensions: { pgcrypto } });
	try {
		await db.exec(`
			CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
			CREATE SCHEMA cron; CREATE SCHEMA net; CREATE SCHEMA vault; CREATE SCHEMA extensions;
			CREATE TABLE net.http_request_queue(id bigserial,headers jsonb);
			GRANT USAGE ON SCHEMA net TO PUBLIC;
			GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA net TO PUBLIC;
			GRANT ALL ON net.http_request_queue TO PUBLIC,anon,authenticated;
			GRANT SELECT(headers),UPDATE(headers),REFERENCES(headers) ON net.http_request_queue TO anon,authenticated;
			CREATE FUNCTION net.enqueue_fixture() RETURNS bigint LANGUAGE sql SECURITY INVOKER AS $$
				INSERT INTO net.http_request_queue(headers) VALUES('{}'::jsonb) RETURNING id;
			$$;
			CREATE TABLE cron.job(jobid bigint, jobname text);
			CREATE TABLE cron.job_run_details(jobid bigint, end_time timestamptz);
			INSERT INTO cron.job VALUES(1,'comm-link-radio-watchdog'),(2,'unrelated-job');
			INSERT INTO cron.job_run_details VALUES(1,now()-interval '3 hours'),(2,now()-interval '3 hours');
			CREATE TABLE vault.decrypted_secrets(name text, decrypted_secret text);
			INSERT INTO vault.decrypted_secrets VALUES('comm_link_watchdog_token','fixture-only-not-a-production-secret-0123456789');
			CREATE TABLE net.requests(id bigserial PRIMARY KEY,url text,headers jsonb,body jsonb,timeout_ms integer);
			CREATE FUNCTION net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer)
			RETURNS bigint LANGUAGE plpgsql AS $$ DECLARE result bigint; BEGIN
			INSERT INTO net.requests(url,headers,body,timeout_ms) VALUES(url,headers,body,timeout_milliseconds) RETURNING id INTO result; RETURN result; END $$;
		`);
		for (const name of [
			'202611080001_comm_link_radio.sql',
			'202611090001_comm_link_durable_state.sql',
			'202611090002_comm_link_watchdog.sql',
			'202611090003_comm_link_watchdog_signed_dispatch.sql'
		]) {
			await db.exec(await readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8'));
		}
		for (const role of ['anon', 'authenticated']) {
			for (const privilege of ['UPDATE', 'REFERENCES']) {
				assert.equal(
					(
						await db.query('SELECT has_any_column_privilege($1,$2,$3) AS allowed', [
							role,
							'net.http_request_queue',
							privilege
						])
					).rows[0].allowed,
					false
				);
			}
			for (const privilege of ['DELETE', 'TRUNCATE', 'TRIGGER']) {
				assert.equal(
					(
						await db.query('SELECT has_table_privilege($1,$2,$3) AS allowed', [
							role,
							'net.http_request_queue',
							privilege
						])
					).rows[0].allowed,
					false
				);
			}
			assert.equal(
				(
					await db.query('SELECT has_table_privilege($1,$2,$3) AS allowed', [
						role,
						'net.http_request_queue',
						'INSERT'
					])
				).rows[0].allowed,
				true
			);
			assert.equal(
				(
					await db.query('SELECT has_table_privilege($1,$2,$3) AS allowed', [
						role,
						'net.http_request_queue',
						'SELECT'
					])
				).rows[0].allowed,
				false
			);
			assert.equal(
				(
					await db.query('SELECT has_column_privilege($1,$2,$3,$4) AS allowed', [
						role,
						'net.http_request_queue',
						'id',
						'SELECT'
					])
				).rows[0].allowed,
				true
			);
			assert.equal(
				(
					await db.query('SELECT has_column_privilege($1,$2,$3,$4) AS allowed', [
						role,
						'net.http_request_queue',
						'headers',
						'SELECT'
					])
				).rows[0].allowed,
				false
			);
		}
		for (const privilege of [
			'SELECT',
			'INSERT',
			'UPDATE',
			'DELETE',
			'TRUNCATE',
			'REFERENCES',
			'TRIGGER'
		]) {
			assert.equal(
				(
					await db.query('SELECT has_table_privilege($1,$2,$3) AS allowed', [
						'service_role',
						'net.http_request_queue',
						privilege
					])
				).rows[0].allowed,
				true
			);
		}
		// Local owner-controlled ACL checks above cover the immutable migration only.
		// Hosted Supabase owns this queue; restore its observed public privileges and
		// verify signed dispatch works without claiming that queue secrecy is required.
		await db.exec('GRANT ALL ON net.http_request_queue TO PUBLIC');
		const scalar = async (sql, params = []) => (await db.query(sql, params)).rows[0].result;
		const tick = () => scalar('SELECT public.request_comm_link_watchdog() AS result');
		const count = () => scalar('SELECT count(*)::integer AS result FROM net.requests');
		const health = async () => {
			const owner = randomUUID();
			const lease = await scalar('SELECT public.comm_link_state_acquire($1) AS result', [owner]);
			await db.query('SELECT public.comm_link_state_release($1)', [owner]);
			return lease.watchdogReadyUntilMs;
		};
		assert.equal(await health(), 0);
		await db.exec('UPDATE public.comm_link_watchdog SET enabled=true');
		assert.equal(await tick(), null);
		assert.equal(await count(), 0);
		assert.deepEqual((await db.query('SELECT jobid FROM cron.job_run_details')).rows, [
			{ jobid: 2 }
		]);
		const room = {
			id: 'room-private',
			mode: 'radio',
			isEnded: false,
			participants: [
				{
					userId: 'private-person',
					isConnected: true,
					admissionStatus: 'admitted',
					lastSeenAt: new Date().toISOString()
				}
			],
			pttLease: { holderUserId: null, expiresAtMs: null }
		};
		await db.query(
			"UPDATE public.comm_link_state SET snapshot=jsonb_set(snapshot,'{rooms}',$1::jsonb)",
			[JSON.stringify([room])]
		);
		assert.equal(await tick(), 1);
		assert.equal(await tick(), null);
		assert.equal(await count(), 1);
		const sent = (await db.query('SELECT url,headers,body,timeout_ms FROM net.requests WHERE id=1'))
			.rows[0];
		assert.equal(sent.url, 'https://www.suvroghosh.in/api/internal/radio-watchdog');
		assert.deepEqual(Object.keys(sent.body).sort(), ['dispatchId', 'expiresAt']);
		assert.equal(sent.timeout_ms, 20000);
		assert.ok(sent.body.expiresAt > Math.floor(Date.now() / 1000));
		assert.ok(sent.body.expiresAt <= Math.floor(Date.now() / 1000) + 25);
		const message = `comm-link-watchdog:v1\n${sent.body.dispatchId}\n${sent.body.expiresAt}\nPOST\n${sent.url}`;
		const expectedProof = createHmac('sha256', fixtureSecret).update(message, 'utf8').digest('hex');
		assert.equal(sent.headers.Authorization, `Bearer ${expectedProof}`);
		assert.equal(JSON.stringify(sent).includes(fixtureSecret), false);
		assert.equal(JSON.stringify(sent).includes('private-person'), false);
		assert.equal(JSON.stringify(sent).includes('room-private'), false);
		const dispatch = sent.body.dispatchId,
			owner = randomUUID();
		assert.equal(
			await scalar('SELECT public.comm_link_watchdog_claim($1,$2) AS result', [dispatch, owner]),
			true
		);
		assert.equal(
			await scalar('SELECT public.comm_link_watchdog_claim($1,$2) AS result', [
				dispatch,
				randomUUID()
			]),
			false
		);
		assert.equal(await health(), 0);
		assert.equal(
			await scalar('SELECT public.comm_link_watchdog_finish($1,$2,true) AS result', [
				dispatch,
				randomUUID()
			]),
			false
		);
		assert.equal(
			await scalar('SELECT public.comm_link_watchdog_finish($1,$2,true) AS result', [
				dispatch,
				owner
			]),
			true
		);
		assert.ok(Number(await health()) > Date.now());
		// Completing the dispatch consumes it permanently, even while its proof is fresh.
		assert.equal(
			await scalar('SELECT public.comm_link_watchdog_claim($1,$2) AS result', [
				dispatch,
				randomUUID()
			]),
			false
		);
		assert.equal(await tick(), null);

		// Near-expiry invokes the worker even while the last successful health ack is fresh.
		room.pttLease = {
			holderUserId: 'private-person',
			publisherId: 'private-publisher',
			expiresAtMs: Date.now() + 1000
		};
		await db.query(
			"UPDATE public.comm_link_state SET snapshot=jsonb_set(snapshot,'{rooms}',$1::jsonb)",
			[JSON.stringify([room])]
		);
		await db.exec(
			"UPDATE public.comm_link_watchdog SET last_dispatch_at=now()-interval '3 seconds'"
		);
		assert.equal(await tick(), 2);
		const dispatch2 = (await db.query('SELECT body FROM net.requests WHERE id=2')).rows[0].body
			.dispatchId;
		const owner2 = randomUUID();
		assert.equal(
			await scalar('SELECT public.comm_link_watchdog_claim($1,$2) AS result', [dispatch2, owner2]),
			true
		);
		assert.equal(
			await scalar('SELECT public.comm_link_watchdog_finish($1,$2,false) AS result', [
				dispatch2,
				owner2
			]),
			true
		);
		assert.equal(await health(), 0);
		await db.exec(
			"UPDATE public.comm_link_watchdog SET last_dispatch_at=now()-interval '3 seconds'"
		);
		assert.equal(await tick(), 3);

		// Idle rooms and valid distant leases generate no paid HTTP even with stale health.
		room.participants[0].lastSeenAt = new Date(Date.now() - 31000).toISOString();
		room.pttLease.expiresAtMs = Date.now() + 45000;
		await db.query(
			"UPDATE public.comm_link_state SET snapshot=jsonb_set(snapshot,'{rooms}',$1::jsonb)",
			[JSON.stringify([room])]
		);
		await db.exec(
			"UPDATE public.comm_link_watchdog SET dispatch_until=null,last_dispatch_at=now()-interval '3 seconds',last_ack_at=null"
		);
		assert.equal(await tick(), null);
		assert.equal(await count(), 3);
		await db.exec(
			"UPDATE public.comm_link_watchdog SET last_tick_at=now()-interval '7 seconds',last_ack_at=now(),consecutive_failures=0"
		);
		assert.equal(await health(), 0);
		await db.exec(
			"UPDATE public.comm_link_watchdog SET last_tick_at=now(),last_ack_at=now()-interval '16 seconds'"
		);
		assert.equal(await health(), 0);
		await db.exec('SET ROLE anon');
		assert.ok((await db.query('SELECT net.enqueue_fixture() AS id')).rows[0].id > 0);
		assert.ok((await db.query('SELECT headers FROM net.http_request_queue')).rows.length > 0);
		await assert.rejects(tick(), /permission denied/i);
		await assert.rejects(db.query('SELECT * FROM public.comm_link_watchdog'), /permission denied/i);
		await db.exec('RESET ROLE');
	} finally {
		await db.close();
	}
});
