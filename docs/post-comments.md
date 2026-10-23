# Post comments and moderation

Readers can leave a display name and plain-text comment beneath articles, without an account or
email address. Comments and reader replies remain private until the configured site owner
approves them. The owner can reply with an Author badge on an approved thread.

Submitted comments live in the existing Supabase database, shared across readers and devices.
They are not saved in each reader's localStorage or in the deployment filesystem. Unsent form
text survives a failed request while that component remains open; reloading or leaving the page
can discard it. Articles retain their existing static/server rendering even when comments are
unavailable. JavaScript is required for the comment interface.

## Set up the existing backend

The hosted schema was applied on 23 October 2026 to the existing Supabase project `suvroghoshin`
(`daggtcjyyyznnmvmmfpi`). The project was matched to its existing Notes/analytics tables and one
registered Notes owner before applying the exact tested migration. Version `202610230001`, name
`post_comments`, was recorded in `supabase_migrations.schema_migrations` within the same
transaction, and the PostgREST schema cache was notified to reload.

Compatibility version `202610230002` (`post_comments_legacy_slugs`) was also applied and recorded
on 23 October. It extends the slug alphabet for eight existing filenames with ASCII capitals,
preserving exact keys, rows, function grants and all moderation rules. Both hosted ledger entries
are present; do not reapply either migration there.

Hosted inspection confirmed the comment schema is ready, anonymous direct table reads and reader
RPC execution are denied, service-role reader RPC execution is allowed, and the migration record
exists. The intended Vercel project/team and all five existing required production secret variable
names were also confirmed without reading their values. Application deployment and signed-in
owner-browser verification are separate release checks, recorded in
[the implementation pull request](https://github.com/suvrotica/suvroghosh-in/pull/12).

A separate transactional check on that hosted database exercised the actual service-role and
authenticated-owner SQL boundaries: a guest submission stayed pending and invisible publicly,
appeared in the owner's queue, became visible on approval, gained a correctly badged author reply,
and disappeared with its replies when the parent was hidden. The transaction was rolled back;
the lifecycle assertions passed and a subsequent read confirmed no test rows remained. This
verifies the hosted SQL lifecycle, separately from application deployment and browser checks.

1. Use the existing Supabase project and owner account. The Notes migration and the owner's
   `auth.users`/`public.note_owners` membership must already exist.
2. Confirm these existing server-only deployment variables from [.env.example](../.env.example):

   | Variable                    | Purpose                                                                                     |
   | --------------------------- | ------------------------------------------------------------------------------------------- |
   | `SUPABASE_URL`              | Existing project's API URL.                                                                 |
   | `SUPABASE_PUBLISHABLE_KEY`  | Request-cookie owner authentication client.                                                 |
   | `SUPABASE_SERVICE_ROLE_KEY` | Server-only reader comment RPC client; never expose in browser code.                        |
   | `NOTES_OWNER_USER_ID`       | Existing immutable configured-owner UUID.                                                   |
   | `NOTES_RATE_LIMIT_SALT`     | Existing login throttle salt, reused for daily comment-abuse HMACs; at least 32 characters. |

3. Confirm migration version `202610230001` is recorded before applying SQL. It is already applied
   to `suvroghoshin`; do not run it again there. For another existing installation, apply
   [202610230001_post_comments.sql](../supabase/migrations/202610230001_post_comments.sql) once
   through its privileged migration connection after the Notes schema. Use the
   [database setup and RPC contract](../supabase/post-comments.md) for grants, limits and role
   details. Then apply
   [202610230002_post_comments_legacy_slugs.sql](../supabase/migrations/202610230002_post_comments_legacy_slugs.sql)
   once on another installation if its ledger entry is absent. It extends validation for eight existing mixed-case article
   filenames without changing their URLs, keys or existing comment data. These migrations do not
   create accounts or modify login settings.
4. For new-comment email alerts, apply
   [202610230003_post_comments_notifications.sql](../supabase/migrations/202610230003_post_comments_notifications.sql)
   once after the first two versions, when its ledger entry is absent. It adds the private outbox
   and service-only delivery RPCs without queueing existing comments. Reuse the contact form's
   `RESEND_API_KEY`, `CONTACT_FROM_EMAIL` and `CONTACT_TO_EMAIL`; the owner has selected the same
   contact-form inbox. Configure one new private `COMMENTS_NOTIFICATION_SECRET` in Vercel
   Production and the matching Supabase Vault scheduler secret, then activate
   [the five-minute retry job](../supabase/post-comments-notifications-cron.sql). Follow the
   [notification setup contract](../supabase/post-comments.md#email-notification-outbox) for
   permissions, scheduler activation and verification. This document does not establish that the
   third migration or hosted scheduler has been activated; record those release checks separately.
   Content-bearing alerts additionally require
   [202610230004_post_comments_notification_content.sql](../supabase/migrations/202610230004_post_comments_notification_content.sql).
   Deploy the compatible application and updated privacy notice first, then apply this fourth
   migration once its ledger entry is confirmed absent. Existing notification rows keep their
   metadata-only payload and provider key; only future rows default to full-content alerts.
   Follow the [content-upgrade order](../supabase/post-comments.md#notification-content-upgrade).
   Email Approve/Reject buttons additionally require
   [202610230005_post_comments_email_actions.sql](../supabase/migrations/202610230005_post_comments_email_actions.sql).
   Deploy the version-three dispatcher, confirmation route and privacy notice first, then apply
   migration 005 once its ledger entry is absent. Only future alerts gain the buttons; existing
   version-one/version-two payloads and keys stay unchanged. Use the
   [email-action upgrade order](../supabase/post-comments.md#email-action-upgrade), without
   changing the existing recipient, secrets or scheduler.
   The separate Reply button additionally requires
   [202610230006_post_comments_email_reply.sql](../supabase/migrations/202610230006_post_comments_email_reply.sql).
   Deploy the version-four application and privacy notice before applying migration 006;
   preserve all earlier notification payloads and follow the
   [email-reply upgrade order](../supabase/post-comments.md#email-reply-upgrade).
5. Deploy the application with that configuration. Environment changes require a fresh deployment.
   Use the existing [owner sign-in](https://www.suvroghosh.in/notes/sign-in?returnTo=%2Fnotes%2Fstudio%2Fcomments), then open
   [comment moderation](https://www.suvroghosh.in/notes/studio/comments).
6. Verify one bounded end-to-end flow: submit as a reader, confirm it is private, approve as owner,
   refresh a separate reader session, publish an author reply, hide the parent and confirm the
   thread disappears on a fresh public read. Check pending rows cannot be retrieved publicly and
   non-owner sessions cannot access counts, exports or mutations. Remove test content through an
   authorised operator procedure if needed; the UI supplies moderation rather than deletion.
   For alerts, confirm a single new pending guest submission queues one email to the contact
   inbox with the correct display name, complete comment, article context and moderation link, while a retry does not create
   another outbox row. Verify the job and bearer endpoint separately; a provider acceptance is
   distinct from inbox delivery. Use isolated local tests for failure/retry fixtures.
   For version-three alerts, verify an email-link GET leaves the comment pending, then confirm
   Reject on the small action page and verify that both email links become unusable. Verify
   approval/public visibility with isolated fixtures or an explicitly authorised live comment.

Keep service credentials private. The application calls reader-facing functions using the service
role after validating the published Markdown registry; readers do not call Supabase directly.
Owner functions use the authenticated session and verify database owner membership independently.

## Use the moderation board

Open `/notes/studio/comments`, or choose **Comments** in Studio navigation. The navigation badge
shows pending submissions and an unread marker. The board refreshes every 30 seconds while its
tab is visible; the shared badge refreshes every 60 seconds. Production also queues email alerts
for new pending reader comments and replies, using the existing contact-form inbox and sender.

- **Pending** is the default queue. Filter by article or use Approved, Rejected, Hidden or All.
- **Approve** publishes a reader comment. **Reject** keeps an unwanted submission private.
- **Hide thread** removes an approved parent and its replies from subsequent public reads.
  **Restore as approved** restores the parent while preserving each reply's own moderation state.
  **Return to pending** makes a submission private again.
- **Mark read** clears that comment's unread state. Moderation actions also mark it read. Merely
  viewing or refreshing the queue does not.
- **Reply as author** appears on approved visible threads. The reply publishes immediately with
  the server-derived “Suvro Ghosh” name and Author badge. Replies are one level deep, up to 3,000
  characters, and can be moderated like other comments.
- **Export this page as JSON** downloads only the selected filtered page, at most 20 rows, for
  local inspection. Advance through pages for further exports. These downloads contain private
  submissions and moderation metadata.

Reader display names are unverified. Text is rendered literally, without raw HTML. Each guest
submission starts pending even when the reader is signed in as the owner; publish author replies
through the private board. Failed replies retain the entered text; retry an uncertain request
without editing it to reuse its submission ID and avoid duplicates.

Hiding and rejection retain the stored submission and history. There is no delete action or
automatic retention policy for comments/history. Privacy removal requests can be sent through
[the contact form](https://www.suvroghosh.in/contact), identifying the article, display name and approximate posting date for
operator review. Hiding cannot retract previously viewed text, downloaded exports or delivered
notification emails.

## Email alerts

Each newly saved pending reader comment or reply queues one private notification. The subject is
**A new comment is waiting for approval | SuvroGhosh.IN**. After the content upgrade, alerts
contain the reader's display name and complete comment, the article title,
submission timestamp and a link to
[the moderation board](https://www.suvroghosh.in/notes/studio/comments). Names and comments retain
their stored Unicode text and line breaks within the existing 60/3,000-character limits; the
email does not use an excerpt. Version-three messages provide escaped HTML and a complete
plain-text alternative; reader text never supplies raw markup or mail headers.
Email delivery does not publish a submission. The same contact-form inbox remains the recipient.
The display name and full comment pass through the existing Resend provider and remain in the
delivered email; later moderation cannot recall that copy.
Author replies, changing a comment's status and comments saved before activation do not create
new alerts.

After the email-action upgrade, new messages have **Approve** and **Reject** buttons. Open the
chosen button, review the comment on the small confirmation page and confirm your choice.
No owner login or admin-board visit is needed for that one action. Merely
receiving or opening the email, or following the link, does not moderate it. The confirmation
page works without JavaScript. Version-four alerts additionally support the separate
[Reply flow](#reply-from-an-email). The signed-in board remains available for author replies
and later changes.

Each pair expires seven days after the comment is queued. Approving or rejecting consumes the
pair, so the other button cannot undo the decision. Any explicit status action on the board,
including choosing its current status, revokes old links; returning to pending does not revive
them. Marking a comment read without changing status can leave them valid. Expired or already
handled links direct you to the board. Keep these messages private: forwarding the email can
give its recipient authority over that one pending comment until expiry or moderation.

The confirmation route is production-only and uses a path-scoped, HttpOnly, Secure,
SameSite=Lax cookie lasting at most 15 minutes. It carries the selected private action and a
confirmation nonce while you review the page. A clean URL, private no-store/noindex responses,
no external resources and no analytics keep this separate from public browsing. A same-origin,
size-limited POST applies only the selected action; a stale page cannot replace a newer board
decision. The audit records email moderation separately from a signed-in owner action.

The fourth migration records a content version on each notification. Existing version-one jobs
retain their original article/time/link-only body and `post-comment-approval/<comment_id>` key,
including uncertain deliveries awaiting retry. Future version-two jobs include the stored name
and full body and use `post-comment-approval-v2/<comment_id>`. The outbox does not duplicate the
comment prose: the service-only claim joins the immutable original submission. This transition
does not resend historical notifications or reset delivery state. Deploy the compatible
application before applying migration 004; claims from migration 003 without a version are
handled as version one.

Migration 005 changes only future rows to version three, using
`post-comment-approval-v3/<comment_id>` and immutable action URLs. Each pair is created once
in private service-only storage with fixed expiry; raw token material is retained only for
unsent retries and cleared on acknowledged delivery or explicit board moderation. Lookup
hashes and used/revoked state remain. An unsent notification whose links have expired still
retries with its original payload and the board fallback, rather than silently dropping the
alert or changing its provider identity. Deploy the compatible application before this
migration. Do not roll back to a dispatcher that cannot preserve existing version-three jobs.

Migration 006 adds Reply only to future version-four jobs, using
`post-comment-approval-v4/<comment_id>` and a distinct reply capability with its own used/revoked
state. It shares the original seven-day expiry; email approval leaves an active Reply link
available, while rejection and explicit board status actions revoke it. The enqueue-time reply
submission UUID stays fixed so an uncertain network retry cannot create a second author reply.
Earlier emails keep their exact payloads, keys and button set.

The submission handler awaits one bounded delivery attempt after saving the comment. If email
delivery fails, the comment still succeeds and remains private in Pending. A Supabase job retries
available notifications every five minutes, up to five per run. Attempts use a two-minute lease
and exponential retry delay starting at 60 seconds, capped at one hour. A provider outage or a
queue backlog can delay alerts; the schedule is not a delivery-time guarantee. Rows that have
already been moderated are skipped when claimed, though an email already being sent can still
arrive after a moderation action.

Delivery runs only with Vercel's production environment marker; previews and local development
do not email the real inbox. Missing provider or worker configuration leaves queued notifications
for later recovery. Contact settings and the worker secret stay server-only. The worker has no
cookie login or configurable recipient in its request.

A stable Resend idempotency key suppresses repeated sends within its 24-hour provider window.
Successful sends are acknowledged durably in Supabase. If Resend accepted a message but its
acknowledgement was lost, recovery after that window can rarely produce a duplicate. Email
acceptance does not guarantee arrival in the inbox or prevent spam filtering. Notification state
persists independently of site deployments; do not remove it when rolling back application code.

### Reply from an email

New version-four emails include **Reply** beside Approve and Reject. Open it to review the
comment and write your author reply without signing in. Opening the composer does not publish
anything. If the reader comment is still pending, the final button says **Approve and reply**:
it explicitly approves that comment and publishes your reply together. If you already approved
through the email, choose **Publish reply**. Your reply uses the fixed “Suvro Ghosh” name and
Author badge; it cannot impersonate another display name.

Replies remain one level deep. When answering a guest reply, your response appears under that
comment's approved root alongside the other replies; the composer explains this placement.
It does not create a nested grandchild or restore a hidden root. If the root is no longer
approved, use the board to review the thread before replying.
Hiding that root blocks its child Reply links while hidden. Restoring the root can make an
otherwise valid child link usable again; it does not revive a link revoked on the source
comment itself.

Each Reply link permits one author reply of up to 3,000 characters, with the same seven-day
expiry as its email's moderation links. Email Approve can leave it available. Email Reject,
or an explicit status action on the board even when the status is unchanged, revokes it.
Marking a comment read alone need not. Once a reply is saved, retrying identical text after
an uncertain response can acknowledge that existing reply before expiry while the thread
remains eligible; it cannot create a duplicate or
republish a reply later hidden or rejected. Edited text cannot reuse a consumed link.

When a valid submission fails, the private response keeps your escaped draft available for
retry. Leaving or reloading can lose unsent text; the draft is not stored in a browser or
offline comment database. Keep the email private: forwarding Reply can let another person
approve that source and publish its one author reply. The link grants no general owner session,
board access or arbitrary reply target. Use the signed-in board for later edits to moderation
and further author replies.

## Validation and maintenance

Run `npm run comments:test` for validation, public/owner API boundaries, page access and repository
deadlines. Run `npm run comments:sql:test` with the optional temporary PostgreSQL WASM runtime
described in the [SQL verification instructions](../supabase/post-comments.md#local-sql-verification)
to execute the actual migration, role grants, moderation flows, durable caps and persistence
checks. Include all notification migrations when verifying outbox creation, content-version
compatibility, claim/acknowledgement leases, retries and moderation suppression. Application tests
cover complete plain-text name/body content, literal multiline Unicode input, fixed mail headers,
legacy payload/key preservation, production gating, bounded provider failure and the private worker boundary without real email
delivery. Email-action fixtures additionally verify stable version-three retries, escaped HTML,
full-text alternatives, scoped/expiring capabilities, raw-material cleanup, GET/HEAD safety,
private headers/cookies, strict body/origin/nonce checks, one-use consumption, board revocation
and email audit identity. The isolated single-engine SQL suite does not establish real
multi-connection contention or hosted activation. Without the SQL runtime, the SQL suite
explicitly skips. For `npm run comments:browser:test`,
install that pinned temporary runtime at `.codex-artifacts/comments-sql-runtime`, then run the
command with local Chrome available (or set `PLAYWRIGHT_CHANNEL` to an installed browser). The
test configuration builds the site, starts a loopback production preview and a test-only
Supabase-shaped HTTP bridge backed by
the actual migration in PGlite. It supplies isolated test sessions; it does not verify live owner
login. Service workers and remote provider requests are blocked. Never deploy the test bridge.

Version-four checks must cover exact earlier-version payload preservation, independent Reply
state, explicit pending approval, approved-source publication, guest-child placement under its
approved root, stale parent visibility, rejection/board revocation, matching uncertain retries,
changed-body conflicts, draft recovery and no republishing after later moderation. These
requirements do not establish that migration 006 or the live reply flow has been activated.

Also run the relevant Svelte/build checks for application changes. Security-command availability
must be reported accurately: this checkout's existing `security:audit` and `security:smoke`
commands are absent, so they cannot establish passing security checks.

Comments use the exact, case-sensitive Markdown filename slug as their article key, including
ASCII capitals in older filenames. Category moves preserve a thread;
renaming a filename slug needs a deliberate database migration. Applying/rolling back site code
must not drop submitted comments. If comment functions or configuration are missing, the reader
interface reports unavailability and existing Notes pages continue working.

The limits are deliberately small: 60-character names, 3,000-character bodies, 20-row pages, and
one reply level. Durable guest counters allow five new attempts per address HMAC and 100 globally
in a fixed ten-minute window, with short-lived abuse keys stored separately from comments.
Function/transport deadlines and request admission are additional controls, not a guarantee
against every automated submission. See [ADR 0009](architecture/decisions/0009-premoderated-post-comments.md)
for the architecture trade-offs and local/hosted verification limits.
