-- Run after 202611090004_comm_link_watchdog_warm_path.sql and its production release.
-- Provision a dedicated >=32-byte random secret as Vercel Production
-- COMM_LINK_WATCHDOG_SECRET and Vault name comm_link_watchdog_token first.
-- Secret values never belong in this file, URLs, command arguments or logs.
begin;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $$
begin
	if not exists (select 1 from pg_extension where extname = 'pg_cron'
		and split_part(extversion,'.',1)::integer >= 1
		and (split_part(extversion,'.',1)::integer > 1 or split_part(extversion,'.',2)::integer >= 5)) then
		raise exception 'pg_cron_seconds_schedules_not_supported';
	end if;
	if not exists (select 1 from vault.decrypted_secrets where name = 'comm_link_watchdog_token' and octet_length(decrypted_secret) >= 32) then
		raise exception 'radio_watchdog_secret_not_configured';
	end if;
	-- Managed queue ACLs are not an application-controlled confidentiality boundary.
	-- Require the corrected scheduler: it enqueues only a 25-second dispatch proof.
	if to_regprocedure('extensions.hmac(bytea,bytea,text)') is null
		or to_regprocedure('public.comm_link_watchdog_claim_v2(uuid,uuid)') is null
		or obj_description('public.request_comm_link_watchdog()'::regprocedure, 'pg_proc')
			is distinct from 'comm-link-watchdog:hmac-sha256:v1' then
		raise exception 'radio_watchdog_signed_dispatch_not_installed';
	end if;
end $$;

update public.comm_link_watchdog set enabled = true, last_ack_at = null,
	consecutive_failures = 0, dispatch_until = null, worker_owner = null, worker_until = null
where id = 1;
select cron.schedule('comm-link-radio-watchdog', '2 seconds',
	$$select public.request_comm_link_watchdog();$$);
commit;

-- Safe read-only activation checks: no Vault secret or queued request headers.
select jobname, schedule, active from cron.job where jobname = 'comm-link-radio-watchdog';
select enabled, last_tick_at, last_ack_at, consecutive_failures,
	(dispatch_until > now()) as dispatch_in_flight from public.comm_link_watchdog where id = 1;
