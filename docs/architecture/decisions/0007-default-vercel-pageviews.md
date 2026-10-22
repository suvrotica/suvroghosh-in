# 0007 — Default Vercel pageviews with separate optional measurement

- Date: 23 October 2026
- Status: Accepted
- Partially supersedes: [0006](0006-consented-aggregate-analytics.md), provider pageview consent and eligibility

## Context

The SEO/AEO release added application-level measurement eligibility checks. A subsequent privacy
release required affirmative consent for Vercel Web Analytics as well as new first-party reporting.
Those changes altered the counted population, making the earlier and later country panels
incomparable. No India-only source or configured firewall country restriction was found, and the
precise contribution of measurement changes to actual international audience loss remains unknown.

The owner explicitly requested restoring previous Vercel tracking, preserving SEO fixes, deploying,
and verifying production recording. The first-party geographic dataset and external media remain
separate optional services. Private routes and sensitive URL state must stay outside measurement.

## Decision

Start cookieless Vercel public-page measurement without requiring the optional analytics consent
choice, the canonical www origin, readable browser storage or an application webdriver check. Use
the provider SDK's normal development/production mode and retain its built-in automation behavior.
An explicit readable local/session `suvroghosh:measurement=off` value still opts out. No country,
language, region, IP override, proxy or geographic default is introduced.

Keep the low-level SDK with manual pageviews and the root layout's completed-navigation callback.
Maintain separate per-document ledgers for provider and first-party views. Preserve URL sanitation,
same-browser-origin validation and private/API path exclusions in provider callbacks. Custom events
still require the optional policy. Optional withdrawal removes queued optional work without
discarding default provider pageviews; full opt-out and lifecycle disposal suppress both lanes.

First-party Supabase rollups, Speed Insights and custom events retain their existing consent,
canonical production, automation and storage boundaries. YouTube permission and one-time activation
are unchanged. Update the notice, settings receipt and privacy page so rejecting optional services
does not imply that default Vercel page counts stop. No database or account setting changes are needed.

## Alternatives

- Reverting the SEO/AEO release would also undo unrelated discovery and canonical fixes.
- Removing consent from the first-party collector would expand the geographic dataset beyond the
  requested provider restoration and change its ingestion contract.
- Returning to the SDK wrapper's automatic subscription would add another navigation owner; keeping
  the existing manual lifecycle preserves teardown and explicit public/private URL filtering.
- Fabricating country headers, changing browser identity or using untrusted proxies would not
  verify genuine regional provider ingestion.

## Consequences and verification

Vercel totals again include eligible public pageviews before an optional choice, after rejection,
and when storage is unavailable. Historical opt-in and restored-default periods remain different
measurement populations. Pageviews are not distinct people; SDK bot filtering, blockers, network
failures and explicit opt-outs can still reduce counts. Default recording does not restore visits
that were never collected and does not guarantee future audience from any country.

Test the two ledgers, initial/SPA views, late grants, withdrawal, custom-event gating, opt-out,
storage denial, alternate origins, encoded private paths and sensitive query/fragment redaction.
Browser fixtures must keep requests local and service workers blocked. Run the relevant privacy,
SEO, Svelte/type and build checks, then verify exact-commit production readiness and one bounded,
truthfully labelled default browser recording. Observe provider country aggregates separately;
one local test and mocked country inputs cannot prove worldwide network reachability or organic
foreign visitors. Preserve that limitation in the release receipt and follow-up.

See [canonical architecture](../ARCHITECTURE.md#9-security-errors-and-validation) and the
[measurement guide](../../privacy-analytics.md).
