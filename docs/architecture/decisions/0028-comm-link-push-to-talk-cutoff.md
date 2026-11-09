# ADR 0028: Per-press microphone authority and independent expiry for COMM-LINK

- **Date:** 9 November 2026
- **Status:** Accepted; enable the hosted flag only after verification
- **Extends:** [ADR 0027](0027-comm-link-production-room-authority.md)
- **Affected sections:** [Architecture and existing decisions](../ARCHITECTURE.md#14-existing-decisions-and-debt), [security boundaries](../ARCHITECTURE.md#9-security-errors-and-validation)

LiveKit's token expiry does not disconnect a publisher already sending audio. A UI release event
also cannot reach the server when a browser loses its network or closes unexpectedly. A Radio
room therefore needs both immediate local track shutdown and a cutoff independent of the browser.

The primary Radio connection listens only. A UUID identifies each intentional press, and a
fenced room transaction gives only one current press a short-lived token for a unique microphone
publisher. That token cannot subscribe or publish data, video, or screen sharing. The browser
never reconnects the publisher automatically. It stops capture on release, cancellation, loss of
focus or connection, or a missed lease acknowledgement. Late responses cannot start audio.
The listening connection survives ordinary press release. A hosted room changes mode only when
no existing media reservations or usable tokens would cross the permission boundary.

Postgres keeps the lease, renewable for eight seconds at a time with a 45-second maximum hold.
An expiring lease remains in the snapshot until LiveKit confirms strict revocation. A dedicated
two-second `pg_cron` job uses `pg_net` to call the canonical authenticated Vercel worker only
when expiry or occupied-room readiness requires it. A database claim bounds duplicate work;
idle rooms cause no HTTP calls. In occupied rooms, a readiness probe is due six seconds after the
last acknowledgement, with a 15-second freshness limit. The claim checks the committed snapshot
for expiry. When nothing is due, the worker acknowledges without taking the room write lease;
otherwise readiness requires a successful fenced sweep. Each scheduler tick checks expiry
independently of readiness, including new work committed after a probe. Stale readiness blocks
new or renewed turns. Provider failure keeps the old lease fenced and retryable; we do not promise
a remote cutoff time while the provider itself is unavailable.

This uses the existing Supabase and LiveKit projects. The signing key stays in Supabase Vault
and Vercel Production secrets. The managed HTTP queue carries only a short-lived HMAC for the
specific dispatch and never receives the key. The worker also claims that dispatch once in SQL.
Ordinary users cannot mint or redirect its authority. Keeping
the local cutoff and the remote revoke independent avoids relying on unload events, browser
timers alone, or a long-running Vercel request. See the [setup and smoke checks](../../comm-link-radio.md).
