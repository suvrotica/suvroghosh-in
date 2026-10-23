// Real PostgreSQL WASM execution; no hosted database or website dependency required.
// npm install --prefix <temporary-folder> --no-save @electric-sql/pglite@0.5.11
// COMMENTS_SQL_RUNTIME=<temporary-folder> node --test supabase/tests/post-comments.integration.test.mjs
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
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
const ownerId = 'd66ad910-1e06-4bb7-8f0c-fcf107193d73';
const outsiderId = '34c166ef-c242-41bb-a397-c185f263b1f1';

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
