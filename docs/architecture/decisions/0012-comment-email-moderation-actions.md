# 0012 — Approve and reject comments from owner emails

- Date: 23 October 2026
- Status: Accepted; hosted migration and live email-action flow require release verification
- Supersedes: The board-only action and plain-text-only email decisions in [ADR 0011](0011-comment-email-review-content.md) for new version-three notifications

On 23 October 2026, [ADR 0013](0013-comment-email-author-replies.md) adds a separate one-use
Reply capability only to future version-four notifications. Email approval can preserve that
independent reply authority, while rejection and explicit board status calls revoke it.
Existing version-three email payloads and keys remain unchanged. The original decision below
is preserved as historical context.

## Context

The owner wants Approve and Reject buttons in the existing full-comment notification, so a
submission can be moderated without opening the admin board or signing in. The existing
contact-form inbox is the authorised recipient. The owner-session board remains available for
replies, exports, later corrections and expired links.

An email link grants authority to whoever possesses it, including a recipient of a forwarded
message. Email security tools commonly fetch links before a person clicks them. A GET that
changes moderation state could therefore publish or reject a comment without an intentional
owner decision. Existing queued or uncertain provider sends also require byte-stable retries.

## Decision

Migration 005 changes only future notification rows to content version three. Those emails
include escaped HTML Approve and Reject buttons, the complete commenter name and body, a
plain-text alternative with the same full content and action links, and the existing board
link. Static mail headers and contact configuration remain fixed. Preserve the exact payloads
and provider keys of version-one and version-two jobs; version three uses its own provider key.
No old notification is resent or upgraded, and no new environment secret is introduced.

Each new pending guest comment receives two distinct 64-hex-character random bearer tokens,
one for approval and one for rejection. Each token combines two PostgreSQL random UUIDs,
retaining 244 random bits after their fixed version/variant bits. Both actions expire seven
days after enqueueing, independently of delivery or retries. The private
`post_comment_email_actions` table has forced RLS and no direct role grants. Hashes support
lookup and durable used/revoked state. Raw token pairs are retained privately only while the
notification awaits acknowledged delivery, so retries can reproduce identical URLs; successful
send acknowledgement or explicit board moderation clears that raw material. Hashes and audit
state remain. This is limited raw-token retention, not a claim that every stored representation
is hashed.

Expiry disables action authority, not delivery recovery. An expired unsent notification keeps
retrying with its original links, expiry and board fallback. Its now-nonactionable raw pair may
therefore remain private until acknowledged delivery or moderation; it is never regenerated
or given a later expiry under the same provider key.

The production-only `/api/comments/moderate` endpoint serves standalone server-rendered HTML without the site's Svelte
layout, scripts, analytics or external resources. A syntactically valid token/action GET puts
the selected capability and a random confirmation nonce in a path-scoped, HttpOnly, Secure,
SameSite=Lax cookie for at most 15 minutes, then redirects to the clean URL. Token-bearing
responses use `no-referrer`; clean pages use `same-origin` so native form submission retains
its Origin. HEAD does no SQL work. Neither GET nor HEAD consumes a link, marks a comment read
or changes moderation state. Clean GET uses a bounded service-only preview to show the exact
comment and selected action.

A native confirmation POST has a streamed body limit, strict action/nonce fields, same-origin
and Fetch-Site checks, local request/concurrency admission and five-second SQL transport
deadlines. It can apply only the action bound to the cookie's capability. The consume RPC
checks an unexpired, unused and unrevoked link for a still-pending guest comment, then changes
the status, marks the comment read, invalidates both links and records `email_moderated` in
the same transaction. Its null actor ID records bearer authority rather than impersonating a
Notes session.

Email and board moderation follow the same advisory-lock and row-lock order: advisory lock,
comment, outbox, then action rows. Any explicit board status call, including a no-op, revokes
email authority permanently; a mark-read-only action need not. Returning a comment to pending
does not restore old links. An expired, consumed, revoked or stale confirmation cannot replace
the current moderation decision. Both links racing can produce at most one successful email
moderation. No capability material enters public comment responses, board exports, rendered
confirmation HTML, logs or worker responses; its intended outgoing locations are the email
links and the private confirmation cookie.

## Alternatives

- A mutation on email-link GET has no confirmation step and is vulnerable to link previews.
- Email-client-specific interactive forms would not provide the same native fallback across
  inboxes. A short confirmation page works with ordinary links and without JavaScript.
- Requiring owner sign-in for every button would retain the login step the owner asked to avoid.
- An environment-derived signing key would couple older email authority and exact retry links
  to key rotation. Private, immutable random pairs reuse the existing database trust boundary.
- Regenerating links or expiry per retry would change the provider payload under one key.
- Upgrading existing version-two jobs could conflict with an already-accepted provider send.

## Consequences and verification

Keep notification emails private: forwarding one can grant another person authority over that
single pending comment until expiry or moderation. The confirmation page requires no owner
login; it grants no access to the board, replies or other comments. Opening the page is safe
for ordinary link previews, but a deliberate POST with the capability is authoritative.
Successful moderation cannot recall copies already delivered to Resend or an inbox.

Deploy the compatible application before applying migration 005 and reloading PostgREST's
schema cache. Keep the existing scheduler, contact settings, migrations and version-aware
dispatcher. Rollback must retain support for already-created version-three retry payloads and
the capability route, or explicitly suspend dispatch until compatible code is restored. A
local migration or test pass does not establish hosted activation.

Verify unchanged legacy payloads/keys, immutable version-three retries, complete plain-text
content, HTML escaping, action separation, expiry, hash-only lookup, raw-material cleanup,
service-only grants, GET/HEAD safety, private headers/cookies, strict body/origin checks,
stale/replay behavior and board invalidation. SQL fixtures should prove the atomic status and
audit transition; single-engine PGlite does not establish multi-connection contention. Keep
provider calls mocked locally. After deployment and migration, use a bounded private live
email check and record provider acceptance separately from inbox readability and action
completion.

See the [canonical comment boundary](../ARCHITECTURE.md#moderated-post-comments),
[operator guide](../../post-comments.md#email-alerts) and
[database rollout contract](../../../supabase/post-comments.md#email-action-upgrade).
