-- Source-scoped inbox author replies for new version-four notifications only.
-- Deploy the compatible application first. Do not backfill or rewrite earlier delivery payloads.
begin;

alter table public.post_comment_notifications drop constraint post_comment_notifications_content_version_check;
alter table public.post_comment_notifications add constraint post_comment_notifications_content_version_check
  check (content_version in (1, 2, 3, 4));
alter table public.post_comment_notifications alter column content_version set default 4;

alter table public.post_comment_history drop constraint post_comment_history_action_check;
alter table public.post_comment_history add constraint post_comment_history_action_check
  check (action in ('submitted', 'replied', 'moderated', 'read', 'email_moderated', 'email_replied'));

alter table public.post_comment_email_actions
  add column reply_token text check (reply_token is null or reply_token ~ '^[a-f0-9]{64}$'),
  add column reply_token_hash text unique check (reply_token_hash is null or reply_token_hash ~ '^[a-f0-9]{64}$'),
  add column reply_submission_id uuid unique,
  add column reply_used_at timestamptz,
  add column reply_revoked_at timestamptz,
  add column reply_comment_id uuid references public.post_comments(id) on delete restrict,
  add check ((reply_token_hash is null) = (reply_submission_id is null)),
  add check (reply_token is null or (reply_token_hash is not null and reply_token <> approve_token and reply_token <> reject_token)),
  add check (reply_token_hash is null or (reply_token_hash <> approve_token_hash and reply_token_hash <> reject_token_hash)),
  add check ((reply_used_at is null) = (reply_comment_id is null)),
  add check (reply_used_at is null or reply_token_hash is not null);

-- Existing forced RLS and revoked direct grants apply to every added column.
-- All capabilities retain the same fixed expiry; only the source comment is revoked.
-- Child reply eligibility additionally requires its current root to be approved.

create or replace function public.enqueue_post_comment_notification()
returns trigger language plpgsql security definer set search_path = ''
set statement_timeout = '3s' set lock_timeout = '1500ms'
as $$
declare
  v_created_at timestamptz;
  v_approve text;
  v_reject text;
  v_reply text;
begin
  if not new.is_author and new.status = 'pending' then
    insert into public.post_comment_notifications (comment_id) values (new.id)
      returning created_at into v_created_at;
    -- Each pair has 244 random UUID bits, encoded without punctuation. No extra extension.
    v_approve := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
    v_reject := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
    v_reply := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
    insert into public.post_comment_email_actions (
      comment_id, approve_token, reject_token, approve_token_hash, reject_token_hash, expires_at,
      reply_token, reply_token_hash, reply_submission_id
    ) values (
      new.id, v_approve, v_reject,
      encode(sha256(convert_to(v_approve, 'UTF8')), 'hex'),
      encode(sha256(convert_to(v_reject, 'UTF8')), 'hex'),
      v_created_at + interval '7 days', v_reply,
      encode(sha256(convert_to(v_reply, 'UTF8')), 'hex'), gen_random_uuid()
    );
  end if;
  return new;
end;
$$;

create or replace function public.revoke_post_comment_email_actions(p_comment_id uuid)
returns void language plpgsql security definer set search_path = ''
set statement_timeout = '3s' set lock_timeout = '1500ms'
as $$
declare v_now timestamptz := clock_timestamp();
begin
  perform 1 from public.post_comment_notifications where comment_id = p_comment_id for update;
  update public.post_comment_notifications set cancelled_at = v_now,
    lease_token = null, leased_until = null
  where comment_id = p_comment_id and content_version in (3, 4)
    and sent_at is null and cancelled_at is null;
  update public.post_comment_email_actions set
    revoked_at = case when used_at is null then coalesce(revoked_at, v_now) else revoked_at end,
    approve_token = null, reject_token = null, reply_token = null,
    reply_revoked_at = case when reply_token_hash is not null then coalesce(reply_revoked_at, v_now) else reply_revoked_at end
  where comment_id = p_comment_id;
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
      and (c.status <> 'pending' or c.is_author or (n.content_version in (3, 4) and
        (a.comment_id is null or a.used_at is not null or a.revoked_at is not null
          or a.approve_token is null or a.reject_token is null
          or (n.content_version = 4 and (a.reply_token is null or a.reply_token_hash is null
            or a.reply_submission_id is null or a.reply_used_at is not null or a.reply_revoked_at is not null)))))
    order by n.due_at, n.created_at, n.comment_id
    limit p_limit for update of n skip locked
  ), cancelled as (
    update public.post_comment_notifications n
    set cancelled_at = v_now, lease_token = null, leased_until = null
    from obsolete o where n.comment_id = o.comment_id returning n.comment_id
  )
  update public.post_comment_email_actions a set
    revoked_at = case when a.used_at is null then coalesce(a.revoked_at, v_now) else a.revoked_at end,
    approve_token = null, reject_token = null, reply_token = null,
    reply_revoked_at = case when a.reply_token_hash is not null then coalesce(a.reply_revoked_at, v_now) else a.reply_revoked_at end
  from cancelled n where a.comment_id = n.comment_id;

  with candidates as (
    select n.comment_id from public.post_comment_notifications n
    join public.post_comments c on c.id = n.comment_id
    left join public.post_comment_email_actions a on a.comment_id = n.comment_id
    where n.sent_at is null and n.cancelled_at is null and n.due_at <= v_now
      and (n.leased_until is null or n.leased_until <= v_now)
      and (p_submission_id is null or c.submission_id = p_submission_id)
      and c.status = 'pending' and not c.is_author
      and (n.content_version not in (3, 4) or (a.comment_id is not null and a.used_at is null
        and a.revoked_at is null and a.approve_token is not null and a.reject_token is not null
        and (n.content_version = 3 or (a.reply_token is not null and a.reply_token_hash is not null
          and a.reply_submission_id is not null and a.reply_used_at is null and a.reply_revoked_at is null))))
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
    'display_name', case when claimed.content_version in (2, 3, 4) then c.display_name else null end,
    'body', case when claimed.content_version in (2, 3, 4) then c.body else null end,
    'approve_token', case when claimed.content_version in (3, 4) then a.approve_token else null end,
    'reject_token', case when claimed.content_version in (3, 4) then a.reject_token else null end,
    'action_expires_at', case when claimed.content_version in (3, 4) then a.expires_at else null end,
    'reply_token', case when claimed.content_version = 4 then a.reply_token else null end
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
    update public.post_comment_email_actions set approve_token = null, reject_token = null, reply_token = null
    where comment_id = p_comment_id;
  end if;
  return v_updated = 1;
end;
$$;

create or replace function public.consume_post_comment_email_action(p_token_hash text, p_action text)
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
    approve_token = null, reject_token = null, reply_token = null where comment_id = v_id;
  update public.post_comment_notifications set cancelled_at = v_now,
    lease_token = null, leased_until = null
  where comment_id = v_id and content_version in (3, 4) and sent_at is null and cancelled_at is null;
  update public.post_comments set status = v_status, read_at = coalesce(read_at, v_now),
    updated_at = v_now where id = v_id;
  -- The status trigger revokes every source link. Only this authorized email approval
  -- restores its own captured independent reply state within the same locked transaction.
  if p_action = 'approve' and v_action.reply_token_hash is not null
    and v_action.reply_used_at is null and v_action.reply_revoked_at is null then
    update public.post_comment_email_actions set reply_revoked_at = null where comment_id = v_id;
  end if;
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

create or replace function public.preview_post_comment_email_action(p_token_hash text, p_action text)
returns jsonb language plpgsql security definer set search_path = ''
set statement_timeout = '3s' set lock_timeout = '1500ms'
as $$
declare
  v_action public.post_comment_email_actions%rowtype;
  v_comment public.post_comments%rowtype;
  v_parent public.post_comments%rowtype;
begin
  if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$'
    or p_action is null or p_action not in ('approve', 'reject', 'reply')
  then return jsonb_build_object('state', 'invalid'); end if;
  select * into v_action from public.post_comment_email_actions
  where (p_action = 'approve' and approve_token_hash = p_token_hash)
    or (p_action = 'reject' and reject_token_hash = p_token_hash)
    or (p_action = 'reply' and reply_token_hash = p_token_hash);
  if not found then return jsonb_build_object('state', 'invalid'); end if;
  if p_action = 'reply' then
    if v_action.reply_revoked_at is not null or v_action.revoked_at is not null or v_action.used_action = 'reject'
    then return jsonb_build_object('state', 'unavailable'); end if;
    if v_action.reply_used_at is not null then return jsonb_build_object('state', 'used'); end if;
  else
    if v_action.used_at is not null then return jsonb_build_object('state', 'used'); end if;
    if v_action.revoked_at is not null then return jsonb_build_object('state', 'unavailable'); end if;
  end if;
  if v_action.expires_at <= clock_timestamp() then return jsonb_build_object('state', 'expired'); end if;
  select * into v_comment from public.post_comments where id = v_action.comment_id;
  if not found or v_comment.is_author
    or (p_action = 'reply' and v_comment.status not in ('pending','approved'))
    or (p_action <> 'reply' and v_comment.status <> 'pending')
  then return jsonb_build_object('state', 'unavailable'); end if;
  if p_action = 'reply' then
    if v_action.reply_submission_id is null then return jsonb_build_object('state', 'unavailable'); end if;
    if v_comment.parent_id is not null then
      select * into v_parent from public.post_comments where id = v_comment.parent_id;
      if not found or v_parent.parent_id is not null or v_parent.status <> 'approved'
        or v_parent.post_slug <> v_comment.post_slug
      then return jsonb_build_object('state', 'unavailable'); end if;
    end if;
    return jsonb_build_object('state', 'ready', 'action', p_action,
      'comment_id', v_comment.id, 'post_slug', v_comment.post_slug,
      'display_name', v_comment.display_name, 'body', v_comment.body,
      'expires_at', v_action.expires_at, 'comment_status', v_comment.status,
      'reply_parent_id', coalesce(v_comment.parent_id,v_comment.id),
      'reply_is_sibling', v_comment.parent_id is not null);
  end if;
  return jsonb_build_object('state', 'ready', 'action', p_action,
    'comment_id', v_comment.id, 'post_slug', v_comment.post_slug,
    'display_name', v_comment.display_name, 'body', v_comment.body,
    'expires_at', v_action.expires_at);
end;
$$;

create function public.reply_post_comment_email_action(p_token_hash text, p_body text)
returns jsonb language plpgsql security definer set search_path = ''
set statement_timeout = '3s' set lock_timeout = '1500ms'
as $$
declare
  v_action public.post_comment_email_actions%rowtype;
  v_comment public.post_comments%rowtype;
  v_parent public.post_comments%rowtype;
  v_reply public.post_comments%rowtype;
  v_id uuid;
  v_parent_id uuid;
  v_reply_id uuid;
  v_body text;
  v_now timestamptz;
begin
  if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$'
  then return jsonb_build_object('state', 'invalid'); end if;
  if p_body is null or char_length(btrim(p_body, E' \t\n\r')) not between 1 and 3000
    or regexp_replace(p_body, E'[\t\n\r]', '', 'g') ~ '[[:cntrl:]]'
  then raise exception 'invalid_comment' using errcode = '22023'; end if;
  v_body := btrim(p_body, E' \t\n\r');
  perform pg_advisory_xact_lock(849223, 1);
  select comment_id into v_id from public.post_comment_email_actions where reply_token_hash = p_token_hash;
  if not found then return jsonb_build_object('state', 'invalid'); end if;
  select * into v_comment from public.post_comments where id = v_id for update;
  if not found then return jsonb_build_object('state', 'unavailable'); end if;
  v_parent_id := coalesce(v_comment.parent_id, v_comment.id);
  if v_comment.parent_id is not null then
    select * into v_parent from public.post_comments where id = v_parent_id for update;
    if not found or v_parent.parent_id is not null or v_parent.status <> 'approved'
      or v_parent.post_slug <> v_comment.post_slug
    then return jsonb_build_object('state', 'unavailable'); end if;
  end if;
  perform 1 from public.post_comment_notifications where comment_id = v_id for update;
  select * into v_action from public.post_comment_email_actions where comment_id = v_id for update;
  if not found or v_action.reply_submission_id is null
  then return jsonb_build_object('state', 'unavailable'); end if;
  if v_action.reply_revoked_at is not null or v_action.revoked_at is not null or v_action.used_action = 'reject'
    or v_comment.is_author or v_comment.status not in ('pending','approved')
  then return jsonb_build_object('state', 'unavailable'); end if;
  v_now := clock_timestamp();
  if v_action.expires_at <= v_now then return jsonb_build_object('state', 'expired'); end if;
  if v_action.reply_used_at is not null then
    -- The fixed private UUID and immutable full body identify an uncertain-response retry.
    -- A retry never updates visibility or inserts; current moderation must still allow it.
    select * into v_reply from public.post_comments where id = v_action.reply_comment_id;
    if not found or not v_reply.is_author or v_reply.submission_id <> v_action.reply_submission_id
      or v_reply.parent_id <> v_parent_id or v_reply.post_slug <> v_comment.post_slug
      or v_comment.status <> 'approved' or v_reply.status <> 'approved'
    then return jsonb_build_object('state', 'unavailable'); end if;
    if v_reply.body <> v_body
    then raise exception 'submission_conflict' using errcode = '23505'; end if;
    return jsonb_build_object('state','replied','action','reply','comment_id',v_id,
      'post_slug',v_comment.post_slug,'reply_id',v_reply.id,'reply_parent_id',v_parent_id);
  end if;
  -- No caller supplies author identity, status, parent or a fresh idempotency UUID.
  insert into public.post_comments (submission_id,post_slug,parent_id,display_name,body,is_author,status,read_at)
  values (v_action.reply_submission_id,v_comment.post_slug,v_parent_id,'Suvro Ghosh',v_body,true,'approved',v_now)
  returning id into v_reply_id;
  insert into public.post_comment_history (comment_id,actor_id,action,to_status)
  values (v_reply_id,null,'email_replied','approved');
  update public.post_comment_email_actions set reply_used_at = v_now, reply_comment_id = v_reply_id,
    used_at = coalesce(used_at,v_now), used_action = coalesce(used_action,'approve'),
    approve_token = null, reject_token = null, reply_token = null where comment_id = v_id;
  update public.post_comment_notifications set cancelled_at = v_now, lease_token = null, leased_until = null
  where comment_id = v_id and content_version in (3,4) and sent_at is null and cancelled_at is null;
  if v_comment.status = 'pending' then
    update public.post_comments set status = 'approved',read_at = coalesce(read_at,v_now),updated_at = v_now where id = v_id;
    -- Restore only the captured reply state invalidated by this transaction's status trigger.
    update public.post_comment_email_actions set reply_revoked_at = null where comment_id = v_id;
    insert into public.post_comment_history (comment_id,actor_id,action,from_status,to_status)
    values (v_id,null,'email_moderated','pending','approved');
  elsif v_comment.read_at is null then
    update public.post_comments set read_at = v_now,updated_at = v_now where id = v_id;
  end if;
  if v_comment.read_at is null then
    insert into public.post_comment_history (comment_id,actor_id,action,from_status,to_status)
    values (v_id,null,'read',v_comment.status,'approved');
  end if;
  return jsonb_build_object('state','replied','action','reply','comment_id',v_id,
    'post_slug',v_comment.post_slug,'reply_id',v_reply_id,'reply_parent_id',v_parent_id);
end;
$$;
revoke all on function public.reply_post_comment_email_action(text,text) from public, anon, authenticated, service_role;
grant execute on function public.reply_post_comment_email_action(text,text) to service_role;

-- Replaced RPCs retain their service-only grants, private search_path and deadlines.
commit;
