# 0011 — Include comment content in owner approval emails

- Date: 23 October 2026
- Status: Accepted; hosted migration and version-two delivery require release verification
- Supersedes: The minimal email-content decision in [ADR 0010](0010-durable-comment-email-alerts.md)

## Context

The owner explicitly requests the commenter's name and full comment in approval notifications
so a submission can be reviewed before opening the moderation board. The owner has selected the
existing contact-form inbox and confirmed delivery there. The existing Resend provider, sender,
recipient, Supabase storage, moderation login and private retry worker remain appropriate.

ADR 0010 deliberately omitted reader prose from email. Including it changes the private data
sent to the email provider and retained in the owner's inbox. Approval still controls public
visibility; receiving the email must not approve a submission or allow email-based mutations.

Existing unsent or uncertain notifications can already have reached Resend. Changing their
payload under an existing provider idempotency key can break retries or produce duplicates.
The content transition therefore needs a durable version per notification, rather than an
application flag that rewrites every queued message.

## Decision

Send the stored display name and complete stored comment in the plain-text body of new
version-two alerts, together with the article title, submission timestamp and fixed
`https://www.suvroghosh.in/notes/studio/comments` link. Preserve multiline and Unicode text
without an excerpt or truncation; the existing submission limits remain 60 characters for names
and 3,000 for bodies. Reader text never supplies HTML, subject, sender, recipient or mail headers.
Use the existing contact configuration; do not add a provider, recipient choice or credentials.

Migration `202610230004_post_comments_notification_content.sql` adds a constrained
`content_version` to the private outbox. Existing rows retain version one; new rows default to
version two. The service-only claim RPC joins the immutable stored comment to return its name
and body only for version two. The outbox retains delivery state and the version, without
duplicating comment prose. Existing table/RPC grants, leases, moderation suppression, deadlines
and durable acknowledgements remain in force.

Version-one jobs keep the exact original metadata-only body and
`post-comment-approval/<comment_id>` provider key. Version-two jobs use
`post-comment-approval-v2/<comment_id>` and include the stored text. Deploy the compatible
application first: claims from the preceding migration have no version and are treated as
version one. Apply migration 004 only after the application is live. This order also publishes
the updated privacy notice before new content-bearing notifications are queued. A rollback must
retain both durable delivery state and a dispatcher that understands version two.

## Alternatives

- Keeping metadata-only notifications would require the owner to open the board to read every
  submission and would not fulfil the requested email review flow.
- Sending an excerpt would omit requested content and could hide context needed for moderation.
- Reusing the old payload identity for all queued work risks provider idempotency conflicts after
  an accepted send with a lost acknowledgement. A per-row version preserves those retries.
- Copying a second private name/body into the outbox is unnecessary because submitted comment
  content is immutable. A service-only join uses the existing source of truth.

## Consequences and verification

New notification content passes through Resend and is retained in the owner's inbox before
public approval. Update the privacy notice and operator guides accordingly. Hiding, rejecting or
removing a stored comment cannot recall an email already delivered or erase copies made outside
the site. Comments remain private on the website until owner approval. Logs and worker responses
continue to exclude reader prose; the worker returns aggregate counts only.

Focused application tests must verify the full bounded body and display name, multiline Unicode
preservation, literal handling of HTML-like input, fixed addressing and subject, and stable
version-specific payloads/keys. Check migration-before/after compatibility and reject malformed
version-two claim data. Actual SQL tests must cover existing version-one state, new version-two
defaults, unchanged leases/grants, joined immutable content and absence of prose in the outbox.
Do not send test fixtures through the real provider.

Hosted migration installation and one bounded live version-two email check are separate release
observations. Provider acceptance alone does not prove inbox arrival or readable rendering. See
the [canonical comment boundary](../ARCHITECTURE.md#moderated-post-comments),
[operator guide](../../post-comments.md#email-alerts) and
[database rollout contract](../../../supabase/post-comments.md#notification-content-upgrade).
