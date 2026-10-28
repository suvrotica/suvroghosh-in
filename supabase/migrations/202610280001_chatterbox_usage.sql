-- Shared admission for optional public Chatterbox generation. Does not enable the provider.
-- Request/character ceilings bound submitted work, not a provider's monetary billing.
begin;

create table if not exists public.chatterbox_usage (
  id bigint generated always as identity primary key,
  reserved_at timestamptz not null,
  client_hash text not null check (client_hash ~ '^[a-f0-9]{64}$'),
  text_characters integer not null check (text_characters between 1 and 3000)
);
create index if not exists chatterbox_usage_time on public.chatterbox_usage (reserved_at);
create index if not exists chatterbox_usage_client_time
  on public.chatterbox_usage (client_hash, reserved_at);

alter table public.chatterbox_usage enable row level security;
alter table public.chatterbox_usage force row level security;
revoke all on public.chatterbox_usage from public, anon, authenticated, service_role;
revoke all on sequence public.chatterbox_usage_id_seq from public, anon, authenticated, service_role;

create or replace function public.reserve_chatterbox_usage(
  client_hash text,
  text_characters integer
) returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '1s'
as $$
declare
  v_now timestamptz;
  v_day timestamptz;
  v_hour timestamptz;
  v_daily_requests integer;
  v_daily_characters integer;
  v_hourly_requests integer;
  v_active integer;
  v_oldest_active timestamptz;
  v_retry integer := 0;
begin
  if client_hash is null or client_hash !~ '^[a-f0-9]{64}$'
    or text_characters is null or text_characters not between 1 and 3000
  then
    raise exception 'Invalid Chatterbox quota parameters' using errcode = '22023';
  end if;

  -- All instances and identities share one transaction lock; read the clock after waiting.
  perform pg_catalog.pg_advisory_xact_lock(849225, 2);
  v_now := pg_catalog.clock_timestamp();
  v_day := pg_catalog.date_trunc('day', v_now at time zone 'UTC') at time zone 'UTC';
  v_hour := pg_catalog.date_trunc('hour', v_now at time zone 'UTC') at time zone 'UTC';

  -- At most 100 rows are admitted per day. Cleanup is bounded and never deletes active slots.
  with expired as (
    select usage.id from public.chatterbox_usage as usage
    where usage.reserved_at <= v_now - interval '48 hours'
    order by usage.reserved_at, usage.id limit 128
  )
  delete from public.chatterbox_usage as usage using expired where usage.id = expired.id;

  select count(*)::integer, coalesce(sum(usage.text_characters), 0)::integer
    into v_daily_requests, v_daily_characters
    from public.chatterbox_usage as usage where usage.reserved_at >= v_day;
  select count(*)::integer into v_hourly_requests
    from public.chatterbox_usage as usage
    where usage.client_hash = reserve_chatterbox_usage.client_hash and usage.reserved_at >= v_hour;
  select count(*)::integer, min(usage.reserved_at) into v_active, v_oldest_active
    from public.chatterbox_usage as usage
    where usage.reserved_at > v_now - interval '150 seconds';

  if v_daily_requests >= 100 or v_daily_characters + text_characters > 60000 then
    v_retry := greatest(1, ceil(extract(epoch from (v_day + interval '24 hours' - v_now)))::integer);
  elsif v_hourly_requests >= 3 then
    v_retry := greatest(1, ceil(extract(epoch from (v_hour + interval '1 hour' - v_now)))::integer);
  elsif v_active >= 2 then
    v_retry := greatest(1, ceil(extract(epoch from (v_oldest_active + interval '150 seconds' - v_now)))::integer);
  else
    insert into public.chatterbox_usage (reserved_at, client_hash, text_characters)
      values (v_now, reserve_chatterbox_usage.client_hash, reserve_chatterbox_usage.text_characters);
  end if;

  return pg_catalog.jsonb_build_object('allowed', v_retry = 0, 'retryAfterSeconds', v_retry);
end;
$$;

revoke all on function public.reserve_chatterbox_usage(text,integer)
  from public, anon, authenticated, service_role;
grant execute on function public.reserve_chatterbox_usage(text,integer) to service_role;

comment on table public.chatterbox_usage is
  'Expiring reservations with rotating keyed client hashes and character counts only; no prose or raw addresses. No direct client or service table access.';
comment on function public.reserve_chatterbox_usage(text,integer) is
  'Service-only atomic resource admission: 100 calls/60000 characters per UTC day, 3 calls/client/hour, 2 starts per 150 seconds. No refunds or early slot release: failures, crashes, aborts and unknown outcomes consume quota. No provider monetary guarantee.';

commit;
