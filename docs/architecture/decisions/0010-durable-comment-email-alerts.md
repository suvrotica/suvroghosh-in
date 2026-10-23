# 0010 — Durable email alerts for comments awaiting approval

- Date: 23 October 2026
- Status: Accepted; hosted migration, scheduler, secret configuration and delivery require release verification
- Supersedes: The in-app-only alert decision in [ADR 0009](0009-premoderated-post-comments.md)

## Context

The owner wants an email whenever a new reader comment or reply is waiting for approval,
delivered to the inbox already used by the site's contact form. The existing moderation board
and Supabase owner login stay authoritative. Notification failure must not discard a comment or
make the reader repeat a successfully saved submission.

Sending only in the submission request can lose alerts after a process failure or provider
outage. Fire-and-forget promises are not a reliable serverless delivery mechanism. The site
already uses Resend for contact email and Supabase Postgres for comments, so no additional email
provider or reader identity is needed.

## Decision

Insert one `post_comment_notifications` outbox row atomically with each newly inserted guest
comment in the pending state. A unique comment identity prevents accepted submission retries
from queueing another alert. Owner replies, subsequent moderation transitions and comments that
predate the migration do not create alerts. The outbox stores delivery identities and state;
it does not copy the reader's name, comment body or email address.

Use service-role-only claim/finish RPCs, forced RLS, revoked direct table access, empty function
search paths and SQL deadlines. Claims have a two-minute lease and a unique token; only its
current holder may acknowledge success or schedule another attempt. Claims skip comments that
have already left pending. This narrows stale alerts but cannot recall a provider request if
moderation races after the claim.

After a guest submission is saved, await one bounded delivery attempt before returning the normal
202 response. Delivery failure leaves the saved comment successful and its outbox row available
for retry. The retry worker claims at most five rows per call. Failed attempts use an exponential
delay starting at 60 seconds and capped at one hour, without discarding a row after an arbitrary
retry count. Unacknowledged claims become available when their lease expires.

An unattended Supabase `pg_cron` job runs every five minutes and uses `pg_net` to POST an empty
JSON object to the fixed production `/api/internal/comment-notifications` endpoint. A private
`COMMENTS_NOTIFICATION_SECRET` bearer value must match between Vercel Production and Supabase
Vault. The endpoint does not use owner cookies or accept a recipient, article, destination URL
or comment body from its caller. Bounded input, explicit bearer authentication, timeouts,
process-local admission and the database leases constrain the worker. Browser same-origin rules
remain on reader mutations; the scheduled service call uses its separate bearer boundary.

Production dispatch requires `VERCEL_ENV=production`. Preview and local requests cannot email
the real inbox; local tests use explicit dependency injection. Missing email configuration leaves
notifications queued. Reuse the server-only `RESEND_API_KEY`, `CONTACT_FROM_EMAIL` and
`CONTACT_TO_EMAIL`, including the existing contact-form defaults. Keep the email subject static.
Its content contains only the published article title, submission timestamp and fixed
`https://www.suvroghosh.in/notes/studio/comments` link. Reader names and comment bodies stay inside
the private moderation board and database, outside Resend notification payloads.

Use a stable provider idempotency key derived from the unique notification identity. Resend's
deduplication window is 24 hours; delivery is not an unlimited exactly-once guarantee. A provider
acceptance followed by a lost database acknowledgement can rarely produce a duplicate if recovery
occurs after that window. A successful acknowledgement prevents future outbox delivery. Provider
acceptance does not prove inbox delivery or exclude spam filtering.

## Alternatives

- Sending without an outbox cannot recover a saved comment's lost alert after request termination.
- A database webhook without durable delivery state cannot establish the retry/acknowledgement
  lifecycle used here.
- A new email provider or client-side sending adds credentials, integration and privacy boundaries
  without improving the existing contact-inbox requirement.
- Including the reader's name or text in email would forward unnecessary user content to the email
  provider. The article context and private-board link are sufficient for moderation.
- A cron-only path delays every alert; the immediate bounded attempt handles normal submissions
  promptly while the scheduled worker handles outages and process loss.

## Consequences and verification

Notification persistence adds one private table, service-only RPCs, one private HTTP route and an
unattended job. The scheduler and Vault secret are hosted operational configuration, independent
of application deployment. Disabling delivery or rolling back site code must preserve comments
and queued delivery state. Do not backfill existing comments during activation, and never put the
bearer secret in browser code, a public environment variable, a job name or checked-in SQL.

Focused application tests must cover fixed-recipient/minimal payloads, production-only dispatch,
provider timeout/error recovery, stable retry identity and unchanged submission success on mail
failure. Execute the real SQL migration under isolated roles to verify atomic insertion,
idempotency, grants, concurrent claim ownership, lease recovery, retry timing and suppression
after moderation. Exercise the private endpoint's unauthorized, invalid/oversized input and
bounded dispatch paths. Test fixtures must not call the real email provider.

Local tests do not prove hosted delivery. Release verification separately records the intended
Supabase migration, Vault/scheduler activation, Vercel Production secret presence and one bounded
live pending-comment alert to the user-authorized contact inbox. Do not describe those operations
as complete until their results are observed. See the
[canonical comment boundary](../ARCHITECTURE.md#moderated-post-comments),
[operator guide](../../post-comments.md) and
[database contract](../../../supabase/post-comments.md).
