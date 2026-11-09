# ADR 0027: Shared room authority and a bounded COMM-LINK release

- **Date:** 9 November 2026
- **Status:** Accepted; production activation requires separate verification
- **Supersedes:** Persistence and media authority portions of [ADR 0026](0026-comm-link-audio-conferencing.md)
- **Affected sections:** [Architecture and existing decisions](../ARCHITECTURE.md#14-existing-decisions-and-debt), [security boundaries](../ARCHITECTURE.md#9-security-errors-and-validation)

The first implementation kept room and guest state in per-process Maps. On a Vercel cold start
or when two requests reached different instances, the host and guest could see different rooms.
It also issued media publication authority from a caller's join preference. Neither arrangement
is suitable for private calls.

Use a bounded Postgres snapshot as the authority for room access. The server acquires it using a
short, service-only lease, reads it into a request-local context, and uses the lease owner and
version to commit. A stale writer cannot commit. SQL denies direct snapshot access and ordinary
user roles cannot execute the coordination functions. This trades parallel room mutations for
small, deterministic transactions at the initial 25-room cap. On contention or provider failure,
return a retryable response. Loopback verification uses an in-memory backend; a production
failure cannot fall back to it. The predecessor tables remain as historical schema with their
service-role access removed; production has no predecessor records to migrate.

Use LiveKit Cloud because its provider-side token revocation is part of the access boundary.
The room-specific token initially grants only listening and expires after 60 seconds. Once a
connected member requests unmute, the server can grant microphone publication only. Removal or
host mute revokes old provider tokens and disconnects the target. A host-muted member can rejoin
to listen. The durable application reservation is the capacity boundary. We also send the cap to
LiveKit, but a disposable hosted test admitted a third token minted directly with project
credentials despite a two-seat setting. The app never mints that extra token. Failed state commits
compensate microphone grants; provider revocations are kept fail-closed. Neither token expiry nor client
timers terminate an already-connected speaker. Therefore public calls launch in Conversation
mode. Radio mode needs a verified independent expiry mechanism before public release.

The feature is gated by `COMM_LINK_CALLS_ENABLED`, with dedicated production session signing and
required provider configuration. On-request cleanup bounds the room and account state; the setup
guide records retention, staged activation, and how to verify the hosted boundary. The existing
Google OIDC session remains separate from the site's owner tools.
