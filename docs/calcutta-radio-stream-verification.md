# Calcutta Radio stream verification

Checked **4 November 2026** from the Windows development workstation, using
headless Chromium (Playwright's installed build 1234), hls.js **1.7.4**, and a
loopback HTTP page with a real `HTMLAudioElement`. Service workers were blocked.
Each source was started by clicking a button. No access-control or geography
workaround was used. These checks establish playback on that network, not a
verified Calcutta test location or universal availability.

## Playback results

Every included station reached `playing`, `readyState: 4`, and an advancing media
clock. Each was observed for a further two seconds after playback began. The
Web Audio samples below establish non-silent decoded output; they do not claim
a human listening assessment or identify the current programme.

| Station                      | Source        | Playback clock advance | Non-silent PCM                    |
| ---------------------------- | ------------- | ---------------------: | --------------------------------- |
| FM Rainbow Kolkata           | HLS / AAC     |                 2.18 s | Yes                               |
| Akashvani Kolkata Geetanjali | HLS / AAC     |                 2.15 s | Yes                               |
| Akashvani Kolkata Sanchayita | HLS / AAC     |                 2.14 s | Yes                               |
| FM Gold Kolkata              | HLS / AAC     |                 2.13 s | Yes                               |
| Akashvani Bangla             | HLS / AAC     |                 2.12 s | Yes                               |
| Akashvani Maitree            | HLS / AAC     |                 2.13 s | Yes                               |
| Vividh Bharati Kolkata       | HLS / AAC     |                 2.14 s | Yes                               |
| Vividh Bharati — national    | HLS / MPEG-TS |                 2.13 s | Yes                               |
| KEXP                         | Direct AAC    |                 2.14 s | Yes                               |
| WNYC 93.9 FM                 | Direct MP3    |                 2.01 s | Not measured; provider omits CORS |
| WQXR                         | Direct MP3    |                 2.00 s | Not measured; provider omits CORS |

No source had a fatal playback error. Geetanjali reported one recovered
`bufferSeekOverHole` event before continuous playback. No console errors were
observed for the HLS sources. Follow-up manifest requests confirmed advancing
media sequences for Geetanjali, Sanchayita, Gold, Rainbow and Maitree, rather than
an unchanged archived playlist.

WNYC and WQXR must use ordinary native audio requests **without**
`crossorigin="anonymous"`. Their public streams play in the media element but
do not expose the decoded signal to an unrelated origin's Web Audio analyser.
The application does not need signal analysis or audio meters.

This source-selection check complements the integrated page's playback,
production-CSP, lifecycle and interface checks. It does not replace them.

## Provenance and permitted network origins

Akashvani station identities and languages were checked against the
[official live player](https://akashvani.gov.in/radio/live.php). Its current
Kolkata URLs on `d3r9rhourdc02u.cloudfront.net` returned manifests and AAC
segments successfully but did **not** return an Access-Control-Allow-Origin
header. Those URLs are therefore not used for the cross-origin hls.js player.

The still-operating broadcaster CDN URLs were discovered through
[Radio Browser](https://www.radio-browser.info/) and the
[AiRadio West Bengal directory](https://airadio.in/states/west-bengal), then
tested directly. Sanchayita's mapping was also checked against the
[Radio India Live Sanchayita entry](https://www.radioindialive.com/air-kolkata-sanchayita-live-all-india-radio).
The directory's health flags were not accepted as playback evidence.

The HLS leaf manifests and AAC media on the selected Bitgravity origin returned
HTTP 200 and `Access-Control-Allow-Origin: *`. The national Vividh Bharati URL
comes directly from Akashvani's official live-player configuration and redirects
from Waves to its CloudFront media origin; both fetched playlist and media
responses allowed cross-origin access.

International URLs come from the broadcasters' own published lists:
[KEXP streaming URLs](https://www.kexp.org/streaming-urls/) and
[WNYC other formats](https://prod.wnyc.org/audio-other-formats/).

| Exact HTTPS origin                         | Purpose                                              |
| ------------------------------------------ | ---------------------------------------------------- |
| `https://airhlspush.pc.cdn.bitgravity.com` | Seven Bengal HLS manifests and AAC segments          |
| `https://radio.wavespb.com`                | National Vividh Bharati entry URL / redirect         |
| `https://d3hrxqn1tritdh.cloudfront.net`    | National Vividh Bharati HLS manifest and TS segments |
| `https://kexp.streamguys1.com`             | KEXP direct AAC                                      |
| `https://fm939.wnyc.org`                   | WNYC direct MP3                                      |
| `https://stream.wqxr.org`                  | WQXR direct MP3                                      |

Only the HLS origins need fetch access in `connect-src`; direct streams need
`media-src` access. Native HLS also needs the HLS origins in `media-src`.
There is no runtime directory request, generic media proxy, external station
artwork request or user-supplied stream URL.

## Exclusions and official links

The legacy Akashvani Live News 24x7 manifest returned HTTP 200 but its referenced
AAC segment returned 404, so it is excluded. Akashvani Bangla, Sanchayita and VBS
Kolkata were retained only after alternate broadcaster URLs passed playback.

Mirchi, RED FM Kolkata and BIG FM are explicitly external official destinations,
not playable entries. Their linked websites returned HTTP 200; Mirchi redirected
to `/stories` and RED FM Kolkata to `/kolkata/home`. The
[Mirchi help centre](https://mirchi.in/helpcenter) describes region-dependent
live-radio availability. No verified public in-app Kolkata stream was identified
for these commercial services. Friends FM and Radio One were not added without
a verified suitable listening destination.

Recheck a station before replacing its URL. Confirm the identity, complete
manifest/segment chain, browser decoding and any new origins; update the registry
date and this record together. A broadcaster can change or withdraw a stream
after these checks.

## Implementation validation

The following checks were completed on 4 November 2026. Their scopes are kept
separate from the source-selection results above and from the final deployment
check.

- `npm run calcutta-radio:test`: fourteen controller tests passed. They cover
  initial inactivity, real-event playback state, replaced-source callbacks,
  pending HLS imports, adapter disposal, bounded decoder recovery, connection
  deadlines, sleep deadlines, narration ownership and sound settings.
- The scoped Svelte/TypeScript check for Calcutta Radio reported zero errors
  and zero warnings. The full repository check still reported forty-five
  existing errors across `src/lib/components/games/sort-the-tray/SortTheTray.svelte`
  and `tests/listening-room.spec.ts`; it is not reported as passing.
- Seven functional checks passed in the isolated Calcutta Radio component
  harness: no media request before activation, real Rainbow audio decoding,
  rapid source replacement, offline release and retry, preference persistence
  without autoplay, usable playback with storage denied, and no uncaught
  browser errors. This harness did not include the production SvelteKit shell
  or its CSP. Its local report is
  `test-results/calcutta-radio/functional.json`.
- The rebuilt production-preview UI check found no axe accessibility
  violations or uncaught browser errors. Widths of 1440, 390 and 320 pixels
  had no horizontal overflow. The app remained outside article prose styling
  and narration extraction; `/blog/apps` linked to its single canonical
  article. The page had exactly one H1, **Calcutta Radio.**, and displayed
  **Updated 4 November 2026**. The local report is
  `test-results/calcutta-radio/production-ui-checks.json`.
- The rebuilt production preview played all eleven stations using the
  browser-preferred playback path. Every source had an advancing clock,
  decoded audio bytes and `readyState: 4`. Vividh Bharati Kolkata was observed
  for a further twenty-six seconds to cover the false-stall regression; the
  other sources advanced for a further two seconds. No uncaught browser
  errors or CSP violations were recorded. This loopback check used Chrome on
  Windows with service workers blocked; its local report is
  `test-results/calcutta-radio/preview-playback.json`.

An initial playback check in the actual production build found a false stall
for Vividh Bharati Kolkata. Native HLS emitted `stalled` while decoded audio
continued to advance with buffered data. The controller had treated that
network event as stopped playback and eventually fired its watchdog. The fix
ignores that event only while the source is already playing, is not paused and
has `readyState >= 3`. An actual `waiting` event or a stall without future
buffered audio still starts the eighteen-second deadline. Two regression tests
cover continued buffered playback and bounded unbuffered failure. The local
investigation record is `test-results/calcutta-radio/vbs-investigation.json`.

Forcing the `hls.js` fallback also decoded and played both FM Rainbow Kolkata
and national Vividh Bharati. That run recorded a `media-src` CSP violation from
an unused `data:,WEBVTT` metadata track, so it is not a clean CSP result.
The diagnostic record is `test-results/calcutta-radio/hls-csp-diagnostic.json`.
The controller now disables `enableID3MetadataCues`, `enableEmsgMetadataCues`
and `enableDateRangeMetadataCues`; it does not relax CSP to admit data-URL media.
The final rebuilt bundle passed `npm run calcutta-radio:verify -- --hls-js`:
both stations decoded audio and advanced playback, with no uncaught browser
errors and no CSP violations. The final report is
`test-results/calcutta-radio/preview-hls-playback.json`.

The release production build completed successfully. The full build pipeline's
content and artifact checks completed; its initial discoverability failures
(the app's missing H1 and visible updated date) were corrected, and the repeated
discoverability and route-asset checks passed. No unrelated feature code was
changed to address existing repository diagnostics.

Hosted deployment verification belongs to the release task handoff; local
preview checks do not establish a live deployment. The repository's named
`security:audit` and `security:smoke` commands remain absent and are not claimed
as completed safeguards.
