# The Piano That Forgives — Codex implementation prompts

An impressionist jazz piano suspended between a moonlit pond and a sky full of paint. You play; the instrument gently turns an uncertain press into the nearest possibility in its current harmony. Every decision leaves a visible brushstroke between the note you touched and the note you heard.

This pack records the original brief for the Visualizations blog post and instrument. The implementation and its verification are recorded in [The Piano That Forgives feature record](probabilistic-piano.md). The prompts remain reusable instructions for the complete experience.

**Working title:** _The Piano That Forgives: Painting Jazz with Probability_

**Article slug:** `the-piano-that-forgives`

**Intended route:** `/blog/visualizations/the-piano-that-forgives`

**Visitor promise:** “Every press is gently guided towards a nearby note in this jazz harmony. You supply the rhythm and expression.”

“Always musical” is the artistic ambition. The testable promise is that assisted notes belong to an explicit harmonic palette and follow the distance rules below. Rhythm, phrasing, dense clusters and personal taste still matter. The post should make that distinction feel inviting.

## How to use this pack

Use the same Codex chat for the sequence. Paste the launch prompt to implement the complete feature, or paste the numbered prompts one at a time for staged work. Each stage reads this document so the musical rules and visual direction survive a fresh chat. A stage completes working code and verification within its scope; the final stage verifies the assembled feature.

Repository paths are starting points verified on 21 October 2026. Reinspect them before implementation. Respect existing user changes and the repository's current contribution instructions.

### Launch prompt — build the complete experience

```text
Read docs/visualizations/probabilistic-piano-prompts.md in full and implement
the proposed feature by completing prompts 1–7 in order. Treat their musical,
visual, editorial and verification requirements as one connected brief.

Build a complete, playable impressionist jazz piano and its explanatory
Visualizations blog post. The first encounter should feel like touching a
painting and discovering that the painting can listen. Keep the actual keys,
musical choices and controls clear enough to use immediately.

Work directly in this repository. Inspect first, implement, exercise the real
interaction, repair failures introduced by the work and report evidence.
Use subagents for independent model, audio or accessibility review when useful.
Do not finish with only a plan, a mock-up, scaffolding or an attractive canvas
whose music and probability display are disconnected.

Complete the architecture gate as part of the implementation. Deliver the
working local feature, article, actual-renderer publication assets, tests and
verification receipt. Follow the repository's publishing instructions if the
active user request includes publication.
```

## 1. Establish the musical and architectural foundation

```text
Read docs/visualizations/probabilistic-piano-prompts.md in full. Implement the
foundation for The Piano That Forgives, following this stage's scope.

Read AGENTS.md, CONTRIBUTING.md#architecture-change-gate, the relevant canonical
architecture sections and docs/visualizations.md. Inspect the Strange Attractor
Orchestra's audio lifecycle and the Mrinmoyee atelier's progressive enhancement
and capture conventions. Reuse patterns where they fit this instrument.

Classify architecture impact before editing. The new instrument introduces a
feature-owned musical decision flow and audio/rendering lifecycle; document
those changes in docs/architecture/ARCHITECTURE.md in the same implementation.
Update the relevant diagram. Add an ADR only if a significant foundational
trade-off warrants one. Document implemented behaviour as each stage lands.

Use these intended boundaries, adapting filenames to existing conventions:
- src/lib/visualizations/probabilistic-piano/: pure harmony/probability model,
  typed contracts, seeded randomness, presets, browser audio and painting.
- src/lib/components/visualizations/probabilistic-piano/: Svelte 5 shell,
  playable keyboard, readable probability inspector and accessible controls.
- src/lib/posts/the-piano-that-forgives.md: prose and explicit feature import.
- static/images/visualizations/probabilistic-piano/: real-renderer captures.
- docs/visualizations/probabilistic-piano.md: implemented design and evidence.

Use the existing generic blog route. Keep the gallery registry lightweight.
Keep browser resource creation behind mount/explicit activation. The musical
core must run without Svelte, window, a canvas or an AudioContext. Each mounted
instrument owns its state. The instrument works locally without a backend,
account, external inference service or runtime asset CDN.
Preserve the repository's security boundaries and resource policy. Report
missing validation commands accurately; audit recommendations are not shipped
safeguards.

Define typed input, harmony, decision, output-voice and replay-event contracts.
A decision records input pitch, harmony snapshot, eligible candidates, actual
normalised probabilities, selected pitch, semitone displacement and reason.
Send this one decision to both sound and visualisation. Painting must never
make an independent musical choice.

Use integer MIDI pitches; explicitly label middle C as MIDI 60 / C4. Start with
a playable C3–C6 span, with a usable smaller viewport on phones. Separate the
musical seed stream from the visual seed stream. Define bounded settings and
versioned replay fixtures. Avoid adding a general-purpose simulation framework.

Deliver a functional mounted shell with a silent decision inspector and a
small deterministic input fixture. Verify that the model imports server-side
without browser globals and that ordinary articles do not load its runtime.
Record the implemented boundaries and remaining stages.
```

## 2. Make the probability earn its name

```text
Read docs/visualizations/probabilistic-piano-prompts.md. Implement and test the
pure harmonic correction engine. This stage supplies the musical truth used
by every later stage.

Author explicit pitch-class palettes per chord and colour setting. Give each
tone its chord role and any supported tension label; do not use one universal
"jazz scale" or claim the palette is a trained model. Include three original,
complete presets: a stationary C6/9 pond, a Dm9–G13–Cmaj9 night walk, and a
spacious Fmaj9–Fm6–C6/9 dusk. Verify the actual tones and accompaniment voicings
against reliable music education sources. Preset names and melodies are original.

At note-on, freeze the current harmony/settings snapshot. Let n be the pressed
MIDI pitch and C be all allowed pitches within the instrument's output range.
Every preset must provide a nonempty C. Reject invalid settings visibly rather
than quietly inventing a different harmony.

Implement three clearly named modes:
1. Nearest, the default: preserve n unchanged if it is eligible. Otherwise
   compute d_min = min(abs(j - n)) for j in C and admit only pitches at d_min.
   If there is one candidate its probability is 1. If there are equally near
   candidates, use the documented weights and musical seed to choose.
2. Wander: preserve eligible presses; otherwise admit pitches whose distance
   is at most d_min + 1 semitone. Explain that these are nearby alternatives.
3. Raw: sound the pressed pitch unchanged for an intentional comparison.

For admitted alternatives, calculate bounded scores such as
score(j) = -a*abs(j-n) - b*abs(j-lastMelodyPitch)
           + c*harmonicRole(j) - d*recentRepetition(j).
Document the weights, units, initial-note behaviour and active-voice penalties.
Treat voice leading as a small preference: do not erase intentional leaps.
Compute a numerically stable softmax, subtracting the maximum score before
exponentiation. Validate finite weights and temperature. At temperature zero,
choose the maximum score with a documented deterministic pitch tie-break.
At positive temperature, sample with the musical PRNG. Show exactly these
probabilities. Do not manufacture uncertainty when there is only one choice.

Preserve onset, duration, velocity where available, repeated-note rhythm and
silence. Correction changes pitch only. No automatic swing, timing quantisation
or accompaniment by default. Harmony advances only on its explicit transport;
with transport stopped, the current chord remains selected.

Select pitch once per press. A held note keeps that pitch when harmony changes;
the new harmony governs later note-ons. Use currently held voices as a bounded
soft compatibility preference. Do not promise that arbitrary dense chords are
universally consonant. Do not delay a press to collect a simultaneous chord.

Test all input pitches in the supported range against every preset/chord:
eligibility, eligible-note preservation, literal nearest distance, Wander bound,
range edges, finite normalised probabilities, zero-temperature ties and empty
or malformed palettes. Include a fixed tie fixture such as C#4 between eligible
C4 and D4. Check seeded replay, variation across seeds when alternatives exist,
and sampler frequencies against computed probabilities with a fixed large
sample and justified tolerance. Confirm visual randomness cannot change notes.

Deliver readable model tests and example decision records. Keep descriptions
of these probabilities explicit: authored musical preferences, not measured
odds that a listener will enjoy a note and not Bayesian learning from a player.
```

## 3. Make it a responsive instrument

```text
Read docs/visualizations/probabilistic-piano-prompts.md. Connect the tested
decision engine to real pointer, touch and computer-keyboard playing and a
convincing, gentle piano-like Web Audio voice.

Start silent with an explicit Enable sound action. A silent visual mode should
still show key presses and decisions. Handle denied or suspended audio startup
and rapid enable/disable actions. Lazily initialise one owned audio context.
Choose a modest synthesis approach with a percussive hammer-like attack,
decaying partials, register-dependent brightness and a natural release. Label
it honestly as a synthesised piano approximation. If using samples instead,
verify the licence, host them locally and provide a working load/failure path.
The core must remain playable without a network audio dependency.

Schedule audio with the audio clock, independently of animation frames. Keep
master gain conservative with bounded polyphony and click-free ramps. Supply
volume, mute, sustain and an always reachable Stop all sound action. A compressor
is not proof of a guaranteed output limiter. Bound all voices, release tails,
audio nodes, reverb buffers and scheduled accompaniment events.

Each physical input gets an input ID. At note-on, store its exact output pitch
and voice ID. At note-off, release that voice; never recalculate correction.
Two inputs corrected to one pitch must release independently. A sustain pedal
retains released voices until pedal-up, within the polyphony cap. Document voice
stealing and reflect it in the held-key display.

Use Pointer Events and pointer capture, with correct cancellation/lost-capture
cleanup and multi-touch ownership. Glissando releases the old owned voice before
starting the new one; dragging out has a defined release path. Painted key
shapes must match hit testing, with black keys taking the intended precedence.
Keyboard note shortcuts act only inside the focused instrument, ignore repeat,
and never steal typing from inputs or modified browser shortcuts. Track releases
even if focus changes. Native buttons also support normal keyboard activation.

On blur, hidden document, reset, preset switch or teardown, silence voices,
clear sustain/input state and stop pending transport events. Offscreen state
must stop visual work and accompaniment without leaving a stuck note. Guard
asynchronous startup so navigation cannot resurrect a disposed instrument.
Disconnect finished nodes and close/dispose the owned context on teardown.

Offer optional soft accompaniment only after an explicit action, using original
sparse voicings of the selected progression. Keep it quieter than the melody.
Let it reveal the harmonic context without turning each press into a full chord.
Use a bounded audio-clock scheduler with no catch-up burst after hiding the tab.

Verify real browser interaction plus voice ownership, same-pitch collisions,
release after a chord change, sustain, polyphony limits, pointer cancellation,
blur and pending-startup disposal. Listen to slow notes, repeated notes, chords
and fast playing. Automated node assertions cannot establish timbral quality;
report whether actual listening was available.
```

## 4. Paint the keyboard into an impossible world

```text
Read docs/visualizations/probabilistic-piano-prompts.md. Give the working piano
an original impressionist visual identity. Make this the piece's strongest
visual moment while retaining the tested musical behaviour.

Imagine ivory keys as warm cream strokes floating over ultramarine water;
black keys gather into violet shadows. Viridian, lilac, coral and pale gold
break across the surface like reflected evening light. Beyond the keys, water
and sky become ambiguous: the pond seems to curve upwards into a quiet painted
cosmos. The wonder should come from composition, pigment and response to touch.

Use broken colour, visible short strokes, scumbled edges and subtle canvas grain.
Keep the keyboard's familiar grouping of two and three black keys unmistakable.
Key boundaries, note labels and focus rings remain sharp enough to play. Keep
the hit regions stable; a painted surface must never make a key move away from
the player's finger. Use locally rendered procedural paint so the keyboard
itself is interactive artwork. Reuse the simplest adequate Canvas/SVG/CSS path.

Give three events distinct visual identities:
- The requested key receives a fine outlined mark with a note label.
- The sounded key receives a filled light/pigment mark with its own label.
- A short connecting brushstroke reveals displacement when correction occurs.
If the pitch is preserved, show one clear combined mark and say "unchanged".

Above the keys, show a fan of possible notes. Its labelled widths or bars
encode the actual candidate probabilities from the engine. The selected note
is indicated by shape and text as well as colour. Keep an exact numeric view
available beside the poetic marks. Every animated musical mark comes from a
real decision; the surrounding painted atmosphere is described as atmosphere.

Each preset has a composed lighting/colour world without changing key geometry.
Use restrained editorial typography, generous space and a small set of controls
on a quiet margin. Open with the instrument and one short invitation to play.
Keep advanced musical controls in an accessible disclosure. The artwork should
feel like an instrument encountered inside an essay.

Cache slow-changing textures; bound paint particles and history. Use capped
pixel density and quality settings. Render on demand at rest. Stop frame loops
when hidden, offscreen or disposed. In reduced-motion/Still mode, replace trails
with immediate stable marks and exact probability bars; sound remains a separate
choice. Include a low-cost renderer fallback with a usable semantic keyboard.
Use the existing motion preference resolver in src/lib/motion/preferences.ts,
respecting both OS preference and the site's Still setting, including changes
after mount. Do not add a competing motion store.

On portrait phones, keep keys large enough to touch and show a labelled octave
window or keyboard-local scroll. Avoid page-wide overflow and silently shrinking
all 37 keys into unusable targets. Preserve the complete desktop layout and
tablet touch layout. Test both site themes and visible keyboard focus.

Deliver actual desktop and phone captures from the implemented instrument,
including a correction, unchanged note and Still view. Inspect them and refine
composition until the keyboard is recognisably painted and immediately playable.
```

## 5. Let the visitor see the decision

```text
Read docs/visualizations/probabilistic-piano-prompts.md. Turn the musical model
into a clear, enjoyable probability visualisation and short guided discovery.

Provide three linked views of the same decision:
1. Keyboard: the requested note, sounded note and connecting stroke.
2. Possibility fan: every admitted candidate and its actual selection probability.
3. A compact text ledger: requested pitch, played pitch, signed semitone change,
   current chord, mode, candidate probabilities and why selection occurred.

Distinguish chord palette eligibility from the narrower nearest/Wander set.
Show omitted notes as ineligible or outside the distance bound, not as mysterious
zero-probability predictions. Explain that probability 1 is a valid result.
Retain a bounded recent-note ledger and an explicit Freeze last decision action
so rapid playing does not prevent inspection. Avoid per-note screen-reader
announcements during fast playing; provide an opt-in readable event history.

Keep the first-use controls small: Enable sound, preset, Nearest/Wander/Raw,
volume and Stop all sound. Put temperature, chord inspection, seed/replay,
accompaniment and other advanced choices behind labelled controls. Explain when
temperature cannot change a result because only one candidate is admitted.

Build a brief three-step guide:
- Press a note in the current palette and see why it stays unchanged.
- Try a neighbouring outside note and inspect the nearest possibilities.
- Compare Nearest, Wander and Raw using the same original short phrase.
Use a labelled deterministic demo fixture, started explicitly by the visitor.
Do not call a prerecorded or scheduled demo live user playing. Replay uses the
same model and records event ordering/harmony snapshots; no rendering-derived
randomness may enter the musical stream. Raw/assisted comparisons share timing,
velocity, instrument settings and harmonic context so the difference is clear.

Do not call the display a neural network, a listener model or a scientific
measurement of beauty. Explain the model's chosen harmonic assumptions in plain
language. Show that assistance preserves timing and expression while changing
pitch, and that raw notes remain an available creative choice.

Verify all controls by keyboard and touch. Use native semantics, visible focus,
legible contrast and non-colour state indicators. Give nonvisual readers the
candidate values and correction explanation. Ensure the guide also works in
silent mode and that no understanding depends on moving particles.
```

## 6. Write and integrate the Visualizations blog post

```text
Read docs/visualizations/probabilistic-piano-prompts.md. Write the finished
original article around the working instrument, matching repository conventions.

Use the working title The Piano That Forgives: Painting Jazz with Probability
and slug the-piano-that-forgives unless repository inspection reveals a conflict.
Keep prose in src/lib/posts/the-piano-that-forgives.md, with category
Visualizations and an explicit import of the feature shell. Inspect a recent
interactive-first article before setting supported metadata and embed order.
If using immersiveLead, give the shell its own visible title and accessible H1
because the generic article header is suppressed. Include useful inPlainEnglish,
keyTerms and FAQ metadata where supported by the current article contract.
Use the actual publication date when publishing, not this prompt pack's date.
Curate tags and pinnedTags together, with at most ten meaningful tags.

Write in British English, warm, precise and curious. Begin with the sensation
of touching a painted key and hearing a small act of forgiveness. Bring the
visitor into playing quickly, then unpack what happened. Aim for a substantial
but readable essay of roughly 1,200–1,800 words, adjusted to the explanation.

Explain through one worked example that matches a real fixture:
- A press is a pitch request; the current chord supplies an allowed palette.
- Semitone distance identifies the nearest candidates.
- Voice-leading/role preferences weight an actual probability distribution.
- The seed chooses among alternatives; held notes keep their selected pitch.
- The requested rhythm and duration survive the correction.
Show the small formula beside its plain-language explanation. Clarify how
Nearest differs from Wander and why some presses have no random outcome.

Connect impressionist broken colour with musical possibility as an artistic
analogy. Distinguish that analogy from technical or historical claims. Explain
that jazz also uses deliberate tension, chromatic approaches, rhythm and
phrasing; this curated assistant does not define correct jazz or guarantee that
every cluster is beautiful. Close with a small listening/playing experiment.

Verify music and browser claims using primary standards or credible first-party
music education sources, including the reference leads in this document.
Cite sources near supported claims. Define terms such as voicing, tension and
voice leading. Describe synthesised timbre honestly and explain activation,
silent mode, reduced motion and keyboard shortcuts. State the model's limits
without burying the invitation to play.

Add the lightweight visualization summary and appropriate gallery subjects
using the current registry/landing conventions. Keep audio/rendering imports
out of gallery metadata. Verify ordinary article discovery, category archive,
search, social metadata and existing public routes.
Inspect visualizationSummaries in src/lib/visualizations/registry.ts and the
postSubjects map in VisualizationsLanding.svelte. Use supported subject filters
such as Statistics, Mathematics and Generative Art unless extending the taxonomy
is explicitly part of the implementation.

Generate the poster/social image from the implemented renderer in a specified,
seeded decision state. Show the actual keyboard and possibility marks. Supply
dimensions, useful alt text and a deterministic capture/provenance check using
repository asset conventions. Provide the poster and explanatory text during
loading, failure and no-JavaScript reading. The static poster represents an
actual state; it does not claim interactivity when JavaScript is unavailable.

If adding an asset checker, wire it into the feature build and relevant workflow
filters, including this interactive article path in both PR and push selection.
Update docs/visualizations/probabilistic-piano.md and the canonical architecture
with implemented details. Record significant decisions where the gate requires.
```

## 7. Review the whole experience and finish it

```text
Read docs/visualizations/probabilistic-piano-prompts.md. Audit and finish the
assembled piano, visualisation and article against every preceding stage.
Fix defects introduced by this feature before reporting completion.

Run the focused model/audio lifecycle tests, browser suite, npm run check,
scoped lint/format checks and npm run build:full, following the current
contribution policy. This is interactive feature work, so use the feature build
lane. Review generated changes; keep unrelated existing failures separate.
Do not describe blocked or unavailable checks as passing.

Exercise the production preview in a real browser. Cover:
- Desktop, tablet and portrait phone; both themes; no page overflow.
- Mouse, multi-touch and focused keyboard; pointer cancellation and key repeat.
- All presets and modes; eligible-note preservation; an actual tie distribution.
- Raw versus corrected replay with the same phrase and seed.
- Two inputs sharing an output pitch; sustain; chord changes while notes are held.
- Mute and Stop all sound, including sustained notes and scheduled accompaniment.
- Startup cancellation, rapid navigation, hidden/offscreen state and remount.
- Still/reduced motion, silent playing, visual failure and JavaScript disabled.
- Complete tab order, focus visibility, readable probabilities and text history.

Capture desktop, phone, probability-inspector and Still screenshots from the
real final UI. Inspect key geometry, paint texture, controls, contrast and note
mapping. Check the fallback poster and capture provenance. Review the article's
worked example against the tested model rather than an invented illustration.

Measure input-handler-to-audio-scheduling time under documented conditions;
target less than 20 ms for the measured local work on the test device. Report
that this excludes operating-system/device output latency. Use a 60 fps desktop
rendering target only during visible activity, degrade quality gracefully, and
report measured results rather than promising universal frame rates. Confirm
that idle, hidden and disposed instruments leave no frame loop or live voices.

Listen if audio output is available: does the voice read as a gentle struck
keyboard, do release ramps avoid clicks, and can the melody be heard over the
optional accompaniment? Identify listening checks unavailable in the environment.

Compare final imports, state ownership, event flow and cleanup with the updated
canonical architecture and diagrams. Include Architecture impact: yes and a
nonempty Architecture rationale in the PR description or final handoff. Run
git diff --check. Deliver the route, changed files, commands and results,
screenshots, model limits, source/licence notes and any unresolved blocker.
Keep the handoff explicit about implemented features and remaining limitations.
```

## Reference leads for implementation

These sources support the engineering and musical vocabulary. The proposed scoring rule, presets, distances and visual world are original design choices. Recheck sources and current repository evidence when implementing.

- [OpenAI: Prompting Codex](https://learn.chatgpt.com/docs/prompting#prompting-codex) — describe behaviour, relevant code, constraints and verification. This pack applies that structure to a concrete feature.
- [Berklee: Piano Voicing Techniques](https://online.berklee.edu/takenote/basic-piano-voicing-techniques/) — chord voicings, guide tones and compatible tensions.
- [Berklee: Voice Leading Paradigms](https://online.berklee.edu/takenote/voice-leading-paradigms-for-harmony-in-music-composition/) — common tones and economical motion as musical preferences.
- [W3C: Web Audio](https://www.w3.org/TR/webaudio/) — audio contexts, scheduled sources and parameter automation; inspect the current specification and browser support during implementation.
- [W3C: Pointer Events](https://www.w3.org/TR/pointerevents3/) — pointer identity, capture and cancellation.
- [W3C: WCAG 2.2](https://www.w3.org/TR/WCAG22/) — keyboard access, visible focus, contrast and alternatives to colour-only information.

## Architecture impact of this prompt pack

Architecture impact: no

Architecture rationale: The canonical architecture and contribution gate were reviewed. This change adds a proposed implementation brief and a backlog link only; it changes no application modules, routes, state, data flow, integrations, assets or build behaviour. The future implementation prompts explicitly require the corresponding architecture review, same-change documentation/diagram updates, verification and any warranted ADR.
