# COMM-LINK production setup and verification

COMM-LINK is the audio-only radio at `/tools/radio`. The hosted release supports Conversation
mode. Radio-mode push-to-talk and test sign-in are available on local loopback only. The site
keeps conferencing accounts separate from the Notes owner account.

1. In Google Auth Platform, create a Web OAuth client for the canonical host and authorise
   `https://www.suvroghosh.in/api/radio/auth/callback`. The app requests `openid email profile`
   for sign-in. Use Gmail or Google Workspace mailboxes so Google can verify room allowlists.
   The app does not need any Gmail permissions. Store `GOOGLE_OAUTH_CLIENT_ID`,
   `GOOGLE_OAUTH_CLIENT_SECRET` and `GOOGLE_OAUTH_REDIRECT_URI` on Vercel Production. Generate
   `COMM_LINK_SESSION_SECRET` from at least 32 random bytes. A missing or short dedicated secret
   disables production sign-in rather than using the local fixture secret.
2. Use a dedicated LiveKit Cloud project. On the free Build plan, the provider rejects requests
   when the free quota is used up. Check the [current quotas](https://docs.livekit.io/deploy/admin/quotas-and-limits/)
   and project usage rather than assuming unlimited calls. Disable agent observability and do not
   configure recording or transcription. Set `LIVEKIT_URL`, `LIVEKIT_API_KEY` and
   `LIVEKIT_API_SECRET` as server-only values. The hosted implementation requires Cloud token
   revocation, and does not accept a self-hosted LiveKit endpoint.
3. Review and apply `202611080001_comm_link_radio.sql` followed by
   `202611090001_comm_link_durable_state.sql` in the existing Supabase project. Confirm only the
   intended migrations appear in the dry run. The latter creates the service-only state and
   coordination RPCs; its predecessor tables are retained but inaccessible to the runtime.
   `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` must identify that project.
4. Set `COMM_LINK_CALLS_ENABLED=true` for the reviewed deployment after the database and media
   settings are ready. Production secrets are deployed with a new Vercel build. The anonymous
   `/api/radio/session` status distinguishes configured providers from the call release flag.
   Those fields are not proof that either provider works.

For a hosted smoke test, use two separately authenticated Google users. The host creates a room
with capacity two, copies an invitation, and admits the guest. Confirm that a waiting guest
cannot receive audio. Join muted, explicitly unmute one participant at a time, verify speech in
both directions, then end the room and check disconnection. If verifying a host mute, expect the
participant to disconnect and be able to rejoin as a listener. For local checks, use
`npm run radio:test` and the loopback browser suite (`npm run radio:browser:test`) on a production
preview with service workers blocked. The loopback suite does not verify cloud services.

The app limits each room to 2–12 people, each host to three rooms, and the site to 25 rooms. The
application's shared reservations enforce capacity before issuing tokens. A disposable provider
test verified two-way audio, explicit revocation and cleanup, but the provider accepted an extra
directly minted test token; its room-size setting alone is not an admission check. The
shared state stores account identity, room membership, hashed invitation tokens, deletion cutoffs,
and submitted abuse reports. It bounds rooms to one day and prunes stale account/report data after
30 days and old revocation cutoffs after eight days. Cleanup runs on subsequent requests. Do not
advertise these as independently scheduled purge times. Audio travels over encrypted WebRTC to
LiveKit Cloud and is not recorded by the application. The privacy notice describes the service
and how to request data deletion. This app does not use radio frequencies or telephone calling.

To stop accepting new calls, remove or disable `COMM_LINK_CALLS_ENABLED` and redeploy. If you
need an immediate stop, close active rooms and revoke media access in LiveKit Cloud as well.
