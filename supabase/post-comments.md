# Moderated post comments: database setup and contract

Apply `migrations/202610230001_post_comments.sql` after the existing handwritten Notes
migration, using the project's privileged Supabase migration connection. The Notes
owner must already exist in `auth.users` and `public.note_owners`. This migration
does not create accounts, add owners, or change login configuration.

Then apply `migrations/202610230002_post_comments_legacy_slugs.sql`. This additive
compatibility migration accepts existing ASCII capital letters in article filename
keys. It preserves their exact case, existing rows, grants and moderation rules.
An installation that already has version `202610230001` needs only the second
migration; check its migration ledger before applying either file.

Email alerts additionally require
`migrations/202610230003_post_comments_notifications.sql` after both versions above. It adds a
private delivery outbox and trigger for newly inserted pending guest comments; it does not
backfill existing submissions or change their approval state. The unattended retry job is a
separate hosted activation step described under [Email notification outbox](#email-notification-outbox).

Full-comment email review additionally uses
`migrations/202610230004_post_comments_notification_content.sql`. Deploy the compatible
application before applying this additive migration; see
[Notification content upgrade](#notification-content-upgrade). It preserves existing delivery
state and metadata-only retries, while future notifications include stored names and complete
comment text through the same private owner-email path.

The application also checks the configured owner before serving its admin routes.
Every owner RPC independently requires a non-null `auth.uid()` present in
`public.note_owners`. Owner calls use the authenticated session client; passing the
service-role key cannot substitute for an owner session.

No hosted migration is performed by the local tests. Deployment requires applying
the migration to the intended Supabase project and verifying the configured owner
and service credentials there. Schema changes persist independently of application
deployments; rolling back the site must not drop submitted comments.

## Access boundary

The comment tables (`post_comments`, `post_comment_history`, `post_comment_limits`)
have forced RLS and no browser policies. Direct reads and writes are revoked from
`anon`, `authenticated` and `service_role`, including the audit sequence. New
functions revoke the default `PUBLIC` execute permission explicitly.

Only the service role may execute reader-facing read/submission RPCs. Therefore a
visitor cannot call Supabase directly to comment on an unpublished article or
bypass the application's same-origin, streamed-body, published-post registry,
spam, rate-admission and configured-owner checks. The database accepts a bounded
slug; it cannot resolve repository Markdown. The server must validate the article
against the published-post registry before each reader-facing RPC.

Only `authenticated` may execute owner RPCs, whose owner-membership checks run
inside their `SECURITY DEFINER` functions. All functions fix `search_path` to an
empty string, qualify application objects, and set statement/lock timeout
configuration. Application transport deadlines remain necessary.

## RPCs

All list pages contain at most 20 comments; page numbers are integers 1–5000.
Slugs accept 1–180 ASCII letters in either case, digits, underscores and hyphens,
including legacy Markdown filenames. Keys remain case-sensitive and the application
checks the exact published registry entry before reader RPCs. Display names contain 1–60 non-control
characters. Comment bodies contain 1–3000 characters; newlines, carriage returns
and tabs are allowed, other control characters are rejected. The application
renders the stored text literally.

| RPC                                                                                             | Caller              | Result                                                                                                                                                               |
| ----------------------------------------------------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get_post_comments(p_post_slug, p_parent_id := null, p_page := 1)`                              | Service role        | `{comments,total,commentCount}`. `total` counts the selected roots or replies; `commentCount` counts all visible comments and replies for the article.               |
| `submit_post_comment(p_post_slug,p_parent_id,p_display_name,p_body,p_submission_id,p_rate_key)` | Service role        | `pending`, `rate_limited`, or `invalid_parent`. Reader submissions always start pending with no author role.                                                         |
| `get_comment_moderation_counts()`                                                               | Authenticated owner | Global `{pending,unread}` counts.                                                                                                                                    |
| `get_comment_moderation_queue(p_status := 'pending',p_post_slug := null,p_page := 1)`           | Authenticated owner | `{comments,total,pending,unread}`; filters support `all`, `pending`, `approved`, `rejected`, `hidden`. Counts `pending`/`unread` are global; `total` honors filters. |
| `moderate_post_comment(p_id,p_status := null,p_mark_read := false)`                             | Authenticated owner | `updated` or `not_found`. At least a status or mark-read operation is required.                                                                                      |
| `reply_to_post_comment(p_parent_id,p_body,p_submission_id)`                                     | Authenticated owner | `approved` or `invalid_parent`. Identity, author badge and publication status are derived in SQL.                                                                    |

Public rows contain only `id`, `parent_id`, `display_name`, `body`, `is_author`,
`created_at`, and `reply_count`. They omit submission IDs, moderation state,
read status and audit metadata. Queue rows additionally contain article slug,
status, read/update timestamps, parent body/name/status and at most ten recent
history entries. History records submission, author reply, moderation and first
read events; only an owner sees them. Owner JSON downloads can page through this
same bounded queue interface.

Replies have exactly one level: their parent must be an approved root in the same
article. Public reads apply one predicate to rows, counts and reply lookups:
the comment is approved and either is a root or has an approved root parent in
that article. Hiding a parent therefore hides all replies immediately, while
restoration preserves every child's individual moderation state. Owner replies
publish immediately only beneath an approved root.

## Idempotency and abuse state

One transaction advisory lock serializes submissions, author replies and
moderation. This deliberately favors a small personal site's simple moderation
consistency over high write throughput. Lock waits are bounded by the function's
lock-timeout configuration. An accepted submission UUID is unique. Reader retries
return `pending` regardless of its current status or payload, revealing neither
the existing body nor approval status and writing no duplicate row/audit event.
An owner retry must match the existing author's parent and body; reusing a guest
or different submission UUID raises `submission_conflict`. A matching retry only
returns `approved` while both the reply and root parent remain approved. A hidden
parent returns `invalid_parent`; a reply that was moderated away from approval
raises `submission_conflict`, preserving that moderation decision.

The durable fixed ten-minute window admits at most five attempts per salted
64-character HMAC rate key and 100 attempts globally. Invalid-parent attempts
consume admission; accepted UUID retries do not. Counters saturate rather than
overflow. Raw IP addresses and emails are never stored. Rate hashes live only in
the separate limits table, expire 24 hours after their last use, and are pruned
in batches of at most 100 on subsequent new-submission attempts. Expired rows can
remain while the site receives no new submissions; this is opportunistic cleanup,
not a separately scheduled retention job.

## Email notification outbox

The additive notification migration creates `post_comment_notifications` with forced RLS,
revokes direct access from `PUBLIC`, `anon`, `authenticated` and `service_role`, and exposes
only bounded service-role claim/finish functions. Its trigger inserts an outbox row in the same
transaction as each new guest comment whose state is pending. Unique comment identity means
idempotent reader retries do not produce more notifications. Owner replies, moderation updates
and historical comments are excluded. Delivery state does not copy reader names, comment text
or email addresses.

| RPC                                                                                         | Caller       | Result and boundary                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `claim_post_comment_notifications(p_submission_id := null,p_limit := 1)`                    | Service role | At most five leased rows with `comment_id`, `submission_id`, `post_slug`, `created_at`, `lease_token` and, after migration 004, `content_version`. Version-two claims additionally contain stored `display_name` and `body`; version-one text fields are null. An optional UUID narrows the immediate submission attempt. Claims skip comments no longer pending. |
| `finish_post_comment_notification(p_comment_id,p_lease_token,p_sent,p_provider_id := null)` | Service role | Acknowledges the current lease's successful delivery or schedules retry after failure. Stale/mismatched lease tokens cannot acknowledge another claim.                                                                                                                                                                                                            |

A claim lasts two minutes. An unacknowledged claim can be recovered after its lease expires.
Failed sends use exponential backoff starting at 60 seconds, capped at one hour. Success is
recorded durably and prevents future claims. The worker uses a stable Resend idempotency key;
provider deduplication lasts 24 hours, so a send accepted before a lost acknowledgement can
rarely duplicate after that window. There is no automatic outbox deletion or arbitrary retry
count that discards an unsent notification. A claim checks moderation state, but an in-flight
email cannot be recalled if moderation happens after it was claimed.

### Notification content upgrade

1. Deploy the application that supports both content versions, including the privacy notice,
   before changing the hosted schema. A claim from migration 003 has no `content_version` and
   must retain the exact version-one article/time/link-only payload and
   `post-comment-approval/<comment_id>` provider idempotency key.
2. Confirm version `202610230004` is absent from the intended project's migration ledger, then
   apply [202610230004_post_comments_notification_content.sql](migrations/202610230004_post_comments_notification_content.sql)
   through the privileged migration connection. Record the ledger entry and reload PostgREST's
   schema cache. The migration gives existing outbox rows `content_version = 1`, then changes
   the insert default to `2`; it does not requeue old comments or reset leases, acknowledgements,
   cancellation or provider identities. It preserves forced RLS and service-only RPC grants.
3. The updated claim joins the immutable comment source to return the display name and full body
   for version two only. It returns null text fields for version one. The outbox stores only a
   constrained delivery-content version alongside existing delivery state, without a second
   copy of private prose. Version-two email keys use `post-comment-approval-v2/<comment_id>`;
   retries preserve the version's payload and key.
4. Verify the hosted ledger/default/RPC grants without exposing reader text. Use one bounded new
   pending submission to check the full display name and multiline Unicode body reach the
   existing contact inbox with the moderation link. Confirm it remains absent from public reads.
   Record provider acceptance separately from inbox arrival; isolated local tests cover legacy
   retries and provider failures. No new recipient, provider, secret or scheduler job is needed.

Keep the outbox and version-aware dispatcher when rolling back application code. Returning to a
dispatcher that omits version-two content would change its payload under an existing provider
key. Moderation never recalls email already delivered; rejection/removal affects stored and
public site content independently of copies in the owner's inbox.

### Hosted scheduler activation

1. Confirm migration version `202610230003` is absent before applying the exact tested SQL to
   the intended project. Record its ledger entry and reload PostgREST's schema cache. Preserve
   the outbox on application rollback.
2. Reuse the existing production `RESEND_API_KEY`, `CONTACT_FROM_EMAIL` and `CONTACT_TO_EMAIL`
   values and contact-form defaults. Generate at least 32 random bytes for the new private
   `COMMENTS_NOTIFICATION_SECRET`. Set it in Vercel Production and as the matching private
   Supabase Vault secret expected by the activation SQL. Do not print or commit the value.
3. Review and run [post-comments-notifications-cron.sql](post-comments-notifications-cron.sql)
   through the privileged migration connection. It uses `pg_cron`, `pg_net` and Vault to register
   `deliver-post-comment-notifications` every five minutes. Each call POSTs `{}` to the fixed
   `https://www.suvroghosh.in/api/internal/comment-notifications` endpoint with its private
   bearer value. Reuse/update this named job rather than creating duplicates.
4. Deploy the matching application after environment changes. Dispatch requires
   `VERCEL_ENV=production`; preview and local deployments cannot email the owner's real inbox.
   The service endpoint uses bearer authentication, bounded streamed JSON, timeouts and local
   admission. It accepts neither owner cookies nor caller-selected recipients or destinations,
   processes at most five notifications, and returns only aggregate results without comment data.
5. Inspect the hosted job schedule/active state and private permissions without exposing the
   Vault value. Verify unauthorized calls cannot claim work. Confirm one new pending guest
   comment creates one notification and a bounded live attempt reaches Resend, then separately
   confirm inbox arrival with the owner. Use local isolated failure fixtures for retry tests.

Supabase documents that `pg_net` temporarily stores decrypted request headers in its queue, where
direct database LOGIN roles can read the bearer value; Vault protects its storage at rest, not
that queued copy. Keep `net` outside the Data API's exposed schemas and restrict direct database
logins to trusted operators. The scoped `COMMENTS_NOTIFICATION_SECRET` authorizes only bounded
alert dispatch, and the endpoint returns aggregate counts without private queue content. Review
the [documented pg_net header boundary](https://supabase.com/docs/guides/troubleshooting/database-roles-can-read-request-headers-queued-by-pg_net-ad6357)
when activating or rotating this secret.

The guest submission handler first saves the comment, then awaits one bounded attempt for that
submission; a delivery failure does not undo the saved comment or change its normal 202 response.
The scheduled endpoint is the recovery path after request termination, missing configuration or
provider failure. Its fixed five-minute schedule is not a guaranteed inbox-arrival deadline.
Email payloads use a static subject, configured sender/recipient, the published article title,
submission timestamp and fixed moderation-board URL. Version-two notifications also send the
stored display name and entire comment body to Resend as plain text for owner review. Preserve
Unicode and line breaks within the existing 60/3,000-character limits without truncation; reader
text never supplies headers or HTML. Version-one jobs retain the original metadata-only payload.
Provider content and delivered inbox copies remain private to the owner; approval still controls
public website visibility. Logs and worker responses do not contain reader prose. No new public
environment setting or browser mail client is introduced.

Local SQL tests do not establish that the hosted third migration, extensions, Vault secret, job
or Vercel environment are configured. Record those release observations separately; the schema
and job setup files alone are not evidence of activation.

## Local SQL verification

The integration test executes this migration in a real PostgreSQL WASM engine
with isolated mock Supabase roles, `auth.uid()` and owner membership. It exercises
permissions, guest privacy and author-role derivation, approval/read/audit flows,
owner replies, hidden-parent behavior, rejected-child restoration, invalid parent
relationships, duplicate bursts, validation, durable caps, pruning, pagination and
persistence after restarting the engine. PGlite queues calls in one engine;
the duplicate burst is not a multi-connection lock-contention benchmark. Hosted
Supabase configuration, network behavior and live authentication require separate
release verification.

Notification coverage executes the additive migration and checks atomic outbox insertion,
guest retry uniqueness, author/backfill exclusion, revoked browser/direct access, service-only
claims, lease tokens/expiry, retry delays and acknowledgement, plus moderation suppression.
Concurrent claim statements in a single PGlite engine do not establish multi-connection hosted
contention behavior. Email provider calls and the hosted scheduler are not part of this isolated
database suite. Content-upgrade coverage also checks existing version-one payload identities,
new version-two defaults, immutable joined text, preserved delivery state and grants, and no
duplicate prose stored in the outbox. Applying migrations in a local engine does not establish
that hosted migration 004 or content-bearing email delivery is active.

The runtime is intentionally temporary and is not a website dependency:

```powershell
npm install --prefix .codex-artifacts/comments-sql-runtime --no-save --package-lock=false @electric-sql/pglite@0.5.11
$env:COMMENTS_SQL_RUNTIME = (Resolve-Path .codex-artifacts/comments-sql-runtime).Path
node --test supabase/tests/post-comments.integration.test.mjs
```

Without that optional runtime, the SQL integration test reports a skip explicitly.
When `COMMENTS_SQL_RUNTIME` is provided but invalid, it fails instead of skipping.
