-- Private, expiring visitor workspaces for the simulated enquiry prototype.
-- Data and the worker schedule are deliberately not seeded by this migration.
begin;

create table public.enquiry_demo_workspaces (
  session_hash text primary key check (session_hash ~ '^[0-9a-f]{64}$'),
  scope_key text not null unique check (scope_key ~ '^[0-9a-f]{64}$'),
  revision bigint not null default 1 check (revision > 0),
  state jsonb not null check (jsonb_typeof(state) = 'object'),
  state_bytes integer not null check (state_bytes > 0 and state_bytes <= 655360),
  created_at timestamptz not null default now(),
  touched_at timestamptz not null default now(),
  expires_at timestamptz not null,
  staff_until timestamptz,
  next_due_at timestamptz,
  check (expires_at > created_at and expires_at <= created_at + interval '24 hours 2 minutes'),
  check (staff_until is null or staff_until <= expires_at),
  check (state_bytes = octet_length(state::text))
);
create index enquiry_demo_due on public.enquiry_demo_workspaces(next_due_at) where next_due_at is not null;
create index enquiry_demo_expiry on public.enquiry_demo_workspaces(expires_at);

create table public.enquiry_demo_admission (
  bucket_start timestamptz not null,
  admission_hash text not null check (admission_hash ~ '^[0-9a-f]{64}$'),
  attempts integer not null check (attempts between 1 and 8),
  primary key (bucket_start, admission_hash)
);

alter table public.enquiry_demo_workspaces enable row level security;
alter table public.enquiry_demo_workspaces force row level security;
alter table public.enquiry_demo_admission enable row level security;
alter table public.enquiry_demo_admission force row level security;
revoke all on public.enquiry_demo_workspaces, public.enquiry_demo_admission from public, anon, authenticated, service_role;

create function public.enquiry_demo_workspace_json(p_row public.enquiry_demo_workspaces)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'sessionHash',p_row.session_hash,'scopeKey',p_row.scope_key,'version',p_row.revision,
    'state',p_row.state,'expiresAt',p_row.expires_at,'staffUntil',p_row.staff_until,
    'nextDueAt',p_row.next_due_at
  );
$$;
revoke all on function public.enquiry_demo_workspace_json(public.enquiry_demo_workspaces) from public, anon, authenticated, service_role;

create function public.enquiry_demo_create(
  p_session_hash text, p_scope_key text, p_expires_at timestamptz,
  p_staff_until timestamptz, p_next_due_at timestamptz, p_state jsonb,
  p_admission_key text
) returns jsonb language plpgsql security definer set search_path = '' set lock_timeout = '1500ms' as $$
declare
  v_row public.enquiry_demo_workspaces;
  v_bytes integer := octet_length(p_state::text);
  v_bucket timestamptz := date_trunc('hour',now());
  v_count integer;
begin
  if p_session_hash is null or p_session_hash !~ '^[0-9a-f]{64}$'
     or p_admission_key is null or p_admission_key !~ '^[0-9a-f]{64}$'
     or p_scope_key is null or p_scope_key !~ '^[0-9a-f]{64}$' or p_expires_at is null or p_expires_at <= now()
     or p_expires_at > now() + interval '24 hours 2 minutes'
     or p_staff_until is not null
     or p_state is null or jsonb_typeof(p_state) <> 'object'
     or p_state->>'schemaVersion' is distinct from '1' or jsonb_typeof(p_state->'tables') is distinct from 'object'
     or v_bytes is null or v_bytes > 655360 then
    raise exception 'Invalid demonstration workspace' using errcode = '22023';
  end if;
  -- One shared quota lock precedes row locks for all writes. Quotas cannot race
  -- across different visitors or separate function instances.
  perform pg_advisory_xact_lock(17926,1);
  select count(*) into v_count from public.enquiry_demo_workspaces where expires_at > now();
  if v_count >= 200 then return null; end if;
  if (select coalesce(sum(state_bytes),0) from public.enquiry_demo_workspaces) + v_bytes > 33554432 then return null; end if;
  if (select coalesce(sum(attempts),0) from public.enquiry_demo_admission where bucket_start = v_bucket) >= 120 then return null; end if;
  if (select coalesce(max(attempts),0) from public.enquiry_demo_admission where bucket_start=v_bucket and admission_hash=p_admission_key) >= 8 then return null; end if;
  insert into public.enquiry_demo_admission(bucket_start,admission_hash,attempts)
    values(v_bucket,p_admission_key,1)
    on conflict(bucket_start,admission_hash) do update set attempts=public.enquiry_demo_admission.attempts+1;
  insert into public.enquiry_demo_workspaces(session_hash,scope_key,state,state_bytes,expires_at,staff_until,next_due_at)
    values(p_session_hash,p_scope_key,p_state,v_bytes,least(p_expires_at,now()+interval '24 hours'),null,p_next_due_at)
    returning * into v_row;
  return public.enquiry_demo_workspace_json(v_row);
end;
$$;

create function public.enquiry_demo_get(p_session_hash text)
returns jsonb language sql security definer set search_path = '' as $$
  select public.enquiry_demo_workspace_json(w) from public.enquiry_demo_workspaces w
  where w.session_hash=p_session_hash and w.expires_at > now();
$$;

create function public.enquiry_demo_cas(
  p_session_hash text,p_version bigint,p_staff_until timestamptz,
  p_next_due_at timestamptz,p_state jsonb
) returns jsonb language plpgsql security definer set search_path = '' set lock_timeout = '1500ms' as $$
declare
  v_row public.enquiry_demo_workspaces;
  v_bytes integer := octet_length(p_state::text);
begin
  if p_state is null or jsonb_typeof(p_state) <> 'object'
     or p_state->>'schemaVersion' is distinct from '1' or jsonb_typeof(p_state->'tables') is distinct from 'object'
     or v_bytes is null or v_bytes > 655360 or p_version is null or p_version < 1 then
    raise exception 'Invalid demonstration state' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(17926,1);
  select * into v_row from public.enquiry_demo_workspaces
    where session_hash=p_session_hash and revision=p_version and expires_at > now() for update;
  if not found then return null; end if;
  if p_staff_until is not null and (p_staff_until > v_row.expires_at or p_staff_until > now()+interval '8 hours 2 minutes') then
    raise exception 'Invalid demonstration staff expiry' using errcode = '22023';
  end if;
  if (select coalesce(sum(state_bytes),0) from public.enquiry_demo_workspaces)-v_row.state_bytes+v_bytes > 33554432 then
    raise exception 'Demonstration capacity reached' using errcode = '54000';
  end if;
  update public.enquiry_demo_workspaces set state=p_state,state_bytes=v_bytes,
    revision=revision+1,staff_until=p_staff_until,next_due_at=p_next_due_at,touched_at=now()
    where session_hash=p_session_hash returning * into v_row;
  return public.enquiry_demo_workspace_json(v_row);
end;
$$;

create function public.enquiry_demo_due(p_limit integer default 10)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if p_limit is null or p_limit < 1 or p_limit > 20 then
    raise exception 'Invalid demonstration worker batch' using errcode='22023';
  end if;
  return (select coalesce(jsonb_agg(public.enquiry_demo_workspace_json(w)),'[]'::jsonb)
    from (select * from public.enquiry_demo_workspaces where expires_at > now()
      and next_due_at <= now() order by next_due_at,session_hash limit p_limit) w);
end;
$$;

create function public.enquiry_demo_cleanup()
returns integer language plpgsql security definer set search_path = '' set lock_timeout = '1500ms' as $$
declare v_deleted integer;
begin
  perform pg_advisory_xact_lock(17926,1);
  delete from public.enquiry_demo_workspaces where session_hash in
    (select session_hash from public.enquiry_demo_workspaces where expires_at <= now() order by expires_at limit 200);
  get diagnostics v_deleted = row_count;
  delete from public.enquiry_demo_admission where bucket_start < date_trunc('hour',now())-interval '2 hours';
  return v_deleted;
end;
$$;

revoke all on function public.enquiry_demo_create(text,text,timestamptz,timestamptz,timestamptz,jsonb,text) from public,anon,authenticated;
revoke all on function public.enquiry_demo_get(text) from public,anon,authenticated;
revoke all on function public.enquiry_demo_cas(text,bigint,timestamptz,timestamptz,jsonb) from public,anon,authenticated;
revoke all on function public.enquiry_demo_due(integer) from public,anon,authenticated;
revoke all on function public.enquiry_demo_cleanup() from public,anon,authenticated;
grant execute on function public.enquiry_demo_create(text,text,timestamptz,timestamptz,timestamptz,jsonb,text) to service_role;
grant execute on function public.enquiry_demo_get(text) to service_role;
grant execute on function public.enquiry_demo_cas(text,bigint,timestamptz,timestamptz,jsonb) to service_role;
grant execute on function public.enquiry_demo_due(integer) to service_role;
grant execute on function public.enquiry_demo_cleanup() to service_role;

notify pgrst, 'reload schema';
commit;
