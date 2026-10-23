# 0013 — Publish one author reply from a comment email

- Date: 23 October 2026
- Status: Accepted; hosted migration and live reply flow require release verification
- Supersedes: The board-only reply decision in [ADR 0012](0012-comment-email-moderation-actions.md) for future version-four notifications

## Context

The owner wants a Reply button beside the existing email Approve and Reject actions. Publishing
a reply as the author grants more authority than merely changing a reader comment's status.
The capability must authorise one reply in one existing thread without granting general board
access. Email approval should leave Reply available; rejection or a later board decision must
remain authoritative. Existing queued notifications must retain exact provider payloads and
keys across retries.

The comment model permits one reply level. A guest reply already has a root parent, so an
author response to it must be a sibling under that root rather than a grandchild. A pending
reader comment must not become public merely because the owner opened a reply composer.

## Decision

Migration `202610230006_post_comments_email_reply.sql` defaults only future notifications to
version four. New HTML and complete plain-text alternatives add a Reply link and use
`post-comment-approval-v4/<comment_id>`. Versions one, two and three retain byte-identical
payloads and keys, including their existing button set and wording. No historical job is
upgraded or resent, and no new provider, inbox, secret or scheduler is introduced.

Each version-four action row gains a third distinct random bearer token and lookup hash,
independent reply-used/revoked state, a durable reply identity and a `reply_submission_id`
generated once at enqueueing. The existing forced-RLS/service-only boundary and fixed
seven-day expiry apply. Raw capability material is retained privately only to reproduce
unsent retry URLs, then cleared on delivery acknowledgement or applicable moderation.
Hashes and audit/idempotency state remain. Link expiry does not silently drop an unsent
notification or regenerate its payload.

The existing production-only standalone `/api/comments/moderate` route accepts the Reply
action and uses the same token-to-cookie redirect, clean URL, 15-minute scoped HttpOnly
cookie, safe GET/HEAD handling, private headers and script-free CSP. The reply composer
shows the source comment and whether approval is required. A pending source requires an
explicit **Approve and reply** submission; an eligible already-approved source offers
**Publish reply**. If the source is a guest child, the page explains that the author reply
appears under its approved root alongside other replies. A child's existing root must still
be approved at preview and consumption; the operation never approves or restores a hidden
root. A pending root source can be approved only by its explicit combined action.

The form accepts only its action, matching confirmation nonce and a plain-text reply body of
1–3,000 characters under the existing control-character rules. Its actual streamed URL-encoded
body limit is 40 KiB with a three-second read deadline: 3,000 astral Unicode characters can
require about 36 KiB after UTF-8 percent encoding. Same-origin/Fetch-Site enforcement, local
admission and a five-second SQL transport deadline remain mandatory. A validated draft may
be returned escaped in the private POST error response for retry, including an uncertain
backend result; it is never logged or stored in public/offline caches.

The new service-only reply RPC receives a token hash and body, not a caller-selected parent,
author name, status or submission UUID. Under the existing advisory lock and consistent
comment → outbox → action row locks, it resolves the root, rechecks source and root visibility,
and atomically approves a pending source when explicitly requested, publishes exactly one
SQL-derived “Suvro Ghosh” author reply, marks the source read and records `email_replied` on
the new reply with a null actor ID. Combined approval additionally records `email_moderated`
on the source. It consumes the reply capability and finishes the Approve/Reject authority.
The stored submission UUID and reply identity make uncertain retries idempotent. A matching
body may acknowledge the existing reply while the link remains unexpired and the source,
reply and root remain eligible. Expiry also denies these acknowledgement retries. Changed
text cannot reuse that consumed identity, and a later-hidden or rejected reply is never
republished by retry.

Ordinary email Approve consumes its moderation pair but preserves an active, unexpired,
unused Reply grant captured under the same locks. The status trigger may revoke it during
the transition; only that captured active state is restored before commit. Email Reject and
every explicit board status call, including a no-op, revoke Reply. Mark-read-only changes
need not. A stale composer cannot approve a rejected/hidden source or replace a newer board
decision. The reply capability is independent of the moderation pair, not a way to recover
consumed Approve/Reject links.

Revocation is scoped to the source comment, without scanning all descendants when its root
is moderated. Hiding a child's root temporarily blocks its Reply operation. Deliberately
restoring that root to approved can make the still-unexpired, unused and unrevoked source
grant usable again. This never restores a source grant explicitly revoked on that source.

## Alternatives

- Reusing the Approve token for Reply would lose reply authority as soon as the owner approved
  the source and would combine two distinct powers in one capability.
- Silently approving on a reply-page GET would violate scanner safety and moderation intent.
- Publishing a grandchild would violate the existing one-level public thread model.
- Generating a new reply UUID per POST would allow duplicate author replies after an uncertain
  commit. A durable identity belongs to the capability rather than the browser request.
- Rewriting version-three emails would change their retry payload under the existing key.
- General owner sessions or unrestricted reply APIs would grant more authority than requested.

## Consequences and verification

Keep version-four messages private: forwarding a Reply link can authorise another person to
approve its pending source and publish one author reply in that thread before expiry. It does
not allow board access, arbitrary article replies, editing other comments or further replies.
The existing signed-in board remains the recovery path for expired/revoked links and later
corrections. Delivered email copies cannot be recalled by moderation.

Deploy compatible application code and the privacy notice before applying migration 006,
recording its ledger entry and reloading PostgREST. Preserve all durable state and dispatchers
that understand existing versions on rollback. Hosted migration, inbox readability and live
reply completion require separate release evidence; local fixtures are not activation proof.

Verify version-one/two/three payload preservation, stable version-four URLs/keys, independent
action state, complete text and HTML escaping, safe GET/HEAD, bounded native form submission,
draft recovery, explicit pending approval, approved-source replies, child-to-root placement,
root visibility races, rejection/board revocation, matching uncertain retries, changed-body
conflicts and no republishing after later moderation. Test atomic approval/reply/audit state
and service-only grants with SQL fixtures. Single-engine PGlite does not establish real
multi-connection contention. Keep provider calls mocked locally and live checks bounded.

See the [canonical comment boundary](../ARCHITECTURE.md#moderated-post-comments),
[operator guide](../../post-comments.md#reply-from-an-email) and
[database rollout contract](../../../supabase/post-comments.md#email-reply-upgrade).
