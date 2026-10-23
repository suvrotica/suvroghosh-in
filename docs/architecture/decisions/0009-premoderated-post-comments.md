# 0009 — Premoderated article comments in existing Supabase

- Date: 23 October 2026
- Status: Accepted; hosted schema applied, site deployment/live owner flow pending

## Context

Readers need to leave comments and threaded replies beneath articles, and the site owner needs
to inspect each submission before it appears publicly. The owner also needs identifiable author
replies and in-app alerts using the existing private Notes login. Articles currently render from
repository Markdown, often as static HTML; commenting must not make reading depend on a database.

Browser localStorage cannot provide a shared comment queue across readers and owner devices.
Deployment filesystem writes are not a durable serverless database. Supabase already provides
the site's persistent Postgres backend, configured owner and authentication flow, so another
account, identity system or third-party comment widget is unnecessary.

## Decision

Store comments, moderation history and short-lived abuse counters in new Supabase tables behind
bounded security-definer RPCs. Reuse existing server-only Supabase clients and private environment
keys. Reader RPCs accept only server service-role calls after the application's published-post,
same-origin, input and abuse checks. Owner RPCs use the authenticated request client and verify
database owner membership; every admin API/page separately checks the configured owner UUID.
Revoke browser/direct-table access and default function grants rather than exposing a writable
public table.

Every reader submission starts pending. SQL applies a shared approved-row/approved-root visibility
predicate to public comments, replies and counts. Use one reply level, preserve child moderation
states when hiding/restoring a parent, and assign author identity in the authenticated owner RPC.
Owner replies under an approved root publish immediately. Record moderation/read actions durably;
opening the queue alone does not clear unread state. Keep UUID retries idempotent. Serialize
mutations with one bounded advisory lock, accepting lower write throughput for simple parent,
moderation and retry consistency at personal-site volume.

Keep the article's existing render mode and Markdown content. A reusable Svelte component fetches
approved comments separately when near the viewport, with expandable paged replies. Comment APIs
return no-store responses so moderation affects subsequent reads without a rebuild. Use the
validated filename slug as the stable article key; category moves preserve it, while renaming the
slug requires a data migration. Draft text and retries stay in component memory, with no durable
browser comment store or offline comment cache.

Use the existing Studio for a private moderation board, visible pending/unread badges and author
replies. Visibility-aware bounded polling supplies in-app alerts; no email/push integration is
introduced. Local inspection uses an owner-only JSON download of the selected 20-row page.

## Alternatives

- A third-party widget adds a provider, browser integration and independent moderation/privacy
  policy without using the site's existing persistence and owner identity.
- Browser-local comments cannot provide cross-device sharing, owner moderation or reliable alerts.
- Writing repository/deployment files conflates reader state with publication and does not provide
  durable serverless writes or row-level authorization.
- Rendering comments inside prerendered articles would require rebuilding on moderation changes;
  making every article dynamic would add a database dependency to ordinary reading.
- Immediate reader publication contradicts the owner's approval requirement. Unbounded nested
  threads and real-time subscriptions add complexity beyond the requested conversation flow.

## Consequences and verification

Article reading remains available independently of comment storage. Reading or posting comments
requires JavaScript and a working API/backend. Guest names are unverified display names; only the
server-derived author badge signals the configured owner. Plain text is escaped by Svelte, and
public responses omit moderation/read/audit/retry metadata. Hiding removes content from subsequent
public reads but does not delete stored submissions, exports or copies already viewed.

Strict JSON, streamed body limits, origin checks, transport/SQL settings, local admission and
durable guest counters reduce abuse; local read/owner limits are not distributed guarantees.
Per-address HMACs rotate daily, live separately from comments and expire with opportunistic cleanup.
There is no automatic deletion policy for comment or moderation history, and no public delete
endpoint. Privacy removal requests use the existing contact route and require operator handling.

Focused API/page tests check validation, authorization, public projection, errors and bounds.
Isolated PostgreSQL WASM tests execute the real migration with Supabase-shaped roles, covering
grants, pending privacy, author derivation, read/audit/moderation transitions, hidden-parent rules,
idempotency, caps, pagination and persistence across restart. A single-engine duplicate burst does
not prove multi-connection lock behavior. Local browser fixtures cover interaction separately
from hosted login. Run relevant Svelte/build checks and inspect the final source against the
[canonical architecture](../ARCHITECTURE.md#moderated-post-comments).

On 23 October 2026, authenticated Supabase dashboard access confirmed the existing `suvroghoshin`
project against its Notes/analytics tables and one registered Notes owner. The exact tested
migration was applied, version `202610230001`/name `post_comments` was recorded in the migration
ledger within the same transaction, and the PostgREST schema cache was notified to reload. Hosted
inspection confirmed schema readiness, denied anonymous table reads and reader-RPC execution,
allowed service-role reader-RPC execution, and the migration record. Vercel CLI metadata confirmed
the intended deployment project/team and existing required production secret names without
revealing their values.

A subsequent hosted transaction used the actual `service_role` and `authenticated` roles with
the existing owner's membership to assert pending-reader privacy, owner queue access, approval,
the SQL-derived author badge/reply and hidden-parent protection including direct reply reads.
The assertions passed, then the transaction was rolled back; a separate check confirmed no test
rows remained. This exercises the real database role/lifecycle boundary without claiming a live
site login or browser/API release check.

Site deployment, effective deployment credentials and one bounded live
submit/approve/reply/hide flow remain pending. Dashboard authentication is separate from the
site's configured-owner login; it does not verify that live browser flow. Local fixtures and SQL
tests likewise do not establish production behavior. Retain submitted rows during rollbacks and
check the recorded migration version before attempting any schema operation. See
[the setup guide](../../post-comments.md) and
[database contract](../../../supabase/post-comments.md).
