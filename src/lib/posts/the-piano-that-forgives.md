---
title: "The Piano That Forgives: Painting Jazz with Probability"
seoTitle: "The Piano That Forgives — A Probabilistic Jazz Piano"
description: "Play an impressionist piano that guides uncertain notes towards nearby jazz possibilities, then see the exact probability behind each gentle correction."
date: "2026-10-21"
dateModified: "2026-10-22"
thumbnail: "/images/visualizations/probabilistic-piano/piano-social.jpg"
thumbnailAlt: "An impressionist piano above ultramarine water, with a brushstroke connecting a requested C sharp to the selected nearby note and labelled probability marks"
category: "Visualizations"
tags: ["Probability", "Statistics", "Mathematics", "Jazz", "Generative Art", "Interactive Art", "Music Theory", "Creative Coding", "Web Audio", "Jazz Harmony"]
pinnedTags: ["Probability", "Statistics", "Mathematics", "Jazz", "Generative Art", "Interactive Art", "Music Theory", "Creative Coding", "Web Audio", "Jazz Harmony"]
published: true
interactiveFirst: true
immersiveLead: true
color: "#A19BDD"
author: "Suvro Ghosh"
readingTime: "8 min"
inPlainEnglish: "You supply a piano phrase's rhythm and expression. The instrument keeps notes in its chosen harmony and gently redirects outside notes to nearby alternatives. Its painted marks and exact percentages explain the same decision that produces the sound."
keyTerms: ["Pitch class", "Semitone", "Chord palette", "Voicing", "Tension", "Voice leading", "Softmax", "Temperature", "Seed"]
faq:
  - question: "Does every key press become beautiful jazz?"
    answer: "Assisted notes belong to the selected authored harmonic palette and obey the displayed distance rule. Rhythm, phrasing, register, dense clusters and personal taste still matter. The instrument does not define correct jazz."
  - question: "Why does a note sometimes have a probability of 100 per cent?"
    answer: "Eligible presses stay unchanged. An outside press can also have only one nearest eligible candidate. In both cases there is one possible outcome, so temperature and the seed cannot change it."
  - question: "Is the instrument learning from me?"
    answer: "No. It uses explicit chord palettes and a small authored scoring rule. The percentages describe its selection process, not the chance that a listener will enjoy a note."
  - question: "What changes when I hold a note through a chord change?"
    answer: "The held note keeps the pitch chosen when you pressed it. The new harmony applies to later presses. Releasing an input releases its own voice, including when another input has selected the same pitch."
  - question: "Can I explore without audio or animation?"
    answer: "Yes. The keyboard and decision inspector work silently. The display uses stable marks and respects the site's Still setting and reduced-motion preference. A poster and the article remain readable without JavaScript."
---

<script>
	import ProbabilisticPiano from '$lib/components/visualizations/probabilistic-piano/ProbabilisticPiano.svelte';
</script>

<ProbabilisticPiano />

<p><small>Published <time datetime="2026-10-21">21 October 2026</time> · Updated <time datetime="2026-10-22">22 October 2026</time></small></p>

<TTS />

## A small act of forgiveness

Touch a cream-coloured key. A pale mark settles beneath your finger; another opens a little to its left, and a brushstroke joins them across the painted surface. The note arrives as though your hand had always known where it meant to go.

Above the keyboard, ultramarine water climbs into a lilac sky. Small strokes of viridian and gold refuse to decide whether they are reflections or distant stars. The keys remain ordinary enough to recognise: two dark ones, then three, then two again. Their surroundings have quietly left the room.

This piano offers a modest kindness. You supply the rhythm, pauses and shape of a phrase. It guides an uncertain pitch towards a nearby possibility in the current harmony. The brushstroke makes that intervention visible.

Start with the **Moonlit pond** preset and **Nearest** mode. Play slowly, leaving a little silence after each note. **Enable sound** when you want to listen; the keys and explanations also work silently. There is no audition to pass before touching the painting.

## Your finger makes a request

A press is a request for a pitch, rather than an instruction that the instrument must obey literally. The current chord supplies a small, explicit palette of allowed notes. **C6/9**, the pond's stationary harmony, uses C, D, E, G and A, repeated across the available octaves.

These are **pitch classes**: C4 and C5 share a letter and harmonic identity while occupying different registers. This instrument labels middle C as **C4, MIDI 60**. Adjacent piano keys differ by one **semitone**, including the step from E to F where no black key intervenes. The complete piano runs from A0 to C8: eighty-eight keys, with fifty-two white and thirty-six black.

On a wide screen, **Fit all 88 keys** opens the whole instrument at once. **Playing view** gives your fingers more room, while the small keyboard overview lets you travel from the low bass to the bright treble. Use the octave arrows or **Return to middle C** to find your way home. On a phone, the keyboard moves inside its own window. **Enter focus view** gives the pond and keys more space within the article.

Press an allowed note and it stays exactly where you put it. Press an outside note and Nearest measures the semitone distance to each allowed pitch. Only the closest survive. Sometimes that leaves one answer; sometimes two equally close neighbours remain.

The distinction matters. The palette says what this particular instrument permits. The candidate set says which permitted pitches are close enough to answer this particular press. A distant allowed note has not received a mysterious bad prediction. It was excluded by a stated distance rule.

## C sharp, between two doors

Consider a fresh C6/9 state, with no previous melody notes or held voices. Press C♯4, MIDI 61. C4 is one semitone below; D4 is one semitone above. Both qualify in Nearest. E4 is three semitones away and cannot enter the draw.

The instrument gives the two neighbours small preference scores. At the default temperature of 0.7, the resulting probabilities are approximately **54.98 per cent for C4** and **45.02 per cent for D4**. C has a slight preference because the authored rule favours its root role over D's added ninth. The selected mark shows which possibility actually sounded.

The rule begins with:

<div class="piano-equation">

$$
s(j)=-1.6|j-n|-0.035L(j)+0.35H(j)-0.12R(j)-0.10V(j).
$$

</div>

Here $n$ is your requested MIDI pitch and $j$ a candidate. Distance supplies the strongest preference. $L$ measures the distance from the previous sounded melody note, capped at twelve semitones; the first note has no such penalty. $H$ is the candidate's authored harmonic-role weight. $R$ counts recent exact repetitions, capped at three, and $V$ is a small, bounded cost from currently held voices.

For this clean example, C4 scores −1.25 and D4 scores −1.39. A **softmax** turns these relative scores into probabilities:

<div class="piano-equation">

$$
p(j)=\frac{\exp((s(j)-s_{\max})/T)}
{\sum_k\exp((s(k)-s_{\max})/T)}.
$$

</div>

Subtracting the largest score keeps the calculation numerically well behaved. Temperature $T$ controls how sharply the scores matter. At zero, the highest score wins directly; an exact score tie goes to the lower MIDI pitch. With positive temperature, a seeded pseudorandom draw selects from the displayed distribution.

These percentages belong to an authored choosing mechanism. They do not measure beauty, predict your satisfaction or come from a neural network learning your taste.

## Three degrees of permission

**Nearest** makes the smallest possible correction. An intentional leap survives: the model measures distance from the key you pressed before giving voice leading any preference. It cannot drag a high request down an octave merely because the previous note was low.

**Wander** allows candidates up to one semitone farther than the nearest distance. That extra room can make an answer less obvious while keeping it local. Allowed presses still remain unchanged. **Raw** sounds your requested pitch directly, giving deliberate outside notes their full citizenship.

A probability of one is perfectly useful information. If only one candidate qualifies, turning up temperature cannot invent another. The fan collapses to an honest certainty. The same is true when your press already belongs to the palette.

Freeze a decision to read its exact values. The keyboard shows the request and result, the fan gives the candidates' relative probabilities, and the ledger names the chord and signed semitone movement. All three views read the same decision. The paint is never secretly composing a second tune.

## Harmony gives the colour somewhere to live

The three presets offer different places to linger. **Moonlit pond** stays on C6/9. **Night walk** follows Dm9–G13–Cmaj9. **The blue hour** moves through Fmaj9–Fm6–C6/9, with the minor turn giving the light a different edge. Their palettes are individual choices; there is no universal jazz scale beneath every chord.

A **voicing** is the arrangement of chord notes across register. A **tension** adds colour beyond the basic chord sound, such as a ninth or thirteenth. Berklee's [piano voicing lesson](https://online.berklee.edu/takenote/basic-piano-voicing-techniques/) explains the roles of thirds, sixths and sevenths, and the use of added tensions. Here G13 includes G, A, B, D, E and F, leaving out the eleventh as a deliberate palette choice. The University of Puget Sound's [jazz chord reference](https://musictheory.pugetsound.edu/mt21c/JazzChordBasics.html) explains the extension symbols and this customary omission.

**Voice leading** concerns how individual lines move through changing harmony. Keeping a shared note or making a small step can connect one chord with the next, as Berklee's [voice-leading lesson](https://online.berklee.edu/takenote/voice-leading-paradigms-for-harmony-in-music-composition/) illustrates. This piano borrows that preference gently. It also applies small repetition and held-voice costs, without pretending to solve every combination of fingers.

The progression advances only when you start its transport. With it stopped, the selected chord waits. Optional **Soft accompaniment** supplies sparse, quieter voicings when requested. A single melodic press still produces a single melodic note.

Hold a note through a chord change and it keeps its chosen pitch. Later presses consult the new harmony. Releasing your finger releases the voice selected for that input; **Hold pedal** delays release until the pedal lifts. Within the instrument's voice limits, correction preserves onset, duration and available velocity. It adds no automatic swing and moves no note to a rhythmic grid.

## Paint that explains its intervention

Broken colour offers an artistic analogy for possibility: adjacent strokes can suggest a changing surface without dissolving into one flat mixture. Here a requested pitch and its neighbours remain distinct, even while a connecting stroke lets the eye imagine their relationship. This is a visual conversation between music and painting, rather than a historical theory about how impressionists composed.

Each sounded note opens a moonlit bloom and a few expanding ripples. Low notes make broader, slower rings; high notes leave finer glints. A held note keeps a quiet reflection, including when the pedal carries it after your finger has lifted. Short ribbons of pigment remember the length and strength of recent notes, joining a quick run into one passing brush gesture.

The surrounding atmosphere is decoration. The labelled musical marks have stricter duties. An outline identifies the request; a filled mark identifies the result; an unchanged note receives a combined mark. Curves of light connect the request to its admitted candidates, with stronger lines for larger probabilities and warm gold for the selected branch. The selected candidate is named as well as coloured. That follows the principle in [WCAG's guidance on colour](https://www.w3.org/TR/WCAG22/#use-of-color) that information needs another visual means of identification.

Choose Still, or use your device's reduced-motion preference, for stable rings, ribbons and probability marks. The probabilities remain available as numbers. Computer shortcuts work inside the focused instrument and are shown beside the keys; **[** and **]** shift their range by an octave. Arrow keys move between individual piano keys, **Home** and **End** reach A0 and C8, and **Page Up** and **Page Down** move an octave. One Tab stop enters the keyboard, and ordinary key buttons support activation too. The recent-note history gives a quieter way to inspect a phrase after playing it.

The voice is an original synthesised piano approximation, made from decaying partials with a small struck attack. It evokes a gentle keyboard rather than reproducing a recorded concert grand. Sound begins through an explicit action: the [Web Audio specification](https://www.w3.org/TR/webaudio/#allowed-to-start) allows browsers to require user activation before starting an audio context. Volume, mute and **Stop all sound** remain within reach.

## Leave room for a surprising note

Jazz makes expressive use of tension, chromatic approaches, phrasing and rhythmic placement. A note outside this instrument's palette can be exactly the note a phrase needs. Raw mode keeps that choice available. Nor can membership in a chord palette guarantee that a dense handful of notes will sound graceful in every register.

Try the three-step guide, then replay its short original phrase in Nearest, Wander and Raw. The comparison keeps the phrase's timing, velocity and harmonic context together. The seed reproduces its musical choices for the same ordered input and settings; changing the painted atmosphere cannot change the melody.

Finally, play four slow notes and leave a gap. Repeat them with a different last note. Freeze the result, listen to the silence after it, and decide whether the piano helped. Forgiveness is a useful beginning. The phrase is still yours to finish.
