# 0006 — Consented aggregate analytics and one owner workspace

- Date: 22 October 2026
- Status: Accepted for implementation; hosted migration and configuration require verification

## Context

The site needs an explicit optional-measurement choice, approximate geographic audience reporting,
and a private dashboard. Existing Vercel measurement already excludes development, automation,
noncanonical origins, owner opt-outs and private URLs. Notes already supplies configured-owner
authentication and a server-only Supabase boundary. Public content must remain cacheable and usable
without authentication, optional storage or JavaScript.

## Decision

A browser-local, validated version-one consent record governs optional measurement and external
media. It expires after 180 days and propagates across tabs. The root layout owns optional SDK
initialization and a per-document navigation ledger. Existing measurement eligibility remains an
additional requirement. A one-video action is separate from remembered media permission.

A small same-origin collector accepts consented public page-view events, validates paths against
known public content, and derives approximate location only from trusted Vercel production headers.
It increments separate daily dimension rollups in the existing Supabase database. Reports retain
180 reporting days in Asia/Kolkata, with bounded database cleanup. There are no retained per-view
rows, visitor IDs, raw IPs, durable IP hashes, precise coordinates or cross-session joins in the
analytics dataset. Transient admission-control keys are separate from reporting data.

The dashboard lives at `/notes/studio/analytics`, reusing the existing configured-owner sign-in and
private-cache boundary. Page and export independently authorize before querying. RLS denies direct
anonymous/browser access; privileged database access remains server-only.

## Alternatives

- Provider-only country reports do not supply the requested owner dashboard and city rollups.
- Visitor/session identifiers would enable unique-browser estimates but introduce durable linkage
  that is unnecessary for page-view and geographic counts.
- A separate authentication system would duplicate recovery, session and authorization boundaries.
- A separate analytics platform would add an account, credentials and network dependencies.

## Consequences and verification

Counts describe accepted consented page views, not unique people or all traffic. Location is an
estimate. Withdrawal stops future optional work; aggregate counts cannot be traced to an individual
browser for retroactive deletion. Hosting providers have their own processing/log policies.

Deploying application code alone does not apply the database migration or establish cron execution.
An unavailable backend must remain an honest unavailable/empty state without interfering with
reading. Verify SQL grants, atomic increments, retention, owner access, ingress limits, consent
lifecycle, network suppression and responsive UI. Test fixtures must not be production auth bypasses.

See [canonical architecture](../ARCHITECTURE.md#9-security-errors-and-validation) and the
[setup guide](../../privacy-analytics.md).
