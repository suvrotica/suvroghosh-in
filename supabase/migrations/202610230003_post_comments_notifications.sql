-- Durable owner-email notifications. New submissions only; existing comments are not backfilled.
-- Application email dispatch uses bounded service-role RPCs and a provider idempotency key.
begin;

create table public.post_comment_notifications (
  comment_id uuid primary key references public.post_comments(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  due_at timestamptz not null default clock_timestamp(),
  attempts integer not null default 0 check (attempts between 0 and 1000000),
  lease_token uuid,
  leased_until timestamptz,
  sent_at timestamptz,
  cancelled_at timestamptz,
  provider_id text check (provider_id is null or (char_length(provider_id) between 1 and 200 and provider_id !~ '[[:cntrl:]]')),
  check ((lease_token is null) = (leased_until is null)),
  check (sent_at is null or cancelled_at is null)
);
create index post_comment_notifications_due on public.post_comment_notifications (due_at, created_at, comment_id)
  where sent_at is null and cancelled_at is null;

alter table public.post_comment_notifications enable row level security;
alter table public.post_comment_notifications force row level security;
revoke all on public.post_comment_notifications from public, anon, authenticated, service_role;

create function public.enqueue_post_comment_notification()
returns trigger language plpgsql security definer set search_path = ''
set statement_timeout = '3s' set lock_timeout = '1500ms'
as $$
begin
  if not new.is_author and new.status = 'pending' then
    insert into public.post_comment_notifications (comment_id) values (new.id);
  end if;
  return new;
end;
$$;
revoke all on function public.enqueue_post_comment_notification() from public, anon, authenticated, service_role;

create trigger post_comment_notification_after_insert
after insert on public.post_comments for each row
execute function public.enqueue_post_comment_notification();

create function public.claim_post_comment_notifications(p_submission_id uuid default null, p_limit integer default 1)
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
    returning n.comment_id, n.lease_token
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'comment_id', c.id, 'submission_id', c.submission_id, 'post_slug', c.post_slug,
    'created_at', c.created_at, 'lease_token', claimed.lease_token
  ) order by c.created_at, c.id), '[]'::jsonb) into v_result
  from claimed join public.post_comments c on c.id = claimed.comment_id;
  return v_result;
end;
$$;

create function public.finish_post_comment_notification(
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
  return v_updated = 1;
end;
$$;

revoke all on function public.claim_post_comment_notifications(uuid,integer) from public, anon, authenticated, service_role;
revoke all on function public.finish_post_comment_notification(uuid,uuid,boolean,text) from public, anon, authenticated, service_role;
grant execute on function public.claim_post_comment_notifications(uuid,integer) to service_role;
grant execute on function public.finish_post_comment_notification(uuid,uuid,boolean,text) to service_role;

commit;
