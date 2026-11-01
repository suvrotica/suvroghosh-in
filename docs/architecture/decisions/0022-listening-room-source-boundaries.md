# ADR 0022: Listening Room separates YouTube transport from local audio processing

Date: 1 November 2026. Status: accepted for local implementation; deployment and
live provider playback require separate verification.

## Context

Listening Room combines a YouTube song/playlist player with a tactile audio
interface in the existing Apps collection. The official IFrame Player API
exposes transport and playlist operations but no decoded-audio source for the
page's Web Audio graph. The requested EQ, stereo processing and measured
spectrum therefore cannot truthfully be applied to the YouTube iframe.

The site already has a browser-local external-media choice and a local
placeholder before YouTube activation. The new controller must preserve that
boundary when adding the provider's JavaScript API.

## Decision

Publish one Markdown visualization with Apps membership. Keep a feature-owned
controller and audio engine under `src/lib/visualizations/listening-room`, with
one corresponding Svelte interface. Add no media API route or persistence
service.

Use two explicit source modes. YouTube mode keeps the official player visible
and delegates playback to documented API operations. Audio file mode uses a
visitor-selected local file, browser decoder and Web Audio graph for genuine EQ,
mid/side width, balance and output measurements. Pause the previous source on
every switch and destroy owned playback resources on navigation.

Load the IFrame API and iframe only after existing media permission or explicit
one-time activation. Permit only the exact required script origins in CSP and
retain the explicit iframe origin. Revocation or expiry stops and removes the
active player. The API library may remain loaded for the document lifetime;
this does not grant permission to create another player.

Keep local files on the device. Store at most validated small preferences;
do not retain files or listening history. Source resolution, browser processing
rate and device output capability are separate concepts. Display only
information the implementation can substantiate.

## Alternatives and consequences

- Extracting or proxying YouTube streams would introduce a separate media
  retrieval, policy, bandwidth and security boundary. It is not used.
- A hidden iframe with an animated spectrum would misrepresent both playback
  and measurement. YouTube remains visible and has no custom sound analyser.
- A native desktop audio capture application could have different capabilities,
  but is outside this browser app and would require a separate design.
- A custom Opus encoder cannot restore information removed by an earlier
  encoding. This player does not re-encode sources as a fidelity improvement.
- Full-file loudness normalisation needs a validated BS.1770-compatible meter,
  bounded decoding and verification fixtures. It is omitted from this version
  rather than presenting an unvalidated LUFS estimate.
- Browser codec support and YouTube embedding/region restrictions remain
  observable failure states. The interface offers an honest retry or external
  provider link rather than promising universal playback.

## Verification and regression boundaries

Test URL admission and source choices independently from the player. Verify
local DSP using known synthetic signals and channel matrices. Browser tests
cover consent, provider failure recovery, file playback, single-source
ownership, keyboard access and cleanup. Mocked API tests and real provider
playback are reported separately. The full feature build and relevant security
checks cover the content and CSP integration.

See the [architecture description](../ARCHITECTURE.md#listening-room-consented-youtube-and-local-audio)
and [feature contract](../../visualizations/listening-room.md). Neither this
decision nor the existence of test files establishes deployment or playback
availability in an untested browser or region.
