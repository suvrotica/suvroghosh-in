---
title: Ink That Follows a Scent
seoTitle: Ink That Follows a Scent | Interactive Chemotaxis & Biased Random Walk Lab
description: Paint an invisible chemical landscape and watch thousands of wandering particles reveal it through accumulated trails and a paired sensing comparison.
date: '2026-11-06'
dateModified: '2026-11-06'
category: Visualizations
tags:
  - chemotaxis
  - biased random walk
  - mathematical biology
  - random walks
  - diffusion
  - collective behaviour
  - stochastic processes
  - interactive simulation
  - agent-based modelling
  - James D. Murray
pinnedTags:
  - chemotaxis
  - biased random walk
  - mathematical biology
  - random walks
  - diffusion
  - collective behaviour
  - stochastic processes
  - interactive simulation
  - agent-based modelling
  - James D. Murray
thumbnail: /images/visualizations/ink-that-follows-a-scent/social.png
thumbnailAlt: Computed chemotaxis comparison showing dense warm ink trails gathered around a chemical source when sensing is on beside uniform wandering trails when sensing is off.
color: '#FFAA4C'
author: Suvro Ghosh
readingTime: 4 min read
inPlainEnglish: Each particle wanders randomly through an invisible chemical landscape; adding a small local push up the concentration slope gathers their accumulated ink trails around sources and painted curves without a leader or pre-drawn route.
published: true
mediaReviewed: true
interactiveFirst: true
immersiveLead: true
---

<script>
	import InkFollowsScentInstrument from '$lib/components/visualizations/ink-that-follows-a-scent/InkFollowsScentInstrument.svelte';
</script>

<InkFollowsScentInstrument />

<TTS />

How can thousands of wandering particles gather around a shape they cannot see?

Start with a single patch of chemical. Each particle moves randomly, but sensing adds a small push towards a stronger concentration. Over time, more particles gather around the patch. Their trails make that influence visible.

Move the source to the other side of the canvas. The particles begin responding to its new position. The old marks remain for a while, so you can see the difference between where particles have been and where they are moving now.

Then try painting a curve.

The chemical itself is hidden. As particles encounter its slopes, their movement becomes biased towards the painted region. A drawing gradually appears through the accumulation of their paths.

They will not necessarily follow the curve from one end to the other. They respond to the chemical near their current position. That can bring them towards the curve and keep more of them nearby, without giving any particle a route to follow.

The comparison makes the effect easier to examine.

Choose Compare from same start. Both runs begin with the same particle positions, and each matching particle receives the same random nudge at every step. One run also responds to the chemical. The other has sensing switched off.

Watch how their paths separate.

Sharing the random nudges makes this a more useful comparison: a different sequence of random movements cannot explain the difference between the two runs. The sensing rule is what changes.

You can also switch sensing off during exploration. The particles continue wandering, and the earlier drawing takes time to fade. Turning off a rule changes what happens next; it does not remove the history of what has already happened.

That distinction matters throughout the experiment. Chemical is the environment the particles respond to. Trails record their movement. Clearing the drawing leaves the chemical intact. Clearing the chemical removes its influence while previous marks remain visible.

The coordinated appearance comes from many particles responding independently to the same surroundings. There is no leader, and the particles do not exchange messages.

This is a simplified way to explore chemotaxis: movement influenced by a chemical gradient. The chemical landscape here is prescribed directly. The model does not include chemical secretion, nutrient consumption, or the details of how a particular organism senses its environment.

The connection is to Chapter 11 of J. D. Murray’s Mathematical Biology I: An Introduction, which develops the relationship between random movement, diffusion, and environmental bias. The visualization uses those ideas in a small particle experiment. [Read the chapter reference](https://link.springer.com/chapter/10.1007/978-0-387-22437-4_11).

Paint something simple. Let the trails build. Then reveal the chemical field and compare it with the marks the particles have left.
