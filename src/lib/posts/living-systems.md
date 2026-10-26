---
title: "Living Systems: Small Rules, Unexpected Worlds"
seoTitle: "Living Systems — Four Interactive Simulation Experiments"
description: "Paint Conway's Game of Life, follow Langton's ant, watch dye diffuse and explore random walks in a responsive simulation playground with live measurements."
date: "2026-10-26"
dateModified: "2026-10-26"
thumbnail: "/images/visualizations/living-systems/social.png"
thumbnailAlt: "A scientific instrument showing a cellular simulation beside transport controls and measured population statistics"
category: "Visualizations"
tags: ["Cellular Automata", "Game of Life", "Langton's Ant", "Diffusion", "Random Walks", "Emergence", "Probability", "Scientific Computing", "Discrete Mathematics", "Mathematical Modelling"]
pinnedTags: ["Cellular Automata", "Game of Life", "Langton's Ant", "Diffusion", "Random Walks", "Emergence", "Probability", "Scientific Computing", "Discrete Mathematics", "Mathematical Modelling"]
published: true
interactiveFirst: true
immersiveLead: true
color: "#187e7a"
author: "Suvro Ghosh"
readingTime: "5 min"
inPlainEnglish: "Choose one of four small mathematical worlds and change its starting conditions. Cells follow neighbour counts, an ant follows two turns, dye spreads to nearby cells and walkers take independent random steps. The patterns and measurements come from the running models."
keyTerms: ["Emergence", "Cellular automaton", "Simultaneous update", "Diffusion", "Random walk", "Mean squared displacement", "Seed"]
faq:
  - question: "Are these animations or working simulations?"
    answer: "They are working browser simulations. Each model advances in discrete steps, and its visible cells, paths, concentration field and numerical readouts come from that state. Playback speed changes how quickly steps are requested."
  - question: "What rules does Conway's Game of Life use?"
    answer: "A dead cell becomes alive with exactly three live neighbours. A live cell survives with two or three. All cells update simultaneously. The selected finite or wrapping boundary changes which neighbours exist at the edge."
  - question: "Which ant model is included?"
    answer: "Langton's ant turns right on a white cell and left on a black cell, flips the cell, then moves forward. Its logical grid expands as needed. The highway preset starts after an explicitly counted pre-roll."
  - question: "Does diffusion create or destroy dye?"
    answer: "The diffusion update conserves total concentration within numerical precision when there are no active sources or manual edits. The outer boundary and painted obstacles are impermeable. A continuous source deliberately adds dye."
  - question: "Why does a random walk have a predictable reference line?"
    answer: "Individual walkers remain unpredictable, but for independent unit-length steps on the square lattice the expected mean squared displacement grows by one per step. The measured finite ensemble can fluctuate around that expectation."
  - question: "Does the simulation send my experiments to a server?"
    answer: "No. The models run locally in your browser. A seed reproduces the random initialisation or random steps when the settings and interactions are also the same."
---

<script>
	import LivingSystems from '$lib/components/visualizations/living-systems/LivingSystems.svelte';
</script>

<LivingSystems />

<p><small>Published <time datetime="2026-10-26">26 October 2026</time> · Updated <time datetime="2026-10-26">26 October 2026</time></small></p>

<TTS />

## A world small enough to hold in your hand

A few squares light up. Most disappear. A small arrangement survives, repeats and begins to travel. There is no instruction telling the pattern to become a traveller. Each square knows only the squares beside it.

Living Systems puts four mathematical worlds on the same workbench. Their rules are short enough to explain in a paragraph. Their consequences take longer to see. Start a preset, pause it, advance one step and look for the exact change that produced the next picture.

The transport controls provide a common rhythm. **Single Step** exposes one update. **Reset** returns to the same starting conditions. A new seed asks a different random question. Switching modes keeps the experiment you left behind, so you can return to its particular moment.

## Neighbours make a city

Conway's Game of Life begins with a grid of living and empty cells. A living cell survives when it has two or three living neighbours. An empty cell is born when it has exactly three. Every decision reads the same old grid; the new generation appears together.

Try the blinker. Three cells become three cells in the other direction, then return. Try a glider and follow the same shape as it reappears a little farther away. The glider gun makes the distinction between a repeating machine and the travellers it sends into the rest of the field especially clear.

Paint a few cells while paused, then advance a single generation. Your mark becomes an initial condition. The rules decide what it becomes next. Change the boundary deliberately: a wrapping grid joins opposite edges, while a finite grid ends there. An edge is part of a model's behaviour, even when it sits quietly at the edge of the screen.

## Two turns, a long journey

Langton's ant has a position, a direction and two instructions. On white, turn right. On black, turn left. Flip the colour of the square, then move forward.

Follow its first few steps slowly. The ant writes the surface it will later read. Its surroundings remember its previous decisions, so a tiny rule and a changing environment become a much longer story.

Fast-forward the classic starting condition or select **Reveal the highway**. The latter begins after a counted pre-roll, rather than pretending that its accumulated path appeared at step zero. The logical grid expands as the ant travels; the viewing window can move without changing its rules.

## A drop learns the shape of a room

Diffusion begins with an uneven concentration. At each update, neighbouring cells exchange small amounts. A high concentration spreads towards a lower one. The hard boundary holds the dye inside the field, and obstacles prevent exchange across their surfaces.

Deposit one drop and watch the sharp centre soften. Place two drops and follow the space between them. Change diffusivity to alter how much exchange takes place in each model step. Playback speed controls how quickly you watch those steps happen.

The total concentration is an accounting check. With no source or manual edit, spreading should rearrange the dye while preserving its total. A continuous source is a different experiment: it keeps adding material. Compare the changing picture with the readouts before deciding that a brighter field means faster diffusion.

## A crowd can reveal what one walker cannot

Each random walker chooses independently between four equally likely directions. A single path wanders, folds back and occasionally travels farther than you expected. Its history can look purposeful without having a destination.

Switch to an ensemble. The individual paths remain irregular, but their measurements begin to tell a steadier story. Mean squared displacement averages the squared distance of every walker from its starting point. For the unit-step square-lattice walk here, its theoretical expectation equals the number of steps.

The reference line is an expectation, rather than a promise that a finite crowd will sit exactly on it. A small ensemble can wander above or below it. Increase the number of walkers, reset with the same seed and compare what changes. Distances use the walkers' unwrapped positions, even when the display brings a path back through the opposite edge.

## Watch the rule and the evidence together

A beautiful pattern invites a story. The controls let you test that story. Pause before an apparent collision. Change one setting. Keep the seed. Read the population, concentration or displacement beside the picture.

These are deliberately small models. They do not reproduce all of life, animal behaviour, fluid motion or human decisions. They make a narrower promise: the displayed consequences follow explicit rules that you can interrupt, inspect and try again.
