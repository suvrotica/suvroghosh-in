# Listening Room Equaliser

This optional Microsoft Edge/Chrome companion applies Listening Room's EQ,
trim, stereo width, mono, balance and bypass controls to the audio produced by
its YouTube player. All processing happens on your computer. It does not make
YouTube audio lossless or fix videos that will not play.

## Install in desktop Edge

1. Download the extension ZIP from Listening Room and extract it into a folder
   you will keep (for example, Documents/Listening Room Equaliser).
2. Open `edge://extensions`, enable Developer mode, choose **Load unpacked**,
   and select the extracted folder containing `manifest.json`.
3. Reload [Listening Room](https://www.suvroghosh.in/blog/visualizations/listening-room).
   Pin **Listening Room Equaliser** in Edge's Extensions menu if useful.
4. Load and play a YouTube song. Click the extension's toolbar icon once to
   start processing this tab, then use Listening Room's sound controls.
5. Click the icon again, or choose Stop in Listening Room, to stop processing.

Chrome follows the same steps at `chrome://extensions`. Chromium 116 or newer
is required. This is an unpacked companion, not a store-published extension;
updates require replacing its files and reloading it on the extensions page.
The site cannot install or enable it automatically.

The extension stops when the tab closes, reloads, navigates away, or switches to
Audio file mode. Starting a different Listening Room tab stops the previous one.
Click the toolbar icon again to enable it for a new session. Audio preferences
are saved locally, but capture permission and playback never restart on their
own. Keep normal player volume at a comfortable level; begin with Neutral and
small adjustments. The volume and mute controls remain YouTube's controls.

## Permissions and privacy

- `activeTab`: identify the tab selected when you click the extension.
- `tabCapture`: access that tab's already-playing audio, including its YouTube
  iframe. It does not request your microphone, camera, desktop or other tabs.
- `offscreen`: host the Web Audio graph outside the background service worker.
- `storage`: retain only validated sound controls on your device.
- `scripting`: attach the same fixed bridge script after a toolbar click when
  you arrived from Apps without reloading. This uses the temporary `activeTab`
  grant and checks the exact Listening Room URL; it adds no all-sites access.

The content bridge runs only on the exact Listening Room URL on
`www.suvroghosh.in` or `suvroghosh.in`. The manifest prefix is checked again with
an exact path check. No audio is recorded, saved, uploaded or sent to a server.
There are no analytics, accounts, remote scripts or network requests from the
extension. Settings are stored with `chrome.storage.local`, not cloud sync.

## Build and verify

From the repository root:

```sh
node scripts/build-listening-room-extension.mjs
node --test extensions/listening-room/extension.test.mjs
```

The build copies these sources plus a compiled copy of Listening Room's shared
DSP helpers into `.tmp/listening-room-extension`, and writes the downloadable
`static/downloads/listening-room-extension.zip`. Local-file playback in the
web app continues to use its existing audio engine.
