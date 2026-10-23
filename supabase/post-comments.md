# Moderated post comments: database setup and contract

Apply `migrations/202610230001_post_comments.sql` after the existing handwritten Notes
migration, using the project's privileged Supabase migration connection. The Notes
owner must already exist in `auth.users` and `public.note_owners`. This migration
does not create accounts, add owners, or change login configuration.

The application also checks the configured owner before serving its admin routes.
Every owner RPC independently requires a non-null `auth.uid()` present in
`public.note_owners`. Owner calls use the authenticated session client; passing the
service-role key cannot substitute for an owner session.

No hosted migration is performed by the local tests. Deployment requires applying
the migration to the intended Supabase project and verifying the configured owner
and service credentials there. Schema changes persist independently of application
deployments; rolling back the site must not drop submitted comments.

## Access boundary

All three tables (`post_comments`, `post_comment_history`, `post_comment_limits`)
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
Slugs accept 1–180 lowercase ASCII letters, digits, underscores and hyphens,
including legacy Markdown filenames. Display names contain 1–60 non-control
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

The runtime is intentionally temporary and is not a website dependency:

```powershell
npm install --prefix .codex-artifacts/comments-sql-runtime --no-save --package-lock=false @electric-sql/pglite@0.5.11
$env:COMMENTS_SQL_RUNTIME = (Resolve-Path .codex-artifacts/comments-sql-runtime).Path
node --test supabase/tests/post-comments.integration.test.mjs
```

Without that optional runtime, the SQL integration test reports a skip explicitly.
When `COMMENTS_SQL_RUNTIME` is provided but invalid, it fails instead of skipping.
