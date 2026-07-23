create extension if not exists pgcrypto;

create table if not exists public.note_owners (
	user_id uuid primary key references auth.users(id) on delete cascade,
	created_at timestamptz not null default now()
);

create table if not exists public.notes (
	id uuid primary key default gen_random_uuid(),
	owner_id uuid not null references auth.users(id) on delete restrict,
	title text not null check (char_length(title) between 1 and 160),
	slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(slug) <= 180),
	excerpt text not null default '' check (char_length(excerpt) <= 500),
	status text not null default 'draft'
		check (status in ('draft', 'scheduled', 'published', 'archived', 'private')),
	tags text[] not null default '{}' check (cardinality(tags) <= 20),
	category text,
	cover_image_url text,
	document jsonb not null,
	transcript text not null default '',
	seo_title text,
	seo_description text,
	downloads_enabled boolean not null default false,
	revision bigint not null default 0 check (revision >= 0),
	scheduled_for timestamptz,
	published_at timestamptz,
	deleted_at timestamptz,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	unique (slug),
	unique (id, owner_id),
	check (jsonb_typeof(document) = 'object'),
	check (octet_length(document::text) <= 15728640),
	check (octet_length(transcript) <= 2000000),
	check (category is null or char_length(category) <= 80),
	check (cover_image_url is null or (cover_image_url ~ '^https://' and char_length(cover_image_url) <= 2000)),
	check (seo_title is null or char_length(seo_title) <= 70),
	check (seo_description is null or char_length(seo_description) <= 170),
	check ((status = 'scheduled' and scheduled_for is not null) or status <> 'scheduled')
);

create index if not exists notes_owner_dashboard_idx
	on public.notes (owner_id, status, updated_at desc)
	where deleted_at is null;

create table if not exists public.note_versions (
	id uuid primary key default gen_random_uuid(),
	note_id uuid not null references public.notes(id) on delete cascade,
	revision bigint not null check (revision >= 0),
	kind text not null default 'autosave'
		check (kind in ('autosave', 'manual', 'publish', 'schedule', 'restore', 'import')),
	document jsonb not null,
	metadata jsonb not null default '{}',
	created_at timestamptz not null default now(),
	check (jsonb_typeof(document) = 'object'),
	check (octet_length(document::text) <= 15728640)
);

create unique index if not exists note_versions_autosave_revision_uidx
	on public.note_versions (note_id, revision)
	where kind = 'autosave';

create index if not exists note_versions_history_idx
	on public.note_versions (note_id, created_at desc);

create table if not exists public.note_save_requests (
	note_id uuid not null references public.notes(id) on delete cascade,
	idempotency_key uuid not null,
	request_hash text not null check (request_hash ~ '^[0-9a-f]{32}$'),
	result_revision bigint not null check (result_revision >= 0),
	created_at timestamptz not null default now(),
	primary key (note_id, idempotency_key)
);

create table if not exists public.note_auth_rate_limits (
	key_hash text primary key check (key_hash ~ '^[0-9a-f]{64}$'),
	window_started_at timestamptz not null default now(),
	attempts integer not null default 0 check (attempts >= 0),
	blocked_until timestamptz,
	updated_at timestamptz not null default now()
);

create table if not exists public.note_assets (
	id uuid primary key default gen_random_uuid(),
	note_id uuid not null,
	owner_id uuid not null references auth.users(id) on delete restrict,
	private_path text not null unique,
	mime_type text not null check (mime_type = 'image/webp'),
	byte_size integer not null check (byte_size between 1 and 2097152),
	width integer not null check (width between 1 and 2560),
	height integer not null check (height between 1 and 2560),
	content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
	alt text not null default '' check (char_length(alt) <= 2000),
	created_at timestamptz not null default now(),
	unique (id, note_id),
	foreign key (note_id, owner_id)
		references public.notes(id, owner_id)
		on delete cascade,
	check (width::bigint * height::bigint <= 25000000)
);

create index if not exists note_assets_note_idx on public.note_assets (note_id, created_at);

-- Every row is a frozen publication payload. Activation and revocation timestamps may change,
-- but the snapshot document and metadata are protected by a trigger below.
create table if not exists public.note_publications (
	id uuid primary key default gen_random_uuid(),
	note_id uuid not null references public.notes(id) on delete cascade,
	source_revision bigint not null check (source_revision >= 0),
	title text not null check (char_length(title) between 1 and 160),
	slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(slug) <= 180),
	excerpt text not null default '' check (char_length(excerpt) <= 500),
	tags text[] not null default '{}' check (cardinality(tags) <= 20),
	category text,
	cover_image_url text,
	document jsonb not null,
	transcript text not null default '',
	seo_title text,
	seo_description text,
	downloads_enabled boolean not null default false,
	scheduled_for timestamptz,
	activated_at timestamptz,
	published_at timestamptz,
	revoked_at timestamptz,
	activation_error text,
	created_at timestamptz not null default now(),
	search_vector tsvector generated always as (
		to_tsvector(
			'english',
			coalesce(title, '') || ' ' || coalesce(excerpt, '') || ' ' || coalesce(transcript, '')
		)
	) stored,
	unique (id, note_id),
	check (jsonb_typeof(document) = 'object'),
	check (octet_length(document::text) <= 15728640),
	check (octet_length(transcript) <= 2000000),
	check (category is null or char_length(category) <= 80),
	check (cover_image_url is null or (cover_image_url ~ '^https://' and char_length(cover_image_url) <= 2000)),
	check (seo_title is null or char_length(seo_title) <= 70),
	check (seo_description is null or char_length(seo_description) <= 170),
	check (activated_at is not null or scheduled_for is not null),
	check ((activated_at is null and published_at is null) or (activated_at is not null and published_at is not null))
);

create unique index if not exists note_publications_live_note_uidx
	on public.note_publications (note_id)
	where activated_at is not null and revoked_at is null;

create unique index if not exists note_publications_live_slug_uidx
	on public.note_publications (slug)
	where activated_at is not null and revoked_at is null;

create unique index if not exists note_publications_pending_note_uidx
	on public.note_publications (note_id)
	where activated_at is null and revoked_at is null;

create index if not exists note_publications_live_idx
	on public.note_publications (published_at desc)
	where activated_at is not null and revoked_at is null;

create index if not exists note_publications_due_idx
	on public.note_publications (scheduled_for, id)
	where activated_at is null and revoked_at is null;

create index if not exists note_publications_search_idx
	on public.note_publications using gin (search_vector);

create table if not exists public.note_publication_assets (
	publication_id uuid not null,
	asset_id uuid not null,
	note_id uuid not null,
	created_at timestamptz not null default now(),
	primary key (publication_id, asset_id),
	foreign key (publication_id, note_id)
		references public.note_publications(id, note_id)
		on delete cascade,
	foreign key (asset_id, note_id)
		references public.note_assets(id, note_id)
		on delete restrict
);

create index if not exists note_publication_assets_asset_idx
	on public.note_publication_assets (asset_id, publication_id);

create or replace function public.set_note_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
	new.updated_at = now();
	return new;
end;
$$;

drop trigger if exists notes_set_updated_at on public.notes;
create trigger notes_set_updated_at
	before update on public.notes
	for each row execute function public.set_note_updated_at();

create or replace function public.note_session_is_fresh(p_max_age_minutes integer default 720)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select exists (
		select 1
		from auth.sessions as session
		where session.user_id = auth.uid()
			and session.id::text = coalesce(auth.jwt()->>'session_id', '')
			and session.created_at >= now() - make_interval(
				mins => greatest(1, least(coalesce(p_max_age_minutes, 720), 1440))
			)
	);
$$;

create or replace function public.require_recent_note_session()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
	if not public.note_session_is_fresh(720) then
		raise exception 'reauthentication_required' using errcode = '42501';
	end if;
end;
$$;

create or replace function public.protect_note_publication_snapshot()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
	if new.note_id is distinct from old.note_id
		or new.source_revision is distinct from old.source_revision
		or new.title is distinct from old.title
		or new.slug is distinct from old.slug
		or new.excerpt is distinct from old.excerpt
		or new.tags is distinct from old.tags
		or new.category is distinct from old.category
		or new.cover_image_url is distinct from old.cover_image_url
		or new.document is distinct from old.document
		or new.transcript is distinct from old.transcript
		or new.seo_title is distinct from old.seo_title
		or new.seo_description is distinct from old.seo_description
		or new.downloads_enabled is distinct from old.downloads_enabled
		or new.scheduled_for is distinct from old.scheduled_for
		or new.created_at is distinct from old.created_at then
		raise exception 'publication_snapshot_is_immutable' using errcode = '55000';
	end if;
	return new;
end;
$$;

drop trigger if exists note_publications_protect_snapshot on public.note_publications;
create trigger note_publications_protect_snapshot
	before update on public.note_publications
	for each row execute function public.protect_note_publication_snapshot();

create or replace function public.save_note_document(
	p_note_id uuid,
	p_expected_revision bigint,
	p_document jsonb,
	p_idempotency_key uuid
)
returns table (revision bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_actor uuid := auth.uid();
	v_revision bigint;
	v_request_hash text;
	v_existing public.note_save_requests%rowtype;
begin
	if v_actor is null or not exists (
		select 1
		from public.notes n
		join public.note_owners o on o.user_id = n.owner_id
		where n.id = p_note_id
			and n.owner_id = v_actor
			and n.deleted_at is null
	) then
		raise exception 'not_authorized' using errcode = '42501';
	end if;

	if jsonb_typeof(p_document) <> 'object'
		or octet_length(p_document::text) > 15728640
		or p_document->>'id' <> p_note_id::text then
		raise exception 'invalid_document' using errcode = '22023';
	end if;

	v_request_hash := pg_catalog.md5(p_expected_revision::text || ':' || p_document::text);
	perform pg_catalog.pg_advisory_xact_lock(
		pg_catalog.hashtextextended(p_note_id::text || ':' || p_idempotency_key::text, 0)
	);

	select * into v_existing
	from public.note_save_requests
	where note_id = p_note_id and idempotency_key = p_idempotency_key;

	if found then
		if v_existing.request_hash <> v_request_hash then
			raise exception 'idempotency_key_reused' using errcode = '22023';
		end if;
		return query select v_existing.result_revision;
		return;
	end if;

	update public.notes
	set document = p_document,
		revision = public.notes.revision + 1
	where id = p_note_id
		and public.notes.revision = p_expected_revision
		and owner_id = v_actor
		and deleted_at is null
	returning public.notes.revision into v_revision;

	if v_revision is null then
		raise exception 'revision_conflict' using errcode = '40001';
	end if;

	insert into public.note_versions (note_id, revision, kind, document)
	values (p_note_id, v_revision, 'autosave', p_document);

	insert into public.note_save_requests (note_id, idempotency_key, request_hash, result_revision)
	values (p_note_id, p_idempotency_key, v_request_hash, v_revision);

	delete from public.note_versions
	where id in (
		select id
		from public.note_versions
		where note_id = p_note_id and kind = 'autosave'
		order by created_at desc
		offset 100
	);

	delete from public.note_save_requests
	where note_id = p_note_id
		and created_at < now() - interval '7 days';

	return query select v_revision;
end;
$$;

create or replace function public.publish_note(
	p_note_id uuid,
	p_expected_revision bigint,
	p_publication_id uuid,
	p_published_document jsonb,
	p_asset_ids uuid[]
)
returns table (publication_id uuid, published_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_actor uuid := auth.uid();
	v_note public.notes%rowtype;
	v_published_at timestamptz := now();
begin
	perform public.require_recent_note_session();

	select * into v_note
	from public.notes
	where id = p_note_id and deleted_at is null
	for update;

	if not found
		or v_actor is null
		or v_note.owner_id <> v_actor
		or not exists (select 1 from public.note_owners where user_id = v_actor) then
		raise exception 'not_authorized' using errcode = '42501';
	end if;

	if v_note.revision <> p_expected_revision then
		raise exception 'revision_conflict' using errcode = '40001';
	end if;

	if jsonb_typeof(p_published_document) <> 'object'
		or octet_length(p_published_document::text) > 15728640
		or p_published_document->>'id' <> p_note_id::text then
		raise exception 'invalid_published_document' using errcode = '22023';
	end if;

	if exists (
		select 1
		from unnest(coalesce(p_asset_ids, '{}'::uuid[])) requested(id)
		left join public.note_assets a on a.id = requested.id and a.note_id = p_note_id
		where a.id is null
	) then
		raise exception 'invalid_publication_asset' using errcode = '22023';
	end if;

	if exists (
		select 1
		from public.note_publications as conflicting_publication
		where conflicting_publication.slug = v_note.slug
			and conflicting_publication.note_id <> p_note_id
			and conflicting_publication.revoked_at is null
	) then
		raise exception 'publication_slug_conflict' using errcode = '23505';
	end if;

	update public.note_publications
	set revoked_at = v_published_at
	where note_id = p_note_id and revoked_at is null;

	insert into public.note_publications (
		id, note_id, source_revision, title, slug, excerpt, tags, category, cover_image_url,
		document, transcript, seo_title, seo_description, downloads_enabled,
		activated_at, published_at
	)
	values (
		p_publication_id, v_note.id, v_note.revision, v_note.title, v_note.slug, v_note.excerpt,
		v_note.tags, v_note.category, v_note.cover_image_url, p_published_document,
		v_note.transcript, v_note.seo_title, v_note.seo_description, v_note.downloads_enabled,
		v_published_at, v_published_at
	);

	insert into public.note_publication_assets (publication_id, asset_id, note_id)
	select p_publication_id, requested.id, p_note_id
	from (
		select distinct id
		from unnest(coalesce(p_asset_ids, '{}'::uuid[])) ids(id)
	) requested;

	insert into public.note_versions (note_id, revision, kind, document, metadata)
	values (
		v_note.id,
		v_note.revision,
		'publish',
		v_note.document,
		jsonb_build_object(
			'publicationId', p_publication_id,
			'title', v_note.title,
			'slug', v_note.slug,
			'excerpt', v_note.excerpt,
			'tags', v_note.tags,
			'category', v_note.category
		)
	);

	update public.notes
	set status = 'published',
		scheduled_for = null,
		published_at = coalesce(public.notes.published_at, v_published_at)
	where id = p_note_id;

	return query select p_publication_id, v_published_at;
end;
$$;

create or replace function public.restore_note_version(
	p_note_id uuid,
	p_version_id uuid,
	p_expected_revision bigint
)
returns table (revision bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_actor uuid := auth.uid();
	v_note public.notes%rowtype;
	v_version public.note_versions%rowtype;
	v_revision bigint;
begin
	perform public.require_recent_note_session();

	select * into v_note
	from public.notes
	where id = p_note_id and deleted_at is null
	for update;

	if not found
		or v_actor is null
		or v_note.owner_id <> v_actor
		or not exists (select 1 from public.note_owners where user_id = v_actor) then
		raise exception 'not_authorized' using errcode = '42501';
	end if;
	if v_note.revision <> p_expected_revision then
		raise exception 'revision_conflict' using errcode = '40001';
	end if;

	select * into v_version
	from public.note_versions
	where id = p_version_id and note_id = p_note_id;
	if not found then
		raise exception 'version_not_found' using errcode = 'P0002';
	end if;
	if v_version.document->>'id' <> p_note_id::text then
		raise exception 'invalid_version_document' using errcode = '22023';
	end if;

	update public.notes
	set document = v_version.document,
		revision = public.notes.revision + 1
	where id = p_note_id
	returning public.notes.revision into v_revision;

	insert into public.note_versions (note_id, revision, kind, document, metadata)
	values (
		p_note_id,
		v_revision,
		'restore',
		v_version.document,
		jsonb_build_object('restoredFromVersionId', p_version_id)
	);

	return query select v_revision;
end;
$$;

create or replace function public.schedule_note(
	p_note_id uuid,
	p_expected_revision bigint,
	p_publication_id uuid,
	p_published_document jsonb,
	p_asset_ids uuid[],
	p_scheduled_for timestamptz
)
returns table (publication_id uuid, scheduled_for timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_actor uuid := auth.uid();
	v_note public.notes%rowtype;
begin
	perform public.require_recent_note_session();

	if p_scheduled_for is null or p_scheduled_for <= now() then
		raise exception 'schedule_must_be_in_the_future' using errcode = '22023';
	end if;

	select * into v_note
	from public.notes
	where id = p_note_id and deleted_at is null
	for update;

	if not found
		or v_actor is null
		or v_note.owner_id <> v_actor
		or not exists (select 1 from public.note_owners where user_id = v_actor) then
		raise exception 'not_authorized' using errcode = '42501';
	end if;

	if v_note.revision <> p_expected_revision then
		raise exception 'revision_conflict' using errcode = '40001';
	end if;

	if jsonb_typeof(p_published_document) <> 'object'
		or octet_length(p_published_document::text) > 15728640
		or p_published_document->>'id' <> p_note_id::text then
		raise exception 'invalid_published_document' using errcode = '22023';
	end if;

	if exists (
		select 1
		from unnest(coalesce(p_asset_ids, '{}'::uuid[])) requested(id)
		left join public.note_assets a on a.id = requested.id and a.note_id = p_note_id
		where a.id is null
	) then
		raise exception 'invalid_publication_asset' using errcode = '22023';
	end if;

	if exists (
		select 1
		from public.note_publications as conflicting_publication
		where conflicting_publication.slug = v_note.slug
			and conflicting_publication.note_id <> p_note_id
			and conflicting_publication.revoked_at is null
	) then
		raise exception 'publication_slug_conflict' using errcode = '23505';
	end if;

	update public.note_publications
	set revoked_at = now()
	where note_id = p_note_id
		and activated_at is null
		and revoked_at is null;

	insert into public.note_publications (
		id, note_id, source_revision, title, slug, excerpt, tags, category, cover_image_url,
		document, transcript, seo_title, seo_description, downloads_enabled, scheduled_for
	)
	values (
		p_publication_id, v_note.id, v_note.revision, v_note.title, v_note.slug, v_note.excerpt,
		v_note.tags, v_note.category, v_note.cover_image_url, p_published_document,
		v_note.transcript, v_note.seo_title, v_note.seo_description, v_note.downloads_enabled,
		p_scheduled_for
	);

	insert into public.note_publication_assets (publication_id, asset_id, note_id)
	select p_publication_id, requested.id, p_note_id
	from (
		select distinct id
		from unnest(coalesce(p_asset_ids, '{}'::uuid[])) ids(id)
	) requested;

	insert into public.note_versions (note_id, revision, kind, document, metadata)
	values (
		v_note.id,
		v_note.revision,
		'schedule',
		v_note.document,
		jsonb_build_object(
			'publicationId', p_publication_id,
			'scheduledFor', p_scheduled_for,
			'title', v_note.title,
			'slug', v_note.slug
		)
	);

	update public.notes
	set status = 'scheduled', scheduled_for = p_scheduled_for
	where id = p_note_id;

	return query select p_publication_id, p_scheduled_for;
end;
$$;

create or replace function public.unpublish_note(p_note_id uuid, p_next_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_actor uuid := auth.uid();
begin
	perform public.require_recent_note_session();

	if p_next_status not in ('draft', 'private', 'archived') then
		raise exception 'invalid_unpublish_state' using errcode = '22023';
	end if;

	if v_actor is null or not exists (
		select 1
		from public.notes n
		join public.note_owners o on o.user_id = n.owner_id
		where n.id = p_note_id
			and n.owner_id = v_actor
			and n.deleted_at is null
		for update
	) then
		raise exception 'not_authorized' using errcode = '42501';
	end if;

	update public.note_publications
	set revoked_at = now()
	where note_id = p_note_id and revoked_at is null;

	update public.notes
	set status = p_next_status, scheduled_for = null
	where id = p_note_id and owner_id = v_actor;
end;
$$;

create or replace function public.archive_note(p_note_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_actor uuid := auth.uid();
	v_now timestamptz := now();
begin
	perform public.require_recent_note_session();

	if v_actor is null or not exists (
		select 1
		from public.notes n
		join public.note_owners o on o.user_id = n.owner_id
		where n.id = p_note_id
			and n.owner_id = v_actor
			and n.deleted_at is null
		for update
	) then
		raise exception 'not_authorized' using errcode = '42501';
	end if;

	update public.note_publications
	set revoked_at = v_now
	where note_id = p_note_id and revoked_at is null;

	update public.notes
	set status = 'archived', scheduled_for = null
	where id = p_note_id and owner_id = v_actor;
end;
$$;

create or replace function public.delete_note(p_note_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_actor uuid := auth.uid();
begin
	perform public.require_recent_note_session();

	if v_actor is null or not exists (
		select 1
		from public.notes n
		join public.note_owners o on o.user_id = n.owner_id
		where n.id = p_note_id and n.owner_id = v_actor
		for update
	) then
		raise exception 'not_authorized' using errcode = '42501';
	end if;

	delete from public.note_publication_assets where note_id = p_note_id;
	delete from public.notes where id = p_note_id and owner_id = v_actor;
end;
$$;

create or replace function public.activate_due_note_publications(p_limit integer default 25)
returns table (publication_id uuid, note_id uuid, slug text, activated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_candidate public.note_publications%rowtype;
	v_activated_at timestamptz;
begin
	if coalesce(auth.role(), '') <> 'service_role'
		and session_user not in ('postgres', 'supabase_admin') then
		raise exception 'not_authorized' using errcode = '42501';
	end if;

	for v_candidate in
		select candidate.*
		from public.note_publications as candidate
		where candidate.activated_at is null
			and candidate.revoked_at is null
			and candidate.scheduled_for <= now()
		order by candidate.scheduled_for, candidate.id
		for update skip locked
		limit greatest(1, least(coalesce(p_limit, 25), 100))
	loop
		v_activated_at := now();

		if exists (
			select 1
			from public.notes as candidate_note
			where candidate_note.id = v_candidate.note_id
				and candidate_note.deleted_at is not null
		) then
			update public.note_publications as candidate_publication
			set revoked_at = v_activated_at, activation_error = 'note_archived'
			where candidate_publication.id = v_candidate.id;
			continue;
		end if;

		begin
			if exists (
				select 1
				from public.note_publications as conflicting_publication
				where conflicting_publication.slug = v_candidate.slug
					and conflicting_publication.note_id <> v_candidate.note_id
					and conflicting_publication.activated_at is not null
					and conflicting_publication.revoked_at is null
			) then
				raise exception 'publication_slug_conflict' using errcode = '23505';
			end if;

			update public.note_publications as previous_publication
			set revoked_at = v_activated_at
			where previous_publication.note_id = v_candidate.note_id
				and previous_publication.id <> v_candidate.id
				and previous_publication.activated_at is not null
				and previous_publication.revoked_at is null;

			update public.note_publications as due_publication
			set activated_at = v_activated_at, published_at = v_activated_at
			where due_publication.id = v_candidate.id;

			update public.notes as source_note
			set status = 'published',
				scheduled_for = null,
				published_at = coalesce(source_note.published_at, v_activated_at)
			where source_note.id = v_candidate.note_id;

			publication_id := v_candidate.id;
			note_id := v_candidate.note_id;
			slug := v_candidate.slug;
			activated_at := v_activated_at;
			return next;
		exception
			when others then
				update public.note_publications as failed_publication
				set revoked_at = v_activated_at,
					activation_error = left(
						case
							when sqlstate = '23505' then 'publication_slug_conflict'
							else 'activation_failed:' || sqlstate
						end,
						200
					)
				where failed_publication.id = v_candidate.id;

				update public.notes as failed_note
				set status = 'draft', scheduled_for = null
				where failed_note.id = v_candidate.note_id
					and failed_note.status = 'scheduled';
		end;
	end loop;
end;
$$;

create or replace function public.consume_note_auth_rate_limit(
	p_key_hash text,
	p_limit integer,
	p_window_seconds integer,
	p_block_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_now timestamptz := now();
	v_row public.note_auth_rate_limits%rowtype;
	v_limit integer := greatest(1, least(coalesce(p_limit, 1), 1000));
	v_window interval := greatest(1, least(coalesce(p_window_seconds, 60), 86400)) * interval '1 second';
	v_block interval := greatest(1, least(coalesce(p_block_seconds, 60), 604800)) * interval '1 second';
	v_attempts integer;
begin
	if coalesce(auth.role(), '') <> 'service_role' then
		raise exception 'not_authorized' using errcode = '42501';
	end if;
	if p_key_hash !~ '^[0-9a-f]{64}$' then
		raise exception 'invalid_rate_limit_key' using errcode = '22023';
	end if;

	perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_key_hash, 0));
	select * into v_row
	from public.note_auth_rate_limits
	where key_hash = p_key_hash
	for update;

	if found and v_row.blocked_until is not null and v_row.blocked_until > v_now then
		return false;
	end if;

	if not found or v_row.window_started_at + v_window <= v_now then
		insert into public.note_auth_rate_limits (
			key_hash, window_started_at, attempts, blocked_until, updated_at
		)
		values (p_key_hash, v_now, 1, null, v_now)
		on conflict (key_hash) do update set
			window_started_at = excluded.window_started_at,
			attempts = excluded.attempts,
			blocked_until = excluded.blocked_until,
			updated_at = excluded.updated_at;
		return true;
	end if;

	v_attempts := v_row.attempts + 1;
	update public.note_auth_rate_limits
	set attempts = v_attempts,
		blocked_until = case when v_attempts > v_limit then v_now + v_block else null end,
		updated_at = v_now
	where key_hash = p_key_hash;

	delete from public.note_auth_rate_limits
	where updated_at < v_now - interval '7 days';

	return v_attempts <= v_limit;
end;
$$;

create or replace function public.clear_note_auth_rate_limit(p_key_hash text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
	if coalesce(auth.role(), '') <> 'service_role' then
		raise exception 'not_authorized' using errcode = '42501';
	end if;
	delete from public.note_auth_rate_limits where key_hash = p_key_hash;
end;
$$;

alter table public.note_owners enable row level security;
alter table public.notes enable row level security;
alter table public.note_versions enable row level security;
alter table public.note_save_requests enable row level security;
alter table public.note_auth_rate_limits enable row level security;
alter table public.note_assets enable row level security;
alter table public.note_publications enable row level security;
alter table public.note_publication_assets enable row level security;

drop policy if exists "Owner membership is private" on public.note_owners;
create policy "Owner membership is private"
	on public.note_owners
	for select
	to authenticated
	using (user_id = auth.uid());

drop policy if exists "Owner manages notes" on public.notes;
create policy "Owner manages notes"
	on public.notes
	for all
	to authenticated
	using (
		owner_id = auth.uid()
		and exists (select 1 from public.note_owners where user_id = auth.uid())
	)
	with check (
		owner_id = auth.uid()
		and exists (select 1 from public.note_owners where user_id = auth.uid())
	);

drop policy if exists "Owner reads versions" on public.note_versions;
create policy "Owner reads versions"
	on public.note_versions
	for select
	to authenticated
	using (
		exists (
			select 1 from public.notes
			where notes.id = note_versions.note_id and notes.owner_id = auth.uid()
		)
	);

drop policy if exists "Owner manages note assets" on public.note_assets;
create policy "Owner manages note assets"
	on public.note_assets
	for all
	to authenticated
	using (
		owner_id = auth.uid()
		and exists (select 1 from public.note_owners where user_id = auth.uid())
	)
	with check (
		owner_id = auth.uid()
		and exists (
			select 1 from public.notes
			where notes.id = note_assets.note_id
				and notes.owner_id = auth.uid()
				and notes.deleted_at is null
		)
	);

drop policy if exists "Published snapshots are publicly readable" on public.note_publications;
create policy "Published snapshots are publicly readable"
	on public.note_publications
	for select
	to anon, authenticated
	using (activated_at is not null and revoked_at is null);

drop policy if exists "Owner reads all publication snapshots" on public.note_publications;
create policy "Owner reads all publication snapshots"
	on public.note_publications
	for select
	to authenticated
	using (
		exists (
			select 1 from public.notes
			where notes.id = note_publications.note_id and notes.owner_id = auth.uid()
		)
	);

drop policy if exists "Owner reads publication asset references" on public.note_publication_assets;
create policy "Owner reads publication asset references"
	on public.note_publication_assets
	for select
	to authenticated
	using (
		exists (
			select 1 from public.notes
			where notes.id = note_publication_assets.note_id and notes.owner_id = auth.uid()
		)
	);

revoke all on
	public.note_owners,
	public.notes,
	public.note_versions,
	public.note_save_requests,
	public.note_auth_rate_limits,
	public.note_assets,
	public.note_publications,
	public.note_publication_assets
from public, anon, authenticated;

grant select on public.note_publications to anon, authenticated;
grant select, insert on public.notes to authenticated;
grant update (
	title, slug, excerpt, tags, category, cover_image_url, transcript,
	seo_title, seo_description, downloads_enabled
) on public.notes to authenticated;
grant select on public.note_versions to authenticated;
grant select, insert, delete on public.note_assets to authenticated;
grant select on public.note_publication_assets to authenticated;
grant select on public.note_owners to authenticated;

revoke execute on function public.save_note_document(uuid, bigint, jsonb, uuid)
	from public, anon;
revoke execute on function public.note_session_is_fresh(integer)
	from public, anon;
revoke execute on function public.require_recent_note_session()
	from public, anon, authenticated;
revoke execute on function public.publish_note(uuid, bigint, uuid, jsonb, uuid[])
	from public, anon;
revoke execute on function public.restore_note_version(uuid, uuid, bigint)
	from public, anon;
revoke execute on function public.schedule_note(uuid, bigint, uuid, jsonb, uuid[], timestamptz)
	from public, anon;
revoke execute on function public.unpublish_note(uuid, text)
	from public, anon;
revoke execute on function public.archive_note(uuid)
	from public, anon;
revoke execute on function public.delete_note(uuid)
	from public, anon;
revoke execute on function public.activate_due_note_publications(integer)
	from public, anon, authenticated;
revoke execute on function public.consume_note_auth_rate_limit(text, integer, integer, integer)
	from public, anon, authenticated;
revoke execute on function public.clear_note_auth_rate_limit(text)
	from public, anon, authenticated;

grant execute on function public.save_note_document(uuid, bigint, jsonb, uuid)
	to authenticated;
grant execute on function public.note_session_is_fresh(integer)
	to authenticated;
grant execute on function public.publish_note(uuid, bigint, uuid, jsonb, uuid[])
	to authenticated;
grant execute on function public.restore_note_version(uuid, uuid, bigint)
	to authenticated;
grant execute on function public.schedule_note(uuid, bigint, uuid, jsonb, uuid[], timestamptz)
	to authenticated;
grant execute on function public.unpublish_note(uuid, text)
	to authenticated;
grant execute on function public.archive_note(uuid)
	to authenticated;
grant execute on function public.delete_note(uuid)
	to authenticated;
grant execute on function public.activate_due_note_publications(integer)
	to service_role;
grant execute on function public.consume_note_auth_rate_limit(text, integer, integer, integer)
	to service_role;
grant execute on function public.clear_note_auth_rate_limit(text)
	to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('notes-private', 'notes-private', false, 2097152, array['image/webp'])
on conflict (id) do update set
	public = excluded.public,
	file_size_limit = excluded.file_size_limit,
	allowed_mime_types = excluded.allowed_mime_types;

-- Defensive cleanup if an earlier development migration created a public derivatives bucket.
update storage.buckets set public = false where id = 'notes-public';
drop policy if exists "Owner writes private note images" on storage.objects;
drop policy if exists "Owner writes published note images" on storage.objects;

drop policy if exists "Owner reads private note images" on storage.objects;
create policy "Owner reads private note images"
	on storage.objects for select to authenticated
	using (
		bucket_id = 'notes-private'
		and (storage.foldername(name))[1] = auth.uid()::text
		and exists (select 1 from public.note_owners where user_id = auth.uid())
	);

drop policy if exists "Owner inserts private note images" on storage.objects;
create policy "Owner inserts private note images"
	on storage.objects for insert to authenticated
	with check (
		bucket_id = 'notes-private'
		and (storage.foldername(name))[1] = auth.uid()::text
		and exists (select 1 from public.note_owners where user_id = auth.uid())
	);

drop policy if exists "Owner deletes private note images" on storage.objects;
create policy "Owner deletes private note images"
	on storage.objects for delete to authenticated
	using (
		bucket_id = 'notes-private'
		and (storage.foldername(name))[1] = auth.uid()::text
		and exists (select 1 from public.note_owners where user_id = auth.uid())
	);

-- After creating the single Supabase Auth user, seed the immutable owner ID once:
-- insert into public.note_owners (user_id) values ('YOUR-AUTH-USER-UUID');
