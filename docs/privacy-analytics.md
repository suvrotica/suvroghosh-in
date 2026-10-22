# Privacy choices and the Fieldbook Observatory

The current browser runs default cookieless Vercel public-page counts and media-only YouTube
preferences. It does not send first-party page counts, initialize Speed Insights or send custom
visualization events. The bounded first-party endpoint remains available for older consented
clients, and the owner-only aggregate report retains its existing backend and historical data.
Application deployment does not apply database migrations or configure the existing owner account.
See [ADR 0008](architecture/decisions/0008-media-only-consent.md).

## Hosting constraint

Keep this project on the owner's Vercel Hobby plan. This feature does not authorize a paid plan,
analytics add-on, geolocation service, map service or database upgrade. Reuse a Supabase Free project
where available and verify its actual capacity before activation. No Vercel Cron job is added; cleanup
uses Supabase's database scheduler. The code does not enable any paid Vercel analytics tier.

The current browser does not add a first-party Function request for each view. Accepted older-client
collector requests and bounded owner report reads still consume the existing hosting/database
allowances. [Vercel Hobby](https://vercel.com/docs/plans/hobby) applies usage limits, and
[Supabase Free](https://supabase.com/pricing) has its own capacity and availability constraints. This
is not a guarantee of unlimited collection or continuously available free storage.

Custom-event and Speed Insights dispatch have been retired from the browser. Vercel Web Analytics
still requires its existing project-level enablement and a subsequent deployment, as described in
[Vercel's setup guide](https://vercel.com/docs/analytics/quickstart). No paid analytics tier is enabled
by this change.

## Visitor experience

- `/privacy` explains actual storage, default Vercel page counts, YouTube loading and retained legacy
  collection. Footer settings and a compact control on footerless public experiences reopen the
  same media preferences dialog.
- `suvroghosh:consent` is a version-two localStorage record containing `v`, `media`, `savedAt` and
  `expiresAt`. A saved media choice lasts 180 days and is not a visitor identifier. New records have
  no analytics field. Valid version-one records preserve media permission and their original
  timestamps; the analytics value is discarded and the expiry is not extended.
- The media controls offer "Keep videos paused" and "Allow YouTube". There is no analytics choice,
  and neither media preference changes nor legacy `suvroghosh:measurement=off` values affect default
  public-page counts. Storage denial does not prevent Vercel pageviews.
- Invalid/expired preferences leave YouTube paused. If storage is blocked, a saved media choice
  stays in memory for that document. The notice can be dismissed without saving a choice or loading
  a video.
- YouTube server-renders local placeholders. One-video activation is distinct from remembered media
  permission; withdrawal, expiry and cross-tab preference changes remove active players. No new
  YouTube/CSP host is introduced.
- Theme/motion settings, saved feature work, same-origin notebooks and Notes authentication remain
  independent. A media choice never clears all site data.

## Current browser collection

The root layout owns Vercel initialization and one in-memory navigation ledger. It counts each
eligible pathname visit once; query/hash changes and media preference updates do not generate new
views. The SDK's automatic navigation subscription is disabled to keep one navigation owner. The
application stores no visitor ID for this ledger. Lifecycle disposal blocks later callbacks.

Public pageviews do not read consent or browser storage, including the old local/session
`suvroghosh:measurement=off` preference. Provider pageviews use the current browser origin rather
than a canonical-origin gate; the application adds no webdriver, country or location condition.
The SDK's own development/production and automation behavior remains intact. Provider callbacks
validate same-browser-origin URLs, remove query/fragment state and exclude API and Notes
studio/auth paths, including encoded forms. Vercel receives pageviews directly through its existing
endpoints, without a first-party proxy or country override. The current browser sends no custom
events, Speed Insights or `/api/analytics/pageview` requests.

## Retained legacy collection and reporting

`POST /api/analytics/pageview` remains available to older consented clients. It requires exact
same-origin JSON with `{ "v": 1, "consent": true, "path": "/writing" }` and an optional sanitized
referrer hostname. The indication is a browser choice, not proof of a human or protection against
arbitrary clients. The endpoint limits streamed input to 2 KiB, bounds read/database duration,
validates known public paths, and applies process-local and atomic database admission limits.
Current browser code does not dispatch to it; existing server acceptance and reporting behavior
are retained.

Writes occur only in canonical Vercel production, never local development or previews. Approximate
geography uses provider headers, not body-supplied cities or browser GPS. Missing/malformed geography
is Unknown. VPN/proxy/mobile exits can describe a different location from the person reading.

The database stores independent daily total/page/country/city/referrer/device/browser counters in
Asia/Kolkata. It does not store per-view events, raw IP/UA, precise coordinates, visitor identifiers,
durable IP hashes or individual browsing histories. Admission control uses separate expiring keys.
Provider infrastructure logs and Vercel's own reports have separate policies.

The owner dashboard measures retained consented first-party page views, including any accepted
older-client requests, rather than unique people or current Vercel traffic. Its existing labels and
backend do not imply that a current reader can enable first-party collection. Daily cardinality caps
put overflow into Other. Reports are bounded to the retained 180 reporting days; top lists return
at most 200 rows. First-party and provider counts must not be summed. This change neither deletes
historical aggregates nor disables the compatibility endpoint.

## Retained backend setup

These steps apply to the retained first-party backend and owner reports, not to enabling current
browser collection. Review existing hosted configuration before making any operational change.

1. Reuse the existing Notes Supabase project and configured-owner identity. Ensure these private
   server variables are present in the correct deployment environment:
   `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
   `NOTES_OWNER_USER_ID`, and `NOTES_RATE_LIMIT_SALT` (at least 32 random bytes, as in the Notes guide).
   Do not add `PUBLIC_` prefixes. The owner sign-in flow also needs its existing Notes schema/setup.
2. Apply `supabase/migrations/202610220001_site_analytics.sql` using the project's privileged
   migration connection or SQL editor. It creates the two RLS-protected tables and service-role-only
   record/report/cleanup functions. Do not expose SQL execution or service credentials to browsers.
3. Apply `supabase/analytics-cron.sql` in the same project. It installs a named ten-minute bounded
   cleanup job. This is separate so ordinary schema tests do not need pg_cron. Verify the active
   schedule and a successful run using the read-only queries at the end of that file.
   The extension installs in `pg_catalog`, while its scheduling tables live in `cron`; see
   [Supabase Cron installation](https://supabase.com/docs/guides/cron/install).
4. Deploy the application using the repository's normal Vercel release flow. Application deployment
   alone does not migrate Supabase. Do not configure production credentials for a browser fixture.
5. Sign in through `/notes/sign-in?returnTo=%2Fnotes%2Fstudio%2Fanalytics`, then open
   `/notes/studio/analytics`. A link is also present inside Notes studio.

The SQL record function increments all rollups atomically with bounded lock/statement waits. Direct
table access and RPC execution by anonymous/authenticated browser roles are denied. The privileged
server query is reachable only after the configured-owner check; a different authenticated user is
not sufficient. CSV exports repeat authorization independently and escape spreadsheet formulas.
Owner identity verification is bounded to five seconds with fetch cancellation; hook-level failures
return private no-store errors before a report can be queried.

The legacy registry permits the public `/notes` shelf and excludes individual dynamic Notes URLs.
The current Vercel pageview policy remains separate.

## Retention and operational checks

Report queries exclude older data regardless of cleanup timing. Cleanup removes aggregates older
than 180 reporting days and expired admission keys in bounded batches. Expiry does not itself delete
rows: the installed job must run successfully. Check its run results and backlog after activation;
large backlogs need repeated bounded batches, not an unbounded deletion.

Media withdrawal removes active YouTube players and stops remembered media loading. It has no
measurement effect. Removing current-browser first-party dispatch cannot recall accepted older
requests or identify a browser's contribution inside identifier-free aggregates. Retention and
owner access continue to apply to the retained dataset.

An unconfigured backend does not prevent reading. Reports show an honest unavailable state; the
collector returns an unavailable response without throwing into the visitor UI. Do not interpret an
empty report as proof that hosted collection or retention is configured.

## Verification

- `npm run privacy:test`: media-only v2 preferences, valid v1 media migration with original expiry,
  default provider views independent of consent/storage/legacy opt-out values, one navigation
  ledger, URL sanitation/private-path exclusions, absence of current-browser intake/performance/
  custom events, bounded legacy endpoint policy, report ranges, owner authorization and safe CSV.
- `npm run privacy:browser:test`: built loopback preview, blocked service workers, full-site privacy
  controls and private-response checks.
- `npm run privacy:dashboard:test`: the isolated, labelled synthetic dashboard visual harness.
- `npm run privacy:sql:test`: executes the migration, grants, counters and cleanup in a real local
  PostgreSQL WASM engine. Install its pinned runtime outside the checkout with
  `npm install --prefix <temporary-folder> --no-save --ignore-scripts @electric-sql/pglite@0.5.11`,
  then set `ANALYTICS_SQL_RUNTIME` to that folder. The critical-boundaries workflow does this in its
  temporary directory; it does not need hosted database credentials.
- The standalone dashboard harness under `tests/` renders labelled synthetic data for visual tests.
  It is not a production route or an authentication bypass.
- `npm run check`, `npm run test:critical`, the feature build lane, and the architecture gate cover
  affected shared boundaries. The older named `security:audit`/`security:smoke` commands do not exist
  in this checkout and are not reported as passing.

Verify default provider recording separately from retained first-party backend readiness. Hosted
backend checks cover existing migration/cron state, authorized historical reports and unauthorized
page/export responses. Do not seed fake traffic into production to make a screenshot or treat an
empty report as proof of current audience loss. Local mocked tests do not prove hosted access or
live provider acceptance; regional HTTP probes do not prove browser analytics ingestion.

## Shared media resource budget

The always-available media-consent controller and local YouTube placeholder styles change the
emitted static dependency graph of existing articles. The Barnum route's count ceiling is adjusted
from 31 to 34 files for those shared edges and framework chunk partitioning. Its four byte ceilings,
forbidden-feature markers and deferred-runtime boundary are unchanged. The inspected feature build
had 288,158 raw / 103,945 gzip JavaScript bytes and 33,199 raw / 9,491 gzip CSS bytes, within the
existing limits. A separate 35-tiny-file fixture proves the count check still rejects excess
requests independently of payload size. This change does not alter the Barnum experience itself.
