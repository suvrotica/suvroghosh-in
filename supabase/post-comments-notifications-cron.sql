-- Apply after 202610230003_post_comments_notifications.sql and a production release.
-- Provision a random >=32-character secret in Vault under post_comments_notification_token
-- and the identical Vercel Production COMMENTS_NOTIFICATION_SECRET before scheduling.
-- Keep its value out of this file, logs, URLs and browser-visible environment variables.
begin;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create or replace function public.request_post_comment_notification_delivery()
returns bigint language plpgsql security definer set search_path = ''
set statement_timeout = '3s' set lock_timeout = '1500ms'
as $$
declare
  v_secret text;
  v_request bigint;
begin
  -- Avoid an HTTP invocation when there is no due work; expired leases recover crashes.
  if not exists (
    select 1 from public.post_comment_notifications
    where sent_at is null and cancelled_at is null and due_at <= clock_timestamp()
      and (leased_until is null or leased_until <= clock_timestamp())
  ) then return null; end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets
    where name = 'post_comments_notification_token';
  if v_secret is null or char_length(v_secret) < 32 then
    raise exception 'comment_notification_secret_not_configured';
  end if;
  select net.http_post(
    url := 'https://www.suvroghosh.in/api/internal/comment-notifications',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) into v_request;
  return v_request;
end;
$$;
revoke all on function public.request_post_comment_notification_delivery() from public, anon, authenticated, service_role;

-- The same name updates an existing schedule; it does not create duplicate jobs.
select cron.schedule(
  'deliver-post-comment-notifications',
  '*/5 * * * *',
  $$ select public.request_post_comment_notification_delivery(); $$
);
commit;

-- Read-only activation checks (never select the Vault secret or HTTP request headers).
select jobname, schedule, active from cron.job
  where jobname = 'deliver-post-comment-notifications';
select status, return_message, start_time, end_time from cron.job_run_details
  where jobid in (select jobid from cron.job where jobname = 'deliver-post-comment-notifications')
  order by start_time desc limit 1;
