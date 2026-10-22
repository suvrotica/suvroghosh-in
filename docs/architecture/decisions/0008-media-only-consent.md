# 0008 — Media-only preferences and default public pageviews

- Date: 23 October 2026
- Status: Accepted
- Supersedes: [0007](0007-default-vercel-pageviews.md)
- Partially supersedes: [0006](0006-consented-aggregate-analytics.md), browser choices and current-browser collection

## Context

The owner explicitly rejects analytics opt-in and opt-out controls, including the hidden browser
measurement preference retained by ADR 0007. Public Vercel pageviews must be independent of browser
consent and storage. YouTube still needs a separate external-media choice. Private paths and
sensitive URL state must remain outside pageview measurement.

The existing first-party geographic collector and owner dashboard have their own bounded server
contract and retained data. Removing browser dispatch must not imply that the server endpoint,
historical aggregates or provider infrastructure logs have been deleted or disabled.

## Decision

Keep default cookieless Vercel Web Analytics for public pageviews, with one per-document navigation
ledger owned by the root layout. Disable the SDK's automatic navigation subscription. Preserve
same-browser-origin validation, query/fragment removal, API/Notes studio/auth exclusions and
lifecycle teardown. Use the SDK's normal development/production mode and built-in automation
behavior. Read neither analytics consent nor local/session `suvroghosh:measurement=off` values;
add no country, canonical-origin or application webdriver gate.

Retire current-browser first-party pageview requests, Speed Insights initialization and custom
visualization events. The existing `/api/analytics/pageview` endpoint retains its validation,
consent indication, production/origin restrictions, streamed body limit, deadlines and admission
controls for older consented clients. Keep configured-owner reports, CSV authorization, aggregate
storage and retention unchanged. No schema, account or hosting-plan change is needed.

Use version-two `suvroghosh:consent` records containing `v`, `media`, `savedAt` and `expiresAt` only.
Accept valid version-one records by preserving their media permission and original timestamps,
while discarding their analytics value. Do not renew the 180-day expiry during migration. New saves
write version two. Invalid/expired records keep YouTube paused; blocked storage retains an in-memory
media choice for the current document. Cross-tab updates and expiry still remove active players.

The notice and preferences offer "Keep videos paused" and "Allow YouTube". They contain no analytics
switch, acceptance button or receipt field. One-video activation stays separate from remembered
YouTube permission. The public privacy policy explains default Vercel pageviews, media preferences
and the retained legacy collection/reporting boundary.

## Alternatives

- Retaining a visible or hidden analytics opt-out contradicts the owner's explicit requirement.
- Removing media permission along with analytics choices would change external YouTube loading.
- Keeping optional browser collection would preserve a second counting path and an unused choice.
- Deleting the collector or database would expand scope and discard compatibility or historical
  reporting without being needed to remove the current browser choices.
- Reverting SEO/AEO would undo unrelated canonical, discovery and private-URL protections.

## Consequences and verification

Current public pageviews do not depend on preference parsing, consent changes, storage availability
or legacy measurement values. Provider filters, browser blockers and network failures can still
reduce recorded views. This change cannot reconstruct earlier uncollected visits or guarantee
traffic from a country. The owner dashboard remains a separate first-party historical dataset;
older consented clients can still add accepted requests through the retained endpoint.

Verify one initial/SPA view per pathname visit, no repeat from media preference changes, absence
of current-browser first-party/performance/custom-event requests, private/API URL exclusions and
query/fragment sanitation. Verify media-only controls, v1-to-v2 media preservation, invalid/expired
records, original expiry, cross-tab withdrawal and blocked-storage behavior. Browser fixtures must
intercept provider dispatch locally and block service workers; fixture success does not establish
live provider acceptance or international audience activity. Keep endpoint/report/SQL security
regressions and verify the final source against the updated architecture. Production and hosted
backend readiness require separate evidence.

See [canonical architecture](../ARCHITECTURE.md#9-security-errors-and-validation) and the
[measurement and media guide](../../privacy-analytics.md).
