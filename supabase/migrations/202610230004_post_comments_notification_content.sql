-- Include complete reader content in new approval emails only.
-- Existing queued jobs retain their original metadata-only provider payload and key.
-- No reader content is duplicated in the outbox; only the service-only claim reads it.
begin;

alter table public.post_comment_notifications
  add column content_version smallint not null default 1
  check (content_version in (1, 2));
alter table public.post_comment_notifications alter column content_version set default 2;

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

  -- Moderation before a claim suppresses delivery permanently, even if later returned to pending.
  -- Bound cleanup separately so a run can still deliver up to p_limit eligible notifications.
  with obsolete as (
    select n.comment_id from public.post_comment_notifications n
    join public.post_comments c on c.id = n.comment_id
    where n.sent_at is null and n.cancelled_at is null and n.due_at <= v_now
      and (n.leased_until is null or n.leased_until <= v_now)
      and (p_submission_id is null or c.submission_id = p_submission_id)
      and (c.status <> 'pending' or c.is_author)
    order by n.due_at, n.created_at, n.comment_id
    limit p_limit for update of n skip locked
  )
  update public.post_comment_notifications n set cancelled_at = v_now, lease_token = null, leased_until = null
  from obsolete o where n.comment_id = o.comment_id;

  with candidates as (
    select n.comment_id from public.post_comment_notifications n
    join public.post_comments c on c.id = n.comment_id
    where n.sent_at is null and n.cancelled_at is null and n.due_at <= v_now
      and (n.leased_until is null or n.leased_until <= v_now)
      and (p_submission_id is null or c.submission_id = p_submission_id)
      and c.status = 'pending' and not c.is_author
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
    'display_name', case when claimed.content_version = 2 then c.display_name else null end,
    'body', case when claimed.content_version = 2 then c.body else null end
  ) order by c.created_at, c.id), '[]'::jsonb) into v_result
  from claimed join public.post_comments c on c.id = claimed.comment_id;
  return v_result;
end;
$$;

-- CREATE OR REPLACE preserves the existing service-only execute grant and function settings.
commit;
