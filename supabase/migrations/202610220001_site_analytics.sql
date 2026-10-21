-- Consented, independent daily aggregates. No visitor IDs or per-view history.
-- Apply using a privileged migration connection; never a browser publishable key.
begin;

create table public.site_analytics_daily (
  day date not null,
  dimension text not null check (dimension in ('total','page','country','city','referrer','device','browser')),
  key text not null check (char_length(key) between 1 and 512),
  label text not null check (char_length(label) between 1 and 512),
  views bigint not null default 0 check (views >= 0),
  primary key (day, dimension, key)
);
create index site_analytics_daily_dimension_day on public.site_analytics_daily (dimension, day);

-- Separate, expiring abuse-control state; its key is an HMAC rotating every five minutes.
create table public.site_analytics_limits (
  key text primary key check (char_length(key) <= 70),
  window_start timestamptz not null,
  attempts integer not null check (attempts > 0),
  expires_at timestamptz not null
);
create index site_analytics_limits_expiry on public.site_analytics_limits (expires_at);

alter table public.site_analytics_daily enable row level security;
alter table public.site_analytics_daily force row level security;
alter table public.site_analytics_limits enable row level security;
alter table public.site_analytics_limits force row level security;
revoke all on public.site_analytics_daily, public.site_analytics_limits from public, anon, authenticated;
-- Service-role clients use the bounded functions below, never arbitrary table access.
revoke all on public.site_analytics_daily, public.site_analytics_limits from service_role;

create function public.record_site_page_view(
  p_rate_key text, p_path text, p_country text, p_region text, p_city text,
  p_referrer text, p_device text, p_browser text
) returns text language plpgsql security definer set search_path = ''
set statement_timeout = '3s' set lock_timeout = '1500ms'
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_day date := (v_now at time zone 'Asia/Kolkata')::date;
  v_rate text;
  v_limit integer;
  v_attempts integer;
  v_dimension text;
  v_key text;
  v_label text;
  v_cap integer;
  v_keys text[];
  v_labels text[];
  v_dimensions text[] := array['total','page','country','city','referrer','device','browser'];
  v_index integer;
begin
  if p_rate_key is null or p_rate_key !~ '^[a-f0-9]{64}$'
    or p_path is null or char_length(p_path) > 512 or p_path !~ '^/[^?#%\\[:cntrl:]]*$'
    or p_country is null or (p_country <> 'Unknown' and p_country !~ '^[A-Z]{2}$')
    or p_region is null or (p_region <> 'Unknown' and p_region !~ '^[A-Z0-9]{1,3}$')
    or p_city is null or char_length(p_city) not between 1 and 96 or p_city ~ '[[:cntrl:]]'
    or p_referrer is null or p_referrer <> all(array['Direct or unavailable','Internal','Other external','Google','Bing','DuckDuckGo','Facebook','Instagram','X','LinkedIn','YouTube','Substack','Reddit','ChatGPT','Claude','Perplexity'])
    or p_device is null or p_device <> all(array['Desktop','Tablet','Mobile','Unknown'])
    or p_browser is null or p_browser <> all(array['Edge','Firefox','Chrome','Safari','Other','Unknown'])
  then raise exception 'Invalid aggregate dimensions' using errcode = '22023'; end if;

  -- Serializes this small bounded collector, including daily cardinality admissions.
  -- Counters themselves use atomic ON CONFLICT increments. Lock/statement waits are bounded.
  perform pg_advisory_xact_lock(849221, 1);
  foreach v_rate in array array['global', p_rate_key] loop
    v_limit := case when v_rate = 'global' then 600 else 60 end;
    insert into public.site_analytics_limits as limiter (key, window_start, attempts, expires_at)
    values (v_rate, date_trunc('minute', v_now), 1, v_now + interval '10 minutes')
    on conflict (key) do update set
      window_start = excluded.window_start,
      attempts = case when limiter.window_start = excluded.window_start then limiter.attempts + 1 else 1 end,
      expires_at = excluded.expires_at
    returning attempts into v_attempts;
    if v_attempts > v_limit then return 'rate_limited'; end if;
  end loop;

  v_keys := array['all', p_path, p_country,
    case when p_city = 'Unknown' then 'Unknown' else p_country || '|' || p_region || '|' || lower(p_city) end,
    p_referrer, p_device, p_browser];
  v_labels := array['Recorded page views', p_path, p_country,
    case when p_city = 'Unknown' then 'Unknown' else p_city || ', ' || p_region || ', ' || p_country end,
    p_referrer, p_device, p_browser];

  for v_index in 1..7 loop
    v_dimension := v_dimensions[v_index];
    v_key := v_keys[v_index];
    v_label := v_labels[v_index];
    -- Overflow is a named bucket, never an unbounded new hostname/city/path.
    v_cap := case v_dimension when 'page' then 2048 when 'city' then 512 else 700 end;
    if not exists (select 1 from public.site_analytics_daily where day = v_day and dimension = v_dimension and key = v_key)
      and (select count(*) from public.site_analytics_daily where day = v_day and dimension = v_dimension and key <> 'Other') >= v_cap
    then v_key := 'Other'; v_label := 'Other'; end if;
    insert into public.site_analytics_daily as aggregate (day, dimension, key, label, views)
    values (v_day, v_dimension, v_key, v_label, 1)
    on conflict (day, dimension, key) do update set views = aggregate.views + 1;
  end loop;
  return 'accepted';
end;
$$;

create function public.get_site_analytics_report(p_from date, p_to date)
returns jsonb language plpgsql security definer set search_path = ''
set statement_timeout = '4s' set lock_timeout = '1500ms'
as $$
declare
  v_today date := (clock_timestamp() at time zone 'Asia/Kolkata')::date;
  v_report jsonb;
begin
  if p_from is null or p_to is null or p_from > p_to or p_from < v_today - 179 or p_to > v_today
  then raise exception 'Unsupported date range' using errcode = '22023'; end if;

  with buckets as (
    select dimension, key, min(label) as label, sum(views)::bigint as views
    from public.site_analytics_daily
    where day between p_from and p_to
    group by dimension, key
  ), ranked as (
    select *, row_number() over (partition by dimension order by views desc, key) as rank
    from buckets where dimension <> 'total'
  ), arrays as (
    select dimension, jsonb_agg(jsonb_build_object('key',key,'label',label,'views',views) order by views desc, key) as items
    from ranked where rank <= 200 group by dimension
  )
  select jsonb_build_object(
    'totalViews', coalesce((select views from buckets where dimension = 'total' and key = 'all'),0),
    'distinctPages', (select count(*) from buckets where dimension = 'page' and key <> 'Other'),
    'countryCount', (select count(*) from buckets where dimension = 'country' and key not in ('Unknown','Other')),
    'cityCount', (select count(*) from buckets where dimension = 'city' and key not in ('Unknown','Other')),
    'series', coalesce((select jsonb_agg(jsonb_build_object('date',day,'views',views) order by day) from public.site_analytics_daily where dimension = 'total' and key = 'all' and day between p_from and p_to),'[]'::jsonb),
    'pages', coalesce((select items from arrays where dimension = 'page'),'[]'::jsonb),
    'countries', coalesce((select items from arrays where dimension = 'country'),'[]'::jsonb),
    'cities', coalesce((select items from arrays where dimension = 'city'),'[]'::jsonb),
    'referrers', coalesce((select items from arrays where dimension = 'referrer'),'[]'::jsonb),
    'devices', coalesce((select items from arrays where dimension = 'device'),'[]'::jsonb),
    'browsers', coalesce((select items from arrays where dimension = 'browser'),'[]'::jsonb)
  ) into v_report;
  return v_report;
end;
$$;

create function public.cleanup_site_analytics(p_limit integer default 25000)
returns jsonb language plpgsql security definer set search_path = ''
set statement_timeout = '10s' set lock_timeout = '1500ms'
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit,25000),50000));
  v_aggregates integer;
  v_limits integer;
begin
  delete from public.site_analytics_daily where ctid in (
    select ctid from public.site_analytics_daily
    where day < (clock_timestamp() at time zone 'Asia/Kolkata')::date - 179
    order by day limit v_limit for update skip locked
  );
  get diagnostics v_aggregates = row_count;
  delete from public.site_analytics_limits where ctid in (
    select ctid from public.site_analytics_limits where expires_at <= clock_timestamp()
    order by expires_at limit v_limit for update skip locked
  );
  get diagnostics v_limits = row_count;
  return jsonb_build_object('aggregateRowsDeleted',v_aggregates,'rateKeysDeleted',v_limits);
end;
$$;

revoke all on function public.record_site_page_view(text,text,text,text,text,text,text,text) from public, anon, authenticated;
revoke all on function public.get_site_analytics_report(date,date) from public, anon, authenticated;
revoke all on function public.cleanup_site_analytics(integer) from public, anon, authenticated;
grant execute on function public.record_site_page_view(text,text,text,text,text,text,text,text) to service_role;
grant execute on function public.get_site_analytics_report(date,date) to service_role;
grant execute on function public.cleanup_site_analytics(integer) to service_role;

commit;

-- Run the separate analytics-cron.sql once after this migration. pg_cron is provisioned
-- by Supabase and is deliberately separate so the schema also runs in local Postgres.
