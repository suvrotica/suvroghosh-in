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

Hosted inspection confirmed the comment schema is ready, anonymous direct table reads and reader
RPC execution are denied, service-role reader RPC execution is allowed, and the migration record
exists. The intended Vercel project/team and all five existing required production secret variable
names were also confirmed without reading their values. Site deployment and a bounded live
reader/owner moderation flow remain pending; dashboard access does not establish a signed-in
site-owner session.

A separate transactional check on that hosted database exercised the actual service-role and
authenticated-owner SQL boundaries: a guest submission stayed pending and invisible publicly,
appeared in the owner's queue, became visible on approval, gained a correctly badged author reply,
and disappeared with its replies when the parent was hidden. The transaction was rolled back;
the lifecycle assertions passed and a subsequent read confirmed no test rows remained. This
verifies the hosted SQL lifecycle, separately from the pending production browser flow.

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
   details. This migration does not create accounts or modify login settings.
4. Deploy the application with that configuration. Environment changes require a fresh deployment.
   Use the existing [owner sign-in](https://www.suvroghosh.in/notes/sign-in?returnTo=%2Fnotes%2Fstudio%2Fcomments), then open
   [comment moderation](https://www.suvroghosh.in/notes/studio/comments).
5. Verify one bounded end-to-end flow: submit as a reader, confirm it is private, approve as owner,
   refresh a separate reader session, publish an author reply, hide the parent and confirm the
   thread disappears on a fresh public read. Check pending rows cannot be retrieved publicly and
   non-owner sessions cannot access counts, exports or mutations. Remove test content through an
   authorised operator procedure if needed; the UI supplies moderation rather than deletion.

Keep service credentials private. The application calls reader-facing functions using the service
role after validating the published Markdown registry; readers do not call Supabase directly.
Owner functions use the authenticated session and verify database owner membership independently.

## Use the moderation board

Open `/notes/studio/comments`, or choose **Comments** in Studio navigation. The navigation badge
shows pending submissions and an unread marker. The board refreshes every 30 seconds while its
tab is visible; the shared badge refreshes every 60 seconds. These are in-app alerts; email and
push alerts are not implemented.

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
operator review. Hiding cannot retract previously viewed text or downloaded exports.

## Validation and maintenance

Run `npm run comments:test` for validation, public/owner API boundaries, page access and repository
deadlines. Run `npm run comments:sql:test` with the optional temporary PostgreSQL WASM runtime
described in the [SQL verification instructions](../supabase/post-comments.md#local-sql-verification)
to execute the actual migration, role grants, moderation flows, durable caps and persistence
checks. Without that runtime, the SQL suite explicitly skips. For `npm run comments:browser:test`,
install that pinned temporary runtime at `.codex-artifacts/comments-sql-runtime`, then run the
command with local Chrome available (or set `PLAYWRIGHT_CHANNEL` to an installed browser). The
test configuration starts loopback Vite and a test-only Supabase-shaped HTTP bridge backed by
the actual migration in PGlite. It supplies isolated test sessions; it does not verify live owner
login. Service workers and remote provider requests are blocked. Never deploy the test bridge.

Also run the relevant Svelte/build checks for application changes. Security-command availability
must be reported accurately: this checkout's existing `security:audit` and `security:smoke`
commands are absent, so they cannot establish passing security checks.

Comments use the Markdown filename slug as their article key. Category moves preserve a thread;
renaming a filename slug needs a deliberate database migration. Applying/rolling back site code
must not drop submitted comments. If comment functions or configuration are missing, the reader
interface reports unavailability and existing Notes pages continue working.

The limits are deliberately small: 60-character names, 3,000-character bodies, 20-row pages, and
one reply level. Durable guest counters allow five new attempts per address HMAC and 100 globally
in a fixed ten-minute window, with short-lived abuse keys stored separately from comments.
Function/transport deadlines and request admission are additional controls, not a guarantee
against every automated submission. See [ADR 0009](architecture/decisions/0009-premoderated-post-comments.md)
for the architecture trade-offs and local/hosted verification limits.
