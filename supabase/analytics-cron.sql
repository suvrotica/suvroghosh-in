-- Apply once using the Supabase SQL editor after 202610220001_site_analytics.sql.
-- Named schedules are idempotent: cron.schedule replaces an existing same-name job.
-- pg_cron is non-relocatable and installs in pg_catalog (its tables live in cron).
create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'cleanup-site-analytics',
  '*/10 * * * *',
  $$ select public.cleanup_site_analytics(25000); $$
);

-- Read-only verification: active schedule and its most recent result.
select jobid, jobname, schedule, active from cron.job where jobname = 'cleanup-site-analytics';
select status, return_message, start_time, end_time
from cron.job_run_details
where jobid in (select jobid from cron.job where jobname = 'cleanup-site-analytics')
order by start_time desc limit 1;
