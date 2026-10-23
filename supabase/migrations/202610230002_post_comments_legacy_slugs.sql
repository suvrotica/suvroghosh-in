-- Preserve exact legacy Markdown filename identities, including ASCII uppercase.
-- Additive migration: keep the applied 001 schema/history intact and preserve RPC grants.
begin;

alter table public.post_comments drop constraint post_comments_post_slug_check;
alter table public.post_comments add constraint post_comments_post_slug_check
  check (post_slug ~ '^[A-Za-z0-9_-]{1,180}$');

create or replace function public.get_post_comments(p_post_slug text, p_parent_id uuid default null, p_page integer default 1)
returns jsonb language plpgsql security definer set search_path = ''
set statement_timeout = '3s' set lock_timeout = '1500ms'
as $$
declare v_result jsonb;
begin
  if p_post_slug is null or p_post_slug !~ '^[A-Za-z0-9_-]{1,180}$' or p_page is null or p_page not between 1 and 5000
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

create or replace function public.submit_post_comment(
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
  if p_post_slug is null or p_post_slug !~ '^[A-Za-z0-9_-]{1,180}$'
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

create or replace function public.get_comment_moderation_queue(p_status text default 'pending', p_post_slug text default null, p_page integer default 1)
returns jsonb language plpgsql security definer set search_path = ''
set statement_timeout = '4s' set lock_timeout = '1500ms'
as $$
declare v_result jsonb;
begin
  perform public.require_post_comments_owner();
  if p_status is null or p_status not in ('all','pending','approved','rejected','hidden')
    or (p_post_slug is not null and p_post_slug !~ '^[A-Za-z0-9_-]{1,180}$')
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

commit;
