import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const migration = fs.readFileSync(
	path.join(root, 'supabase', 'migrations', '202607230001_handwritten_notes.sql'),
	'utf8'
);
const cron = fs.readFileSync(path.join(root, 'supabase', 'cron.sql'), 'utf8');

function functionDefinition(name) {
	const start = migration.indexOf(`create or replace function public.${name}(`);
	assert.notEqual(start, -1, `Expected public.${name} to be defined`);
	const end = migration.indexOf('\n$$;', start);
	assert.notEqual(end, -1, `Expected public.${name} to have a complete function body`);
	return migration.slice(start, end + 4);
}

test('every notes table has row-level security enabled', () => {
	for (const table of [
		'note_owners',
		'notes',
		'note_versions',
		'note_save_requests',
		'note_auth_rate_limits',
		'note_assets',
		'note_publications',
		'note_publication_assets'
	]) {
		assert.match(
			migration,
			new RegExp(`alter table public\\.${table} enable row level security;`),
			`Expected RLS on public.${table}`
		);
	}

	assert.match(
		migration,
		/create policy "Published snapshots are publicly readable"[\s\S]*?to anon, authenticated[\s\S]*?using \(activated_at is not null and revoked_at is null\);/
	);
});

test('publication payloads are immutable after their snapshot is created', () => {
	const protection = functionDefinition('protect_note_publication_snapshot');

	for (const column of [
		'note_id',
		'source_revision',
		'title',
		'slug',
		'excerpt',
		'tags',
		'category',
		'cover_image_url',
		'document',
		'transcript',
		'seo_title',
		'seo_description',
		'downloads_enabled',
		'scheduled_for',
		'created_at'
	]) {
		assert.match(protection, new RegExp(`new\\.${column} is distinct from old\\.${column}`));
	}

	assert.match(protection, /raise exception 'publication_snapshot_is_immutable'/);
	assert.match(
		migration,
		/create trigger note_publications_protect_snapshot[\s\S]*?before update on public\.note_publications[\s\S]*?execute function public\.protect_note_publication_snapshot\(\);/
	);
});

test('owner mutations use security-definer RPCs with optimistic concurrency', () => {
	for (const name of [
		'save_note_document',
		'publish_note',
		'restore_note_version',
		'schedule_note'
	]) {
		const definition = functionDefinition(name);
		assert.match(definition, /security definer/);
		assert.match(definition, /set search_path = ''/);
		assert.match(definition, /p_expected_revision bigint/);
		assert.match(definition, /revision_conflict/);
		assert.match(definition, /auth\.uid\(\)/);
	}

	assert.match(
		functionDefinition('save_note_document'),
		/public\.notes\.revision = p_expected_revision/
	);
	assert.match(functionDefinition('publish_note'), /v_note\.revision <> p_expected_revision/);
	assert.match(functionDefinition('schedule_note'), /v_note\.revision <> p_expected_revision/);
});

test('scheduled publishing freezes a future snapshot and activation is service-only', () => {
	const schedule = functionDefinition('schedule_note');
	const activation = functionDefinition('activate_due_note_publications');

	assert.match(schedule, /p_scheduled_for is null or p_scheduled_for <= now\(\)/);
	assert.match(schedule, /insert into public\.note_publications/);
	assert.match(schedule, /p_published_document/);
	assert.match(schedule, /conflicting_publication\.slug = v_note\.slug/);
	assert.match(schedule, /publication_slug_conflict/);
	assert.match(activation, /candidate\.scheduled_for <= now\(\)/);
	assert.match(activation, /previous_publication\.note_id = v_candidate\.note_id/);
	assert.match(activation, /previous_publication\.activated_at is not null/);
	assert.match(activation, /exception\s+when others then/);
	assert.match(activation, /activation_error = left/);
	assert.doesNotMatch(activation, /^\s*where note_id =/m);
	assert.doesNotMatch(activation, /^\s*and activated_at is not null/m);
	assert.match(activation, /coalesce\(auth\.role\(\), ''\) <> 'service_role'/);
	assert.match(
		migration,
		/revoke execute on function public\.activate_due_note_publications\(integer\)\s+from public, anon, authenticated;/
	);
	assert.match(
		migration,
		/grant execute on function public\.activate_due_note_publications\(integer\)\s+to service_role;/
	);
	assert.match(cron, /'\* \* \* \* \*'/);
	assert.match(cron, /public\.activate_due_note_publications\(25\)/);
});

test('sensitive mutations require the age of the current auth session, not account sign-in time', () => {
	const freshness = functionDefinition('note_session_is_fresh');
	assert.match(freshness, /from auth\.sessions as session/);
	assert.match(freshness, /session\.id::text = coalesce\(auth\.jwt\(\)->>'session_id', ''\)/);
	assert.match(freshness, /session\.created_at >= now\(\) - make_interval/);

	for (const name of [
		'publish_note',
		'restore_note_version',
		'schedule_note',
		'unpublish_note',
		'archive_note',
		'delete_note'
	]) {
		assert.match(functionDefinition(name), /perform public\.require_recent_note_session\(\);/);
	}

	assert.match(
		migration,
		/revoke execute on function public\.require_recent_note_session\(\)\s+from public, anon, authenticated;/
	);
});

test('storage remains private and RPC execution is not exposed to anonymous users', () => {
	assert.match(
		migration,
		/values \('notes-private', 'notes-private', false, 2097152, array\['image\/webp'\]\)/
	);
	assert.doesNotMatch(migration, /values\s*\(\s*'notes-public'\s*,\s*'notes-public'\s*,\s*true/i);
	assert.match(migration, /update storage\.buckets set public = false where id = 'notes-public';/);
	assert.match(
		migration,
		/foreign key \(asset_id, note_id\)[\s\S]*?references public\.note_assets\(id, note_id\)[\s\S]*?on delete restrict/
	);
	assert.match(
		functionDefinition('delete_note'),
		/delete from public\.note_publication_assets where note_id = p_note_id;/
	);

	for (const signature of [
		'save_note_document\\(uuid, bigint, jsonb, uuid\\)',
		'publish_note\\(uuid, bigint, uuid, jsonb, uuid\\[\\]\\)',
		'restore_note_version\\(uuid, uuid, bigint\\)',
		'schedule_note\\(uuid, bigint, uuid, jsonb, uuid\\[\\], timestamptz\\)',
		'unpublish_note\\(uuid, text\\)',
		'archive_note\\(uuid\\)',
		'delete_note\\(uuid\\)'
	]) {
		assert.match(
			migration,
			new RegExp(`revoke execute on function public\\.${signature}\\s+from public, anon;`)
		);
	}
});
