# Binaural Acoustic Soundboard — Audio Provenance and Feature Contract

Binaural Acoustic Soundboard is a browser-local Web Audio instrument published at
`/blog/visualizations/binaural-acoustic-soundboard` with secondary discovery under
`/blog/apps` (`collections: ['apps']`). It serves as a wordless companion to
[Calcutta Radio](/blog/visualizations/calcutta-radio) for background sound while
reading, working, or resting.

## Scientific and editorial boundaries

- The soundboard generates acoustic sine tones at selected frequency differences
  in the left and right headphone channels (`220 Hz` left ear, `220 Hz + Δf` right
  ear). It does not generate, measure, or display brain waves.
- In accordance with empirical reviews of binaural-beat literature
  ([Ingendoh et al., *PLOS ONE* 2023](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0286023)),
  the frequency presets (`Delta` `2 Hz`, `Theta` `6 Hz`, `Alpha` `10 Hz`,
  `Beta` `20 Hz`, `Gamma` `40 Hz`) are presented as conventional acoustic frequency
  labels without claims of brainwave entrainment, sleep induction, healing, or
  cognitive enhancement. `Gamma` (`40 Hz`) is explicitly noted as an exploratory
  upper setting.
- No simulated EEG trace, brain activity visualiser, or relaxation/focus score is
  included. The status display's `Output` bar reflects only the current post-fade
  mix gain when playing.

## Same-origin audio loop provenance and licence

All audio is either synthesized live in the browser (`Fan`, `Soft noise`, and
`Binaural tones`) or decoded on demand from first-party seamless micro-loops stored
in `static/audio/binaural-acoustic-soundboard/`. No third-party audio CDN or
external runtime media request is used.

| Channel | Asset path | Format | Duration | Sample rate | Loop crossfade | Size | SHA-256 | Provenance and licence |
| --- | --- | --- | --- | --- | --- | ---: | --- | --- |
| Rain (`rain`) | `/audio/binaural-acoustic-soundboard/rain-window.wav` | Stereo 16-bit PCM WAV | 15.0 s (`120,000` frames) | 8,000 Hz | 2.5 s equal-power raised-cosine | 480,044 B | `be5d22950e8b3b538972713007386bf6dcbcab5e9de427fba9a593be7501abb5` | Deterministically synthesized by `scripts/generate-binaural-soundboard-audio.mjs` (band-limited window-pane patter + droplet resonances, no thunder); first-party repository asset released under CC0 1.0 / MIT. |
| Distant city (`city`) | `/audio/binaural-acoustic-soundboard/distant-city.wav` | Stereo 16-bit PCM WAV | 16.0 s (`128,000` frames) | 8,000 Hz | 2.5 s equal-power raised-cosine | 512,044 B | `845adb77098f3e09ccd67043cd2f08bd91f2164b3efb7d6a77e20cf3a0bfd6c5` | Deterministically synthesized by `scripts/generate-binaural-soundboard-audio.mjs` (subdued urban horizon canopy with slow traffic-envelope modulation, no speech or horns); first-party repository asset released under CC0 1.0 / MIT. |

Verify byte-exact reproducibility at any time with:

```bash
npm run binaural-soundboard:audio:check
```

## Signal routing and headroom

- **Single owned context**: `createSoundboardEngine` in
  `src/lib/visualizations/binaural-acoustic-soundboard/engine.ts` creates at most
  one `AudioContext` on the user's explicit `Play` gesture, reuses decoded
  `AudioBuffer` instances across stop/start cycles, and recreates one-use
  `AudioBufferSourceNode` instances whenever playback resumes.
- **True stereo binaural routing**: Left (`220 Hz`) and right (`220 Hz + Δf`)
  `OscillatorNode`s connect to inputs `0` and `1` of a `ChannelMergerNode(2)` before
  the binaural channel gain stage, preserving strict left/right separation through
  the master bus. Single-tone amplitude modulation is never substituted.
- **Headroom**: Per-channel maximum linear gains (`Rain` `0.30`, `Fan` `0.22`,
  `Distant city` `0.22`, `Soft noise` `0.20`, `Binaural tones` `0.14`) and the
  master bus scale (`0.85`) keep the loudest all-channel combination at `0.918`
  linear peak (`< 0.95`), preventing clipping without a compressor that would pump
  background levels.
- **Dedicated sleep-timer fade stage**: `timerFadeGain` sits in series after
  `masterGain`. During the final 10 seconds before the wall-clock deadline,
  `setValueAtTime` and `linearRampToValueAtTime` schedule a linear ramp to silence
  on the Web Audio timeline so moving the master volume dial cannot override the
  fade. Visibility/page-show reconciliation silences and stops any session whose
  deadline passed while the tab was suspended.
- **Shared playback ownership**: Starting playback calls
  `claimPlayback(stopCallback)` from `src/lib/components/blog/tts/playback.ts` and
  stopping or unmounting calls `releasePlayback(stopCallback)`, coordinating cleanly
  with Calcutta Radio and article narration.

## Verification commands

- `npm run binaural-soundboard:audio:check` — verifies the deterministic WAV loops
  in `static/audio/binaural-acoustic-soundboard/`.
- `npm run binaural-soundboard:test` — runs Vitest unit and stereo audio-rendering
  checks (`src/lib/visualizations/binaural-acoustic-soundboard/engine.test.ts`).
- `npm run binaural-soundboard:browser:test` — builds and runs the Playwright
  production-preview browser suite (`tests/binaural-acoustic-soundboard.spec.ts`)
  with service workers blocked.
