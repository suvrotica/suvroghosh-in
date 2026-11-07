# COMM-LINK (`/tools/radio`) — Setup, Deployment, Privacy & Operations Guide

## 1. Overview

**COMM-LINK** (`/tools/radio`) is an audio-only WebRTC conferencing and push-to-talk web application integrated into `SuvroGhosh.IN`. It recreates the `UNIT-07` rugged handheld radio interface (`charcoal-green` upper housing, `burnt-orange` stepped lower panel, recessed `amber` LCD display, `1..12` rotary channel selector, mechanical orange power switch, and `SCAN` / `PTT` / `MODE` controls) while providing:

- **Google OAuth 2.0 / OpenID Connect identity** requesting only minimal scopes (`openid`, `email`, `profile`) with PKCE (`S256`), `state`, `nonce`, and JWKS verification.
- **Strict identity isolation** from the blog's owner-only Handwritten Notes administration (`event.locals.user` / `NOTES_OWNER_USER_ID`).
- **Per-room authorisation** (`approval_required` by default, or `members_only`), unguessable invitation tokens stored as SHA-256 digests, room locking, and host controls (admit, deny, mute, ask to unmute without remotely activating a microphone, remove and revoke re-entry, transfer host, end room).
- **Separate explicit browser microphone permission** (`video: false`, `camera=()`) with listener-only entry, muted-by-default microphone entry, local-only microphone testing, and guaranteed `MediaStreamTrack.stop()` cleanup.
- **Conversation mode** (multi-speaker audio meeting) and **Radio mode** (server-coordinated push-to-talk speaking lease with hold-to-speak, tap-to-latch accessibility mode, and Spacebar support).
- **Real WebRTC/Opus group audio** for 2 to 12 participants backed by LiveKit SFU (with authenticated TURN fallback) in production and real `RTCPeerConnection` + `BroadcastChannel` loopback WebRTC on `localhost`.

---

## 2. Setup and Deployment Instructions

### 2.1 Google Cloud OAuth 2.0 / OIDC Configuration

1. Open the [Google Cloud Console — Credentials](https://console.cloud.google.com/apis/credentials).
2. Configure the **OAuth Consent Screen**:
   - **App name:** `COMM-LINK on SuvroGhosh.IN`
   - **User support email:** `contact@suvroghosh.in`
   - **Application home page:** `https://www.suvroghosh.in/tools/radio`
   - **Application privacy policy link:** `https://www.suvroghosh.in/privacy`
   - **Scopes:** Select only `openid`, `.../auth/userinfo.email`, and `.../auth/userinfo.profile`. Do **not** add Gmail, Contacts, Calendar, or Drive scopes.
3. Create an **OAuth 2.0 Client ID** (`Web application`):
   - **Authorised JavaScript origins:**
     - Development: `http://localhost:5173`
     - Production: `https://www.suvroghosh.in`
   - **Authorised redirect URIs:**
     - Development: `http://localhost:5173/api/radio/auth/callback`
     - Production: `https://www.suvroghosh.in/api/radio/auth/callback`
4. Copy the Client ID and Client Secret into your server environment variables:
   - `GOOGLE_OAUTH_CLIENT_ID`
   - `GOOGLE_OAUTH_CLIENT_SECRET`
   - `GOOGLE_OAUTH_REDIRECT_URI`
   - `COMM_LINK_SESSION_SECRET` (at least 32 random bytes, e.g. `openssl rand -hex 32`)

### 2.2 LiveKit SFU & TURN Configuration

1. Create a project on [LiveKit Cloud](https://cloud.livekit.io/) or deploy a self-hosted LiveKit SFU instance with integrated TLS TURN enabled.
2. Copy the WebSocket URL (`wss://<project>.livekit.cloud`), API Key, and API Secret into your server environment:
   - `LIVEKIT_URL`
   - `LIVEKIT_API_KEY`
   - `LIVEKIT_API_SECRET`
3. In LiveKit Cloud project settings, configure room/participant limits (`Max Participants = 12`, audio-only track publishing) and usage alerts.

### 2.3 Database Migration (Supabase)

Apply the migration [`supabase/migrations/202611080001_comm_link_radio.sql`](../supabase/migrations/202611080001_comm_link_radio.sql) to the Supabase project. It creates:
- `public.comm_link_accounts`
- `public.comm_link_rooms`
- `public.comm_link_invitations`
- `public.comm_link_memberships`
- `public.comm_link_abuse_reports`

All tables enable Row-Level Security (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`) and revoke direct `anon` and `authenticated` access so that all room authorisation is enforced by the SvelteKit server using `SUPABASE_SERVICE_ROLE_KEY`.

---

## 3. Operating-Cost Estimate & Capacity Caps

### Built-in Application Safeguards (`RADIO_LIMITS`)
- **Max participants per room:** `12` (configurable `2..12` per room)
- **Max active rooms per host:** `3`
- **Max concurrent active rooms globally:** `25`
- **Audio-only Opus bitrate:** `~24–32 kbps` per active upstream speaker (`video: false`)

### Estimated Monthly Cost (LiveKit Cloud / Managed SFU + TURN + Vercel + Supabase)
1. **Occasional Personal & Group Use** (e.g., ten 45-minute calls per month with 5 participants = `2,250` audio participant-minutes/month):
   - **LiveKit Cloud Build/Free Tier:** Includes `5,000` participant-minutes/month and `50 GB` bandwidth at **`$0 / month`**.
   - **Supabase & Vercel:** Covered within existing site plan at **`$0` incremental cost**.
   - **Total estimated monthly cost (occasional use):** **`$0 / month`**.
2. **Heavier Group Use** (e.g., forty 60-minute calls per month with 10 participants = `24,000` audio participant-minutes/month):
   - **Audio connection minutes:** `19,000` minutes above free tier at `~$0.0005 / min` ≈ **`$9.50 / month`**.
   - **Audio egress / TURN relay bandwidth:** `~18 GB` Opus audio traffic ≈ **`$2.00 – $3.50 / month`**.
   - **Total estimated monthly cost (heavier use):** **`~$12 – $15 / month`**.

---

## 4. Privacy, DPDP Act 2023 & Lawful Operation

- **Internet Audio Only (Not RF):** COMM-LINK operates exclusively over HTTPS and WebRTC internet transport. Any retained frequency labels (`144-440MHz`) or "Channel" names from the reference artwork are decorative visual labels; the application never transmits on radio frequencies.
- **No Audio Recording:** Live voice streams are forwarded transiently via encrypted WebRTC (`DTLS-SRTP`) and are never recorded or stored on the server.
- **DPDP Act 2023 & DPDP Rules 2025 Compliance:**
  - **Data Minimisation:** Only Google `sub`, email, display name, room membership state, and short-lived operational timestamps are processed.
  - **Self-Service Erasure:** Users can permanently delete their COMM-LINK account data, rooms they created, and active invitations at any time via **Settings → Delete COMM-LINK Account & Data** (`DELETE /api/radio/account`).
  - **Abuse & Grievance Reporting:** Users can report abuse or privacy grievances directly in **Settings → Report Abuse or Privacy Concern** (`POST /api/radio/report`) or via `contact@suvroghosh.in`.

---

## 5. Browser Coverage & Known Limitations

- **Supported Browsers:** Current Chrome (desktop & Android), Safari (macOS & iOS 16.4+), Firefox (desktop & Android), and Edge (desktop).
- **Audio Output Device Selection (`setSinkId`):** Supported in Chromium browsers (Chrome, Edge). In Safari and Firefox where `HTMLMediaElement.setSinkId` is not exposed for arbitrary output routing, output device selection is managed by the operating system's audio route selector, and the UI states `(Managed by OS/Browser)`.
- **Mobile Background Audio:** Mobile operating systems (particularly iOS Safari and aggressive Android battery savers) may suspend WebRTC capture or background tab timers when the browser is backgrounded for extended periods. Keep the page active or screen awake during Push-to-Talk sessions; if a mobile browser suspends the connection, COMM-LINK automatically releases any active PTT lease so a microphone is never left open.
