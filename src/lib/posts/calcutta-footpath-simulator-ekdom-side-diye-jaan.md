---
title: "Calcutta Footpath Simulator: Ekdom Side Diye Jaan"
description: "A full-screen Calcutta survival game where potholes, drains, cows, motorbikes, hawkers, snacks, and municipal entropy sabotage one ordinary walk."
date: "2026-07-25"
dateModified: "2026-07-25"
category: "Games"
tags: ["Games","Calcutta","Kolkata","Browser Game","Satire","Svelte","Saved Scores","Technical Notes","Browser","Game"]
pinnedTags: ["Games", "Calcutta", "Kolkata", "Browser Game", "Satire", "Svelte"]
published: true
color: "amber"
thumbnail: "/images/games/calcutta-footpath-simulator-cover.png"
thumbnailAlt: "A hand-painted Calcutta pavement crowded by a cow, a motorbike, pedestrians, puddles, a tea stall, and one worried walker"
readingTime: "3–7 min play"
status: "complete"
---

## About the game

Cross one Calcutta neighbourhood. Choose any side you like. It will shortly become the wrong one.

This is a full-screen arcade walk through a continuously changing street. Potholes fill with rain, hawkers find one more foot of pavement, pedestrians stop to answer phones, dogs revise their sleeping arrangements, motorbikes discover supplementary highways, and cows remain legally blameless.

## How to walk

Use WASD or the arrow keys to move. Press Shift or Space for a short urgent squeeze. Press P or Escape to pause, M to mute, and F for browser fullscreen. Touch devices receive a thumb joystick or drag-to-walk mode plus a separate dash button. A gamepad can also be used.

Reach the far end with stamina and morale remaining. Warnings appear visually as well as through optional sound. There is usually a plausible route, but the city is permitted to amend it.

## Food and effects

Fuchka restores stamina. Mishti restores morale but takes a moment to eat. Tea sharpens responses until excess tea makes fine control rather optimistic. Suspicious roadside ghugni chooses its own consequence.

## Accessibility

Menus, settings, instructions, pause controls, and run results are regular accessible HTML rather than canvas-only text. The game includes keyboard and touch input, high-contrast warning options, sound-independent warnings, mute, reduced motion, visible focus states, and automatic pause when the tab loses focus.

## Technical notes

The street is rendered with an original Canvas 2D engine loaded only in the browser on this route. Runs use seeded random streams, bounded agents, fixed-timestep simulation, temporary safe corridors, and a difficulty director that quietly releases procedural deadlocks.

## Privacy and saved scores

Best scores, settings, and optional recent-run statistics stay in local storage in this browser. They are not uploaded. The game has no account, remote leaderboard, advertising, or game-specific tracking.
