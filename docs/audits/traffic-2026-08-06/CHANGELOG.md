# Audit changelog

Audit date: **2026-08-06 (Asia/Calcutta)**

Immutable baseline: `1952c2d523bf4b6bbd352d8e8c041b912ae9ae89` on clean, synchronized `main`

Audit branch: `audit/traffic-indexing-2026-08-06`

## Evidence and tooling added

- Added deterministic audit tooling for production URL reconciliation, bounded multi-user-agent crawling, canonical/indexability checks, rendered-content comparison, media/structured-data review, JavaScript transfer measurement, and the internal-link graph.
- Added deterministic corpus tooling for inventory, content-mode classification, similarity/cannibalization candidates, and evidence-risk triage.
- Added telemetry-blocked Lighthouse and semantic/visualization probe tooling with local regression tests.
- Added sanitized public audit reports and CSV evidence under this directory.
- Added `.audit-private/` to `.gitignore` before saving authenticated/account evidence, raw lab output, and the private decision log.

The audit tools use existing project/runtime dependencies and add no package or lockfile change.

### Accepted production crawl and architecture closure

- Accepted the completed production crawl covering 1,022 reconciled URLs, 935 rendered canonical nodes, 46,253 internal edge-evidence rows, 85 direct one-hop aliases, and a 60-URL × eight-user-agent sample with zero material differences.
- Added a deterministic audit-only postprocessor and generated `INTERNAL_LINKS_AND_ARCHITECTURE.md`, `HUB_RECOMMENDATIONS.md`, `TRAFFIC_CANONICAL_RECONCILIATION.csv`, and `FLAGSHIP_ARCHITECTURE.csv` from the accepted crawl outputs and existing sanitized traffic/flagship inputs.
- Closed the crawl-pending report statuses with bounded findings: 933 strictly eligible canonicals, 59 near-orphans, two notebook dead ends, 218 pagination-only canonicals, one visible-unreachable inactive-tab resource, and 25/25 technically eligible, contextually linked, hub-supported flagships. Engine indexing remains unverified.
- Canonical traffic reconciliation preserves raw rows, excludes the sanitized non-unique aggregate, and uses group maxima rather than sums. Of 245 observed public paths, 243 match 243 canonical groups and two historical paths remain unmatched.
- No application route, content page, crawler, sitemap, canonical, redirect, noindex rule, internal link, or external state was changed by this postprocessing step.

## Small reversible corrections

### Stale living-pigment test boundary

Updated `scripts/living-pigment.test.mjs` to verify the current shared published-post loader boundary instead of asserting the route's obsolete direct-call shape. This is a test-only correction; application behavior, routes, canonicals, and rendered content are unchanged.

### Notes coverage in the production IndexNow workflow

Updated `.github/workflows/indexnow.yml` so the main and Notes sitemaps are diffed independently against distinct cached successful snapshots. Added a workflow regression assertion to `scripts/indexnow.test.mjs` and clarified the behavior in `README.md`.

The change remains gated to successful production deployments or explicit manual dispatch. Exact-origin validation, deleted-URL notification, no-change skipping, and failure-before-checkpoint behavior remain in place. No submission was made during the audit; live operation remains an owner-verification item.

## External state

No DNS record, webmaster property, Vercel setting, deployment, analytics configuration, email configuration, reputation-service state, form submission, outreach message, social post, or IndexNow submission was created or changed.

The only known **Vercel Web Analytics/Speed Insights measurement** side effect was an audit incident: 31 initial unblocked Lighthouse navigations completed between 13:05:43 and 13:15:54 IST before the process was stopped. They may affect post-snapshot Vercel Analytics/Speed Insights. The accepted replacement matrix blocks and verifies Vercel telemetry; full details are in [ANALYTICS_TRUTH.md](./ANALYTICS_TRUTH.md).

As with any bounded production GET/HEAD audit, the crawl and response checks may also appear in ordinary origin, CDN, server, WAF, or request logs. Those operational request records were not inspected, suppressed, or modified and are distinct from the Vercel analytics and speed telemetry described above.

## Editorial boundary

No article was rewritten, merged, removed, redirected, or noindexed. Content consolidation, evidence upgrades, title/snippet work, hub changes, identity linkage, and distribution remain proposals requiring owner/editorial review.

## Validation record

The untouched baseline and final widening checks are recorded in [COMMAND_RESULTS.md](./COMMAND_RESULTS.md). Focused audit-tool and remediation tests are also summarized there. The repository-wide formatting baseline contains unrelated pre-existing differences; this audit does not reformat them.
