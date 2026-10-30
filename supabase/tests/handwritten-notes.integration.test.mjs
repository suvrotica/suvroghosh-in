// Executes the unmodified Notes migration in disposable PostgreSQL WASM.
// Auth JWT/session and Storage schema contracts are local fixtures, not a hosted Supabase test.
// PGlite serializes queries: these tests do not establish multi-connection race behavior.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const migration = await readFile(
	new URL('../migrations/202607230001_handwritten_notes.sql', import.meta.url),
	'utf8'
);
const owner = randomUUID();
const otherOwner = randomUUID();
const outsider = randomUUID();
const ownerSession = randomUUID();
const staleSession = randomUUID();
const otherSession = randomUUID();
const outsiderSession = randomUUID();
const noteId = randomUUID();
const otherNoteId = randomUUID();
const publicationId = randomUUID();
const scheduledId = randomUUID();
const assetId = randomUUID();
const document = (id = noteId, title = 'Private draft') => ({ id, title, objects: [] });

test('Notes roles, RPCs, snapshots, storage and admission execute under PostgreSQL', async (t) => {
	const db = new PGlite({ extensions: { pgcrypto } });
	const query = async (sql, values = []) => (await db.query(sql, values)).rows;
	const as = async (role = '', actor = '', session = '') => {
		await db.exec('reset role');
		await db.query("select set_config('request.jwt.claims',$1,false)", [
			JSON.stringify({ sub: actor, role, session_id: session })
		]);
		if (role) {
			assert.ok(['anon', 'authenticated', 'service_role'].includes(role));
			await db.exec(`set role ${role}`);
		}
	};
	const save = (revision, key, body = document(), id = noteId) =>
		query('select * from public.save_note_document($1,$2,$3,$4)', [id, revision, body, key]);
	const publish = (id = publicationId, assets = []) =>
		query('select * from public.publish_note($1,1,$2,$3,$4)', [
			noteId,
			id,
			document(noteId, 'Frozen public snapshot'),
			assets
		]);
	const schedule = (id = scheduledId) =>
		query("select * from public.schedule_note($1,1,$2,$3,'{}',now()+interval '1 hour')", [
			noteId,
			id,
			document(noteId, 'Future snapshot')
		]);
	try {
		await db.exec(`
			create role anon; create role authenticated; create role service_role bypassrls;
			create schema auth;
			create table auth.users (id uuid primary key);
			create table auth.sessions (id uuid primary key, user_id uuid references auth.users(id), created_at timestamptz not null);
			create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
			create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt()->>'sub','')::uuid $$;
			create function auth.role() returns text language sql stable as $$ select auth.jwt()->>'role' $$;
			grant usage on schema auth to anon,authenticated,service_role;
			create schema storage;
			create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
			create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text);
			create function storage.foldername(text) returns text[] language sql immutable as $$ select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1] $$;
			alter table storage.objects enable row level security;
			grant usage on schema storage to anon,authenticated,service_role;
			grant select,insert,delete on storage.objects to anon,authenticated,service_role;
		`);
		await db.exec(migration);
		await db.query('insert into auth.users values ($1),($2),($3)', [owner, otherOwner, outsider]);
		await db.query('insert into public.note_owners(user_id) values ($1),($2)', [owner, otherOwner]);
		await db.query(
			"insert into auth.sessions values ($1,$2,now()),($3,$2,now()-interval '13 hours'),($4,$5,now()),($6,$7,now())",
			[ownerSession, owner, staleSession, otherSession, otherOwner, outsiderSession, outsider]
		);
		for (const [actor, session, id, slug] of [
			[owner, ownerSession, noteId, 'owner-note'],
			[otherOwner, otherSession, otherNoteId, 'other-note']
		]) {
			await as('authenticated', actor, session);
			await db.query(
				'insert into public.notes(id,owner_id,title,slug,document) values ($1,$2,$3,$4,$5)',
				[id, actor, slug, slug, document(id)]
			);
		}

		await t.test(
			'RLS isolates owner records and direct sensitive writes are forbidden',
			async () => {
				await as('authenticated', owner, ownerSession);
				assert.deepEqual(
					(await query('select id from public.notes')).map((row) => row.id),
					[noteId]
				);
				assert.deepEqual(
					(await query('select user_id from public.note_owners')).map((row) => row.user_id),
					[owner]
				);
				await assert.rejects(
					db.query('update public.notes set document=$1 where id=$2', [document(), noteId]),
					{ code: '42501' }
				);
				await assert.rejects(
					db.query('insert into public.notes(owner_id,title,slug,document) values ($1,$2,$3,$4)', [
						otherOwner,
						'Forbidden',
						'forbidden',
						document()
					]),
					{ code: '42501' }
				);
				await as('authenticated', outsider, outsiderSession);
				assert.equal((await query('select * from public.notes')).length, 0);
				assert.equal((await query('select * from public.note_owners')).length, 0);
				await assert.rejects(save(0, randomUUID()), { code: '42501' });
				await assert.rejects(publish(), { code: '42501' });
				await as('authenticated', otherOwner, otherSession);
				await assert.rejects(save(0, randomUUID()), { code: '42501' });
				await as('anon');
				await assert.rejects(db.query('select * from public.notes'), { code: '42501' });
				await assert.rejects(save(0, randomUUID()), { code: '42501' });
				await assert.rejects(publish(), { code: '42501' });
				assert.equal((await query('select * from public.note_publications')).length, 0);
			}
		);

		await t.test(
			'save idempotency and optimistic revisions preserve exactly one committed version',
			async () => {
				await as('authenticated', owner, ownerSession);
				const key = randomUUID();
				assert.equal((await save(0, key))[0].revision, 1);
				assert.equal((await save(0, key))[0].revision, 1);
				await assert.rejects(save(0, key, document(noteId, 'Different request')), {
					code: '22023'
				});
				await assert.rejects(save(0, randomUUID()), { code: '40001' });
				await assert.rejects(save(1, randomUUID(), document(otherNoteId)), { code: '22023' });
				assert.equal(
					(await query('select revision from public.notes where id=$1', [noteId]))[0].revision,
					1
				);
				assert.equal(
					(
						await query("select * from public.note_versions where note_id=$1 and kind='autosave'", [
							noteId
						])
					).length,
					1
				);
			}
		);

		await t.test(
			'fresh sessions guard publication and asset manifests reject references from another note',
			async () => {
				await as('authenticated', owner, staleSession);
				assert.equal(
					(await query('select public.note_session_is_fresh() as fresh'))[0].fresh,
					false
				);
				await assert.rejects(publish(), { code: '42501' });
				await assert.rejects(schedule(), { code: '42501' });
				await assert.rejects(db.query('select public.unpublish_note($1,$2)', [noteId, 'draft']), {
					code: '42501'
				});
				await as('authenticated', otherOwner, otherSession);
				await db.query(
					"insert into public.note_assets(id,note_id,owner_id,private_path,mime_type,byte_size,width,height,content_sha256) values ($1,$2,$3,$4,'image/webp',12,2,2,$5)",
					[
						assetId,
						otherNoteId,
						otherOwner,
						`${otherOwner}/${otherNoteId}/${assetId}.webp`,
						'a'.repeat(64)
					]
				);
				await as('authenticated', owner, ownerSession);
				await assert.rejects(publish(publicationId, [assetId]), { code: '22023' });
				assert.equal((await query('select * from public.note_publications')).length, 0);
				assert.equal((await publish())[0].publication_id, publicationId);
				await as('anon');
				assert.equal(
					(await query('select document from public.note_publications'))[0].document.title,
					'Frozen public snapshot'
				);
				await assert.rejects(db.query('select * from public.note_assets'), { code: '42501' });
			}
		);

		await t.test(
			'published snapshots remain immutable and unpublishing revokes anonymous access',
			async () => {
				await as();
				await assert.rejects(
					db.query('update public.note_publications set title=$1 where id=$2', [
						'Tampered',
						publicationId
					]),
					{ code: '55000' }
				);
				await as('authenticated', owner, ownerSession);
				await db.query('update public.notes set title=$1 where id=$2', [
					'Draft changed after publishing',
					noteId
				]);
				assert.notEqual(
					(
						await query('select title from public.note_publications where id=$1', [publicationId])
					)[0].title,
					'Draft changed after publishing'
				);
				await db.query('select public.unpublish_note($1,$2)', [noteId, 'draft']);
				await as('anon');
				assert.equal((await query('select * from public.note_publications')).length, 0);
			}
		);

		await t.test(
			'scheduled snapshots are private and activation is service-only and idempotent',
			async () => {
				await as('authenticated', owner, ownerSession);
				await schedule();
				await assert.rejects(db.query('select * from public.activate_due_note_publications()'), {
					code: '42501'
				});
				await as('anon');
				assert.equal((await query('select * from public.note_publications')).length, 0);
				await assert.rejects(db.query('select * from public.activate_due_note_publications()'), {
					code: '42501'
				});
				await as('service_role');
				assert.equal(
					(await query('select * from public.activate_due_note_publications()')).length,
					0
				);
				await as();
				// Move the fixture clock via initial insertion only; the immutable-snapshot trigger must remain active.
				const dueId = randomUUID();
				await db.query('update public.note_publications set revoked_at=now() where id=$1', [
					scheduledId
				]);
				await db.query(
					"insert into public.note_publications(id,note_id,source_revision,title,slug,document,scheduled_for) values ($1,$2,1,'Due frozen snapshot','owner-note',$3,now()-interval '1 second')",
					[dueId, noteId, document()]
				);
				await as('service_role');
				assert.equal(
					(await query('select * from public.activate_due_note_publications()'))[0].publication_id,
					dueId
				);
				assert.equal(
					(await query('select * from public.activate_due_note_publications()')).length,
					0
				);
				await as('anon');
				assert.equal((await query('select id from public.note_publications'))[0].id, dueId);
			}
		);

		await t.test(
			'private storage policies reject outsider paths and expose only an owner’s objects',
			async () => {
				const name = `${owner}/${noteId}/image.webp`;
				await as('authenticated', owner, ownerSession);
				await db.query("insert into storage.objects(bucket_id,name) values ('notes-private',$1)", [
					name
				]);
				await assert.rejects(
					db.query("insert into storage.objects(bucket_id,name) values ('notes-private',$1)", [
						`${otherOwner}/${otherNoteId}/image.webp`
					]),
					{ code: '42501' }
				);
				assert.equal((await query('select name from storage.objects'))[0].name, name);
				await as('authenticated', outsider, outsiderSession);
				assert.equal((await query('select * from storage.objects')).length, 0);
				await assert.rejects(
					db.query("insert into storage.objects(bucket_id,name) values ('notes-private',$1)", [
						`${outsider}/image.webp`
					]),
					{ code: '42501' }
				);
				await as('anon');
				assert.equal((await query('select * from storage.objects')).length, 0);
				await as();
				assert.equal(
					(await query("select public from storage.buckets where id='notes-private'"))[0].public,
					false
				);
			}
		);

		await t.test(
			'auth admission is service-only, durable across calls and reset only through its privileged RPC',
			async () => {
				const hash = 'b'.repeat(64);
				const consume = () =>
					query('select public.consume_note_auth_rate_limit($1,2,900,1800) as allowed', [hash]);
				for (const role of ['anon', 'authenticated']) {
					await as(role, role === 'authenticated' ? owner : '', ownerSession);
					await assert.rejects(consume(), { code: '42501' });
					await assert.rejects(db.query('select public.clear_note_auth_rate_limit($1)', [hash]), {
						code: '42501'
					});
					await assert.rejects(db.query('select * from public.note_auth_rate_limits'), {
						code: '42501'
					});
				}
				await as('service_role');
				assert.equal((await consume())[0].allowed, true);
				assert.equal((await consume())[0].allowed, true);
				assert.equal((await consume())[0].allowed, false);
				await db.query('select public.clear_note_auth_rate_limit($1)', [hash]);
				assert.equal((await consume())[0].allowed, true);
			}
		);
	} finally {
		await db.close();
	}
});
