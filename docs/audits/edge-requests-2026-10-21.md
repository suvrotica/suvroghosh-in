# Edge Request incident: 21 October 2026

## Evidence and attribution

Vercel paused `suvro-ghoshs-projects` for exceeding the Hobby Edge Request allowance. The
homepage and articles returned HTTP 402 `DEPLOYMENT_DISABLED`. Vercel Support applied its
one-time free boost on 21 October: a temporary 3,000,000-request allowance through
20 November 2026. The account remained on Hobby.

The authenticated dashboard supplied the following rounded observations on 21 October:

| View                                    | Observation                                                                                                                    |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Production Observability, last 12 hours | 160,000 CDN requests; 141,000 used Windows HeadlessChrome 146.0.7680.165.                                                      |
| Firewall, allowed traffic, past day     | 315,700 requests; 280,000 used that headless browser version (about 88.7%).                                                    |
| Firewall, network facet, same day view  | 289,500 requests attributed to Microsoft Corporation's network. This is a separate aggregate, not a client-identity cross-tab. |
| Firewall, top paths                     | `/blog`: about 1,700; `/service-worker.js`: 464; two commonly loaded font paths: 460 and 452; `/`: 446.                        |

These data show a dominant automated-browser workload and substantial asset fan-out. They do
not identify the individual operator, establish that every request was malicious, or reconstruct
the entire rolling 30-day allowance. Free Observability exposes only the recent 12-hour window;
the Firewall day view adds context. The Pro-gated Paths table's demonstration rows were not used
as incident evidence. No raw IP addresses, client identifiers or authentication data are retained
in this report.

## Reproduced amplification

At commit `f691bca95d666fd21d7f6aa198af8ce30384e64b`, the service-worker install handler ran
`cache.addAll(build)`. The built manifest contained **1,066 assets**: 905 JavaScript files,
67 CSS files, 93 fonts and one SVG, about 30.4 MiB before transfer compression. This included
unopened articles and unrelated interactive features. Every fresh worker installation could
therefore request the whole runtime collection. Repeated deployments generated new versioned
worker caches.

Git history traces that precache call to `07ac49df9`, dated 23 July 2026. It predates the
missing-data visualization, and its cost grows with the site's complete build graph.

A fresh Chrome 155 context against the local production preview reproduced **1,120 same-origin
request events**, **1,080 unique requested URLs**, and 1,067 worker-originated events. Its build
cache contained 1,067 entries including the timestamp marker. The browser version differs from
the dashboard's dominant Chrome 146 client; this experiment reproduces the site's behavior and
does not identify that client's operator.

Browser request events can include page and worker initiators, so they are **not exact Vercel
billable-request counts**. The [before receipt](../../artifacts/traffic/cold-home-before.json)
records unique URLs, successful deliveries, browser version and worker hash separately.

Static resources and functions both consume CDN Requests, including CDN cache hits. Better
shared caching alone would not fix the installation fan-out. See
[Vercel's CDN usage definition](https://vercel.com/docs/manage-cdn-usage#cdn-requests).

## Changes

- Worker installation creates an empty versioned cache and timestamp only. Actual requested
  build resources populate it on demand; concurrent requests are deduplicated, and old runtime
  caches retain their compatibility window.
- Opened public notes retain bounded offline preparation. Only already-requested build assets
  and publication-referenced public images qualify; private/authenticated responses stay excluded.
- Routine hosted narration no longer rechecks the three initial articles on a no-work run.
  Newly ready and pending unverified deliveries still receive production verification before
  their source WAV copies are retired. Explicit verification/probe modes retain the fixtures.
- Production-capable smoke/capture/performance contexts block service workers. Repeated feature
  verification belongs on local previews, with dedicated local tests for offline behavior.

The investigation also found hover preloading, a single bounded narration-manifest lookup per
article, and Pagefind search-fragment loading. No sitewide API polling loop was found. Those
smaller behaviors were left outside this fix. No blanket bot, user-agent, country or network
block was introduced; articles, crawlers, feeds, previews and static resources keep their normal
access paths. No plan, billing, DNS, credential or firewall setting changed.

The architectural trade-off is recorded in
[ADR 0005](../architecture/decisions/0005-demand-driven-offline-caching.md) and the
[canonical architecture](../architecture/ARCHITECTURE.md#10-caching-and-offline-behavior).

## Verification and follow-through

Focused tests cover zero install fetches with the full-size manifest, demand caching,
concurrency, first-note rescue allowlists, private response exclusions, retained runtimes,
revocation, expiry, helper bounds, no-work narration and publication-retirement ordering.

The controlled local cold-home comparison produced:

| Browser instrumentation          | Before | After |
| -------------------------------- | -----: | ----: |
| Same-origin request events       |  1,120 |    56 |
| Unique requested URLs            |  1,080 |    54 |
| Worker-originated request events |  1,067 |     2 |
| Unique delivered URLs            |  1,078 |    52 |
| Cache Storage entries            |  1,067 |     2 |

Request events and unique requested URLs both fell **95% in this local sample**. The complete
manifest still contained 1,066 resources; the changed installation policy accounted for the
reduction. The after cache held its timestamp and one requested asset. The
[after receipt](../../artifacts/traffic/cold-home-after.json) identifies the rebuilt worker
separately from the base commit and marks the measured working tree as modified.

The [offline browser receipt](../../artifacts/traffic/note-offline-seam.json) uses a synthetic
local public note, the actual built worker and the exact browser-helper source. With browser
HTTP cache cleared, its runtime, CSS, font, image and public document survived an offline
reload, which generated zero origin requests. This verifies the caching seam without claiming
a live Supabase authorization test.

Validation passed: `npm run check` (zero errors/warnings), `npm run narration:test` (98 Node
and eight player tests), `npm run test:critical` (seven worker and 89 unit tests), ten local
missing-data browser cases, performance
and architecture gate fixtures, scoped ESLint, the piano capture/provenance check, and
`npm run build:full` including discoverability and route-asset validation. The repository's
named `security:audit` and `security:smoke` commands remain absent, as recorded in the forensic
audit; this task does not claim they ran.

The account's rolling allowance does not reset because this code is deployed. The temporary
boost ends on 20 November 2026. A sustained average below roughly 33,333 requests per day is
necessary for a one-million-request 30-day allowance, and a lower operating target leaves room
for traffic spikes and other projects. Future demand, crawler behavior, retained old clients
and the actual rolling usage still determine whether Hobby remains sufficient. The local
experiment is a request-amplification regression check, not a guarantee of future billing usage.
