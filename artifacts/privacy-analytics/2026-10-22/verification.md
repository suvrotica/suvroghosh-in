# Privacy and owner analytics verification

Implementation verified locally on 22 October 2026. Hosted activation is pending; these captures
are not evidence of live collection, a connected Supabase project, or a successful production login.

## Captures

- `consent-desktop.png` and `consent-mobile.png`: the real `/privacy` route in the final production
  build, with optional choices edited in the native preferences dialog.
- `dashboard-fixture.png`: the real dashboard component in a separate test-only harness. Its visible
  banner identifies synthetic data. This harness is not a production route or authorization bypass.

## Passed checks

- Final `npm run build:site`; the earlier feature build lane also completed notebook/content/SEO/
  media/link preparation. The final shared route-asset guard passed after its documented count-only
  adjustment; all four byte limits and deferred/forbidden asset guards remain intact.
- Discoverability: 714 published posts and representative rendered routes.
- `/privacy` is present in both prerendered pages and Vercel static output; it does not need a
  dynamic function invocation for the public policy text.
- `npm run check`: zero errors and warnings.
- `npm run privacy:test`: 50 Vitest tests and seven Node policy/SSR tests.
- `npm run test:critical`: 108 Vitest tests and 35 Node tests.
- `npm run privacy:sql:test`: actual migration execution in isolated PostgreSQL via pinned PGlite,
  including grants, atomic rollups, admission limits, cardinality overflow, reporting day and cleanup.
- `npm run privacy:browser:test`: all 16 tests against the final built site. Covers consent,
  non-modal first visit, focus containment/restoration, expiry, cross-tab changes, blocked storage,
  YouTube activation/withdrawal, private responses, four themes, mobile and 200% text.
- Dashboard component suite: three browser tests, desktop/mobile captures in all four themes,
  native filters, accessible daily figures, empty/error states and 200% text.
- Focused eligible-production-browser unit tests verify SDK and first-party request gating without
  relying on the local preview's development/origin/automation exclusions.
- Focused lint/format checks and `git diff --check`.

## Activation still required

Reuse Vercel Hobby and an existing suitable Supabase Free project. Apply the analytics migration and
separate database cron script, configure the existing Notes owner and private server environment,
then deploy and verify a small real consented increment and protected owner report. No paid service,
plan upgrade, production fixture traffic or broad live crawl is required.

The available Vercel connection currently denies access to this project's scope; Supabase is not
connected in this session. No hosted SQL or environment changes have been applied. See
[the setup guide](../../../docs/privacy-analytics.md) for the exact steps and verification limits.
