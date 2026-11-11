---
title: How fingerprints form
seoTitle: How Fingerprints Form | Interactive Ridge Formation Model
description: Grow a synthetic fingerprint and see how ridge spacing, the places where ridges begin, and their timing change the result.
date: '2026-11-11'
category: Visualizations
tags: ["Fingerprints","Reaction-diffusion","Pattern formation","Mathematical biology","Morphogenesis","Turing patterns","Scientific Computing","Developmental Biology","Numerical Simulation","Surface Diffusion"]
pinnedTags:
  - Fingerprints
  - Reaction-diffusion
  - Pattern formation
  - Mathematical biology
  - Morphogenesis
  - Turing patterns
  - Scientific Computing
  - Developmental Biology
  - Numerical Simulation
  - Surface Diffusion
thumbnail: /images/visualizations/how-fingerprints-form/social.png
thumbnailAlt: A synthetic loop print with dark curving ridges on a warm pale field.
color: '#A15B23'
author: Suvro Ghosh
readingTime: 4 min
inPlainEnglish: Local interactions between two spreading signals help set the spacing of fingerprint ridges. Where and when the ridges start to form helps determine their arrangement.
published: true
mediaReviewed: true
interactiveFirst: true
immersiveLead: true
---

<script>
	import FingerprintLab from '$lib/visualizations/fingerprint/FingerprintLab.svelte';
</script>

<FingerprintLab />

## How a fingerprint forms

<p><small>By Suvro Ghosh · <time datetime="2026-11-11">11 November 2026</time></small></p>

<TTS />

How does a fingertip acquire its closely spaced ridges? And why do those ridges form an arch on one finger, a loop on another, and a whorl on a third?

Start with **Loop** in the experiment above. Choose **Keep for comparison**, then move **Ridge spacing** towards **Wider**. The fingertip stays the same size. Fewer ridges fit inside it.

Now choose **Reset**, then **New variation**. The starting configuration stays the same, but small differences in the initial state can change some of the detail.

Those two comparisons separate questions that are easy to mix together. What sets the distance between neighbouring ridges? What determines their arrangement?

A fingerprint needs answers to both.

Alan Turing considered the first kind of problem in his 1952 paper, *The Chemical Basis of Morphogenesis*. He showed how substances that react and spread through a system can, under suitable conditions, turn small differences into a repeating spatial pattern. [Turing, 1952](https://doi.org/10.1098/rstb.1952.0012)

Diffusion usually seems to work against this. A drop of ink spreads through water. Its sharp edges disappear. Leave it alone and the concentration becomes more even.

The interesting result comes when spreading happens alongside reactions.

In a useful simplified picture, one signal reinforces activity nearby. It also helps produce another signal that suppresses that activity over a wider distance. A small increase can then strengthen locally while making another increase less likely immediately beside it. Farther away, activity can rise again.

Under the right conditions, this produces a repeated spacing. Raise a signal by the same amount everywhere and it can settle back to its original level. Raise it in patches at certain intervals and the differences can grow. Which intervals grow depends on the reaction rates as well as how fast the signals spread.

The computer follows these rules at many points across the simulated fingertip. At each point, it calculates what the local reactions change and what arrives from neighbouring points. Then it repeats the calculation.

The ridges in the display come from that evolving signal. Their spacing is part of the calculation. Switch to **Signal** to see the same activity before it is turned into dark ink.

In developing fingers, James Glover and colleagues found that WNT, EDAR and BMP signalling helps establish the ridge pattern. Ridges form in waves that spread from distinct regions. Where these waves meet helps determine the overall arrangement. [Glover and colleagues, 2023](https://doi.org/10.1016/j.cell.2023.01.015)

This is where the fingertip itself matters.

The same local rules can produce different arrangements when the available surface, the places where patterning begins, or the timing of those beginnings changes. The study's model gives each of those influences a place in the calculation. [Mathematical appendix and reference models](https://github.com/AndrewLKrause/fingerprint-simulations)

The **Arch**, **Loop** and **Whorl** choices load different starting configurations. An arch carries ridges across the fingertip with a rise through the middle. A loop turns back towards the side from which it came. A whorl has ridges arranged around a centre. Those names describe the overall flow of the ridges. The settings give you a way to explore how that flow develops.

Try moving **Starting position** in the loop preset. Watch where the developing ridges meet. Then return to the reference setting and change **Wave timing**, which adjusts when patterning begins near the crease.

Change one thing at a time. Otherwise, it becomes difficult to tell which change did what.

Genes influence fingerprint patterns. Research has linked variation in fingerprint type to genes involved in limb development and to aspects of hand and finger proportions. A pattern develops through a process within that growing tissue. Small differences along the way can affect its detail. [Li and colleagues, 2022](https://doi.org/10.1016/j.cell.2021.12.008)

The **New variation** button explores a much narrower version of that idea. It changes small initial differences in this model while keeping the other settings fixed. **Replay formation** repeats the same beginning.

The print is synthetic. The model follows two signals on a fixed surface, and the image shows that surface projected onto a flat view. Its distances and times are in model units. Real ridges develop in tissue that changes shape as it grows.

Pause while the first ridges are appearing. Follow a small region as the neighbouring pattern develops. Then try a different starting position.

The finished print contains a great deal of detail. Watching it form lets you examine how local interactions, repeated across a small surface, can produce that detail.
