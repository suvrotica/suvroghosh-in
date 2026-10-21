# ADR 0005: Cache requested resources instead of installing the whole site

- Date: 21 October 2026
- Status: Accepted
- Affects: [Caching and offline behavior](../ARCHITECTURE.md#10-caching-and-offline-behavior)
  and [test verification](../ARCHITECTURE.md#11-tests-and-architectural-verification)

## Context

Vercel paused the Hobby team after its Edge Request allowance was exhausted. The worker's
install handler called `cache.addAll(build)`. The 21 October build contained 1,066 resources,
including code for unrelated articles, games and visualizations, and 93 font files. A fresh local
homepage context reproduced more than one thousand requests. A new worker version repeated
this process. Recent Vercel traffic was dominated by automated browser clients, which amplified
the cost of this installation policy. CDN cache hits still consume the request allowance.

Public notes need offline access to publications the reader has opened. That requirement does
not require downloading every application route on ordinary article or homepage visits.
Private notes, authentication and mutable APIs must never enter a public offline cache.

## Decision

Create an empty versioned build cache at installation and populate it only when an allowed
build asset is actually requested. Keep the build-generated URL allowlist, cache-first reads,
current and retained build caches, public-note response checks, expiry and eviction boundaries.

For a first public-note visit that preceded worker control, use a bounded readiness handshake
from the public-note viewer. Only resources already requested by that viewer are eligible.
The worker validates the originating public-note client and resource allowlists; it does not
accept arbitrary URLs or private content for caching. This preserves opened-note offline
reading without restoring a whole-build download.

Production-capable verification and capture contexts block service workers. Dedicated offline
regressions enable them only against loopback production previews. Routine narration publication
verifies new or pending unverified deliveries; manual verification and deployment probes retain
the explicit initial fixtures. Successful live verification remains a prerequisite for retiring
pending source audio.

## Alternatives

- Keep the whole-build precache: makes all runtime assets available, but requests and transfers
  grow with the entire corpus rather than the page being read.
- Remove the worker: eliminates installation traffic but loses the existing public-note offline
  product behavior and compatibility with saved note pages.
- Block headless clients or whole networks: cannot reliably distinguish legitimate renderers,
  search crawlers, accessibility tools and abuse, and leaves the amplification bug in place.
- Increase only CDN cache duration: reduces origin work but does not eliminate requests reaching
  Vercel. Existing hashed build assets already support browser caching.

## Consequences and verification

Unvisited routes are not promised to work offline. Opened public notes retain their dedicated
offline behavior, subject to the existing publication, storage and expiry constraints. Existing
users can retain an old worker until its normal update and activation; no forceful cache purge
or worker reload is introduced.

Regression coverage must exercise an empty install, demand caching, first-visit public-note
offline hydration, worker-message bounds, private-response exclusions, expiry and revocation.
Compare fresh local homepage request counts before and after using workers enabled, and retain
the measurement boundary (browser events versus unique resource paths). Verify live publication
with a small bounded smoke check rather than another production corpus crawl.

No new service, endpoint, paid feature, firewall rule or credential is introduced.
