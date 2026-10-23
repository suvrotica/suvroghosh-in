// Real PostgreSQL WASM execution; no hosted database or website dependency required.
// npm install --prefix <temporary-folder> --no-save @electric-sql/pglite@0.5.11
// COMMENTS_SQL_RUNTIME=<temporary-folder> node --test supabase/tests/post-comments.integration.test.mjs
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const require = createRequire(
	path.resolve(process.env.COMMENTS_SQL_RUNTIME ?? '.', 'package.json')
);
let PGlite;
try {
	({ PGlite } = require('@electric-sql/pglite'));
} catch (cause) {
	if (process.env.COMMENTS_SQL_RUNTIME) throw cause;
}
const migration = await readFile(
	new URL('../migrations/202610230001_post_comments.sql', import.meta.url),
	'utf8'
);
const legacySlugMigration = await readFile(
	new URL('../migrations/202610230002_post_comments_legacy_slugs.sql', import.meta.url),
	'utf8'
);
const notificationMigration = await readFile(
	new URL('../migrations/202610230003_post_comments_notifications.sql', import.meta.url),
	'utf8'
);
const notificationContentMigration = await readFile(
	new URL('../migrations/202610230004_post_comments_notification_content.sql', import.meta.url),
	'utf8'
);
const emailActionsMigration = await readFile(
	new URL('../migrations/202610230005_post_comments_email_actions.sql', import.meta.url),
	'utf8'
);
const ownerId = 'd66ad910-1e06-4bb7-8f0c-fcf107193d73';
const outsiderId = '34c166ef-c242-41bb-a397-c185f263b1f1';

test(
	'email moderation capabilities are private, one-use, revocable and compatible with durable retries',
	{
		skip:
			!PGlite &&
			'Install the pinned temporary PGlite runtime and set COMMENTS_SQL_RUNTIME to execute SQL integration.'
	},
	async (t) => {
		const dataDir = await mkdtemp(path.join(tmpdir(), 'comment-email-actions-sql-'));
		let db = new PGlite(dataDir);
		try {
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
			await db.query('insert into auth.users values ($1),($2)', [ownerId, outsiderId]);
			await db.query('insert into public.note_owners values ($1)', [ownerId]);
			await db.exec(migration);
			await db.exec(legacySlugMigration);
			await db.exec(notificationMigration);
			const result = async (sql, params = []) => (await db.query(sql, params)).rows[0].result;
			const as = async (role, actor = '') => {
				await db.exec('reset role');
				await db.query("select set_config('request.jwt.claim.sub',$1,false)", [actor]);
				if (role) await db.exec(`set role ${role}`);
			};
			const submit = (
				id = randomUUID(),
				name = 'Email reader',
				body = 'Private email comment',
				parent = null
			) =>
				result('select public.submit_post_comment($1,$2,$3,$4,$5,$6) as result', [
					'email-moderation',
					parent,
					name,
					body,
					id,
					randomUUID().replaceAll('-', '').repeat(2)
				]);
			const claim = (id) =>
				result('select public.claim_post_comment_notifications($1,1) as result', [id]);
			const finish = (job, sent, provider = null) =>
				result('select public.finish_post_comment_notification($1,$2,$3,$4) as result', [
					job.comment_id,
					job.lease_token,
					sent,
					provider
				]);
			const hash = (token) => createHash('sha256').update(token).digest('hex');
			const preview = (tokenHash, action = 'approve') =>
				result('select public.preview_post_comment_email_action($1,$2) as result', [
					tokenHash,
					action
				]);
			const consume = (tokenHash, action = 'approve') =>
				result('select public.consume_post_comment_email_action($1,$2) as result', [
					tokenHash,
					action
				]);
			const moderate = (id, status = null, read = false) =>
				result('select public.moderate_post_comment($1,$2,$3) as result', [id, status, read]);
			const inspect = async (id) => {
				await as();
				const stored = (
					await db.query(
						`select to_jsonb(c) as comment,to_jsonb(n) as notification,
          to_jsonb(a) as actions,(select jsonb_agg(to_jsonb(h) order by h.id)
          from public.post_comment_history h where h.comment_id=c.id) as history
          from public.post_comments c join public.post_comment_notifications n on n.comment_id=c.id
          left join public.post_comment_email_actions a on a.comment_id=c.id where c.id=$1`,
						[id]
					)
				).rows[0];
				await as('service_role');
				return stored;
			};
			const makeDue = async (id) => {
				await as();
				await db.query(
					`update public.post_comment_notifications set
          due_at=clock_timestamp()-interval '1 second', leased_until=null, lease_token=null
          where comment_id=$1`,
					[id]
				);
				await as('service_role');
			};
			const newJob = async () => {
				await as('service_role');
				const id = randomUUID();
				assert.equal(await submit(id), 'pending');
				return (await claim(id))[0];
			};
			const rpcState = () =>
				db.query(`select proname,proacl::text as grants,proconfig
        from pg_proc where pronamespace='public'::regnamespace and proname in (
          'claim_post_comment_notifications','finish_post_comment_notification',
          'enqueue_post_comment_notification','moderate_post_comment') order by proname`);
			await as('service_role');
			const v1Submission = randomUUID();
			assert.equal(await submit(v1Submission), 'pending');
			const initialV1 = (await claim(v1Submission))[0];
			assert.equal(await finish(initialV1, false), true);
			await makeDue(initialV1.comment_id);
			await as();
			await db.exec(notificationContentMigration);
			const v2Submission = randomUUID();
			await as('service_role');
			assert.equal(await submit(v2Submission), 'pending');
			const initialV2 = (await claim(v2Submission))[0];
			assert.equal(await finish(initialV2, false), true);
			await makeDue(initialV2.comment_id);
			await as();
			const oldRows = (
				await db.query('select * from public.post_comment_notifications order by content_version')
			).rows;
			const oldRpcs = (await rpcState()).rows;
			await db.exec(emailActionsMigration);

			await t.test(
				'migration preserves all legacy state, content and grants without backfilling actions',
				async () => {
					assert.deepEqual(
						(
							await db.query(
								'select * from public.post_comment_notifications order by content_version'
							)
						).rows,
						oldRows
					);
					assert.deepEqual((await rpcState()).rows, oldRpcs);
					assert.equal(
						(await db.query('select count(*)::integer as n from public.post_comment_email_actions'))
							.rows[0].n,
						0
					);
					await as('service_role');
					for (const [submission, version] of [
						[v1Submission, 1],
						[v2Submission, 2]
					]) {
						const job = (await claim(submission))[0];
						assert.equal(job.content_version, version);
						assert.equal(job.display_name, version === 1 ? null : 'Email reader');
						assert.equal(job.body, version === 1 ? null : 'Private email comment');
						for (const field of ['approve_token', 'reject_token', 'action_expires_at'])
							assert.equal(job[field], null);
						assert.equal(await finish(job, true, `legacy-v${version}`), true);
						assert.deepEqual(await claim(submission), []);
					}
				}
			);

			await t.test(
				'forced RLS, explicit grants, owner auth and private trigger helpers protect action capabilities',
				async () => {
					await as();
					assert.deepEqual(
						(
							await db.query(
								"select relrowsecurity,relforcerowsecurity from pg_class where oid='public.post_comment_email_actions'::regclass"
							)
						).rows[0],
						{ relrowsecurity: true, relforcerowsecurity: true }
					);
					for (const role of ['anon', 'authenticated', 'service_role']) {
						await as(role, role === 'authenticated' ? ownerId : '');
						await assert.rejects(
							db.query('select * from public.post_comment_email_actions'),
							/permission denied/
						);
						await assert.rejects(
							db.query('update public.post_comment_email_actions set revoked_at=clock_timestamp()'),
							/permission denied/
						);
						await assert.rejects(
							db.query('select public.revoke_post_comment_email_actions($1)', [randomUUID()]),
							/permission denied/
						);
						await assert.rejects(
							db.query('select public.revoke_changed_post_comment_email_actions()'),
							/permission denied/
						);
						if (role !== 'service_role') {
							await assert.rejects(preview('a'.repeat(64)), /permission denied/);
							await assert.rejects(consume('a'.repeat(64)), /permission denied/);
						}
					}
					await as('authenticated', outsiderId);
					await assert.rejects(moderate(initialV1.comment_id, 'pending'), /not_authorized/);
					await as('service_role');
					await assert.rejects(moderate(initialV1.comment_id, 'pending'), /permission denied/);
				}
			);

			let job;
			const submission = randomUUID();
			const name = 'পাঠক <Reader> & "quoted"';
			const body =
				'First <script>literal</script> paragraph.\n\nদ্বিতীয় অনুচ্ছেদ.\n\nThird & final paragraph.';
			await t.test(
				'new v3 enqueue atomically generates distinct fixed action-bound tokens and seven-day expiry once',
				async () => {
					await as('service_role');
					assert.equal(await submit(submission, name, body), 'pending');
					job = (await claim(submission))[0];
					assert.equal(job.content_version, 3);
					assert.equal(job.display_name, name);
					assert.equal(job.body, body);
					assert.match(job.approve_token, /^[a-f0-9]{64}$/);
					assert.match(job.reject_token, /^[a-f0-9]{64}$/);
					assert.notEqual(job.approve_token, job.reject_token);
					const state = await inspect(job.comment_id);
					assert.equal(state.actions.approve_token_hash, hash(job.approve_token));
					assert.equal(state.actions.reject_token_hash, hash(job.reject_token));
					await as();
					assert.equal(
						(
							await db.query(
								`select extract(epoch from (a.expires_at-n.created_at))::integer as seconds
          from public.post_comment_email_actions a join public.post_comment_notifications n using(comment_id)
          where a.comment_id=$1`,
								[job.comment_id]
							)
						).rows[0].seconds,
						604800
					);
					await db.exec('begin');
					const rolledBack = randomUUID();
					await db.query(
						`insert into public.post_comments(submission_id,post_slug,display_name,body)
          values($1,'rollback-action','Reader','Must roll back with outbox and capabilities')`,
						[rolledBack]
					);
					assert.equal(
						(
							await db.query(
								`select count(*)::integer as n from public.post_comment_email_actions a
          join public.post_comments c on c.id=a.comment_id where c.submission_id=$1`,
								[rolledBack]
							)
						).rows[0].n,
						1
					);
					await db.exec('rollback');
					assert.equal(
						(
							await db.query(
								'select count(*)::integer as n from public.post_comments where submission_id=$1',
								[rolledBack]
							)
						).rows[0].n,
						0
					);
					await as('service_role');
					assert.equal(
						await submit(submission, 'Retry name must not replace', 'Retry body must not replace'),
						'pending'
					);
					assert.deepEqual(await inspect(job.comment_id), state);
				}
			);

			await t.test(
				'preview exposes only the selected private comment, never changes state, and binds the action to its own hash',
				async () => {
					const before = await inspect(job.comment_id);
					for (const action of ['approve', 'reject']) {
						const tokenHash = hash(job[`${action}_token`]);
						const details = await preview(tokenHash, action);
						assert.deepEqual(details, {
							state: 'ready',
							action,
							comment_id: job.comment_id,
							post_slug: 'email-moderation',
							display_name: name,
							body,
							expires_at: job.action_expires_at
						});
						assert.deepEqual(await preview(tokenHash, action), details);
						assert.deepEqual(
							await preview(tokenHash, action === 'approve' ? 'reject' : 'approve'),
							{ state: 'invalid' }
						);
						assert.deepEqual(
							await consume(tokenHash, action === 'approve' ? 'reject' : 'approve'),
							{ state: 'invalid' }
						);
					}
					for (const [tokenHash, action] of [
						[null, 'approve'],
						['', 'approve'],
						['A'.repeat(64), 'approve'],
						['x'.repeat(64), 'approve'],
						['a'.repeat(64), 'approve'],
						[hash(job.approve_token), null],
						[hash(job.approve_token), 'delete']
					]) {
						assert.deepEqual(await preview(tokenHash, action), { state: 'invalid' });
						assert.deepEqual(await consume(tokenHash, action), { state: 'invalid' });
					}
					assert.deepEqual(await inspect(job.comment_id), before);
					assert.deepEqual(
						await result("select public.get_post_comments('email-moderation',null,1) as result"),
						{ comments: [], total: 0, commentCount: 0 }
					);
				}
			);

			await t.test(
				'failed and uncertain retries preserve both raw URLs and expiry; successful acknowledgement erases raws but keeps actions usable',
				async () => {
					assert.equal(await finish(job, false), true);
					await makeDue(job.comment_id);
					const retry = (await claim(submission))[0];
					assert.notEqual(retry.lease_token, job.lease_token);
					for (const field of [
						'approve_token',
						'reject_token',
						'action_expires_at',
						'display_name',
						'body'
					])
						assert.equal(retry[field], job[field]);
					assert.equal(await finish(job, true, 'stale'), false);
					assert.equal((await inspect(job.comment_id)).actions.approve_token, job.approve_token);
					assert.equal(await finish(retry, true, 'v3-provider'), true);
					const sent = await inspect(job.comment_id);
					assert.equal(sent.actions.approve_token, null);
					assert.equal(sent.actions.reject_token, null);
					assert.equal(sent.actions.approve_token_hash, hash(job.approve_token));
					assert.equal(sent.actions.revoked_at, null);
					assert.equal((await preview(hash(job.approve_token))).state, 'ready');
					assert.deepEqual(await claim(submission), []);
				}
			);

			await t.test(
				'approval uses both links once, marks read, records honest email audit and resists opposite-link or parallel replays',
				async () => {
					const expected = {
						state: 'updated',
						action: 'approve',
						comment_id: job.comment_id,
						post_slug: 'email-moderation'
					};
					assert.deepEqual(await consume(hash(job.approve_token)), expected);
					const after = await inspect(job.comment_id);
					assert.equal(after.comment.status, 'approved');
					assert.ok(after.comment.read_at);
					assert.equal(after.actions.used_action, 'approve');
					assert.ok(after.actions.used_at);
					assert.equal(after.actions.revoked_at, null);
					assert.equal(after.notification.cancelled_at, null); // A sent notification stays sent.
					assert.ok(after.notification.sent_at);
					assert.deepEqual(
						after.history.slice(-2).map(({ action, actor_id, from_status, to_status }) => ({
							action,
							actor_id,
							from_status,
							to_status
						})),
						[
							{
								action: 'email_moderated',
								actor_id: null,
								from_status: 'pending',
								to_status: 'approved'
							},
							{ action: 'read', actor_id: null, from_status: 'pending', to_status: 'approved' }
						]
					);
					assert.deepEqual(await consume(hash(job.approve_token)), { state: 'used' });
					assert.deepEqual(await consume(hash(job.reject_token), 'reject'), { state: 'used' });
					assert.deepEqual(await preview(hash(job.reject_token), 'reject'), { state: 'used' });
					assert.deepEqual(await inspect(job.comment_id), after);
					const raced = await newJob();
					// A single-engine PGlite queue verifies persisted one-use state, not lock contention.
					const outcomes = await Promise.all([
						consume(hash(raced.reject_token), 'reject'),
						consume(hash(raced.approve_token), 'approve')
					]);
					assert.deepEqual(
						outcomes.map((entry) => entry.state),
						['updated', 'used']
					);
					assert.equal((await inspect(raced.comment_id)).comment.status, 'rejected');
					assert.ok((await inspect(raced.comment_id)).notification.cancelled_at);
					assert.equal(await finish(raced, true, 'late-provider'), false);
				}
			);

			await t.test(
				'owner mark-read preserves links, explicit status intent revokes even a no-op, and return-to-pending never revives links',
				async () => {
					const readOnly = await newJob();
					await as('authenticated', ownerId);
					assert.equal(await moderate(readOnly.comment_id, null, true), 'updated');
					await as('service_role');
					assert.equal((await preview(hash(readOnly.reject_token), 'reject')).state, 'ready');
					assert.equal((await consume(hash(readOnly.reject_token), 'reject')).state, 'updated');
					assert.equal(
						(await inspect(readOnly.comment_id)).history.filter((entry) => entry.action === 'read')
							.length,
						1
					);
					for (const status of ['pending', 'approved', 'rejected', 'hidden']) {
						const boardJob = await newJob();
						await as('authenticated', ownerId);
						assert.equal(await moderate(boardJob.comment_id, status), 'updated');
						assert.equal(await moderate(boardJob.comment_id, 'pending'), 'updated');
						await as('service_role');
						for (const action of ['approve', 'reject']) {
							assert.deepEqual(await preview(hash(boardJob[`${action}_token`]), action), {
								state: 'unavailable'
							});
							assert.deepEqual(await consume(hash(boardJob[`${action}_token`]), action), {
								state: 'unavailable'
							});
						}
						const revoked = await inspect(boardJob.comment_id);
						assert.equal(revoked.comment.status, 'pending');
						assert.ok(revoked.actions.revoked_at);
						assert.equal(revoked.actions.approve_token, null);
						assert.equal(revoked.actions.reject_token, null);
						assert.ok(revoked.notification.cancelled_at);
						assert.equal(await finish(boardJob, true, 'must-not-resurrect'), false);
						assert.deepEqual(await claim(boardJob.submission_id), []);
					}
					const directJob = await newJob();
					await as();
					await db.query("update public.post_comments set status='hidden' where id=$1", [
						directJob.comment_id
					]);
					await db.query("update public.post_comments set status='pending' where id=$1", [
						directJob.comment_id
					]);
					await as('service_role');
					assert.deepEqual(await consume(hash(directJob.approve_token)), { state: 'unavailable' });
					assert.ok((await inspect(directJob.comment_id)).notification.cancelled_at);
					// Bounded claim cleanup also handles a privately revoked row that predates cancellation.
					const obsolete = await newJob();
					assert.equal(await finish(obsolete, false), true);
					await makeDue(obsolete.comment_id);
					await as();
					await db.query(
						'update public.post_comment_email_actions set revoked_at=clock_timestamp() where comment_id=$1',
						[obsolete.comment_id]
					);
					await as('service_role');
					assert.deepEqual(await claim(obsolete.submission_id), []);
					const cancelled = await inspect(obsolete.comment_id);
					assert.equal(cancelled.comment.status, 'pending');
					assert.ok(cancelled.notification.cancelled_at);
					assert.equal(cancelled.actions.approve_token, null);
					assert.equal(cancelled.actions.reject_token, null);
				}
			);

			await t.test(
				'expired links never mutate a comment; late retries keep original expired URLs and the durable alert',
				async () => {
					const expired = await newJob();
					assert.equal(await finish(expired, false), true);
					await as();
					await db.query(
						"update public.post_comment_email_actions set expires_at=clock_timestamp()-interval '1 second' where comment_id=$1",
						[expired.comment_id]
					);
					await makeDue(expired.comment_id);
					const before = await inspect(expired.comment_id);
					for (const action of ['approve', 'reject']) {
						assert.deepEqual(await preview(hash(expired[`${action}_token`]), action), {
							state: 'expired'
						});
						assert.deepEqual(await consume(hash(expired[`${action}_token`]), action), {
							state: 'expired'
						});
					}
					assert.deepEqual(await inspect(expired.comment_id), before);
					const late = (await claim(expired.submission_id))[0];
					assert.equal(late.approve_token, expired.approve_token);
					assert.equal(late.reject_token, expired.reject_token);
					assert.equal(late.action_expires_at, before.actions.expires_at);
					assert.equal((await inspect(expired.comment_id)).notification.cancelled_at, null);
					assert.equal(await finish(late, true, 'late-expired-links-provider'), true);
					assert.equal((await inspect(expired.comment_id)).actions.approve_token, null);
					assert.deepEqual(await consume(hash(late.approve_token)), { state: 'expired' });
				}
			);

			await t.test(
				'author replies never create capabilities, guest replies do, and durable capability state survives restart',
				async () => {
					await as('authenticated', ownerId);
					const authorSubmission = randomUUID();
					assert.equal(
						await result('select public.reply_to_post_comment($1,$2,$3) as result', [
							job.comment_id,
							'Author response',
							authorSubmission
						]),
						'approved'
					);
					await as('service_role');
					assert.deepEqual(await claim(authorSubmission), []);
					const readerSubmission = randomUUID();
					assert.equal(
						await submit(readerSubmission, 'Guest reply', 'A pending reader reply', job.comment_id),
						'pending'
					);
					const guestReply = (await claim(readerSubmission))[0];
					assert.equal(guestReply.content_version, 3);
					assert.equal((await preview(hash(guestReply.reject_token), 'reject')).state, 'ready');
					assert.equal(await finish(guestReply, true, 'guest-reply-provider'), true);
					await db.close();
					db = new PGlite(dataDir);
					await as('service_role');
					assert.deepEqual(await consume(hash(job.reject_token), 'reject'), { state: 'used' });
					assert.equal((await consume(hash(guestReply.reject_token), 'reject')).state, 'updated');
					assert.deepEqual(await preview(hash(guestReply.approve_token)), { state: 'used' });
					assert.equal((await inspect(guestReply.comment_id)).actions.approve_token, null);
				}
			);
		} finally {
			await db.close();
			assert.equal(path.dirname(dataDir), path.resolve(tmpdir()));
			assert.ok(path.basename(dataDir).startsWith('comment-email-actions-sql-'));
			await rm(dataDir, { recursive: true, force: true });
		}
	}
);

test(
	'comments SQL enforces private moderation, ownership, durable limits and persistence',
	{
		skip:
			!PGlite &&
			'Install the pinned temporary PGlite runtime and set COMMENTS_SQL_RUNTIME to execute SQL integration.'
	},
	async () => {
		const dataDir = await mkdtemp(path.join(tmpdir(), 'post-comments-sql-'));
		let db = new PGlite(dataDir);
		try {
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
			await db.query('insert into auth.users values ($1),($2)', [ownerId, outsiderId]);
			await db.query('insert into public.note_owners values ($1)', [ownerId]);
			await db.exec(migration);
			const initialRpcGrants = await db.query(
				"select proname, proacl::text as grants from pg_proc where pronamespace = 'public'::regnamespace and proname in ('get_post_comments','submit_post_comment','get_comment_moderation_queue') order by proname"
			);
			await db.exec(legacySlugMigration);
			const updatedRpcGrants = await db.query(
				"select proname, proacl::text as grants from pg_proc where pronamespace = 'public'::regnamespace and proname in ('get_post_comments','submit_post_comment','get_comment_moderation_queue') order by proname"
			);
			assert.deepEqual(updatedRpcGrants.rows, initialRpcGrants.rows);
			const result = async (sql, params = []) => (await db.query(sql, params)).rows[0].result;
			const as = async (role, actor = '') => {
				await db.exec('reset role');
				await db.query("select set_config('request.jwt.claim.sub',$1,false)", [actor]);
				await db.exec(`set role ${role}`);
			};
			const submit = ({
				slug = 'article-one',
				parent = null,
				name = 'A reader',
				body = 'A thoughtful comment',
				id = randomUUID(),
				rate = 'a'.repeat(64)
			} = {}) =>
				result('select public.submit_post_comment($1,$2,$3,$4,$5,$6) as result', [
					slug,
					parent,
					name,
					body,
					id,
					rate
				]);
			const publicRead = (slug = 'article-one', parent = null, page = 1) =>
				result('select public.get_post_comments($1,$2,$3) as result', [slug, parent, page]);
			const queue = (status = 'all', slug = null, page = 1) =>
				result('select public.get_comment_moderation_queue($1,$2,$3) as result', [
					status,
					slug,
					page
				]);
			const moderate = (id, status = null, read = false) =>
				result('select public.moderate_post_comment($1,$2,$3) as result', [id, status, read]);
			const counts = () => result('select public.get_comment_moderation_counts() as result');
			const reply = (id, body = 'Thank you for reading.', submission = randomUUID()) =>
				result('select public.reply_to_post_comment($1,$2,$3) as result', [id, body, submission]);

			// Even the server service role cannot bypass the bounded function interfaces.
			for (const role of ['anon', 'authenticated', 'service_role']) {
				for (const table of ['post_comments', 'post_comment_history', 'post_comment_limits']) {
					const grants = (
						await db.query(
							`select has_table_privilege($1,$2,'SELECT') as read,
          has_table_privilege($1,$2,'INSERT') as write,has_table_privilege($1,$2,'UPDATE') as update`,
							[role, `public.${table}`]
						)
					).rows[0];
					assert.deepEqual(grants, { read: false, write: false, update: false });
				}
				await as(role);
				await assert.rejects(db.query('select * from public.post_comments'), /permission denied/);
				await assert.rejects(
					db.query("insert into public.post_comments (body) values ('forged author')"),
					/permission denied/
				);
				await assert.rejects(
					db.query("update public.post_comments set status='approved'"),
					/permission denied/
				);
				if (role !== 'service_role') {
					await assert.rejects(publicRead(), /permission denied/);
					await assert.rejects(submit(), /permission denied/);
				}
			}
			await as('authenticated', outsiderId);
			await assert.rejects(queue(), /not_authorized/);
			await assert.rejects(counts(), /not_authorized/);
			await assert.rejects(moderate(randomUUID(), 'approved'), /not_authorized/);
			await assert.rejects(reply(randomUUID()), /not_authorized/);
			await as('authenticated');
			await assert.rejects(counts(), /not_authorized/);

			await as('service_role');
			const submissionId = randomUUID();
			const literal = '<script>alert("hello")</script>\nPlain text stays literal.';
			assert.equal(
				await submit({ id: submissionId, name: 'Suvro Ghosh', body: literal }),
				'pending'
			);
			assert.deepEqual(await publicRead(), { comments: [], total: 0, commentCount: 0 });
			assert.equal(
				await submit({ id: submissionId, body: 'different guessed payload' }),
				'pending'
			);
			await assert.rejects(submit({ name: '\tInvalid name' }), /invalid_comment/);
			await assert.rejects(submit({ name: 'x'.repeat(61) }), /invalid_comment/);
			await assert.rejects(submit({ body: '\t\n\r ' }), /invalid_comment/);
			await assert.rejects(submit({ body: 'x'.repeat(3001) }), /invalid_comment/);
			await assert.rejects(submit({ body: 'Invalid\u0001control' }), /invalid_comment/);
			await assert.rejects(submit({ slug: '../draft' }), /invalid_comment/);
			await assert.rejects(submit({ rate: 'unhashed-ip' }), /invalid_comment/);
			await assert.rejects(publicRead('article-one', null, 5001), /invalid_comment_query/);
			// Valid legacy filenames with underscores/leading hyphens remain usable.
			assert.equal(await submit({ slug: '-legacy_post', rate: 'b'.repeat(64) }), 'pending');

			await as('authenticated', ownerId);
			const firstQueue = await queue('pending', 'article-one');
			assert.equal(firstQueue.total, 1);
			assert.equal(firstQueue.pending, 2);
			assert.equal(firstQueue.unread, 2);
			const root = firstQueue.comments[0];
			assert.equal(root.body, literal);
			assert.equal(root.is_author, false);
			assert.equal(root.reply_count, 0);
			assert.equal(root.history[0].action, 'submitted');
			assert.equal(await moderate(root.id, 'approved', true), 'updated');
			assert.equal((await counts()).unread, 1);
			assert.equal((await queue('approved', 'article-one')).comments[0].history[0].action, 'read');
			assert.equal(await moderate(randomUUID(), 'hidden'), 'not_found');
			await assert.rejects(moderate(root.id, 'published'), /invalid_moderation/);
			await assert.rejects(queue('unknown'), /invalid_comment_query/);
			await assert.rejects(reply(root.id, '', randomUUID()), /invalid_comment/);
			await assert.rejects(reply(root.id, 'x'.repeat(3001)), /invalid_comment/);
			// An owner cannot repurpose a guest idempotency token as a privileged reply.
			await assert.rejects(reply(root.id, 'Hijack', submissionId), /submission_conflict/);
			const replySubmission = randomUUID();
			assert.equal(await reply(root.id, 'The author reply', replySubmission), 'approved');
			assert.equal(await reply(root.id, 'The author reply', replySubmission), 'approved');

			await as('service_role');
			let visible = await publicRead();
			assert.equal(visible.total, 1);
			assert.equal(visible.commentCount, 2);
			assert.equal(visible.comments[0].reply_count, 1);
			assert.deepEqual(
				Object.keys(visible.comments[0]).sort(),
				['id', 'parent_id', 'display_name', 'body', 'is_author', 'created_at', 'reply_count'].sort()
			);
			const authorReply = (await publicRead('article-one', root.id)).comments[0];
			assert.equal(authorReply.display_name, 'Suvro Ghosh');
			assert.equal(authorReply.is_author, true);
			await as('authenticated', ownerId);
			assert.equal(await moderate(authorReply.id, 'hidden'), 'updated');
			await assert.rejects(
				reply(root.id, 'The author reply', replySubmission),
				/submission_conflict/
			);
			assert.equal(await moderate(authorReply.id, 'approved'), 'updated');
			await as('service_role');
			assert.equal(await submit({ parent: root.id, body: 'Reader reply' }), 'pending');
			assert.equal((await publicRead('article-one', root.id)).total, 1);
			assert.equal(await submit({ slug: 'article-two', parent: root.id }), 'invalid_parent');
			assert.equal(await submit({ parent: authorReply.id }), 'invalid_parent');
			assert.equal(await submit({ parent: randomUUID() }), 'invalid_parent');

			await as('authenticated', ownerId);
			const readerReply = (await queue('pending', 'article-one')).comments[0];
			assert.equal(readerReply.parent_body, literal);
			assert.equal(readerReply.parent_status, 'approved');
			assert.equal(await moderate(readerReply.id, 'approved', true), 'updated');
			assert.equal(await moderate(root.id, 'hidden'), 'updated');
			assert.equal(await reply(root.id), 'invalid_parent');
			assert.equal(await reply(root.id, 'The author reply', replySubmission), 'invalid_parent');
			await as('service_role');
			assert.deepEqual(await publicRead(), { comments: [], total: 0, commentCount: 0 });
			assert.equal((await publicRead('article-one', root.id)).total, 0);
			assert.equal(await submit({ parent: root.id, rate: 'c'.repeat(64) }), 'invalid_parent');
			await as('authenticated', ownerId);
			// Child statuses survive parent hiding/restoration independently.
			assert.equal(await moderate(readerReply.id, 'rejected'), 'updated');
			assert.equal(await moderate(root.id, 'approved'), 'updated');
			await as('service_role');
			assert.equal((await publicRead()).commentCount, 2);
			assert.equal((await publicRead('article-one', root.id)).comments[0].id, authorReply.id);
			assert.equal(await submit({ id: submissionId }), 'pending');

			// Same token, including concurrent queued calls, never produces a second row/audit.
			const duplicateId = randomUUID();
			const retries = await Promise.all(
				Array.from({ length: 12 }, () => submit({ id: duplicateId, rate: 'd'.repeat(64) }))
			);
			assert.ok(retries.every((status) => status === 'pending'));
			await as('authenticated', ownerId);
			assert.equal((await queue('pending', 'article-one')).total, 1);
			const duplicateRow = (await queue('pending', 'article-one')).comments[0];
			assert.equal(duplicateRow.history.length, 1);
			for (let i = 0; i < 12; i++)
				await moderate(duplicateRow.id, i % 2 === 0 ? 'approved' : 'hidden');
			assert.equal((await queue('hidden', 'article-one')).comments[0].history.length, 10);

			// Additive legacy compatibility preserves case-sensitive filename identities.
			const mixedSlug = 'theFifthWindow';
			const lowerSlug = mixedSlug.toLowerCase();
			const legacyRate = '9'.repeat(64);
			await as('service_role');
			assert.equal(
				await submit({ slug: mixedSlug, body: 'Mixed-case article comment', rate: legacyRate }),
				'pending'
			);
			assert.equal(
				await submit({
					slug: lowerSlug,
					body: 'Distinct lowercase article comment',
					rate: legacyRate
				}),
				'pending'
			);
			assert.equal((await publicRead(mixedSlug)).commentCount, 0);
			assert.equal((await publicRead(lowerSlug)).commentCount, 0);
			await as('authenticated', ownerId);
			const mixedQueue = await queue('pending', mixedSlug);
			const lowerQueue = await queue('pending', lowerSlug);
			assert.equal(mixedQueue.total, 1);
			assert.equal(lowerQueue.total, 1);
			assert.equal(mixedQueue.comments[0].post_slug, mixedSlug);
			assert.equal(lowerQueue.comments[0].post_slug, lowerSlug);
			const mixedRoot = mixedQueue.comments[0];
			assert.equal(await moderate(mixedRoot.id, 'approved', true), 'updated');
			assert.equal(
				await reply(mixedRoot.id, 'Author reply on the exact legacy filename'),
				'approved'
			);
			await as('service_role');
			assert.equal((await publicRead(mixedSlug)).commentCount, 2);
			assert.equal((await publicRead(lowerSlug)).commentCount, 0);
			assert.equal((await publicRead(mixedSlug, mixedRoot.id)).comments[0].is_author, true);
			assert.equal(
				await submit({ slug: lowerSlug, parent: mixedRoot.id, rate: legacyRate }),
				'invalid_parent'
			);
			assert.equal(
				await submit({
					slug: mixedSlug,
					parent: mixedRoot.id,
					body: 'Reader reply on mixed case',
					rate: legacyRate
				}),
				'pending'
			);
			await as('authenticated', ownerId);
			const mixedReaderReply = (await queue('pending', mixedSlug)).comments[0];
			assert.equal(await moderate(mixedReaderReply.id, 'approved', true), 'updated');
			assert.equal(await moderate(lowerQueue.comments[0].id, 'approved', true), 'updated');
			await as('service_role');
			assert.equal((await publicRead(mixedSlug)).commentCount, 3);
			assert.equal((await publicRead(lowerSlug)).commentCount, 1);
			await as('authenticated', ownerId);
			assert.equal(await moderate(mixedRoot.id, 'hidden'), 'updated');
			await as('service_role');
			assert.equal((await publicRead(mixedSlug)).commentCount, 0);
			assert.equal((await publicRead(mixedSlug, mixedRoot.id)).total, 0);
			assert.equal((await publicRead(lowerSlug)).commentCount, 1);

			// Durable per-hash and global admission caps; a retry does not consume another slot.
			await as('service_role');
			const capKey = 'e'.repeat(64);
			for (let i = 0; i < 5; i++)
				assert.equal(await submit({ slug: 'rate-test', rate: capKey }), 'pending');
			assert.equal(await submit({ slug: 'rate-test', rate: capKey }), 'rate_limited');
			await db.exec('reset role');
			const capRow = (
				await db.query('select attempts from public.post_comment_limits where key=$1', [capKey])
			).rows[0];
			assert.equal(capRow.attempts, 6);
			await db.exec(
				"insert into public.post_comment_limits values (repeat('f',64),clock_timestamp()-interval '1 day',1,clock_timestamp()-interval '1 second')"
			);
			await as('service_role');
			assert.equal(await submit({ slug: 'rate-test', rate: '1'.repeat(64) }), 'pending');
			await db.exec('reset role');
			assert.equal(
				(
					await db.query(
						"select count(*)::integer as n from public.post_comment_limits where key=repeat('f',64)"
					)
				).rows[0].n,
				0
			);
			await db.exec(
				"update public.post_comment_limits set attempts=100,window_start=to_timestamp(floor(extract(epoch from clock_timestamp())/600)*600) where key='global'"
			);
			await as('service_role');
			assert.equal(await submit({ rate: '2'.repeat(64) }), 'rate_limited');

			// Seed beyond a page through privileged SQL, then exercise only the real public RPC.
			await db.exec('reset role');
			await db.exec(`insert into public.post_comments (submission_id,post_slug,display_name,body,status)
      select gen_random_uuid(),'pagination','Reader','Comment ' || n,'approved' from generate_series(1,25) n`);
			await as('service_role');
			const page1 = await publicRead('pagination');
			const page2 = await publicRead('pagination', null, 2);
			assert.equal(page1.comments.length, 20);
			assert.equal(page2.comments.length, 5);
			assert.equal(page1.total, 25);
			assert.equal(new Set([...page1.comments, ...page2.comments].map((c) => c.id)).size, 25);
			// A fresh engine sees persisted data, not browser- or process-local memory.
			await db.close();
			db = new PGlite(dataDir);
			await as('service_role');
			assert.equal((await publicRead('pagination')).total, 25);
			assert.equal((await publicRead()).comments[0].body, literal);
		} finally {
			await db.close();
			assert.equal(path.dirname(dataDir), path.resolve(tmpdir()));
			assert.ok(path.basename(dataDir).startsWith('post-comments-sql-'));
			await rm(dataDir, { recursive: true, force: true });
		}
	}
);

test(
	'comment notification SQL preserves transactional enqueue, private leases and retry delivery',
	{
		skip:
			!PGlite &&
			'Install the pinned temporary PGlite runtime and set COMMENTS_SQL_RUNTIME to execute SQL integration.'
	},
	async (t) => {
		const dataDir = await mkdtemp(path.join(tmpdir(), 'comment-notifications-sql-'));
		let db = new PGlite(dataDir);
		try {
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
			await db.query('insert into auth.users values ($1),($2)', [ownerId, outsiderId]);
			await db.query('insert into public.note_owners values ($1)', [ownerId]);
			await db.exec(migration);
			await db.exec(legacySlugMigration);
			// Applying the additive migration must not email an existing moderation backlog.
			const oldSubmission = randomUUID();
			await db.query(
				`insert into public.post_comments (submission_id,post_slug,display_name,body)
         values ($1,'pre-notifications','Old reader','Old pending comment')`,
				[oldSubmission]
			);
			await db.exec(notificationMigration);

			const result = async (sql, params = []) => (await db.query(sql, params)).rows[0].result;
			const as = async (role, actor = '') => {
				await db.exec('reset role');
				await db.query("select set_config('request.jwt.claim.sub',$1,false)", [actor]);
				if (role) await db.exec(`set role ${role}`);
			};
			const claim = (submission = null, limit = 1) =>
				result('select public.claim_post_comment_notifications($1,$2) as result', [
					submission,
					limit
				]);
			const finish = (id, token, sent, provider = null) =>
				result('select public.finish_post_comment_notification($1,$2,$3,$4) as result', [
					id,
					token,
					sent,
					provider
				]);
			const submit = (id = randomUUID(), parent = null) =>
				result('select public.submit_post_comment($1,$2,$3,$4,$5,$6) as result', [
					'theFifthWindow',
					parent,
					'Private reader name',
					'Private body must not reach the email worker.',
					id,
					randomUUID().replaceAll('-', '').repeat(2)
				]);
			const rowFor = async (submission) => {
				await as();
				return (
					await db.query(
						`select n.*, c.submission_id from public.post_comment_notifications n
             join public.post_comments c on c.id=n.comment_id where c.submission_id=$1`,
						[submission]
					)
				).rows[0];
			};

			await t.test('forced RLS and revoked direct access protect notification state', async () => {
				const flags = (
					await db.query(
						"select relrowsecurity,relforcerowsecurity from pg_class where oid='public.post_comment_notifications'::regclass"
					)
				).rows[0];
				assert.deepEqual(flags, { relrowsecurity: true, relforcerowsecurity: true });
				for (const role of ['anon', 'authenticated', 'service_role']) {
					await as(role, role === 'authenticated' ? ownerId : '');
					await assert.rejects(
						db.query('select * from public.post_comment_notifications'),
						/permission denied/
					);
					await assert.rejects(
						db.query('insert into public.post_comment_notifications (comment_id) values ($1)', [
							randomUUID()
						]),
						/permission denied/
					);
					await assert.rejects(
						db.query('update public.post_comment_notifications set sent_at=clock_timestamp()'),
						/permission denied/
					);
					await assert.rejects(
						db.query('select public.enqueue_post_comment_notification()'),
						/permission denied/
					);
					if (role !== 'service_role') {
						await assert.rejects(claim(), /permission denied/);
						await assert.rejects(finish(randomUUID(), randomUUID(), true), /permission denied/);
					}
				}
				await as('authenticated', outsiderId);
				await assert.rejects(claim(), /permission denied/);
			});

			let root;
			const submission = randomUUID();
			await t.test(
				'enqueue is atomic, does not backfill, and deduplicates submission retries',
				async () => {
					await as('service_role');
					assert.deepEqual(await claim(oldSubmission), []);
					assert.equal(await submit(submission), 'pending');
					assert.equal(await submit(submission), 'pending');
					root = await rowFor(submission);
					assert.ok(root);
					assert.equal(root.attempts, 0);
					assert.equal(root.sent_at, null);
					assert.equal(
						(await db.query('select count(*)::integer as n from public.post_comment_notifications'))
							.rows[0].n,
						1
					);
					await db.exec('begin');
					await db.query(
						`insert into public.post_comments (submission_id,post_slug,display_name,body)
           values ($1,'rolled-back','Reader','Rolled back transaction')`,
						[randomUUID()]
					);
					assert.equal(
						(await db.query('select count(*)::integer as n from public.post_comment_notifications'))
							.rows[0].n,
						2
					);
					await db.exec('rollback');
					assert.equal(
						(await db.query('select count(*)::integer as n from public.post_comment_notifications'))
							.rows[0].n,
						1
					);
				}
			);

			await t.test(
				'claim excludes private content, prevents overlap, and validates bounds',
				async () => {
					await as('service_role');
					for (const limit of [null, 0, 6, -1])
						await assert.rejects(claim(null, limit), /invalid_notification_claim/);
					const claimed = await claim(submission);
					assert.equal(claimed.length, 1);
					assert.deepEqual(
						Object.keys(claimed[0]).sort(),
						['comment_id', 'submission_id', 'post_slug', 'created_at', 'lease_token'].sort()
					);
					assert.equal(claimed[0].post_slug, 'theFifthWindow');
					assert.equal(claimed[0].submission_id, submission);
					assert.ok(!JSON.stringify(claimed).includes('Private'));
					root.lease_token = claimed[0].lease_token;
					// Queued single-engine calls verify persisted leases, not multi-connection lock throughput.
					assert.deepEqual(await Promise.all([claim(submission), claim(submission)]), [[], []]);
					assert.deepEqual(await claim(randomUUID()), []);
					const stored = await rowFor(submission);
					assert.ok(new Date(stored.leased_until).getTime() - Date.now() > 110000);
					assert.equal(stored.attempts, 1);
				}
			);

			await t.test(
				'token-checked failures back off and expired leases reject stale acknowledgements',
				async () => {
					await as('service_role');
					assert.equal(await finish(root.comment_id, randomUUID(), true, 'forged'), false);
					assert.equal(await finish(root.comment_id, root.lease_token, false), true);
					assert.deepEqual(await claim(submission), []);
					let stored = await rowFor(submission);
					assert.equal(stored.lease_token, null);
					assert.equal(stored.leased_until, null);
					assert.ok(new Date(stored.due_at).getTime() - Date.now() > 50000);
					assert.ok(new Date(stored.due_at).getTime() - Date.now() <= 60000);
					await db.query(
						"update public.post_comment_notifications set due_at=clock_timestamp()-interval '1 second' where comment_id=$1",
						[root.comment_id]
					);
					await as('service_role');
					const second = (await claim(submission))[0];
					assert.notEqual(second.lease_token, root.lease_token);
					await as();
					await db.query(
						"update public.post_comment_notifications set leased_until=clock_timestamp()-interval '1 second' where comment_id=$1",
						[root.comment_id]
					);
					await as('service_role');
					const reclaimed = (await claim(submission))[0];
					assert.notEqual(reclaimed.lease_token, second.lease_token);
					assert.equal(await finish(root.comment_id, second.lease_token, true, 'stale'), false);
					for (const provider of ['', 'x'.repeat(201), 'bad\nprovider'])
						await assert.rejects(
							finish(root.comment_id, reclaimed.lease_token, true, provider),
							/invalid_notification_result/
						);
					await assert.rejects(
						finish(null, reclaimed.lease_token, true),
						/invalid_notification_result/
					);
					await assert.rejects(finish(root.comment_id, null, true), /invalid_notification_result/);
					await assert.rejects(
						finish(root.comment_id, reclaimed.lease_token, null),
						/invalid_notification_result/
					);
					assert.equal(
						await finish(root.comment_id, reclaimed.lease_token, true, 'resend-test-id'),
						true
					);
					assert.equal(
						await finish(root.comment_id, reclaimed.lease_token, true, 'duplicate'),
						false
					);
					assert.deepEqual(await claim(submission), []);
					stored = await rowFor(submission);
					assert.equal(stored.attempts, 3);
					assert.equal(stored.provider_id, 'resend-test-id');
					assert.ok(stored.sent_at);
				}
			);

			await t.test('owner replies never enqueue and reader replies each enqueue once', async () => {
				await as('authenticated', ownerId);
				assert.equal(
					await result('select public.moderate_post_comment($1,$2,true) as result', [
						root.comment_id,
						'approved'
					]),
					'updated'
				);
				const authorSubmission = randomUUID();
				assert.equal(
					await result('select public.reply_to_post_comment($1,$2,$3) as result', [
						root.comment_id,
						'Author reply',
						authorSubmission
					]),
					'approved'
				);
				assert.equal(await rowFor(authorSubmission), undefined);
				const readerSubmission = randomUUID();
				await as('service_role');
				assert.equal(await submit(readerSubmission, root.comment_id), 'pending');
				assert.equal(await submit(readerSubmission, root.comment_id), 'pending');
				assert.ok(await rowFor(readerSubmission));
			});

			await t.test(
				'moderated submissions are cancelled and are not requeued by later moderation',
				async () => {
					for (const status of ['approved', 'rejected', 'hidden']) {
						const id = randomUUID();
						await as('service_role');
						assert.equal(await submit(id), 'pending');
						const stored = await rowFor(id);
						await as('authenticated', ownerId);
						assert.equal(
							await result('select public.moderate_post_comment($1,$2,true) as result', [
								stored.comment_id,
								status
							]),
							'updated'
						);
						await as('service_role');
						assert.deepEqual(await claim(id), []);
						assert.ok((await rowFor(id)).cancelled_at);
						await as('authenticated', ownerId);
						assert.equal(
							await result('select public.moderate_post_comment($1,$2,true) as result', [
								stored.comment_id,
								'pending'
							]),
							'updated'
						);
						await as('service_role');
						assert.equal(await submit(id), 'pending');
						assert.deepEqual(await claim(id), []);
					}
				}
			);

			await t.test(
				'bounded batches and saturated retry delays survive prolonged delivery failure',
				async () => {
					await as('service_role');
					for (let i = 0; i < 7; i++) assert.equal(await submit(), 'pending');
					const batch = await claim(null, 5);
					assert.equal(batch.length, 5);
					const next = await claim(null, 5);
					assert.equal(next.length, 3); // Includes the pending reader reply from the earlier test.
					assert.equal(new Set([...batch, ...next].map((row) => row.comment_id)).size, 8);
					const candidate = batch[0];
					await as();
					await db.query(
						'update public.post_comment_notifications set attempts=1000000 where comment_id=$1',
						[candidate.comment_id]
					);
					await as('service_role');
					assert.equal(await finish(candidate.comment_id, candidate.lease_token, false), true);
					const stored = await rowFor(candidate.submission_id);
					const delay = new Date(stored.due_at).getTime() - Date.now();
					assert.ok(delay > 3590000 && delay <= 3600000);
					await db.query(
						"update public.post_comment_notifications set due_at=clock_timestamp()-interval '1 second' where comment_id=$1",
						[candidate.comment_id]
					);
					await as('service_role');
					assert.equal((await claim(candidate.submission_id)).length, 1);
					assert.equal((await rowFor(candidate.submission_id)).attempts, 1000000);
				}
			);
			await t.test(
				'a restarted database retains delivery acknowledgement and pending leases',
				async () => {
					await db.close();
					db = new PGlite(dataDir);
					await as('service_role');
					assert.deepEqual(await claim(submission), []);
					const stored = await rowFor(submission);
					assert.equal(stored.provider_id, 'resend-test-id');
					assert.ok(stored.sent_at);
					const leased = (
						await db.query(
							'select count(*)::integer as n from public.post_comment_notifications where lease_token is not null'
						)
					).rows[0].n;
					assert.equal(leased, 8);
				}
			);
		} finally {
			await db.close();
			assert.equal(path.dirname(dataDir), path.resolve(tmpdir()));
			assert.ok(path.basename(dataDir).startsWith('comment-notifications-sql-'));
			await rm(dataDir, { recursive: true, force: true });
		}
	}
);

test(
	'comment notification content migration preserves old deliveries and privately claims full new content',
	{
		skip:
			!PGlite &&
			'Install the pinned temporary PGlite runtime and set COMMENTS_SQL_RUNTIME to execute SQL integration.'
	},
	async (t) => {
		const dataDir = await mkdtemp(path.join(tmpdir(), 'comment-content-sql-'));
		let db = new PGlite(dataDir);
		try {
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
			await db.exec(migration);
			await db.exec(legacySlugMigration);
			await db.exec(notificationMigration);
			const result = async (sql, params = []) => (await db.query(sql, params)).rows[0].result;
			const as = async (role, actor = '') => {
				await db.exec('reset role');
				await db.query("select set_config('request.jwt.claim.sub',$1,false)", [actor]);
				if (role) await db.exec(`set role ${role}`);
			};
			const submit = (id, name, body, parent = null) =>
				result('select public.submit_post_comment($1,$2,$3,$4,$5,$6) as result', [
					'theFifthWindow',
					parent,
					name,
					body,
					id,
					randomUUID().replaceAll('-', '').repeat(2)
				]);
			const claim = (id) =>
				result('select public.claim_post_comment_notifications($1,1) as result', [id]);
			const finish = (job, sent, provider = null) =>
				result('select public.finish_post_comment_notification($1,$2,$3,$4) as result', [
					job.comment_id,
					job.lease_token,
					sent,
					provider
				]);
			const makeDue = async (id) => {
				await as();
				await db.query(
					`update public.post_comment_notifications n
           set due_at=clock_timestamp()-interval '1 second'
           from public.post_comments c where c.id=n.comment_id and c.submission_id=$1`,
					[id]
				);
				await as('service_role');
			};
			const rpcState = () =>
				db.query(`select proname, proacl::text as grants, proconfig
        from pg_proc where pronamespace='public'::regnamespace
        and proname in ('claim_post_comment_notifications','finish_post_comment_notification',
          'enqueue_post_comment_notification') order by proname`);
			const originalRpcs = (await rpcState()).rows;
			const legacySubmission = randomUUID();
			await as('service_role');
			assert.equal(
				await submit(legacySubmission, 'Old private reader', 'Old private comment'),
				'pending'
			);
			const initialLegacyJob = (await claim(legacySubmission))[0];
			assert.equal(await finish(initialLegacyJob, false), true);
			await makeDue(legacySubmission);
			await as();
			const oldRow = (
				await db.query('select * from public.post_comment_notifications where comment_id=$1', [
					initialLegacyJob.comment_id
				])
			).rows[0];
			await db.exec(notificationContentMigration);

			await t.test(
				'existing retry jobs remain version one without changing stored state or grants',
				async () => {
					assert.deepEqual((await rpcState()).rows, originalRpcs);
					const migratedRow = (
						await db.query('select * from public.post_comment_notifications where comment_id=$1', [
							initialLegacyJob.comment_id
						])
					).rows[0];
					assert.deepEqual(migratedRow, { ...oldRow, content_version: 1 });
					await as('service_role');
					const legacy = (await claim(legacySubmission))[0];
					assert.equal(legacy.content_version, 1);
					assert.equal(legacy.display_name, null);
					assert.equal(legacy.body, null);
					assert.deepEqual(
						Object.keys(legacy).sort(),
						[
							'comment_id',
							'submission_id',
							'post_slug',
							'created_at',
							'lease_token',
							'content_version',
							'display_name',
							'body'
						].sort()
					);
					assert.ok(!JSON.stringify(legacy).includes('private'));
					assert.equal(await finish(legacy, false), true);
					await makeDue(legacySubmission);
					const retried = (await claim(legacySubmission))[0];
					assert.equal(retried.content_version, 1);
					assert.equal(retried.body, null);
					assert.equal(await finish(retried, true, 'legacy-provider-id'), true);
				}
			);

			await t.test(
				'new content remains behind the same service-only RPC and forced RLS',
				async () => {
					await as();
					const flags = (
						await db.query(
							"select relrowsecurity,relforcerowsecurity from pg_class where oid='public.post_comment_notifications'::regclass"
						)
					).rows[0];
					assert.deepEqual(flags, { relrowsecurity: true, relforcerowsecurity: true });
					for (const role of ['anon', 'authenticated', 'service_role']) {
						await as(role, role === 'authenticated' ? ownerId : '');
						await assert.rejects(
							db.query('select content_version from public.post_comment_notifications'),
							/permission denied/
						);
						if (role !== 'service_role')
							await assert.rejects(claim(legacySubmission), /permission denied/);
					}
					await as();
					const columns = (
						await db.query(
							"select column_name from information_schema.columns where table_schema='public' and table_name='post_comment_notifications'"
						)
					).rows.map((row) => row.column_name);
					assert.ok(!columns.includes('display_name'));
					assert.ok(!columns.includes('body'));
					await assert.rejects(
						db.query('update public.post_comment_notifications set content_version=3'),
						/check constraint/
					);
				}
			);

			let newJob;
			const newSubmission = randomUUID();
			const name = 'পাঠক <Reader> ' + 'ক'.repeat(60 - 'পাঠক <Reader> '.length);
			const prefix =
				'বাংলা <script>alert("literal")</script>\nFirst paragraph.\n\nSecond paragraph.\n';
			const body = prefix + 'ক'.repeat(3000 - prefix.length);
			await t.test(
				'new version-two jobs claim the full name and 3000-character multiline Unicode body',
				async () => {
					assert.equal(name.length, 60);
					assert.equal(body.length, 3000);
					await as('service_role');
					assert.equal(await submit(newSubmission, name, body), 'pending');
					assert.equal(
						await submit(newSubmission, 'Different retry name', 'Changed retry body'),
						'pending'
					);
					newJob = (await claim(newSubmission))[0];
					assert.equal(newJob.content_version, 2);
					assert.equal(newJob.display_name, name);
					assert.equal(newJob.body, body);
					assert.deepEqual(await claim(newSubmission), []);
					assert.deepEqual(
						await result('select public.get_post_comments($1,null,1) as result', [
							'theFifthWindow'
						]),
						{ comments: [], total: 0, commentCount: 0 }
					);
					assert.equal(await finish(newJob, false), true);
					await makeDue(newSubmission);
					newJob = (await claim(newSubmission))[0];
					assert.equal(newJob.content_version, 2);
					assert.equal(newJob.display_name, name);
					assert.equal(newJob.body, body);
					assert.equal(await finish(newJob, true, 'content-provider-id'), true);
					assert.deepEqual(await claim(newSubmission), []);
				}
			);

			await t.test(
				'new guest replies include content, author replies do not enqueue, and versioned delivery survives restart',
				async () => {
					await as('authenticated', ownerId);
					assert.equal(
						await result('select public.moderate_post_comment($1,$2,true) as result', [
							newJob.comment_id,
							'approved'
						]),
						'updated'
					);
					const authorSubmission = randomUUID();
					assert.equal(
						await result('select public.reply_to_post_comment($1,$2,$3) as result', [
							newJob.comment_id,
							'Owner response',
							authorSubmission
						]),
						'approved'
					);
					await as('service_role');
					assert.deepEqual(await claim(authorSubmission), []);
					const replySubmission = randomUUID();
					assert.equal(
						await submit(
							replySubmission,
							'Reply reader',
							'Full reader reply\nNext line',
							newJob.comment_id
						),
						'pending'
					);
					const replyJob = (await claim(replySubmission))[0];
					assert.equal(replyJob.content_version, 2);
					assert.equal(replyJob.display_name, 'Reply reader');
					assert.equal(replyJob.body, 'Full reader reply\nNext line');
					assert.equal(await finish(replyJob, false), true);
					await as('authenticated', ownerId);
					assert.equal(
						await result('select public.moderate_post_comment($1,$2,true) as result', [
							replyJob.comment_id,
							'rejected'
						]),
						'updated'
					);
					await makeDue(replySubmission);
					assert.deepEqual(await claim(replySubmission), []);
					await db.close();
					db = new PGlite(dataDir);
					await as('service_role');
					assert.deepEqual(await claim(legacySubmission), []);
					assert.deepEqual(await claim(newSubmission), []);
					assert.deepEqual(await claim(replySubmission), []);
					await as();
					const rows = (
						await db.query(
							'select content_version,provider_id,sent_at,cancelled_at from public.post_comment_notifications order by content_version,created_at'
						)
					).rows;
					assert.equal(rows.length, 3);
					assert.equal(rows[0].content_version, 1);
					assert.equal(rows[0].provider_id, 'legacy-provider-id');
					assert.equal(rows[1].content_version, 2);
					assert.equal(rows[1].provider_id, 'content-provider-id');
					assert.ok(rows[2].cancelled_at);
				}
			);
		} finally {
			await db.close();
			assert.equal(path.dirname(dataDir), path.resolve(tmpdir()));
			assert.ok(path.basename(dataDir).startsWith('comment-content-sql-'));
			await rm(dataDir, { recursive: true, force: true });
		}
	}
);
