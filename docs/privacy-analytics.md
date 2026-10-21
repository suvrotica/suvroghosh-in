# Privacy choices and the Fieldbook Observatory

The application implements optional measurement/media choices and an owner-only aggregate report.
Application deployment does not apply database migrations or configure the existing owner account.

## Hosting constraint

Keep this project on the owner's Vercel Hobby plan. This feature does not authorize a paid plan,
analytics add-on, geolocation service, map service or database upgrade. Reuse a Supabase Free project
where available and verify its actual capacity before activation. No Vercel Cron job is added; cleanup
uses Supabase's database scheduler. The code does not enable any paid Vercel analytics tier.

The application adds one small Function request per consented recorded page view and bounded owner
report reads. Those requests consume the existing Hobby allowance; aggregate storage consumes the
database's allowance. [Vercel Hobby](https://vercel.com/docs/plans/hobby) applies usage limits, and
[Supabase Free](https://supabase.com/pricing) currently includes a 500 MB database and can pause after
inactivity. This is not a guarantee of unlimited collection or continuously available free storage.

The new page-view and city dashboard does not depend on Vercel's paid custom-event reports. The
existing custom-event calls are now consent-gated, but [Vercel custom-event reporting](https://vercel.com/docs/analytics/custom-events)
is available only on Pro/Enterprise. Do not upgrade to enable it for this feature. The separate
Vercel Web Analytics integration also requires its existing project-level enablement and a subsequent
deployment, as described in [Vercel's setup guide](https://vercel.com/docs/analytics/quickstart).

## Visitor experience

- `/privacy` explains actual storage and optional services. Footer settings and a compact control on
  footerless public experiences reopen the same preferences dialog.
- `suvroghosh:consent` is a version-one localStorage record with analytics/media booleans and save/expiry
  timestamps, retained for 180 days. It is not an identifier. Rejection has the same lifetime.
- Invalid/expired choices disable optional services. Storage denial leaves a choice in memory for
  that document; existing measurement storage checks still fail closed.
- Both localStorage and sessionStorage `suvroghosh:measurement=off` override analytics permission.
- YouTube server-renders local placeholders. One-video activation is distinct from remembered media
  permission; withdrawal removes active players. No new YouTube/CSP host is introduced.
- Theme/motion settings, saved feature work, same-origin notebooks and Notes authentication remain
  independent of optional measurement. Rejection never clears all site data.

## Collection and reporting

The root layout owns optional provider initialization and first-party navigation counting. An
in-memory ledger counts a pathname visit once, including the current page when permission is first
given; query/hash changes and repeated effects do not generate new views. No visitor ID is stored.

`POST /api/analytics/pageview` requires exact same-origin JSON with
`{ "v": 1, "consent": true, "path": "/writing" }` and an optional sanitized referrer hostname.
The indication is a browser choice, not proof of a human or protection against arbitrary clients.
The endpoint limits streamed input to 2 KiB, bounds read/database duration, validates known public
paths, and applies process-local and atomic database admission limits. No retries are queued.

Writes occur only in canonical Vercel production, never local development or previews. Approximate
geography uses provider headers, not body-supplied cities or browser GPS. Missing/malformed geography
is Unknown. VPN/proxy/mobile exits can describe a different location from the person reading.

The database stores independent daily total/page/country/city/referrer/device/browser counters in
Asia/Kolkata. It does not store per-view events, raw IP/UA, precise coordinates, visitor identifiers,
durable IP hashes or individual browsing histories. Admission control uses separate expiring keys.
Provider infrastructure logs and Vercel's own reports have separate policies.

The dashboard measures recorded consented page views, not unique people or all traffic. Daily
cardinality caps put overflow into Other. Reports are bounded to the retained 180 reporting days;
top lists return at most 200 rows. First-party and provider counts must not be summed.

## Hosted setup

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

The public `/notes` shelf is eligible for first-party counts. Individual dynamic Notes URLs are
deliberately excluded from this registry; the existing provider measurement policy remains separate.

## Retention and operational checks

Report queries exclude older data regardless of cleanup timing. Cleanup removes aggregates older
than 180 reporting days and expired admission keys in bounded batches. Expiry does not itself delete
rows: the installed job must run successfully. Check its run results and backlog after activation;
large backlogs need repeated bounded batches, not an unbounded deletion.

Withdrawal cancels unsent first-party work and blocks future optional events. It cannot recall a
request already received or identify one browser's contribution inside identifier-free aggregates.

An unconfigured backend does not prevent reading. Reports show an honest unavailable state; the
collector returns an unavailable response without throwing into the visitor UI. Do not interpret an
empty report as proof that hosted collection or retention is configured.

## Verification

- `npm run privacy:test`: consent lifecycle, eligible-browser network/SDK gating, navigation ledger,
  bounded endpoint policy, report ranges, configured-owner authorization and safe CSV.
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

Hosted verification additionally requires successful migration/cron checks, a bounded real consented
view, a protected owner report showing the increment, and unauthorized page/export checks. Do not
seed fake traffic into production to make a screenshot. Local mocked tests do not prove hosted access.

## Shared media resource budget

The always-available media-consent controller and local YouTube placeholder styles change the
emitted static dependency graph of existing articles. The Barnum route's count ceiling is adjusted
from 31 to 34 files for those shared edges and framework chunk partitioning. Its four byte ceilings,
forbidden-feature markers and deferred-runtime boundary are unchanged. The inspected feature build
had 288,158 raw / 103,945 gzip JavaScript bytes and 33,199 raw / 9,491 gzip CSS bytes, within the
existing limits. A separate 35-tiny-file fixture proves the count check still rejects excess
requests independently of payload size. This change does not alter the Barnum experience itself.
