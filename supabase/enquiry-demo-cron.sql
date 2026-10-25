-- Activate only after the tested public release is serving the canonical URL.
-- Vault's enquiry_demo_worker_secret must match Vercel ENQUIRY_DEMO_WORKER_SECRET.
-- Generate/store the value privately; never put the value in this source file.
begin;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create or replace function public.request_enquiry_demo_delivery()
returns bigint language plpgsql security definer set search_path = ''
set statement_timeout = '3s' set lock_timeout = '1500ms'
as $$
declare v_secret text; v_request bigint;
begin
  -- Expiry cleanup continues even when no HTTP invocation is needed.
  perform public.enquiry_demo_cleanup();
  if not exists (select 1 from public.enquiry_demo_workspaces
    where expires_at > now() and next_due_at <= now()) then return null; end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name='enquiry_demo_worker_secret';
  if v_secret is null or char_length(v_secret) < 32 then
    raise exception 'enquiry_demo_worker_secret_not_configured';
  end if;
  select net.http_post(
    url := 'https://www.suvroghosh.in/api/enquiry-demo/worker',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) into v_request;
  return v_request;
end;
$$;
revoke all on function public.request_enquiry_demo_delivery() from public,anon,authenticated,service_role;
select cron.schedule('process-enquiry-demonstrations','* * * * *',
  $$ select public.request_enquiry_demo_delivery(); $$);
commit;

-- Read-only activation evidence. Never select Vault values or request headers.
select jobname,schedule,active from cron.job where jobname='process-enquiry-demonstrations';
