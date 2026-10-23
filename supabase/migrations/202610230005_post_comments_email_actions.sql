-- Inbox moderation capabilities for new version-three notifications only.
-- Deploy the compatible application first. Historical payloads, keys and jobs stay unchanged.
begin;

alter table public.post_comment_notifications drop constraint post_comment_notifications_content_version_check;
alter table public.post_comment_notifications add constraint post_comment_notifications_content_version_check
  check (content_version in (1, 2, 3));
alter table public.post_comment_notifications alter column content_version set default 3;

alter table public.post_comment_history drop constraint post_comment_history_action_check;
alter table public.post_comment_history add constraint post_comment_history_action_check
  check (action in ('submitted', 'replied', 'moderated', 'read', 'email_moderated'));

-- Raw capabilities exist only to render byte-identical unsent retries. Successful delivery,
-- consumption or revocation erases both; hashes still support one-use lookup and replay checks.
create table public.post_comment_email_actions (
  comment_id uuid primary key references public.post_comments(id) on delete restrict,
  approve_token text check (approve_token is null or approve_token ~ '^[a-f0-9]{64}$'),
  reject_token text check (reject_token is null or reject_token ~ '^[a-f0-9]{64}$'),
  approve_token_hash text not null unique check (approve_token_hash ~ '^[a-f0-9]{64}$'),
  reject_token_hash text not null unique check (reject_token_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_action text check (used_action in ('approve', 'reject')),
  revoked_at timestamptz,
  check ((approve_token is null) = (reject_token is null)),
  check (approve_token is null or approve_token <> reject_token),
  check (approve_token_hash <> reject_token_hash),
  check ((used_at is null) = (used_action is null)),
  check (used_at is null or revoked_at is null)
);
alter table public.post_comment_email_actions enable row level security;
alter table public.post_comment_email_actions force row level security;
revoke all on public.post_comment_email_actions from public, anon, authenticated, service_role;

create or replace function public.enqueue_post_comment_notification()
returns trigger language plpgsql security definer set search_path = ''
set statement_timeout = '3s' set lock_timeout = '1500ms'
as $$
declare
  v_created_at timestamptz;
  v_approve text;
  v_reject text;
begin
  if not new.is_author and new.status = 'pending' then
    insert into public.post_comment_notifications (comment_id) values (new.id)
      returning created_at into v_created_at;
    -- Each pair has 244 random UUID bits, encoded without punctuation. No extra extension.
    v_approve := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
    v_reject := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
    insert into public.post_comment_email_actions (
      comment_id, approve_token, reject_token, approve_token_hash, reject_token_hash, expires_at
    ) values (
      new.id, v_approve, v_reject,
      encode(sha256(convert_to(v_approve, 'UTF8')), 'hex'),
      encode(sha256(convert_to(v_reject, 'UTF8')), 'hex'),
      v_created_at + interval '7 days'
    );
  end if;
  return new;
end;
$$;

-- Callers already hold the comment row. All mutations then lock outbox before actions;
-- the delivery acknowledgement and bounded claim cleanup follow the same order.
create function public.revoke_post_comment_email_actions(p_comment_id uuid)
returns void language plpgsql security definer set search_path = ''
set statement_timeout = '3s' set lock_timeout = '1500ms'
as $$
declare v_now timestamptz := clock_timestamp();
begin
  perform 1 from public.post_comment_notifications where comment_id = p_comment_id for update;
  update public.post_comment_notifications set cancelled_at = v_now,
    lease_token = null, leased_until = null
  where comment_id = p_comment_id and content_version = 3
    and sent_at is null and cancelled_at is null;
  update public.post_comment_email_actions set
    revoked_at = coalesce(revoked_at, v_now), approve_token = null, reject_token = null
  where comment_id = p_comment_id and used_at is null;
end;
$$;
revoke all on function public.revoke_post_comment_email_actions(uuid) from public, anon, authenticated, service_role;

create function public.revoke_changed_post_comment_email_actions()
returns trigger language plpgsql security definer set search_path = ''
set statement_timeout = '3s' set lock_timeout = '1500ms'
as $$
begin
  if new.status is distinct from old.status then
    perform public.revoke_post_comment_email_actions(new.id);
  end if;
  return new;
end;
$$;
revoke all on function public.revoke_changed_post_comment_email_actions() from public, anon, authenticated, service_role;
create trigger post_comment_email_actions_before_status_update
before update of status on public.post_comments for each row
execute function public.revoke_changed_post_comment_email_actions();

create or replace function public.moderate_post_comment(p_id uuid, p_status text default null, p_mark_read boolean default false)
returns text language plpgsql security definer set search_path = ''
set statement_timeout = '3s' set lock_timeout = '1500ms'
as $$
declare
  v_actor uuid;
  v_comment public.post_comments%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  v_actor := public.require_post_comments_owner();
  if p_id is null or (p_status is not null and p_status not in ('pending','approved','rejected','hidden'))
    or p_mark_read is null or (p_status is null and not p_mark_read)
  then raise exception 'invalid_moderation' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(849223, 1);
  select * into v_comment from public.post_comments where id = p_id for update;
  if not found then return 'not_found'; end if;
  -- Explicit board status intent revokes both links even if that status is unchanged.
  -- Mark-read-only remains harmless to an outstanding approval link.
  if p_status is not null then perform public.revoke_post_comment_email_actions(p_id); end if;
  if p_status is not null and p_status <> v_comment.status then
    insert into public.post_comment_history (comment_id,actor_id,action,from_status,to_status)
    values (p_id,v_actor,'moderated',v_comment.status,p_status);
  end if;
  if p_mark_read and v_comment.read_at is null then
    insert into public.post_comment_history (comment_id,actor_id,action,from_status,to_status)
    values (p_id,v_actor,'read',v_comment.status,coalesce(p_status,v_comment.status));
  end if;
  update public.post_comments set status = coalesce(p_status,status),
    read_at = case when p_mark_read then coalesce(read_at,v_now) else read_at end,
    updated_at = v_now where id = p_id;
  return 'updated';
end;
$$;

create or replace function public.claim_post_comment_notifications(p_submission_id uuid default null, p_limit integer default 1)
returns jsonb language plpgsql security definer set search_path = ''
set statement_timeout = '3s' set lock_timeout = '1500ms'
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_result jsonb;
begin
  if p_limit is null or p_limit not between 1 and 5
  then raise exception 'invalid_notification_claim' using errcode = '22023'; end if;

  -- Expiry alone does not discard a durable alert: late retries retain original links,
  -- fixed expiry and the board fallback. Already moderated/used/revoked jobs are obsolete.
  with obsolete as (
    select n.comment_id from public.post_comment_notifications n
    join public.post_comments c on c.id = n.comment_id
    left join public.post_comment_email_actions a on a.comment_id = n.comment_id
    where n.sent_at is null and n.cancelled_at is null and n.due_at <= v_now
      and (n.leased_until is null or n.leased_until <= v_now)
      and (p_submission_id is null or c.submission_id = p_submission_id)
      and (c.status <> 'pending' or c.is_author or (n.content_version = 3 and
        (a.comment_id is null or a.used_at is not null or a.revoked_at is not null
          or a.approve_token is null or a.reject_token is null)))
    order by n.due_at, n.created_at, n.comment_id
    limit p_limit for update of n skip locked
  ), cancelled as (
    update public.post_comment_notifications n
    set cancelled_at = v_now, lease_token = null, leased_until = null
    from obsolete o where n.comment_id = o.comment_id returning n.comment_id
  )
  update public.post_comment_email_actions a set
    revoked_at = case when a.used_at is null then coalesce(a.revoked_at, v_now) else a.revoked_at end,
    approve_token = null, reject_token = null
  from cancelled n where a.comment_id = n.comment_id;

  with candidates as (
    select n.comment_id from public.post_comment_notifications n
    join public.post_comments c on c.id = n.comment_id
    left join public.post_comment_email_actions a on a.comment_id = n.comment_id
    where n.sent_at is null and n.cancelled_at is null and n.due_at <= v_now
      and (n.leased_until is null or n.leased_until <= v_now)
      and (p_submission_id is null or c.submission_id = p_submission_id)
      and c.status = 'pending' and not c.is_author
      and (n.content_version <> 3 or (a.comment_id is not null and a.used_at is null
        and a.revoked_at is null and a.approve_token is not null and a.reject_token is not null))
    order by n.due_at, n.created_at, n.comment_id
    limit p_limit for update of n skip locked
  ), claimed as (
    update public.post_comment_notifications n
    set attempts = least(n.attempts + 1, 1000000),
      lease_token = gen_random_uuid(), leased_until = v_now + interval '2 minutes'
    from candidates candidate where n.comment_id = candidate.comment_id
    returning n.comment_id, n.lease_token, n.content_version
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'comment_id', c.id, 'submission_id', c.submission_id, 'post_slug', c.post_slug,
    'created_at', c.created_at, 'lease_token', claimed.lease_token,
    'content_version', claimed.content_version,
    'display_name', case when claimed.content_version in (2, 3) then c.display_name else null end,
    'body', case when claimed.content_version in (2, 3) then c.body else null end,
    'approve_token', case when claimed.content_version = 3 then a.approve_token else null end,
    'reject_token', case when claimed.content_version = 3 then a.reject_token else null end,
    'action_expires_at', case when claimed.content_version = 3 then a.expires_at else null end
  ) order by c.created_at, c.id), '[]'::jsonb) into v_result
  from claimed join public.post_comments c on c.id = claimed.comment_id
  left join public.post_comment_email_actions a on a.comment_id = c.id;
  return v_result;
end;
$$;

create or replace function public.finish_post_comment_notification(
  p_comment_id uuid, p_lease_token uuid, p_sent boolean, p_provider_id text default null
)
returns boolean language plpgsql security definer set search_path = ''
set statement_timeout = '3s' set lock_timeout = '1500ms'
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_updated integer;
begin
  if p_comment_id is null or p_lease_token is null or p_sent is null
    or (p_provider_id is not null and (char_length(p_provider_id) not between 1 and 200 or p_provider_id ~ '[[:cntrl:]]'))
  then raise exception 'invalid_notification_result' using errcode = '22023'; end if;
  update public.post_comment_notifications n set
    sent_at = case when p_sent then v_now else null end,
    provider_id = case when p_sent then p_provider_id else null end,
    due_at = case when p_sent then n.due_at else
      v_now + make_interval(secs => least(3600, 60 * power(2, least(greatest(n.attempts - 1, 0), 6)))::integer) end,
    lease_token = null, leased_until = null
  where n.comment_id = p_comment_id and n.lease_token = p_lease_token
    and n.sent_at is null and n.cancelled_at is null;
  get diagnostics v_updated = row_count;
  if v_updated = 1 and p_sent then
    update public.post_comment_email_actions set approve_token = null, reject_token = null
    where comment_id = p_comment_id;
  end if;
  return v_updated = 1;
end;
$$;

create function public.preview_post_comment_email_action(p_token_hash text, p_action text)
returns jsonb language plpgsql security definer set search_path = ''
set statement_timeout = '3s' set lock_timeout = '1500ms'
as $$
declare
  v_action public.post_comment_email_actions%rowtype;
  v_comment public.post_comments%rowtype;
begin
  if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$'
    or p_action is null or p_action not in ('approve', 'reject')
  then return jsonb_build_object('state', 'invalid'); end if;
  select * into v_action from public.post_comment_email_actions
  where (p_action = 'approve' and approve_token_hash = p_token_hash)
    or (p_action = 'reject' and reject_token_hash = p_token_hash);
  if not found then return jsonb_build_object('state', 'invalid'); end if;
  if v_action.used_at is not null then return jsonb_build_object('state', 'used'); end if;
  if v_action.revoked_at is not null then return jsonb_build_object('state', 'unavailable'); end if;
  if v_action.expires_at <= clock_timestamp() then return jsonb_build_object('state', 'expired'); end if;
  select * into v_comment from public.post_comments where id = v_action.comment_id;
  if not found or v_comment.is_author or v_comment.status <> 'pending'
  then return jsonb_build_object('state', 'unavailable'); end if;
  return jsonb_build_object('state', 'ready', 'action', p_action,
    'comment_id', v_comment.id, 'post_slug', v_comment.post_slug,
    'display_name', v_comment.display_name, 'body', v_comment.body,
    'expires_at', v_action.expires_at);
end;
$$;

create function public.consume_post_comment_email_action(p_token_hash text, p_action text)
returns jsonb language plpgsql security definer set search_path = ''
set statement_timeout = '3s' set lock_timeout = '1500ms'
as $$
declare
  v_action public.post_comment_email_actions%rowtype;
  v_comment public.post_comments%rowtype;
  v_id uuid;
  v_status text;
  v_now timestamptz;
begin
  if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$'
    or p_action is null or p_action not in ('approve', 'reject')
  then return jsonb_build_object('state', 'invalid'); end if;
  perform pg_advisory_xact_lock(849223, 1);
  select comment_id into v_id from public.post_comment_email_actions
  where (p_action = 'approve' and approve_token_hash = p_token_hash)
    or (p_action = 'reject' and reject_token_hash = p_token_hash);
  if not found then return jsonb_build_object('state', 'invalid'); end if;
  select * into v_comment from public.post_comments where id = v_id for update;
  if not found then return jsonb_build_object('state', 'unavailable'); end if;
  perform 1 from public.post_comment_notifications where comment_id = v_id for update;
  select * into v_action from public.post_comment_email_actions where comment_id = v_id for update;
  if not found then return jsonb_build_object('state', 'unavailable'); end if;
  if v_action.used_at is not null then return jsonb_build_object('state', 'used'); end if;
  if v_action.revoked_at is not null then return jsonb_build_object('state', 'unavailable'); end if;
  v_now := clock_timestamp();
  if v_action.expires_at <= v_now then return jsonb_build_object('state', 'expired'); end if;
  if v_comment.is_author or v_comment.status <> 'pending'
  then return jsonb_build_object('state', 'unavailable'); end if;
  v_status := case when p_action = 'approve' then 'approved' else 'rejected' end;
  -- Invalidate both links before changing status; the status trigger preserves used state.
  update public.post_comment_email_actions set used_at = v_now, used_action = p_action,
    approve_token = null, reject_token = null where comment_id = v_id;
  update public.post_comment_notifications set cancelled_at = v_now,
    lease_token = null, leased_until = null
  where comment_id = v_id and content_version = 3 and sent_at is null and cancelled_at is null;
  update public.post_comments set status = v_status, read_at = coalesce(read_at, v_now),
    updated_at = v_now where id = v_id;
  insert into public.post_comment_history (comment_id, actor_id, action, from_status, to_status)
  values (v_id, null, 'email_moderated', v_comment.status, v_status);
  if v_comment.read_at is null then
    insert into public.post_comment_history (comment_id, actor_id, action, from_status, to_status)
    values (v_id, null, 'read', v_comment.status, v_status);
  end if;
  return jsonb_build_object('state', 'updated', 'action', p_action,
    'comment_id', v_id, 'post_slug', v_comment.post_slug);
end;
$$;
revoke all on function public.preview_post_comment_email_action(text,text) from public, anon, authenticated, service_role;
revoke all on function public.consume_post_comment_email_action(text,text) from public, anon, authenticated, service_role;
grant execute on function public.preview_post_comment_email_action(text,text) to service_role;
grant execute on function public.consume_post_comment_email_action(text,text) to service_role;

-- CREATE OR REPLACE preserves existing owner/service-only grants and deadlines.
commit;
