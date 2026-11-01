# ADR 0023: Optional browser companion for Listening Room tab audio

Date: 2 November 2026. Status: accepted; installation and capture in the user's
existing Edge profile require separate verification.

## Context

Listening Room's ordinary webpage cannot obtain decoded audio from YouTube's
cross-origin iframe. Its existing equaliser therefore processes local audio
files. The user explicitly chose a custom browser extension so the same controls
can also affect streamed YouTube playback, and reported that settings appeared
lost after closing the tab.

The existing sound settings were retained, but reopening reset the source view,
collapsed the detailed controls and forgot mute. Native YouTube volume and mute
were reflected in the interface without being written to preferences. These are
settings/lifetime defects, independent of the unresolved playback issue in the
user's existing Edge profile.

## Decision

Keep the official visible YouTube iframe and its consent gate. Add a separately
installed Manifest V3 companion under `extensions/listening-room`; do not add a
media extraction service or expand the page's CSP. The page has a small bridge
for normalized settings, status and stop requests. It cannot start capture.
Only an explicit browser toolbar action obtains the current Listening Room tab's
audio through the browser's `tabCapture` API.

Admit only the exact production app path on `www.suvroghosh.in` and
`suvroghosh.in`, with independent content-script and worker checks. The worker
owns capture-session changes and an extension-owned offscreen document owns the
stream and Web Audio graph. Only one app tab may be processed at a time. Closing
or reloading/navigating the tab, switching to a local audio file, or an explicit
stop ends capture; a later visit requires another toolbar click.
Local-file playback waits for an active capture session to acknowledge stopping,
with a bounded failure message instead of running both processing paths.

Use only `activeTab`, `tabCapture`, `offscreen`, `storage` and `scripting`
permissions, without broad host access. The `scripting` permission allows the
explicit toolbar action to inject the fixed, packaged top-frame bridge after
validating the current app URL when Svelte client navigation did not cause a
fresh content-script injection. This avoids requiring a disruptive page reload
merely to enable the equaliser.

Compile the existing pure `dsp.ts` helpers into the extension package. Use those
same normalized EQ, headroom and stereo calculations in the captured-audio
graph. Do not apply playback volume or mute twice: those are already present in
the provider output, so the extension's output gain stays at unity. Do not
present local-file meters as measurements of YouTube audio.

Migrate the existing localStorage key to a validated version-two record, retaining
audio settings plus mute, source mode, detailed-control visibility, repeat and
shuffle. Save native provider volume/mute after applying remembered values at
initialization. Show a storage failure instead of silently implying persistence.
The companion stores only normalized sound settings in extension-local storage.
Neither component retains audio, files, provider URL history or automatic-playback
authority.

Package a downloadable ZIP with source-derived scripts and installation
instructions. This is an unpacked extension, not a store publication; the site
cannot install or enable it for a visitor. The extension has no network service,
account, analytics, audio recording or upload.

## Alternatives and consequences

- A browser-store equaliser would avoid maintaining a companion, but would use
  separate controls and a third party's permission/data practices. The user
  chose an integrated custom extension.
- A page-only equaliser cannot process the iframe's inaccessible audio. Cosmetic
  controls would misrepresent the product's behavior.
- A server proxy or media extractor adds retrieval, bandwidth and policy
  boundaries without solving a browser-profile playback failure. It remains
  excluded.
- A system-wide equaliser affects other applications and requires different
  platform integration. The chosen scope is one explicitly selected app tab.
- Manual installation and reactivation add setup work. This is exposed in the
  interface and README instead of promising automatic capture across visits.
- The new capture boundary can fail independently of the player. Stopping or
  failing the companion must release captured tracks and its AudioContext; it
  must not leave an apparently active but silent session.
- This extends the local-files-only processing boundary in
  [ADR 0022](0022-listening-room-source-boundaries.md). The original iframe,
  consent, no-upload and honest-measurement decisions remain in effect.

## Verification and regression boundaries

Verify exact origin/path and top-frame message admission, normalized settings,
single-tab ownership, teardown and late-start cancellation. Check the extension
graph with native Web Audio and known synthetic input, separately from mocked
worker and page-bridge tests. Close/reopen browser tests must establish retained
settings, legacy migration and unavailable-storage behavior without restoring
files, provider requests or playback.

Real extension installation, capture authorization and provider playback are
separate acceptance boundaries. Passing DSP or API mocks does not establish that
the user's existing Edge profile can play or capture YouTube. Record actual
tests and any remaining limitation in the implementation handoff.

See the [canonical architecture](../ARCHITECTURE.md#listening-room-consented-youtube-and-local-audio)
and the [feature contract](../../visualizations/listening-room.md).
