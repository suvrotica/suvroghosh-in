# ADR 0026: COMM-LINK audio-only WebRTC conferencing, Google OIDC authentication, and server-coordinated push-to-talk

- **Date:** 8 November 2026
- **Status:** Accepted
- **Affected sections:** [Section 1 — System and principles](../ARCHITECTURE.md#1-system-and-principles), [Section 2 — Directory responsibilities](../ARCHITECTURE.md#2-directory-responsibilities), [Section 11 — Security and privacy architecture](../ARCHITECTURE.md#11-security-and-privacy-architecture), [Section 12 — Architectural invariants](../ARCHITECTURE.md#12-architectural-invariants-and-prohibited-patterns), [Section 14 — Existing decisions and debt](../ARCHITECTURE.md#14-existing-decisions-and-debt)

## Context

We need to build **COMM-LINK** (`/tools/radio`), a production-ready, audio-only conferencing and push-to-talk application for `SuvroGhosh.IN` that closely recreates the user-supplied `UNIT-07` rugged handheld radio interface while meeting strict identity, media, privacy, and repository security boundaries:

1. **Identity isolation (`src/hooks.server.ts`, `src/lib/server/radio/auth.ts`):** Participants sign in with Google OpenID Connect requesting only minimal scopes (`openid`, `email`, `profile`). Conferencing participants must never receive access to the blog's owner-only Handwritten Notes studio (`event.locals.user` / `NOTES_OWNER_USER_ID`), private moderation routes, or administrative APIs.
2. **Per-room authorisation and unguessable invitations (`src/lib/server/radio/store.ts`):** Being signed in with Google must not grant access to every room. Rooms must enforce explicit access policies (`approval_required` by default, or `members_only`), unguessable invitation tokens stored as SHA-256 hashes, room locking, and host moderation (admit, deny, mute, ask to unmute without remotely activating a microphone, remove and revoke re-entry, transfer host, end room).
3. **Separate explicit browser microphone permission (`src/lib/radio/audio-devices.ts`):** Microphone capture is a browser permission separate from Google OAuth. The app must request audio only (`video: false`), keep `camera=()` disabled in `Permissions-Policy`, allow listener-only entry without microphone permission, join muted by default when microphone access is granted, keep microphone tests strictly local, and stop all `MediaStreamTrack`s on disconnect.
4. **Server-enforced push-to-talk (`src/routes/api/radio/rooms/[roomId]/ptt/+server.ts`):** In Radio mode, one participant transmits at a time. Speaking turns must be coordinated on the server with short-lived leases and LiveKit SFU `canPublish` permission updates rather than trusting client browsers alone.

## Decision

1. **Route, studio shell, and security headers (`src/routes/tools/radio/*`, `src/hooks.server.ts`, `vercel.json`):**
   - Serve COMM-LINK at `/tools/radio` (`prerender = false`) inside `studioShell` (`src/routes/+layout.svelte`) against a quiet warm beige work-surface background (`#cfbca9`) with links from `/blog/apps` and the site footer.
   - Enforce `Permissions-Policy: camera=(), microphone=(self), geolocation=()`, `Cache-Control: private, no-cache, no-store, must-revalidate, max-age=0`, and `X-Robots-Tag: noindex, nofollow, noarchive` on `/tools/radio` and `/api/radio/*`, and exclude `/tools/radio` from analytics payloads (`src/lib/measurement.ts`, `src/lib/server/analytics/policy.ts`).

2. **Server-side Google OpenID Connect with PKCE, state, and nonce (`src/lib/server/radio/auth.ts`):**
   - Implement OAuth 2.0 Authorization Code flow with PKCE (`S256`), `state`, and `nonce` using `openid-client` and verify ID tokens against Google's JWKS via `jose`, storing a separate HMAC-SHA256-signed `HttpOnly` cookie (`comm_link_session`) that never populates `event.locals.user`.

3. **Room coordination, capacity caps, and Supabase persistence (`src/lib/server/radio/store.ts`, `supabase/migrations/202611080001_comm_link_radio.sql`):**
   - Cap rooms at a configurable limit of 2–12 participants (default 12), bound concurrent active rooms (`25`) and per-host active rooms (`3`), coordinate Radio-mode speaking leases with automatic expiry and LiveKit `updateParticipant` permission updates, and provide a 180-second host disconnect grace window before automatic host transfer.
   - Persist accounts, rooms, hashed invitations, memberships, and abuse reports to `comm_link_*` tables protected by Row-Level Security (`service_role` only), with self-service account/data deletion (`DELETE /api/radio/account`).

4. **WebRTC/Opus media engine (`src/lib/radio/media-client.ts`, `src/lib/server/radio/livekit.ts`):**
   - Lazy-load `livekit-client` for hosted SFU audio rooms (`wss://*.livekit.cloud` added to `connect-src` in `svelte.config.js`) and provide a real `RTCPeerConnection` + `BroadcastChannel` loopback WebRTC transport on `localhost` so multi-tab and Playwright verification run real WebRTC audio streams without external credentials.

## Alternatives Considered

- **Full-mesh peer-to-peer WebRTC in production:** Rejected for group rooms up to 12 participants because full-mesh requires each participant to encode and upload $N-1$ separate audio streams, whereas a Selective Forwarding Unit (LiveKit SFU) requires a single upstream Opus track per active speaker.
- **Reusing Supabase Auth / Notes owner cookies for conferencing participants:** Rejected to preserve strict security boundary isolation between public conferencing participants and the blog owner's private Notes studio.

## Consequences and Verification

- **No server-side audio recording:** Audio streams are routed transiently via encrypted WebRTC and never recorded or stored.
- **Verification:** Covered by `npm run radio:test` (`src/lib/radio/radio.test.ts`) and `npm run radio:browser:test` (`tests/radio.spec.ts`).
