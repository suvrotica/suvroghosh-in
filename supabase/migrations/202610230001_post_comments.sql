-- Moderated article comments. Apply with the privileged migration connection.
-- Published article identity is checked by the application before service RPCs.
begin;

create table public.post_comments (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique,
  post_slug text not null check (post_slug ~ '^[a-z0-9_-]{1,180}$'),
  parent_id uuid references public.post_comments(id) on delete restrict,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 60 and display_name !~ '[[:cntrl:]]'),
  body text not null check (char_length(btrim(body, E' \t\n\r')) between 1 and 3000 and regexp_replace(body, E'[\t\n\r]', '', 'g') !~ '[[:cntrl:]]'),
  is_author boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'hidden')),
  read_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check (parent_id is null or parent_id <> id),
  check (not is_author or display_name = 'Suvro Ghosh')
);
create index post_comments_public_thread on public.post_comments (post_slug, parent_id, created_at, id) where status = 'approved';
create index post_comments_moderation on public.post_comments (status, created_at desc, id desc);
create index post_comments_article on public.post_comments (post_slug, created_at desc, id desc);
create index post_comments_unread on public.post_comments (created_at desc) where read_at is null and not is_author;

create table public.post_comment_history (
  id bigint generated always as identity primary key,
  comment_id uuid not null references public.post_comments(id) on delete restrict,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('submitted', 'replied', 'moderated', 'read')),
  from_status text check (from_status in ('pending', 'approved', 'rejected', 'hidden')),
  to_status text not null check (to_status in ('pending', 'approved', 'rejected', 'hidden')),
  created_at timestamptz not null default clock_timestamp()
);
create index post_comment_history_thread on public.post_comment_history (comment_id, created_at desc, id desc);

-- Only expiring salted HMACs live here; comments retain no IP/email/rate key.
create table public.post_comment_limits (
  key text primary key check (key = 'global' or key ~ '^[a-f0-9]{64}$'),
  window_start timestamptz not null,
  attempts integer not null check (attempts between 1 and 101),
  expires_at timestamptz not null
);
create index post_comment_limits_expiry on public.post_comment_limits (expires_at);

alter table public.post_comments enable row level security;
alter table public.post_comments force row level security;
alter table public.post_comment_history enable row level security;
alter table public.post_comment_history force row level security;
alter table public.post_comment_limits enable row level security;
alter table public.post_comment_limits force row level security;
-- No direct table access, including service-role callers; all reads/writes are bounded RPCs.
revoke all on public.post_comments, public.post_comment_history, public.post_comment_limits from public, anon, authenticated, service_role;
revoke all on sequence public.post_comment_history_id_seq from public, anon, authenticated, service_role;

create function public.require_post_comments_owner()
returns uuid language plpgsql security definer set search_path = ''
set statement_timeout = '3s' set lock_timeout = '1500ms'
as $$
declare v_actor uuid := auth.uid();
begin
  if v_actor is null or not exists (select 1 from public.note_owners where user_id = v_actor)
  then raise exception 'not_authorized' using errcode = '42501'; end if;
  return v_actor;
end;
$$;

create function public.get_post_comments(p_post_slug text, p_parent_id uuid default null, p_page integer default 1)
returns jsonb language plpgsql security definer set search_path = ''
set statement_timeout = '3s' set lock_timeout = '1500ms'
as $$
declare v_result jsonb;
begin
  if p_post_slug is null or p_post_slug !~ '^[a-z0-9_-]{1,180}$' or p_page is null or p_page not between 1 and 5000
  then raise exception 'invalid_comment_query' using errcode = '22023'; end if;
  -- The same visibility predicate protects roots, replies, counts and direct parent lookups.
  with visible as materialized (
    select c.* from public.post_comments c
    where c.post_slug = p_post_slug and c.status = 'approved'
      and (c.parent_id is null or exists (
        select 1 from public.post_comments parent
        where parent.id = c.parent_id and parent.post_slug = c.post_slug
          and parent.parent_id is null and parent.status = 'approved'
      ))
  ), selected as (
    select c.* from visible c where c.parent_id is not distinct from p_parent_id
  ), page as (
    select c.* from selected c order by c.created_at, c.id limit 20 offset ((p_page - 1) * 20)
  )
  select jsonb_build_object(
    'comments', coalesce((select jsonb_agg(jsonb_build_object(
      'id',c.id,'parent_id',c.parent_id,'display_name',c.display_name,'body',c.body,
      'is_author',c.is_author,'created_at',c.created_at,
      'reply_count',(select count(*) from visible child where child.parent_id = c.id)
    ) order by c.created_at,c.id) from page c),'[]'::jsonb),
    'total',(select count(*) from selected),
    'commentCount',(select count(*) from visible)
  ) into v_result;
  return v_result;
end;
$$;

create function public.submit_post_comment(
  p_post_slug text, p_parent_id uuid, p_display_name text, p_body text,
  p_submission_id uuid, p_rate_key text
)
returns text language plpgsql security definer set search_path = ''
set statement_timeout = '3s' set lock_timeout = '1500ms'
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_window timestamptz := to_timestamp(floor(extract(epoch from v_now) / 600) * 600);
  v_rate text;
  v_cap integer;
  v_attempts integer;
  v_id uuid;
begin
  if p_post_slug is null or p_post_slug !~ '^[a-z0-9_-]{1,180}$'
    or p_display_name is null or char_length(btrim(p_display_name)) not between 1 and 60 or p_display_name ~ '[[:cntrl:]]'
    or p_body is null or char_length(btrim(p_body, E' \t\n\r')) not between 1 and 3000 or regexp_replace(p_body, E'[\t\n\r]', '', 'g') ~ '[[:cntrl:]]'
    or p_submission_id is null or p_rate_key is null or p_rate_key !~ '^[a-f0-9]{64}$'
  then raise exception 'invalid_comment' using errcode = '22023'; end if;

  -- Serialize all mutations so moderation/parent checks and duplicate retries cannot race.
  -- Global throughput is intentionally small; locks and SQL both have deadlines.
  perform pg_advisory_xact_lock(849223, 1);
  if exists (select 1 from public.post_comments where submission_id = p_submission_id)
  then return 'pending'; end if; -- Never disclose an existing submission or its current status.

  delete from public.post_comment_limits where ctid in (
    select ctid from public.post_comment_limits where expires_at <= v_now
    order by expires_at limit 100 for update skip locked
  );
  foreach v_rate in array array['global',p_rate_key] loop
    v_cap := case when v_rate = 'global' then 100 else 5 end;
    insert into public.post_comment_limits as limiter (key,window_start,attempts,expires_at)
    values (v_rate,v_window,1,v_now + interval '24 hours')
    on conflict (key) do update set
      window_start = excluded.window_start,
      attempts = case when limiter.window_start = excluded.window_start then least(limiter.attempts + 1,101) else 1 end,
      expires_at = excluded.expires_at
    returning attempts into v_attempts;
    if v_attempts > v_cap then return 'rate_limited'; end if;
  end loop;

  if p_parent_id is not null and not exists (
    select 1 from public.post_comments where id = p_parent_id and post_slug = p_post_slug
      and parent_id is null and status = 'approved'
  ) then return 'invalid_parent'; end if;
  insert into public.post_comments (submission_id,post_slug,parent_id,display_name,body)
  values (p_submission_id,p_post_slug,p_parent_id,btrim(p_display_name),btrim(p_body, E' \t\n\r')) returning id into v_id;
  insert into public.post_comment_history (comment_id,action,to_status) values (v_id,'submitted','pending');
  return 'pending';
end;
$$;

create function public.get_comment_moderation_counts()
returns jsonb language plpgsql security definer set search_path = ''
set statement_timeout = '3s' set lock_timeout = '1500ms'
as $$
declare v_result jsonb;
begin
  perform public.require_post_comments_owner();
  select jsonb_build_object(
    'pending',count(*) filter (where status = 'pending'),
    'unread',count(*) filter (where read_at is null and not is_author)
  ) into v_result from public.post_comments;
  return v_result;
end;
$$;

create function public.get_comment_moderation_queue(p_status text default 'pending', p_post_slug text default null, p_page integer default 1)
returns jsonb language plpgsql security definer set search_path = ''
set statement_timeout = '4s' set lock_timeout = '1500ms'
as $$
declare v_result jsonb;
begin
  perform public.require_post_comments_owner();
  if p_status is null or p_status not in ('all','pending','approved','rejected','hidden')
    or (p_post_slug is not null and p_post_slug !~ '^[a-z0-9_-]{1,180}$')
    or p_page is null or p_page not between 1 and 5000
  then raise exception 'invalid_comment_query' using errcode = '22023'; end if;
  with selected as (
    select c.* from public.post_comments c
    where (p_status = 'all' or c.status = p_status) and (p_post_slug is null or c.post_slug = p_post_slug)
  ), page as (
    select c.* from selected c order by c.created_at desc,c.id desc limit 20 offset ((p_page - 1) * 20)
  )
  select jsonb_build_object(
    'comments',coalesce((select jsonb_agg(jsonb_build_object(
      'id',c.id,'post_slug',c.post_slug,'parent_id',c.parent_id,'display_name',c.display_name,
      'body',c.body,'is_author',c.is_author,'status',c.status,'read_at',c.read_at,
      'created_at',c.created_at,'updated_at',c.updated_at,
      'reply_count',case when c.parent_id is null and c.status = 'approved' then (
        select count(*) from public.post_comments child where child.parent_id = c.id and child.status = 'approved'
      ) else 0 end,
      'parent_body',parent.body,'parent_display_name',parent.display_name,'parent_status',parent.status,
      'history',coalesce((select jsonb_agg(to_jsonb(h) order by h.created_at desc,h.id desc) from (
        select id,action,from_status,to_status,actor_id,created_at from public.post_comment_history
        where comment_id = c.id order by created_at desc,id desc limit 10
      ) h),'[]'::jsonb)
    ) order by c.created_at desc,c.id desc)
    from page c left join public.post_comments parent on parent.id = c.parent_id),'[]'::jsonb),
    'total',(select count(*) from selected),
    'pending',(select count(*) from public.post_comments where status = 'pending'),
    'unread',(select count(*) from public.post_comments where read_at is null and not is_author)
  ) into v_result;
  return v_result;
end;
$$;

create function public.moderate_post_comment(p_id uuid, p_status text default null, p_mark_read boolean default false)
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

create function public.reply_to_post_comment(p_parent_id uuid, p_body text, p_submission_id uuid)
returns text language plpgsql security definer set search_path = ''
set statement_timeout = '3s' set lock_timeout = '1500ms'
as $$
declare
  v_actor uuid;
  v_parent public.post_comments%rowtype;
  v_reply public.post_comments%rowtype;
  v_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  v_actor := public.require_post_comments_owner();
  if p_parent_id is null or p_submission_id is null or p_body is null
    or char_length(btrim(p_body, E' \t\n\r')) not between 1 and 3000
    or regexp_replace(p_body, E'[\t\n\r]', '', 'g') ~ '[[:cntrl:]]'
  then raise exception 'invalid_comment' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(849223, 1);
  -- Owner retries must match their original reply; never reuse a guest submission.
  select * into v_reply from public.post_comments where submission_id = p_submission_id for update;
  if found then
    if not v_reply.is_author or v_reply.parent_id is distinct from p_parent_id
      or v_reply.body <> btrim(p_body, E' \t\n\r')
    then raise exception 'submission_conflict' using errcode = '23505'; end if;
    -- A lost-response retry must not claim publication after either comment was hidden.
    select * into v_parent from public.post_comments where id = p_parent_id for update;
    if not found or v_parent.parent_id is not null or v_parent.status <> 'approved'
    then return 'invalid_parent'; end if;
    if v_reply.status <> 'approved'
    then raise exception 'submission_conflict' using errcode = '23505'; end if;
    return 'approved';
  end if;
  select * into v_parent from public.post_comments where id = p_parent_id for update;
  if not found or v_parent.parent_id is not null or v_parent.status <> 'approved'
  then return 'invalid_parent'; end if;
  insert into public.post_comments (submission_id,post_slug,parent_id,display_name,body,is_author,status,read_at)
  values (p_submission_id,v_parent.post_slug,v_parent.id,'Suvro Ghosh',btrim(p_body, E' \t\n\r'),true,'approved',v_now)
  returning id into v_id;
  insert into public.post_comment_history (comment_id,actor_id,action,to_status)
  values (v_id,v_actor,'replied','approved');
  return 'approved';
end;
$$;

revoke all on function public.require_post_comments_owner() from public, anon, authenticated, service_role;
revoke all on function public.get_post_comments(text,uuid,integer) from public, anon, authenticated, service_role;
revoke all on function public.submit_post_comment(text,uuid,text,text,uuid,text) from public, anon, authenticated, service_role;
revoke all on function public.get_comment_moderation_counts() from public, anon, authenticated, service_role;
revoke all on function public.get_comment_moderation_queue(text,text,integer) from public, anon, authenticated, service_role;
revoke all on function public.moderate_post_comment(uuid,text,boolean) from public, anon, authenticated, service_role;
revoke all on function public.reply_to_post_comment(uuid,text,uuid) from public, anon, authenticated, service_role;
grant execute on function public.get_post_comments(text,uuid,integer) to service_role;
grant execute on function public.submit_post_comment(text,uuid,text,text,uuid,text) to service_role;
grant execute on function public.get_comment_moderation_counts() to authenticated;
grant execute on function public.get_comment_moderation_queue(text,text,integer) to authenticated;
grant execute on function public.moderate_post_comment(uuid,text,boolean) to authenticated;
grant execute on function public.reply_to_post_comment(uuid,text,uuid) to authenticated;

commit;
