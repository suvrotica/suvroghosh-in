---
title: "Calcutta Footpath Simulator: Ekdom Side Diye Jaan"
description: "A three-dimensional North Calcutta walking game of branching lanes, spatial traffic, tea stops, rain, and the art of taking another route."
date: "2026-07-25"
dateModified: "2026-08-09"
category: "Games"
tags: ["Games","Calcutta","Kolkata","Browser Game","Satire","Svelte","Saved Scores","Technical Notes","Route","Game"]
pinnedTags: ["Games", "Calcutta", "Kolkata", "Browser Game", "Satire", "Svelte"]
published: true
color: "amber"
thumbnail: "/images/games/calcutta-footpath-simulator-cover.png"
thumbnailAlt: "A hand-painted Calcutta pavement crowded by a cow, a motorbike, pedestrians, puddles, a tea stall, and one worried walker"
readingTime: "3–7 min play"
status: "complete"
---

## About the game

Cross one North Calcutta neighbourhood. Choose any side you like. Circumstances will shortly amend it.

This is a third-person walk through a small, dense three-dimensional street network. The old houses rise on both sides, roads bend into bylanes, traffic approaches through real depth, potholes fill with rain, pedestrians negotiate personal space, dogs revise their sleeping arrangements, and cows remain legally blameless.

## How to walk

Click or tap a clear place on the visible road to walk there. Click into a side lane to turn. Arrow Up walks forward, Left and Right turn, Down steps back, Space hurries briefly, and Escape pauses. Labelled buttons stop the walk, turn around, open the map and handle nearby food without video-game shorthand. Optional experienced controls add WASD, mouse-look and gamepad.

Reach the destination by any plausible route. Warnings appear visually as well as through spatial sound. Temporary blockages always resolve or leave another path; sometimes standing still for four seconds is the sensible move.

## Food and effects

Fuchka restores stamina. Mishti restores morale but takes a moment to eat. Tea sharpens responses until excess tea makes fine control rather optimistic. Suspicious roadside ghugni chooses its own consequence.

## Accessibility

Menus, settings, instructions, map, prompts and route results are regular accessible HTML rather than WebGL-only text. The game includes simple keyboard and tap input, high-contrast visual warnings, explicit mute, gentle camera movement, reduced motion, visible focus states and automatic pause when the tab loses focus.

## Technical notes

The street is rendered with a lightweight Three.js engine loaded only after Play on this route. The world uses metres, an authored irregular navigation graph, procedural original materials, bounded agents and fixed-timestep simulation. Web Audio uses world-positioned sources, distance filtering, modest building occlusion, acoustic zones and a subtle clamped Doppler approximation for moving traffic.

## Privacy and saved scores

Best scores, settings, recent-run statistics and the latest route stay in local storage in this browser. They are not uploaded. The game has no account, remote leaderboard, advertising or game-specific tracking.
