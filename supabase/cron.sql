-- Run once in the Supabase SQL editor (or create the same job in Integrations → Cron).
-- Supabase Cron uses pg_cron and records every run in cron.job_run_details.
create extension if not exists pg_cron with schema extensions;

select cron.schedule(
	'activate-handwritten-note-publications',
	'* * * * *',
	$$ select * from public.activate_due_note_publications(25); $$
);
