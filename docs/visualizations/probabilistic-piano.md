# The Piano That Forgives

An impressionist jazz piano and ordinary Visualizations article at
`/blog/visualizations/the-piano-that-forgives`. The instrument assists pitch
locally; the visitor supplies timing, duration and expression. Its testable
promise is palette membership and the declared distance rule. Musical taste,
phrasing and arbitrary dense clusters remain outside that promise.

## Boundaries and ownership

| Source                                                   | Responsibility                                                                                                                          |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/visualizations/probabilistic-piano/model.ts`    | Browser-independent versioned harmony, presets, deterministic decisions, probability calculation, note names and original demo fixture. |
| `src/lib/visualizations/probabilistic-piano/voices.ts`   | Physical-input ownership of a frozen output pitch and its independent audio voice ID.                                                   |
| `src/lib/visualizations/probabilistic-piano/audio.ts`    | Explicitly enabled, per-instance Web Audio synthesis, sustain, finite voice resources and disposal.                                     |
| `src/lib/visualizations/probabilistic-piano/painting.ts` | Deterministic pond atmosphere and stable piano-key geometry; no musical decision.                                                       |
| `src/lib/components/visualizations/probabilistic-piano/` | Per-mount Svelte shell, native playable keys, controls, visual probability marks and readable decision inspector.                       |
| `src/lib/posts/the-piano-that-forgives.md`               | Article, metadata, worked example and primary educational references.                                                                   |
| `static/images/visualizations/probabilistic-piano/`      | Captures of the implemented instrument used by the article and gallery.                                                                 |

The generic blog route and existing post metadata pipeline handle discovery,
archive, search, RSS, sitemap and SEO. The article explicitly imports the shell;
the gallery receives lightweight descriptive metadata. Ordinary article metadata
does not import the piano's audio or painting runtime. No endpoint, external
inference service, account, provider credential or persistent player profile is
introduced. The model is authored preference logic rather than machine learning.

The shell owns mode, seed, temperature, chord, transport, recent history, active
inputs, frozen inspector state and presentation preferences. A note-on freezes
the harmony/settings and selects one output. Its one decision record feeds the
keyboard, probabilities, text ledger and audio. Note-off releases the voice ID
stored for that physical input; it never runs correction again. Two inputs that
choose the same output pitch have separate releases. Held notes retain their
selected pitch across a chord change.

## Musical contract

The supported request/output span is integer MIDI 48–84, C3–C6. Middle C is
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
preferences. Model version `1` and the original twelve-note `DEMO` fixture
establish ordered replay inputs. Visual random draws cannot consume musical
randomness or choose a note.

Correction changes pitch only. It introduces no rhythmic quantisation, swing,
automatic accompaniment or chord-collection delay. Progression and soft
accompaniment require explicit controls. The deterministic demo is labelled as
a replay, and comparisons preserve its timing, velocity and selected harmonic
context. Physical device and operating-system audio latency remains outside
the model.

## Audio and interaction lifetime

The original additive voice uses five sine partials with slight increasing
inharmonicity, a 6 ms attack, register/velocity-dependent brightness, quicker
upper-partial decay and a 150 ms key-up release. Main decay is approximately
3.32–4.28 seconds across C3–C6. This is an explicitly labelled synthesised piano approximation;
no downloaded sample, runtime audio CDN or third-party sound recording is used.
The conservative master scale is 0.24 times the bounded volume control. This
does not certify a universal speaker-output limit.

Twenty playable voices plus four briefly retiring tails bound the audio graph
to twenty-four voices / 120 oscillators. The oldest playable voice fades over
18 ms when stolen. If all four tail slots are momentarily occupied, another
press can be refused instead of creating an unbounded queue. Finished nodes
disconnect. Sustain delays release until pedal-up while retaining the same
voice-resource limits. Unique voice ownership prevents same-pitch collisions
from releasing one another.

Web Audio resources are created only through explicit sound activation. Attacks,
decays and releases use the audio clock independently of painting. Startup is
generation-guarded so cancellation or disposal cannot later enable audio.
Stop all sound invalidates pending startup, clears owned input/sustain state
and stops transport/replay. Hidden/offscreen state, window blur, preset switches
and teardown have explicit silence paths. Teardown closes the owned context and
removes observers and listeners. Browser activation behaviour follows the
[Web Audio specification](https://www.w3.org/TR/webaudio/#allowed-to-start).

Pointer identity/capture supplies independent touch ownership, with cancellation
and lost-capture cleanup. Glissando releases the previous owned input before
starting a new one. Keyboard shortcuts act inside the focused instrument, ignore
auto-repeat and modified browser shortcuts, and avoid editable controls. Native
key buttons also support ordinary keyboard activation. These choices use the
[Pointer Events model](https://www.w3.org/TR/pointerevents3/) while providing
explicit keyboard behaviour alongside it.

## Painting, access and fallbacks

The pond is original procedural artwork. Its bounded, deterministic laid strokes,
moon and lilies describe atmosphere. Native DOM buttons supply stable key
geometry and the familiar two/three black-key grouping; decorative texture does
not change hit targets. Candidate bars and numeric percentages read the same
decision that audio receives. Requested and selected notes have labels and
different marks as well as colour. The full text inspector is available in
silent mode, with a bounded sixteen-event history and a frozen-decision option.

Slow-changing atmosphere renders on demand with pixel density capped at 1.5.
The quiet-wash setting retains the semantic keyboard if canvas painting is
unavailable or the visitor wants lower cost. The feature uses the existing
motion preference resolver and observes both operating-system and site Still
changes. Stable marks preserve the explanation in Still mode. There is no
requirement to hear audio, follow a moving mark or distinguish colours alone to
read the decision. These design choices draw on
[WCAG 2.2](https://www.w3.org/TR/WCAG22/); they are not a claim of complete
assistive-technology or conformance certification.

The phone keyboard scrolls inside its own labelled window rather than shrinking
all thirty-seven keys into the page width. The server-rendered poster and prose
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

The 1440 × 760 `piano-poster.jpg` retains the whole stage with letterboxing.
The 1200 × 630 `piano-social.jpg` adds an editorial title band above the same
stage capture. Five review PNGs under `artifacts/probabilistic-piano/` show the
desktop, portrait phone, Still, exact inspector and unchanged-note views.
These PNGs support human inspection; the two JPEGs are publication inputs.
`static/images/visualizations/probabilistic-piano/assets.json` records the fixed
capture state, normalized source provenance and each publication file's dimensions,
bytes and SHA-256. `npm run probabilistic-piano:assets:check` verifies those
records without a running browser, including a 750 KiB limit per JPEG. The
checker belongs to `features:check`, so the feature build validates committed
captures against the current model, painting, shell, CSS and capture script.
The normal repository image optimizer may re-encode JPEGs during the build.
The checker accepts either the original captured bytes or a same-dimension
derivation recorded in `scripts/image-optimization-manifest.json`: its source
hash/bytes must match the capture, and its output hash/bytes must match the
current file. Arbitrary replacement files and resized derivatives fail.

## Verification record

Verified locally on **21 October 2026**:

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

Architecture rationale: The canonical architecture and contribution gate were
reviewed. This adds a feature-owned decision/audio/painting lifecycle using the
existing ordinary-article pattern. Section 6 of the canonical reference and its
data-flow diagram describe the per-mount owners and shared decision boundary.
No foundational route, integration, persistence or shared-state decision changes,
so a separate ADR is unnecessary.
