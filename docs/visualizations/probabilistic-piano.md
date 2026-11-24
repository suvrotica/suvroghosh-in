# The Piano That Forgives

A studio-grade Web Audio polyphonic synthesizer and impressionist jazz piano at
`/blog/visualizations/the-piano-that-forgives`. The instrument assists pitch
locally while offering a dual-oscillator, filter, modulation, effects,
arpeggiator/sequencer, Web MIDI, and offline `.wav` export engine; the visitor
supplies timing, duration, phrasing, and timbre. Its testable Harmonic Assist
promise remains palette membership and the declared distance rule. Musical taste,
phrasing, and arbitrary dense clusters remain outside that promise.

## Boundaries and ownership

| Source                                                             | Responsibility                                                                                                                                                                                                                     |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/visualizations/probabilistic-piano/model.ts`              | Browser-independent versioned harmony, `PRESETS[0..2]`, `SYNTH_PALETTES`, deterministic decisions, probability calculation, and `DEMO`.                                                                                            |
| `src/lib/visualizations/probabilistic-piano/voices.ts`             | Physical-input, chord-memory, and scheduler ownership (`VoiceLedger`) of frozen output pitches and independent audio voice IDs.                                                                                                    |
| `src/lib/visualizations/probabilistic-piano/keyboard.ts`           | Pure 88-key `A0–C8` geometry shared by native keys, overview, and musical overlays.                                                                                                                                                |
| `src/lib/visualizations/probabilistic-piano/synth-patch.ts`        | `SynthPatch` v1 schema, 14 frozen `FACTORY_PRESETS`, runtime clamping validator, `#patch=` base64url codec, and `localStorage` storage.                                                                                            |
| `src/lib/visualizations/probabilistic-piano/synth-scheduler.ts`    | Clock-injectable `25 ms` tick / `100 ms` lookahead scheduler for Arp, 16-step Sequencer, Chord Progression, and `DEMO` replay.                                                                                                     |
| `src/lib/visualizations/probabilistic-piano/procedural-ir.ts`      | Browser-free deterministic Mulberry32 stereo impulse-response generator (`off`, `room`, `studio`, `chamber`, `hall`, `canyon`).                                                                                                    |
| `src/lib/visualizations/probabilistic-piano/audio.ts`              | Explicitly enabled `SynthAudio` (`PianoAudio` alias) and `buildSynthOfflineGraph`, DSP voice engine, FX rack, limiter, and `Analyser`.                                                                                             |
| `src/lib/visualizations/probabilistic-piano/midi.ts`               | Gesture-gated Web MIDI (`sysex: false`) controller for Note On/Off, 14-bit Pitch Bend, `CC1`, `CC64`, and `CC120/123` cleanup.                                                                                                     |
| `src/lib/visualizations/probabilistic-piano/wav-recorder.ts`       | Bounded event recorder and `OfflineAudioContext` bounce coordinator transferring stereo PCM to the encoder Worker.                                                                                                                 |
| `src/lib/visualizations/probabilistic-piano/wav-encoder.worker.ts` | Vite module Worker encoding transferred stereo `Float32Array` buffers into 44-byte RIFF + 16-bit PCM `.wav` downloads.                                                                                                             |
| `src/lib/visualizations/probabilistic-piano/painting.ts`           | Deterministic cached pond atmosphere; no musical decision.                                                                                                                                                                         |
| `src/lib/visualizations/probabilistic-piano/effects.ts`            | Per-mount, bounded note blooms, ripples, duration ribbons, and held reflections with an independent animation clock.                                                                                                               |
| `src/lib/components/visualizations/probabilistic-piano/`           | 4-zone `#121418` Svelte 5 UI (`ProbabilisticPiano`, `TelemetryBar`, `OledScope`, `ControlDeck`, `ModMatrix`, `ArpSequencerBar`, `FxRack`, `PerformanceBay`, `FullPianoKeybed`, `Knob`, `VerticalFader`, `synth.css`, `piano.css`). |
| `src/lib/posts/the-piano-that-forgives.md`                         | Article, metadata, worked example, and primary educational references (preserved intact to protect committed TTS narration hashes).                                                                                                |
| `static/images/visualizations/probabilistic-piano/`                | Captures (`piano-poster.jpg`, `piano-social.jpg`) and `assets.json` provenance manifest used by the article and gallery.                                                                                                           |
| `scripts/render-probabilistic-piano-assets.mjs`                    | Playwright + Sharp capture generator and `--check` source/dimension/hash verifier.                                                                                                                                                 |

The generic blog route and existing post metadata pipeline handle discovery,
archive, search, RSS, sitemap, and SEO. The article explicitly imports the shell;
the gallery receives lightweight descriptive metadata. Ordinary article metadata
does not import the piano's audio, synth, MIDI, worker, or painting runtime. No
server endpoint, external inference service, account, or provider credential is
introduced. User patches (`suvro-synth-patches:v1` in `localStorage`, capped at
32 validated patches), per-tab last patch selection (`suvro-synth-last-id` in
`sessionStorage`), and shareable `#patch=` URL fragments (`<= 4096` characters,
`SYNTH_PATCH_VERSION = 1`) remain strictly client-side and run through
prototype-safe runtime clamping (`validateSynthPatch`). The model is authored
preference logic rather than machine learning.

The shell owns mode, seed, temperature, chord, transport, recent history, active
inputs, frozen inspector state, active `SynthPatch` v1 state, keyboard viewport,
computer-keyboard range, `Ambient Pond | OLED Focus` visual mode, and
presentation preferences. A note-on freezes the harmony/settings and chord-memory
snapshot (`off`, `oct`, `5th`, `maj7`, `min7`, `sus4`, `9th`, `latch`) and
selects one output. Its one decision record feeds the keyboard, probabilities,
text ledger, pond effects, and audio. Note-off releases the voice ID stored for
that physical input; it never runs correction again. Two inputs that choose the
same output pitch have separate releases. Held notes retain their selected pitch
across a chord change.

## Musical contract

The supported request/output span is integer MIDI 21–108, A0–C8: the complete
88-key piano with 52 white and 36 black keys. Middle C is
explicitly C4 / MIDI 60. There is one authored pitch-class palette per chord;
the preset's painted colours do not modify eligibility.

| Preset        | Progression        | Explicit palettes                              |
| ------------- | ------------------ | ---------------------------------------------- |
| Moonlit pond  | C6/9               | C, D, E, G, A                                  |
| Night walk    | Dm9 → G13 → Cmaj9  | D, E, F, A, C; G, A, B, D, E, F; C, D, E, G, B |
| The blue hour | Fmaj9 → Fm6 → C6/9 | F, G, A, C, E; F, A♭, C, D; C, D, E, G, A      |

These are original curated palettes, with G13's eleventh deliberately omitted.
The University of Puget Sound's [jazz chord reference](https://musictheory.pugetsound.edu/mt21c/JazzChordBasics.html)
supports the interval construction of sixth/ninth/minor/major extensions and
the customary omission of an unaltered eleventh from a thirteenth voicing.
The presets are individual harmonies, not a universal jazz scale. The sparse
accompaniment voicings are original arrangements. Berklee's
[piano voicing lesson](https://online.berklee.edu/takenote/basic-piano-voicing-techniques/)
supports the basic chord-role and added-tension vocabulary; its
[voice-leading lesson](https://online.berklee.edu/takenote/voice-leading-paradigms-for-harmony-in-music-composition/)
supports common-tone and economical-motion terminology. Neither source endorses
this application's numerical preferences or claims to quantify musical beauty.

Eligible presses are preserved in both assisted modes. For outside requests,
Nearest admits only pitches at the literal minimum semitone distance. Wander
admits pitches at most one extra semitone beyond that minimum. Raw preserves
every valid request. The complete eligibility set and the narrower admitted
candidate set remain distinct in the decision inspector.

For candidate `j` and request `n`, the implementation's score is:

```text
score(j) = -1.6 * abs(j - n)
           -0.035 * min(12, abs(j - previousMelodyPitch))
           +0.35 * harmonicRole(j)
           -0.12 * min(3, exactRepetitionsAmongLastEight(j))
           -0.10 * min(3, heldCompatibilityCost(j))
```

The first note has no previous-melody penalty. Distances are in semitones;
the total score is a unitless authored preference. Root and third receive
role 1; fifth 0.7; sixth/seventh 0.9; ninth 0.6; thirteenth 0.65. Repetition
matches an exact MIDI pitch, rather than any octave of the same pitch class.
Held-voice cost is summed over at most sixteen supplied active pitches: an exact
pitch costs 0.25, an absolute one-semitone distance costs 1, and a six-semitone
distance costs 0.5. Other distances cost zero; the sum is capped at three. This
bounded preference is not a chord-consonance guarantee.

The small previous-melody term cannot expand the permitted distance set, so it
cannot erase an intentional register leap. Candidates pass through a stable
softmax with the maximum score subtracted before exponentiation. Temperature is
finite and bounded to 0–2, with 0.7 as the opening setting. Zero temperature
chooses the highest score, breaking exact ties towards the lower MIDI pitch.
Positive temperature samples the actual normalized probabilities from the
musical seed/event stream. A sole candidate has probability one at every
temperature. Invalid pitches, settings, palettes and seeds are rejected visibly.

The article's fixture is a fresh C6/9 request for C♯4 / MIDI 61. With clean
history and no held notes, C4 and D4 are equally near. Their scores are −1.25
and −1.39; at temperature 0.7 their probabilities are 54.9833997% and
45.0166003%. These values express the sampler's rule, not measured listener
preferences. Model version `2` expands the range while retaining the scoring
rule, musical sampling salt and original twelve-note `DEMO` fixture. The clean
C♯4 probabilities and original ordered demo choices remain unchanged. Visual random draws cannot consume musical
randomness or choose a note.

Correction changes pitch only. It introduces no rhythmic quantisation, swing,
or chord-collection delay on live key presses. `SYNTH_PALETTES` appends three
extended synthesizer palettes (`C Dorian`, `C Minor Pentatonic`, `C Hirajoshi`)
while keeping `PRESETS[0..2]` intact. When the arpeggiator, 16-step sequencer,
or `Chord Memory` modes (`off`, `oct`, `5th`, `maj7`, `min7`, `sus4`, `9th`,
`latch`) are enabled, each triggered pitch still routes through `decide()` and
`VoiceLedger` (`bindChord`/`releaseChord`). Progression and soft accompaniment
require explicit controls. The deterministic demo is labelled as a replay, and
comparisons preserve its timing, velocity and selected harmonic context.
Physical device and operating-system audio latency remains outside the model.

## Audio and interaction lifetime

Fourteen deep-frozen `FACTORY_PRESETS` (`SYNTH_PATCH_VERSION = 1`) span six
categories (`Poly`, `Lead`, `Bass`, `Pad`, `Keys`, `FX`), led by `01 Forgiving
Grand` (`osc1.wave: '5-partial'`, `mix: { osc1: 1, osc2: 0, sub: 0, noise: 0 }`,
zero mod depths, bypassed Chorus/Crush/Delay, Reverb `'off'`). The opening
`5-partial` mode preserves the five sine partials with slight inharmonicity,
`6 ms` attack, register-dependent decay from `5.4 s` at A0 to `2.4 s` at C8,
and `150 ms` release. All synthesis runs in native Web Audio API plus pure
TypeScript (`SynthAudio`, `PianoAudio` alias, and `buildSynthOfflineGraph`),
with zero downloaded samples, zero WebAssembly, zero external audio CDNs, and
zero `blob:`/`data:` `AudioWorklet` scripts. The conservative master gain scale
is `0.24` (`PIANO_MASTER_GAIN`) times the bounded volume control (`0..0.8`);
this does not certify a universal speaker-output limit.

Each active voice combines:

- **Dual Oscillators & Ring Mod**: `Osc 1` (`saw`, `pwm`, `tri`, `sine`,
  `supersaw` falling back to single saw when playable voices reach
  `SUPERSAW_POLY_FALLBACK_THRESHOLD = 8`, carrier-scaled 2-Op `fm`, 16-harmonic
  `PeriodicWave` `harmonic`, and `5-partial`; octave `-1..2`, semi `-12..12`,
  fine `-50..50` ct, shape `0..1`, FM ratio `0.5..8`) and `Osc 2` (`saw`, `pwm`,
  `tri`, `sine`, plus optional `Ring Mod` multiplying `Osc 1`), alongside a
  `-1/-2` octave `Sub` (`sine | square`), lazy deterministic Mulberry32
  `White | Pink` `Noise`, and a 4-channel vertical-fader mixer. Any harmonic or
  partial at or above `0.46 * sampleRate` is omitted to stay below Nyquist.
- **Pre-Drive, Multimode Filter & Dual ADSR**: Lazy `WaveShaperNode` Pre-Drive
  (`0..1`) feeding a multimode `BiquadFilterNode` (`lp12`, cascaded `lp24`,
  `bp12`, `hp12`; cutoff `20–18000` Hz, Q `0.5–20`, env amount `-1..1`, key track
  `0..1`), shaped by Dual ADSR envelopes (`Attack 0.002–4 s`, `Decay 0.01–6 s`,
  `Sustain 0–1`, `Release 0.015–6 s`) with a lazy filter `ConstantSourceNode`
  instantiated only when filter envelope or mod routing is active.
- **Lazy LFO 1/2 & `5×5` Mod Matrix**: Global `LFO 1` and `LFO 2` (`sine`,
  `tri`, `saw`, `square`, deterministic 16-step `sh`; `0.05–25` Hz or BPM sync,
  `Key` sync, `Depth 0..1`) start lazily only when `depth > 0` and at least one
  row in the bipolar `5×5` matrix (`LFO 1`, `LFO 2`, `Filter Env`, `Velocity`,
  `Mod Wheel` × `Pitch ±200 ct`, `Shape`, `Cutoff ±4800 ct`, `Resonance ±10 Q`,
  `Amp ±0.5`) is non-zero; both stop and disconnect when active voices return to
  zero, on `stopAll()`, and on `dispose()`.
- **Master FX Bus, Safety Limiter & `AnalyserNode`**: `voiceSumBus` feeds
  **Chorus** (`0.1–5` Hz lazy LFO, depth, mix) → **Crush & Drive** (`3..16`-bit
  quantizer, drive, `400–16000` Hz tone, mix) → **Stereo Multi-Delay** (`40–900`
  ms or BPM sync, `0.75×` right tap, cross-coupled feedback capped at `0.88`) →
  **Procedural Stereo Convolver Reverb** (`procedural-ir.ts`: `off`, `room`,
  `studio`, `chamber`, `hall`, `canyon`) → **`-3 dB` Safety Limiter**
  (`DynamicsCompressorNode`) → **`0 dBFS` Hard Clipper** (`WaveShaperNode`) →
  Master Gain (`0.24 * volume`) → **`AnalyserNode (fftSize = 2048)`**.

Voice modes support `poly`, `mono`, `legato` (gliding oscillators without
retriggering envelopes), and `unison` (`2` or `3` detuned voices, `0–40 ct`
spread, `0–600 ms` glide). `PIANO_PLAYABLE_VOICES = 20` (`UNISON_PLAYABLE_NOTES =
6` in unison mode) and `PIANO_MAX_NODE_VOICES = 24` bound node allocation.
Tail-first reclamation frees oldest already-released/expired tails before
non-held or active voices; `voice.released` guards against double-release, and
exponential releases clamp at `EXP_RELEASE_FLOOR = 0.0001` before a `2 ms`
linear ramp to `0` (`18 ms` steal release, `8 ms` mono retrigger release).
Sustain delays release until pedal-up while respecting the same voice bounds.

`synth-scheduler.ts` runs a clock-injectable `25 ms` tick / `100 ms` Web Audio
lookahead engine (`40–220` BPM + Tap Tempo) driving the Arpeggiator (`up`,
`down`, `up-down`, `random`, `chord`, `order`, `1–3` octaves, `Latch`),
16-step Sequencer (`noteOffset -24..24`, `gate 0.05..1`, `tie`, `accent`, `Step
Rec`), 3-second Chord Progression (`accompaniment` velocity `0.25`), and `DEMO`
phrase replay. `midi.ts` provides gesture-gated Web MIDI
(`navigator.requestMIDIAccess({ sysex: false })`, input device `<select>`,
Note `1–127`, 14-bit Pitch Bend, `CC1` Mod Wheel, `CC64` Sustain, `CC120/123` All
Notes Off, full listener cleanup on `dispose()`). `wav-recorder.ts` records up
to `10,000` events (`180 s` default max), bounces stereo audio via
`OfflineAudioContext` + `buildSynthOfflineGraph`, transfers `Float32Array`
channels to `wav-encoder.worker.ts` (Vite module Worker under `worker-src
'self' blob:`) to encode 16-bit PCM `.wav` downloads, revokes `blob:` URLs,
and terminates the Worker on finish/cancel/dispose.

Web Audio resources are created only through explicit sound activation, with
generation-guarded startup so cancellation or disposal cannot later enable
audio. `SynthAudio` coordinates single-active-audio via
`claimPlayback`/`releasePlayback` (`$lib/components/blog/tts/playback`) so
article TTS narration and the synthesizer pause each other cleanly. Stop all
sound invalidates pending startup, clears owned input/sustain state, and stops
scheduler/LFO/replay activity; hidden/offscreen state, window blur, preset
switches, and teardown run explicit silence and cleanup paths. Browser
activation follows the
[Web Audio specification](https://www.w3.org/TR/webaudio/#allowed-to-start).

Pointer identity/capture supplies independent touch ownership, with cancellation
and lost-capture cleanup. `computeKeyVelocity` uses pointer Y-position
(`0.25–1.0`) when `Dynamic Y-Vel` is enabled, pen `event.pressure` (`0.2–1.0`),
or fixed `0.65`, while `KEYS VEL` selects `Soft (0.35)`, `Med (0.65)`, or
`Hard (0.92)` for computer keys. Glissando releases the previous owned input
before starting a new one. Keyboard shortcuts act inside the focused instrument,
ignore auto-repeat and modified browser shortcuts, and avoid editable controls.
Native key buttons support ordinary keyboard activation and a roving Tab stop:
Left/Right arrows move by a semitone, Page Up/Down by an octave, and Home/End
reach A0/C8. Computer shortcuts cover 18 keys (`a w s e d f t g y h u j k o l p ; '`);
`[` and `]` (or the `PerformanceBay` `[ −` / `+ ]` buttons) shift their base
symmetrically within MIDI `24–96`, omitting out-of-range high notes while
retaining original release ownership. `PerformanceBay` also exposes spring-return
`Pitch Bend`, `Mod Wheel`, `Glide`, `Hold`, `CHORD MEM`, and 9 palette-mapped
`chord-pad` buttons. These choices use the
[Pointer Events model](https://www.w3.org/TR/pointerevents3/) alongside full
keyboard accessibility.

## Painting, access and fallbacks

The pond is original procedural artwork. Its bounded, deterministic laid strokes,
moon and lilies describe atmosphere. Pure geometry in `keyboard.ts` covers the
partial A0/B0 octave, familiar two/three black-key grouping and final C8. Native
DOM buttons use those exact dimensions; decorative texture does not change hit
targets. Candidate bars and numeric percentages read the same
decision that audio receives. Requested and selected notes have labels and
different marks as well as colour. The full text inspector is available in
silent mode, with a bounded sixteen-event history and a frozen-decision option.

The background canvas is cached separately from transient note effects and
repaints only when its atmosphere or dimensions change. The transparent effects
canvas receives the same selected output and actual velocity used by sound.
Pitch positions follow the measured native keyboard through scroll, view changes
and resize. Bass notes produce broader, slower moonlit ripples; treble notes
produce finer rings. Ribbons encode note duration and velocity, and notes within
240 ms can join into a brush gesture. Held and pedal-owned notes retain a
reflection until release. At most 48 note marks survive in decorative history.

The owned animation frame runs only while a visible effect moves. Held marks
settle after 3.8 seconds; released marks fade over 2.8 seconds. Stop clears all
marks immediately. Hidden/offscreen state cancels work, and teardown cancels the
frame and clears the effects canvas. Both canvases cap pixel density at 1.5.
Probability curves are SVG paths from the request to each admitted candidate;
their width/opacity encode the actual probability and the selected branch is
gold. They share the displayed frozen decision with the numerical inspector.

The quiet-wash setting retains the semantic keyboard if canvas painting is
unavailable or the visitor wants lower cost. The feature uses the existing
motion preference resolver and observes both operating-system and site Still
changes. Stable rings, ribbons, reflections and probability marks preserve the
explanation in Still mode, without scheduling animation. There is no
requirement to hear audio, follow a moving mark or distinguish colours alone to
read the decision. These design choices draw on
[WCAG 2.2](https://www.w3.org/TR/WCAG22/); they are not a claim of complete
assistive-technology or conformance certification.

The dark anodized hardware enclosure (`--synth-chassis: #121418`,
`--synth-deck: #181b21`, `--synth-card: #1e2229`) organizes the studio
synthesizer into four responsive zones with amber (`#FF8A1E`) audio accents,
cyan (`#38BDF8`) modulation/digital accents, silver (`#E5E7EB`) reverb accents,
inline `<svg>` icons (zero `lucide-svelte`), and `[data-theme]` outer-frame
adaptation across `paper`, `light`, `night`, and `high-contrast`. **Zone 1**
(`TelemetryBar` + `OledScope`) provides patch browsing, quick-audition
categories (`Poly`, `Lead`, `Bass`, `Pad`), voice mode, a `1.5`-DPR-capped
OLED scope (`Oscilloscope | Spectrum | Curve`) whose `requestAnimationFrame`
loop runs only when visible and not in Still mode, Web MIDI, WAV export, the
`Ambient Pond | OLED Focus` stage toggle (`pond` default), volume, and Stop.
**Zone 2** (`ControlDeck` + `ModMatrix`) renders the 5-column synthesis deck;
**Zone 3** (`ArpSequencerBar` + `FxRack`) houses the 16-step sequencer and
4-card FX rack; **Zone 4** (`FullPianoKeybed` + `PerformanceBay`) docks the
`120px` `PerformanceBay` left of the 88-keybed via `@container keybed
(min-width: 1220px)` and collapses it to a horizontal strip below `1220px`.
Below `960px`, Zones 2 and 3 collapse into a 5-tab mobile drawer (`OSC/MIX |
FILTER/ENV | MOD/FX | ARP/SEQ | INSPECT`).

`Knob` and `VerticalFader` expose `role="slider"`, `tabindex`, `aria-label`,
`aria-valuemin`, `aria-valuemax`, `aria-valuenow`, and `aria-valuetext`, with
Arrow/Page/Home/End/`Shift`-fine keyboard navigation, pointer drag, wheel
control while focused or dragging, and double-click reset. `:focus-visible`
tokens preserve high contrast (`#f4ce73` inside the dark enclosure, `#233b3c`
on `.piano-guide`, `#ffffff`/`#000000` in `high-contrast`). Every newly added
synth container, control, and dynamic inspector readout carries
`data-tts-exclude`, preserving the exact SSR article narration transcript
SHA-256 hash (`4924bf10d9edce57b74b583dde88dab44104355c3de534e3d5402b40d094879d`).

Fit view shows all 88 keys when the keyboard window is at least 1080 CSS pixels
wide; narrower windows use playing view with comfortable key sizes, opening
around C4. The labelled miniature overview shows the visible window and lets the
reader reach both range boundaries. Octave controls and Return to middle C offer
another navigation path. Active pointers lock viewport navigation so the
keyboard cannot slide under a held finger. The phone keyboard scrolls inside its
own labelled window with a separate navigation surface. Focus view expands the
stage within the article; Escape or its exit button restores the ordinary
layout. Sound activation, volume, sustain, mode, chord and Stop remain available.
The server-rendered poster and prose
remain readable without JavaScript. Publication artwork must show the actual
implemented instrument in a specified seeded state, with source provenance and
dimensions checked through the feature's asset tooling. Generated artwork is
not substituted for renderer evidence.

`npm run probabilistic-piano:assets` opens the actual local article through
Playwright and captures its native keyboard, real Canvas2D painting and actual
probability marks. Start the local site first at `http://127.0.0.1:5175`, or
provide `BASE_URL` for another development/preview origin. The capture uses
Moonlit pond / C6/9, Nearest, temperature 0.7, seed 1907, no previous or held
notes and a first request for C♯4. The selected result is C4. Sound stays off.
Publication captures use Still mode for reproducible effect marks and explicitly
select full-keyboard fit on desktop; phone captures retain the playing viewport.
The capture browser uses a fixed 4200-pixel-high viewport at the documented
desktop, tablet and phone widths, then crops actual viewport pixels so the full
4-zone `[data-piano-root]` chassis fits without screenshot-time viewport
emulation changing the instrument's fit/playing state. The capture fails if that
state changes or if any capture target overflows the fixed viewport. Browser
interaction tests separately exercise ordinary 390 × 844, tablet and desktop
viewport sizes.

The 1440 × 760 `piano-poster.jpg` retains the whole `[data-piano-stage]` with
`#121418` letterboxing matching `--synth-chassis`. The 1200 × 630
`piano-social.jpg` adds an `#eae6d9` editorial title band above the same stage
capture over `#121418`. Seven review PNGs under `artifacts/probabilistic-piano/`
show the desktop, portrait phone, tablet, Still, exact inspector, unchanged-note
and animated focus views. The focus capture records a real multi-note gesture
after 700 ms; it is review evidence rather than the reproducible publication
fixture. These PNGs support human inspection; the two JPEGs are publication
inputs. `static/images/visualizations/probabilistic-piano/assets.json` records
the fixed capture state, normalized 26-file source provenance (`SOURCES`), and
each publication file's dimensions, bytes and SHA-256.
`npm run probabilistic-piano:assets:check` verifies those records without a
running browser, including a 750 KiB limit per JPEG. The checker belongs to
`features:check`, so the feature build validates committed captures against all
26 runtime, UI, CSS, and capture-script sources. The normal repository image
optimizer may re-encode JPEGs during the build. The checker accepts either the
original captured bytes or a same-dimension derivation recorded in
`scripts/image-optimization-manifest.json`: its source hash/bytes must match
the capture, and its output hash/bytes must match the current file. Arbitrary
replacement files and resized derivatives fail.

## Verification record

Verified locally on **24 November 2026** for the M4 documentation and asset
capture pass of the studio polyphonic synthesizer upgrade:

- `npm run probabilistic-piano:test -- --maxWorkers=2`: **156 tests across 10
  files passed** (`model.test.ts` 49, `audio.test.ts` 39, `synth-scheduler.test.ts`
  21, `synth-patch.test.ts` 10, `wav-recorder.test.ts` 9, `voices.test.ts` 8,
  `procedural-ir.test.ts` 6, `midi.test.ts` 6, `effects.test.ts` 5,
  `keyboard.test.ts` 3).
- `$env:NODE_OPTIONS = "--max-old-space-size=8192"; npm run build:site`:
  **passed** (`✓ built in 5m 34s`), emitting the Vite module Worker
  `wav-encoder.worker` asset and Vercel output cleanly.
- `npm run probabilistic-piano:assets` against a local `vite preview` server on
  `http://127.0.0.1:5175` (stopped cleanly afterward): **passed**. Updated
  `render-probabilistic-piano-assets.mjs` (`26` `SOURCES`, `#121418` backdrop,
  `captureViewportHeight: 4200`) captured and verified `piano-poster.jpg`
  (`1440 × 760`, `196,405` bytes) and `piano-social.jpg` (`1200 × 630`,
  `140,098` bytes) plus `assets.json` (`sourceHash:
f42cf544eee6b8310be2b8a6315f8ad43b7f8926e7fc1bfa2d68937a9b14fe7d`) and 7
  inspected PNGs under `artifacts/probabilistic-piano/` (`desktop.png`
  `1440×1674`, `mobile.png` `374×2784` at `390px`, `tablet.png` `736×1870`,
  `still.png` `1440×1674`, `inspector.png` `727×503`, `unchanged.png`
  `1438×706`, `focus-motion.png` `1456×1449`).
- `npm run probabilistic-piano:assets:check`: **passed** (`2 actual instrument
captures verified against current source, dimensions and hashes`).
- `$env:PLAYWRIGHT_REUSE_SERVER = "1"; npm run narration:browser:test` against a
  local `vite preview` server on `http://127.0.0.1:4218` (stopped cleanly
  afterward): **12 passed (27.7s)**, confirming `/blog/visualizations/the-piano-that-forgives`
  retains its exact committed SSR narration SHA-256 hash through hydration,
  motion, and musical controls.
- `node --test scripts/check-architecture.test.mjs`: **13 tests passed**.
- `npx prettier --check docs/architecture/ARCHITECTURE.md docs/visualizations/probabilistic-piano.md scripts/render-probabilistic-piano-assets.mjs`,
  `npx eslint scripts/render-probabilistic-piano-assets.mjs`, and `git diff
--check`: **passed**.
- Full synth E2E suite (`probabilistic-piano:browser:test`), `build:full`, and
  branch-diff `check-architecture.mjs --base origin/main --head HEAD` after
  committing remain gated by Milestone M5.

The following dated record describes the 88-key enhancement.

Verified locally on **22 October 2026** for the 88-key enhancement:

- `npm run probabilistic-piano:test -- --maxWorkers=2`: **74 tests across five
  files passed**. These cover the complete A0–C8 geometry, all 88 fundamental
  frequency schedules at 32/44.1/48 kHz, boundary corrections, unchanged middle-
  register probability/demo fixtures, independent voices and bounded effect
  ownership, settling, Still rendering and disposal.
- `PLAYWRIGHT_PORT=5175 PLAYWRIGHT_REUSE_SERVER=1 npm run probabilistic-piano:browser:test`:
  **all 17 cases passed against the final production preview** in 2.2 minutes.
  They cover automatic desktop fit, phone overview endpoints, roving and octave
  shortcuts, focus view, actual probability weights and alignment through view/
  scroll/resize changes, held-pointer navigation/wheel locks, native multi-touch,
  glissando exit/re-entry, two pedal reflections across a chord change, real
  effect pixels/settling, stable Still pixels, silent/denied sound, pending audio
  disposal, unchanged replay/fixtures, both themes and JavaScript-free reading.
- `npm run build-workflow:test`: **15 tests passed**.
- `npm run check`: **zero errors and warnings**. Scoped ESLint and Prettier
  checks passed for the feature and capture tooling.
- `npm run build:full`: **passed** all feature artifact checks, two current
  notebook verifications, content/resource/contrast/SEO/media/link checks,
  search indexing, production compilation, rendered discoverability and the
  emitted-route asset audit. The build retains existing large-chunk, BZ import
  and optional package/platform warnings.
- Final captures were regenerated from that compiled instrument using the fixed
  viewport capture method, then `images:optimize`, `gallery:generate`,
  `probabilistic-piano:assets:check` and `validate:media` passed. Both publication
  JPEGs retain their specified dimensions and stay below 750 KiB; all seven QA
  PNGs were inspected. Only capture tooling and generated media metadata changed
  after the production/browser checks, so those affected checks were rerun
  without another application build.

The following dated record describes the original 37-key release.

Verified locally on **21 October 2026** (original 37-key release):

- `npm run probabilistic-piano:test`: all 60 tests passed across three files,
  including exhaustive pitch/chord/mode cases, empirical sampling, ownership,
  sustain, audio startup and bounded scheduling resources.
- `npm run build-workflow:test`: all 14 publishing-workflow and media-gallery
  fixtures passed. The piano checker runs once in the feature lane and the
  article is selected by both PR and push workflow filters.
- `npm run check`: zero errors and warnings. Scoped ESLint and Prettier passed.
- `npm run build:full`: passed feature artifacts, two current notebook renders,
  publishing validators, production compilation, rendered discoverability and
  the Barnum emitted-route asset audit. The build reports a non-blocking Vite
  warning because key geometry and painting share a module: its dynamic import
  does not create an extra chunk. Canvas work still starts after mount, and the
  article owns the feature dependency.
- `PLAYWRIGHT_PORT=5175 PLAYWRIGHT_REUSE_SERVER=1 npm run probabilistic-piano:browser:test`:
  all ten cases passed against the production preview in Chrome. These cover
  exact probabilities, physical input collisions, note release, pedal/chord
  changes, deterministic phrase comparison, invalid settings, denied audio,
  native multi-touch/glissando, pending startup disposal, portrait/tablet/desktop
  bounds, both themes, Still mode, low-cost painting and JavaScript-free reading.
- `npm run probabilistic-piano:assets:check`: both source-authenticated captures
  passed before and after the repository's same-dimension JPEG optimization.
  The final poster is 1440 × 760 / 127,846 bytes; social image is 1200 × 630 /
  107,167 bytes. Five inspected QA captures live in
  `artifacts/probabilistic-piano/`.
- A final metadata-only correction pinned ten meaningful tags and made the FAQ's
  stable-mark wording precise. The targeted tag generator, content/SEO validation
  and search indexing passed afterward. The instrument code and tested article
  body were unchanged; a later site compilation includes this metadata update.

Twelve actual keyboard presses with sound enabled in headless Chrome
155.0.8059.85 on Windows measured 0.2–1.6 ms for the synchronous model, audio
scheduling and UI assignments, with a median of 0.4 ms. This measurement excludes
operating-system and device output latency. Painting renders on demand, so an
idle frame-rate claim is inapplicable; there is no continuous frame loop.

Real Chrome `OfflineAudioContext` renders of the synthesis graph produced finite
A4 output with peak amplitude 0.01372, stronger early than late RMS, dominant
440 Hz energy, zero tail after decay and zero remaining voices. A scheduled-note
probe was silent before its 100 ms onset and after release. Three complete demo
runs each returned to zero oscillators, one owned master gain and one context,
with a maximum of ten oscillators and thirteen gain nodes observed. Actual
listening was unavailable, so subjective piano timbre was not auditioned.

No remote deployment was performed by this verification run.

Architecture impact: yes

Architecture rationale: Reviewed docs/architecture/ARCHITECTURE.md and
CONTRIBUTING.md#architecture-change-gate. Updated Section 6 ("The Piano That
Forgives") and its Mermaid diagram to document the in-place SynthAudio DSP
engine, 14-preset/localStorage/#patch=/sessionStorage v1 patch persistence,
25 ms/100 ms lookahead scheduler, procedural stereo IR, gesture-gated Web MIDI,
OfflineAudioContext + wav-encoder.worker.ts WAV export,
claimPlayback/releasePlayback TTS coordination, 4-zone data-tts-exclude hardware
UI, and OledScope lifecycle. Verified imports, cleanup paths, asset provenance,
narration invariance, and architecture gate unit fixtures; no new server
endpoint, credential, or foundational cross-feature decision changes, so no
separate ADR is required.
