-- Prompt Atlas provider-request reservations. This migration does not enable a provider,
-- verify a free tier, or promise that a request-count limit is a monetary spending limit.
-- Apply through the repository's privileged migration process, never a browser client.
begin;

create table if not exists public.prompt_atlas_usage (
  bucket_key text primary key check (char_length(bucket_key) between 1 and 100),
  bucket_start timestamptz not null,
  reservations integer not null check (reservations between 1 and 100),
  expires_at timestamptz not null check (expires_at > bucket_start)
);
create index if not exists prompt_atlas_usage_expiry
  on public.prompt_atlas_usage (expires_at, bucket_key);

alter table public.prompt_atlas_usage enable row level security;
alter table public.prompt_atlas_usage force row level security;
-- No direct client or service-role table access: only the bounded RPC below.
revoke all on public.prompt_atlas_usage from public, anon, authenticated, service_role;

create or replace function public.reserve_prompt_atlas_usage(
  client_hash text,
  daily_request_limit integer,
  hourly_client_limit integer
) returns jsonb
language plpgsql
security definer
set search_path = ''
set statement_timeout = '3s'
set lock_timeout = '1s'
as $$
declare
  v_now timestamptz;
  v_day timestamptz;
  v_hour timestamptz;
  v_day_key text;
  v_client_key text;
  v_daily integer := 0;
  v_hourly integer := 0;
  v_retry integer := 0;
  v_allowed boolean := false;
begin
  -- The server must HMAC the address with its private salt and a rotating UTC bucket.
  -- No raw address, prompt, model output, email, or visitor history is accepted here.
  if client_hash is null or client_hash !~ '^[a-f0-9]{64}$'
    or daily_request_limit is null or daily_request_limit not between 1 and 100
    or hourly_client_limit is null or hourly_client_limit not between 1 and 10
  then
    raise exception 'Invalid Prompt Atlas quota parameters' using errcode = '22023';
  end if;

  -- One fixed transaction lock serializes the shared daily budget and client admission.
  -- It is the same lock for every application instance and client key. Both reads and
  -- both increments are in this transaction; failure rolls back the entire reservation.
  perform pg_catalog.pg_advisory_xact_lock(849225, 1);
  -- Read the clock after acquiring the lock, including when waiting crosses midnight.
  v_now := pg_catalog.clock_timestamp();
  v_day := pg_catalog.date_trunc('day', v_now at time zone 'UTC') at time zone 'UTC';
  v_hour := pg_catalog.date_trunc('hour', v_now at time zone 'UTC') at time zone 'UTC';
  v_day_key := 'day:' || pg_catalog.to_char(v_day at time zone 'UTC', 'YYYYMMDD');
  v_client_key := 'client:' || client_hash || ':' || pg_catalog.to_char(v_hour at time zone 'UTC', 'YYYYMMDDHH24');

  -- Physical deletion is bounded and only touches this feature's expired quota rows.
  -- Idle rows remain inaccessible and are removed on later reservations. Denied
  -- requests also perform cleanup but never allocate a row for a new client key.
  with expired as (
    select bucket_key from public.prompt_atlas_usage
    where expires_at <= v_now
    order by expires_at, bucket_key
    limit 128
  )
  delete from public.prompt_atlas_usage as usage
  using expired
  where usage.bucket_key = expired.bucket_key;

  select reservations into v_daily from public.prompt_atlas_usage where bucket_key = v_day_key;
  select reservations into v_hourly from public.prompt_atlas_usage where bucket_key = v_client_key;
  v_daily := coalesce(v_daily, 0);
  v_hourly := coalesce(v_hourly, 0);

  if v_daily >= daily_request_limit then
    v_retry := greatest(1, ceil(extract(epoch from (v_day + interval '24 hours' - v_now)))::integer);
  elsif v_hourly >= hourly_client_limit then
    v_retry := greatest(1, ceil(extract(epoch from (v_hour + interval '1 hour' - v_now)))::integer);
  else
    insert into public.prompt_atlas_usage as usage (bucket_key, bucket_start, reservations, expires_at)
    values (v_day_key, v_day, 1, v_day + interval '48 hours')
    on conflict (bucket_key) do update set reservations = usage.reservations + 1
    returning reservations into v_daily;

    insert into public.prompt_atlas_usage as usage (bucket_key, bucket_start, reservations, expires_at)
    values (v_client_key, v_hour, 1, v_hour + interval '2 hours')
    on conflict (bucket_key) do update set reservations = usage.reservations + 1
    returning reservations into v_hourly;
    v_allowed := true;
  end if;

  return pg_catalog.jsonb_build_object(
    'allowed', v_allowed,
    'retryAfterSeconds', v_retry,
    'dailyReservations', v_daily,
    'hourlyClientReservations', v_hourly,
    'dayResetAt', pg_catalog.to_char((v_day + interval '24 hours') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'hourResetAt', pg_catalog.to_char((v_hour + interval '1 hour') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  );
end;
$$;

revoke all on function public.reserve_prompt_atlas_usage(text,integer,integer)
  from public, anon, authenticated, service_role;
grant execute on function public.reserve_prompt_atlas_usage(text,integer,integer)
  to service_role;

comment on table public.prompt_atlas_usage is
  'Expiring UTC quota buckets only; no prompt content or raw client addresses. Service-only RPC reservations bound shared request volume, not provider cost.';
comment on function public.reserve_prompt_atlas_usage(text,integer,integer) is
  'Reserve before a provider request. No refunds or retries: failed provider calls still consume the reservation. Fixed ceilings: 100 requests per UTC day globally, 10 per client per UTC hour.';

commit;
