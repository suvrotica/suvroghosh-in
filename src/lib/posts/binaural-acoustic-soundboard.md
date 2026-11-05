---
title: "Binaural Acoustic Soundboard"
seoTitle: "Binaural Acoustic Soundboard — Rain, Fan, Soft Noise and Binaural Tones"
description: "Mix steady rain, a quiet fan, distant city ambience, soft noise and optional binaural tones in your browser. Save a favourite mix or set a sleep timer."
date: "2026-11-06"
dateModified: "2026-11-06"
thumbnail: "/images/visualizations/binaural-acoustic-soundboard/social.png"
thumbnailAlt: "Binaural Acoustic Soundboard's matte graphite mixer panel with amber status display, five channel faders, master rotary dial and sleep timer controls"
category: "Visualizations"
collections: ["apps"]
tags: ["Audio", "Soundboard", "Binaural Tones", "Web Audio", "Ambient Sound", "Background Noise", "Browser Tools", "Focus", "Reading", "Sleep Timer"]
pinnedTags: ["Audio", "Soundboard", "Binaural Tones", "Web Audio", "Ambient Sound", "Background Noise", "Browser Tools", "Focus", "Reading", "Sleep Timer"]
published: true
interactiveFirst: true
immersiveLead: true
color: "#d46a2e"
author: "Suvro Ghosh"
readingTime: "3 min"
inPlainEnglish: "Choose Reading, press Play, adjust the rain and fan faders, and set a 15, 30 or 60-minute sleep timer. Add optional stereo binaural tones with headphones and save mixes in your browser."
keyTerms: ["Binaural tones", "Frequency difference", "Pink and brown noise", "Web Audio synthesis"]
faq:
  - question: "Does this generate or measure brain waves?"
    answer: "No. The soundboard generates two audio tones at a selected frequency difference in the left and right headphone channels. Research does not establish reliable brainwave entrainment from binaural beats, so the frequency names describe the audio setting rather than a mental state."
  - question: "Do I need headphones?"
    answer: "Stereo headphones are needed for the binaural tones because each ear must receive its own frequency. The rain, fan, distant city and soft noise channels work through either speakers or headphones."
  - question: "Does audio start automatically when I open or reload the page?"
    answer: "No. Audio starts only when you press Play. Reloading or reopening the page restores your saved mixes and master volume setting, without restarting playback or an active sleep timer."
  - question: "Where are my saved mixes stored?"
    answer: "Saved mixes and master volume settings stay in this browser's local storage when available. No account is required and nothing is uploaded."
  - question: "How does the sleep timer stop playback?"
    answer: "Selecting 15, 30 or 60 minutes sets a wall-clock deadline. During the final ten seconds, a dedicated gain stage fades the mix smoothly to silence before stopping playback."
---

<script>
	import BinauralAcousticSoundboard from '$lib/components/visualizations/binaural-acoustic-soundboard/BinauralAcousticSoundboard.svelte';
</script>

<BinauralAcousticSoundboard />

<p><small>Updated <time datetime="2026-11-06">6 November 2026</time></small></p>

Want something quiet on while you read, work, or rest? Start with **Reading**, press **Play**, adjust the **Rain** and **Fan** faders, and set a **30-minute** timer. When you want live speech or music instead of a wordless room tone, switch over to [Calcutta Radio](/blog/visualizations/calcutta-radio).

## Five quiet channels

Every channel has its own level fader and mute button. Muting a channel remembers its previous level so unmuting returns directly to your setting:

- **Rain** — steady rain against a window, without thunder or sudden downpours.
- **Fan** — a gentle mechanical hum with soft continuous airflow.
- **Distant city** — a subdued wash of far-off movement, without intelligible speech or abrupt horns.
- **Soft noise** — a continuous background texture with a choice between warmer **Brown** noise and brighter **Pink** noise.
- **Binaural tones** — an optional pair of continuous sine tones routed separately to the left and right ears.

## What the binaural settings mean

The binaural layer stays off in the initial presets so you can use the ambient channels through ordinary speakers. When you wear stereo headphones and raise the **Binaural tones** fader, the left ear receives a steady `220 Hz` carrier tone while the right ear receives `220 Hz` plus the selected difference (`Delta` `2 Hz`, `Theta` `6 Hz`, `Alpha` `10 Hz`, `Beta` `20 Hz`, or `Gamma` `40 Hz`). Under **Fine adjustment**, you can set any difference from `1 Hz` to `40 Hz` in `0.5 Hz` steps.

These labels follow conventional frequency-band names used in acoustics and EEG literature, but the soundboard generates audio tones rather than generating or measuring brain waves. As a [2023 systematic review in *PLOS ONE*](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0286023) notes, empirical studies do not establish reliable brainwave entrainment from binaural beats, so the settings describe the acoustic frequency difference without promising a specific mental state.

## Saved mixes and the sleep timer

Starting from **Reading**, **Work**, or **Rest**, any fader adjustment switches the label to **Custom mix**. You can save custom mixes in your browser, load or rename them later, or update a saved mix after tweaking its balance. Loading a preset or saved mix updates only the five channel controls while keeping your current **Master volume** and sleep-timer countdown intact.

The sleep timer offers **Off**, **15**, **30**, and **60 minutes**. Selecting a duration sets an absolute deadline that survives channel and preset changes. During the final ten seconds before the countdown reaches zero, a dedicated gain stage fades the mix smoothly to silence and stops playback.
