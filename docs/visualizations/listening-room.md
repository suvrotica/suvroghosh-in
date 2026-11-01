# Listening Room

Implementation contract, 1 November 2026. Canonical article:
`/blog/visualizations/listening-room`. The ordinary Markdown visualization uses
`collections: ['apps']`, so Apps and Viz discovery share the same canonical page.
This is a feature change governed by the full feature build lane.

## Ownership

- `src/lib/posts/listening-room.md` owns publication metadata and reader guidance.
- `src/lib/components/visualizations/listening-room/ListeningRoom.svelte` owns the
  source mode, controls, consent subscription, current playback session and local
  file object URLs.
- `src/lib/visualizations/listening-room/youtube.ts` owns URL validation, the
  demand-loaded IFrame API and the provider controller.
- `src/lib/visualizations/listening-room/presets.ts` owns the curated song IDs and
  their supplied artist/title metadata.
- `src/lib/visualizations/listening-room/audio.ts` and `dsp.ts` own the local audio
  graph, signal settings and numerical helpers.

There is no feature endpoint, server-side media fetch, upload, API key, account,
database, transcoder or paid provider. The site does not download YouTube media.

## Separate sources

YouTube playback remains inside the official, visible, unobscured iframe.
Documented player operations supply transport, volume and playlist control.
The iframe does not expose decoded audio to this application's Web Audio graph.
Consequently YouTube mode has no custom EQ, waveform, spectrum, LUFS, codec,
bitrate or source-resolution readout. Unknown provider metadata stays unknown.

The URL parser admits explicitly supported YouTube hosts and paths and extracts
video/playlist IDs and bounded time/index values. It rejects malformed URLs,
lookalike hosts, credentials and unexpected ports. A pasted address is never a
server-fetch target. A video-plus-playlist URL preserves the reader's choice of
single track or whole playlist. Curated titles are application data; arbitrary
playlist IDs are not converted into invented titles.

Local files use a browser-owned object URL and an `HTMLAudioElement`. The native
decoder determines supported formats. A single `MediaElementAudioSourceNode`
feeds the local processing graph; no server receives the file. The app does not
decode a whole file merely to display full-track measurements or a waveform.

Switching modes pauses the previous source. Replacing a file releases the old
object URL. Leaving the component stops playback and releases owned resources.
This ownership applies to Listening Room's sources, not every media element in
the entire site or other browser tabs.

## Consent and external requests

The app reuses `src/lib/privacy/consent.ts`. A valid remembered media choice or
explicit one-time activation permits loading the official player. Neither route
requires audible autoplay. Before permission/activation, the initial page uses a
local placeholder: no provider iframe, script, thumbnail or metadata request.
Revocation or expiry ends active provider playback and destroys the player.

The parent-document IFrame API needs exact YouTube script origins in CSP; it is
not permission for arbitrary scripts or media proxies. The existing YouTube
frame destination remains explicit. The iframe's own resource policy is a
separate provider boundary. The initial implementation adds no YouTube Data API
integration merely to obtain playlist titles.

## Local audio contract

The local signal path is:

`media source → gain/headroom → ten-band EQ → stereo matrix/balance → output gain → analysis → destination`

EQ frequencies are approximately 31, 63, 125, 250, 500 Hz, 1, 2, 4, 8 and 16 kHz,
with values constrained for the processing sample rate. Adjustments are bounded
to ±6 dB and parameters are smoothed to avoid discontinuities. Neutral and bypass
states must have explicit, testable semantics. Headroom management reduces gain
for boosts rather than silently adding a compressor.

Mid/side width uses `M = (L + R) / 2`, `S = (L - R) / 2`, then
`L' = M + width × S`, `R' = M - width × S`. Width one preserves the original
stereo pair within numerical tolerance; width zero is mono. Balance, mono input
and output-gain interactions require channel-specific tests.

The spectrum and channel meters consume the actual local graph. They are not
animations driven by time or playback state. Level values must identify their
measurement; sample peaks are not true peaks and ordinary amplitude/RMS is not
integrated loudness. The AudioContext sample rate is the processing rate, not
proof of source metadata, bit-perfect playback or output-device capability.

This version has no automatic loudness matching. There is no validated
BS.1770-compatible full-file analysis implementation, so the optional feature
is omitted rather than substituting an RMS estimate labelled LUFS. It also has
no audio restoration, forced high-resolution output, noise cancellation,
headphone hardware control, or re-encoding pipeline.

## Persistence and lifetime

Only small audio preferences may be stored in browser storage, with validated
values and an in-memory fallback when storage is unavailable. Audio files,
their contents and listening history are not retained. Loading a new session
does not resume audio automatically.

The controller owns listeners and provider polling; the component owns visual
animation frames and source switches. Destruction cancels pending work and
prevents stale ready callbacks from creating a new active player. Local teardown
disconnects nodes, releases the AudioContext and revokes object URLs. The shared
API loader may retain the provider library for the lifetime of the document;
removing an iframe cannot undo an already completed external request.

## Verification and limitations

Focused unit tests cover URL admission, gain/EQ/matrix behaviour and controller
lifecycle. Synthetic signals establish gain, band response, stereo identity,
mono handling, silence and output-level behaviour without copyrighted fixtures.
Browser tests must cover consent before external requests, source switching,
provider error states, actual local playback, keyboard access, mobile layout and
repeated navigation with service workers blocked.

Real YouTube playback is a separate verification boundary from mocked API
responses. Provider availability, embedding permission, region and browser
autoplay rules can change. Report tested presets and playlist behaviour from the
actual browser session; a matching title or passing mocked test does not prove
playback. Verify a bounded set of live provider requests rather than crawling
the site's articles or all related videos.

The implementation handoff records measured test/build results and any
unavailable browser checks. This contract does not itself establish deployment,
regional availability, successful tests or an auditory quality assessment.

See [ADR 0022](../architecture/decisions/0022-listening-room-source-boundaries.md)
and the [canonical architecture](../architecture/ARCHITECTURE.md#listening-room-consented-youtube-and-local-audio).

## Implementation verification on 2 November 2026, before publication

- 48 focused unit tests passed: 40 URL/controller cases and eight DSP cases.
- The native Chromium audio regression passed mono decoding/upmix, stereo
  matrices, mute, bypass, file replacement, native filter response and teardown.
- All 11 Playwright tests passed against the loopback production preview, with
  service workers blocked. Local sample and selected-WAV playback, actual
  spectrum readings, keyboard EQ, source cancellation, consent, provider
  recovery, file privacy and SPA cleanup were verified. Both 390 px and 320 px
  layouts had no horizontal overflow. YouTube API integration used a mock.
- Feature-scoped Svelte/TypeScript checking reported zero errors and zero
  warnings. Scoped ESLint, Prettier and Git whitespace checks passed.
- The full feature build's asset audits, notebook preparation and content,
  resource, contrast, SEO, media, search and link stages passed. Its first
  discoverability check caught a missing page heading and an unnecessary
  modified date. After correction, `npm run build:site`,
  `node scripts/validate-discoverability.mjs` and
  `npm run barnum-lab:route-assets` passed on the final implementation.
- The canonical app and `/blog/apps` returned HTTP 200 in production preview;
  the Apps listing included the new canonical link. Desktop and mobile captures
  completed without application errors. The sharing image is a browser capture
  of the actual interface, subsequently losslessly optimised by the site build.

The repository-wide `npm run check` reported 13 existing diagnostics in
`SortTheTray.svelte`; the new feature's separate check is clean. The documented
`security:audit` and `security:smoke` scripts are absent from this checkout, as
already recorded in the forensic audit. They are not claimed as completed checks.

The bounded live YouTube probe observed provider error 150 on seven starter
videos and the official IFrame API demonstration video; another starter result
was interrupted by development reload. Live playback and playlist advancement
remain unverified in this test environment. No unavailable-song result was
presented as successful playback, and no extraction or policy bypass was added.
Loudness matching, LUFS/true-peak measurement and lossless YouTube claims are not
part of this version. No deployment or social publication was performed.

## Production verification and corrections on 2 November 2026

The first production release, `c610b3a8`, was deployed through the existing
Vercel project and appeared under `/blog/apps`. The app and Apps listing returned
HTTP 200 with their intended canonical URLs. The production build and
discoverability audit passed for 760 published entries. The new deployment's
initial runtime error-log query returned no matching errors.

Real playback was verified on `https://www.suvroghosh.in` without mocked provider
responses. All eight starter songs played in fresh Chrome, with advancing native
video time and readyState 4. The public Ed Sheeran playlist
`PLjp0AEEJ0-fGKG_3skl0e1FQlJfnx-TJz` loaded 48 entries. Playing, next, previous and
selection of its third entry were also verified in the in-app browser. Switching
to the local sample removed the YouTube iframe; the original sample played and
drove nonzero spectrum readings. This establishes playback for the tested
browser sessions, not permanent availability in every region or profile.

The live checks found two defects that mocked responses had not exposed:

- Play could become available before the selected source finished cueing. The
  controls now wait for a playable provider state and show "Preparing track"
  during that interval. A delayed-cue browser regression covers this transition.
- The provider ignored the starter array in the object form of `cuePlaylist`.
  The documented positional form, `cuePlaylist(videoIds, index, startSeconds)`,
  established all eight entries and advanced from Adele to Ed Sheeran in a live
  comparison. The controller now uses this form for arrays and retains object
  syntax for actual playlist IDs.

The iframe's readiness deadline is now 30 seconds, independently of the
12-second API-script deadline, to allow slower initial player loading while
keeping cancellation and timeout cleanup. The charcoal surface also explicitly
owns heading and paragraph colours so the site's light theme cannot supply dark
text inside it. These are local integration/presentation corrections; the
documented media, consent and storage boundaries are unchanged.

The existing Edge profile timed out loading embedded players during the initial
release check, while direct YouTube playback, fresh Chrome and the in-app browser
worked. That profile-specific cause was not established. Loopback Adele embed
responses also differed from the public domain's responses. Neither case was
treated as proof that every preset owner had disabled embedding, and no
credentials, extraction service or referrer substitution were added to the app.
