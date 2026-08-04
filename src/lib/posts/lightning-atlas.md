---
title: "Lightning Atlas: How the Sky Finds the Ground"
description: "Watch a seeded Kalbaisakhi storm build a broad, branching lightning channel through charge, terrain, attachment, return stroke, and delayed thunder."
date: "2026-08-03"
dateModified: "2026-08-04"
thumbnail: "/images/lightning-atlas.png"
thumbnailAlt: "A broad branching return-stroke channel illuminates a severe pre-monsoon storm over a low Bengal landscape"
category: "Visualizations"
tags: ["Lightning","Thunderstorms","Atmospheric Electricity","Simulation","Three.js","Earth Science","Physics","WebGL","Nine Storm Terrains","Nine Model Questions"]
pinnedTags: ["Lightning", "Thunderstorms", "Atmospheric Electricity", "Simulation", "Three.js", "Earth Science", "Physics", "WebGL"]
published: true
interactiveFirst: true
mediaReviewed: true
color: "#E5C56F"
author: "Suvro Ghosh"
readingTime: "15 min"
inPlainEnglish: "A lightning channel is not a finished bolt dropped from a cloud. This laboratory slows the sequence down: charge separates, a branching leader explores the air, several upward streamers compete, one connection establishes a path, current brightens that path, and thunder arrives later. Its featured Kalbaisakhi mode favours a broad, hierarchical channel that fills more of the storm sky. The geometry and measurements remain a reproducible procedural model, not a literal storm reproduction, forecast, or protection calculator."
keyTerms: ["Charge separation", "Stepped leader", "Upward streamer", "Attachment", "Return stroke", "Negative cloud-to-ground flash", "Positive cloud-to-ground flash", "Intra-cloud flash", "Electric-field proxy", "Thunder delay"]
faq:
  - question: "Does lightning choose the tallest object?"
    answer: "Not invariably. Height can help an object launch an upward streamer, but the developing channel, local electric field, distance, prominence, isolation, shape, conductivity, and chance all matter. The atlas deliberately scores several factors rather than awarding every flash to the tallest object."
  - question: "Does the visible bolt travel down or up?"
    answer: "In a common negative cloud-to-ground sequence, a faint branched leader develops downwards and an upward streamer connects to it. The brilliant return-stroke current then propagates up the established channel. The entire discharge contains processes in both directions."
  - question: "Is this a real lightning forecast or strike-risk calculator?"
    answer: "No. It does not consume weather observations, solve the full electrical and fluid equations, estimate protection zones, or predict a real attachment point. Every terrain, channel, intensity, delay, and frequency shown here is simulated."
  - question: "Why is sound off when the atlas opens?"
    answer: "Browsers require a user gesture before audio, and unexpected thunder would be intrusive. Sound remains off until you activate it. The procedural rumble is then delayed according to the observer's simulated distance from the generated channel."
  - question: "Will the same seed make the same flash?"
    answer: "Yes, when the model version, seed, parameters, terrain, placed features, and strike number are the same. Camera movement, display quality, frame rate, and decorative rain do not alter the generated channel."
  - question: "What changes in flash-safe or reduced-motion mode?"
    answer: "Flash-safe mode restrains brightness and repeated pulses. A reduced-motion preference disables autoplay and automatic camera following, lowers playback speed, and leaves phase stepping, tables, cross-section, and exports available."
---

<script>
	import LightningAtlas from '$lib/components/visualizations/lightning-atlas/LightningAtlas.svelte';
</script>

Before lightning becomes a line, it is a disagreement spread through a volume of air. Ice particles and water move through a turbulent cloud, collisions help separate charge, and the electric field grows while air still behaves mostly as an insulator. The eventual flash is not a bolt selecting a destination from a menu. It is a fast, branching negotiation between changing fields, partially ionised air, the cloud and the surface below. In a severe Bengal pre-monsoon storm, that negotiation can appear to occupy a startling fraction of the evening sky.

This atlas makes that negotiation slow enough to inspect. The featured **Kalbaisakhi / Bengal Nor'wester** scene gives the channel room to spread and makes its branch hierarchy legible. It is still a **physically inspired procedural model**, not a weather feed, lightning detector, safety tool, engineering model, or literal reconstruction of one storm. The terrain is invented, the field is a proxy, the values labelled “relative” have no hidden SI calibration, and a hundred virtual flashes are only a census of this algorithm.

<LightningAtlas />

<TTS />

# A Bengal storm as the featured scale reference

The local name **Kaalbaisakhi**, often written Kalbaisakhi, refers to the nor'westers familiar during Bengal's March–May pre-monsoon season. A [MAUSAM study of Kaalbaisakhi conditions over Gangetic West Bengal](https://mausamjournal.imd.gov.in/index.php/MAUSAM/article/view/1202) and a [severe-event study from the same IMD journal](https://mausamjournal.imd.gov.in/index.php/MAUSAM/article/download/1427/1254/5320) describe the regional storm setting. The atlas borrows that observational reference—low horizon, deep storm belly, rain and haze, and the possibility of a sprawling luminous channel—without claiming to reproduce the meteorology of either study.

Choose **Compact**, **Standard**, **Large**, or **Heroic** to change the model's morphology rather than merely turning up a glow. Larger regimes admit a broader bounded search, longer-lived major branches, and a stronger hierarchy around one coherent route. **Call a hero strike** selects the high-energy end of that same deterministic model for the current seed and strike number. It is curated, not unseeded: replay, URL, JSON, and history can reconstruct what happened.

The camera is part of presentation, not causality. **Hero Sky View** frames the full event against a generous sky; **Wide Storm** keeps the storm shelf in context; **Attachment** studies the final connection; and **Follow Bolt** moves with the developing route when motion is allowed. Changing view does not change the channel hash.

# First, make a storm capable of disagreeing with itself

Inside a thunderstorm, rising liquid water, descending ice and hail, freezing, melting and collisions participate in a complicated electrification process. A useful introductory picture is a broad positive region aloft, a broad negative region lower down, and sometimes a smaller positive pocket near the cloud base. That picture is not a universal wiring diagram. Real storms rearrange, tilt, split and replenish their charge regions.

The atlas therefore uses soft three-dimensional **charge pockets**, not hard coloured plates. Their position and extent establish an analytical potential proxy. Every prospective leader step samples the local direction and strength of that proxy, adds bounded turbulent variation, and asks whether several nearby directions remain viable. Charge separation, storm position, cloud-base height and wind drift change those pockets. “Show charge regions” reveals the model’s causes; it does not claim that glowing ellipsoids inhabit a real cloud.

NOAA’s [plain-language account of thunderstorm electrification](https://www.nesdis.noaa.gov/about/k-12-education/severe-weather/what-causes-lightning-and-thunder) is a good entrance to the physical process. The National Severe Storms Laboratory’s [lightning detection overview](https://www.nssl.noaa.gov/education/svrwx101/lightning/detection/) explains why real instruments observe different parts of a flash: ground networks detect radio signals from fast currents, lightning mapping arrays reconstruct three-dimensional source points, and satellite instruments observe light escaping the cloud. This browser does none of those things.

# A leader is a search with memory

For the common negative cloud-to-ground sequence, the atlas releases a faint leader from the lower negative charge region. It advances in discrete steps. Each active tip proposes several directions; proposals that better follow the local field, continue plausible momentum and avoid implausible turns receive stronger scores. The best proposal extends the active channel. Strong runners-up remain alive as competitive branches until their energy budgets expire.

That last detail matters. Decorative lightning often draws one random polyline and glues twigs onto it afterwards. Here the twigs were alternatives while the route was developing. A branch may approach a ridge, lose the competition and stop. Main channel, primary, secondary, and tertiary segments retain their hierarchy, energy, and birth order. Replay can emphasise only the trunk and primary routes before revealing the full network; it never invents a cleaner bolt after the fact.

Branching is not independent of the storm that supports it. Lightning-mapping research in *Geophysical Research Letters* shows how [channel morphology can reflect charge structure and storm dynamics](https://agupubs.onlinelibrary.wiley.com/doi/full/10.1029/2023GL106024). The atlas does not reproduce that analysis. It takes the narrower lesson that broad branching should arise from a changed morphology regime and charge-guided search, not from painting random forks over a finished line.

The slowed timing is explanatory. The [NSSL description of lightning types](https://www.nssl.noaa.gov/education/svrwx101/lightning/types/) notes that a negative stepped leader develops in a forked pattern too quickly and faintly for ordinary human vision. The atlas stretches milliseconds into readable seconds so that leader, streamers, attachment and return stroke can occupy separate timeline stops. Its clock is a teaching clock, not high-speed-camera footage.

# The ground does not simply nominate its tallest citizen

As a leader nears the surface, several candidate sites can launch upward streamers. The atlas tests terrain peaks, exposed trees, building corners, masts, wind turbines, boats and other scene-specific features. A candidate benefits from proximity to the leader and a strong local field. Prominence, isolation, tip shape, semantic height and a modest conductivity proxy can help. A deterministic chance term prevents the score from becoming a rigid height contest.

This is why moving one radio mast can change a replay while merely orbiting the camera cannot. It is also why water gets no magical bonus. Open water can be part of a lightning attachment scene, but “wet equals automatically selected” would be bad physics and bad pedagogy. Surface wetness changes a bounded conductivity proxy; it never overrides the developing channel geometry.

When the leader enters attachment range, multiple streamer lines become visible. One may connect; the others fade as failed competitors. The [NSSL lightning FAQ](https://www.nssl.noaa.gov/education/svrwx101/lightning/faq/) is careful about the familiar rule of thumb: lightning *usually* strikes the tallest object, not *always*. Height helps explain streamer initiation, but it does not supply a complete attachment solution.

The Study mode repeats the model one hundred times over a deterministic range of strike numbers. Its heat map answers a narrow question: **where did this version of this model attach under these settings?** It cannot estimate the real strike probability of a tree, roof, turbine, person or protection system.

# Connection establishes the route; current makes it conspicuous

Once an upward streamer and descending leader connect, the conductive route from cloud to ground is established. The return-stroke current wave brightens that route upwards. In the atlas, a travelling luminosity front follows the winning main channel from the attachment point towards the cloud, and current rings spread across the model surface. Flash-safe mode suppresses harsh repeated pulses; it does not remove the phase information.

Negative and positive cloud-to-ground flashes are not palette swaps. The less common positive family begins from a different model charge region, uses a longer and less branched leader tendency, and receives a single, more sustained return-stroke profile. NSSL explains that [positive cloud-to-ground flashes typically have fewer return strokes and are more likely to carry sustained current](https://www.nssl.noaa.gov/education/svrwx101/lightning/types/). The atlas represents those qualitative differences without pretending to calculate amperes, coulombs or fire ignition.

Most lightning does not reach the ground. Select **intra-cloud** and the generator searches between oppositely signed charge regions inside the storm. There is no surface attachment, no ground streamer winner and no ground-current ring. This separate path family matters because a horizontal luminous channel inside a cloud is not merely a failed ground strike.

# Thunder is a path-length instrument

Light reaches the observer effectively at once on the scale of this scene; sound does not. Each generated flash measures the shortest distance from the movable observer to its piecewise-linear three-dimensional channel and divides that distance by a simplified speed of sound. The countdown therefore changes if the channel or observer moves. The rumble is synthesised locally from seeded filtered noise with an optional nearby crack, so saved links reproduce its character without downloading an audio file.

This is still an approximation. Wind, temperature profiles, humidity, terrain reflections and atmospheric refraction can alter real propagation. The National Weather Service explains both the delayed arrival and why [different parts of an extended channel produce a crack followed by a longer rumble](https://www.weather.gov/safety/lightning-science-thunder). It also gives the familiar five-seconds-per-mile estimate—and the more important instruction that audible thunder means it is time to be safely indoors, not time to remain outside measuring.

# Nine storm terrains, nine model questions

The terrain selector is an atlas of experiments, not current geography. Kalbaisakhi / Bengal Nor'wester is the featured composition: a low Bengal horizon beneath a deep pre-monsoon storm, with a heroic default morphology and space for a broad sky canopy. The monsoon delta asks how low relief, wet ground, trees and towers compete. The Himalayan ridge concentrates prominence into steep relief. The coastal shelf separates land, cliff and water. The forest basin offers many similar tree candidates. The desert escarpment tests isolated tips; the urban plain offers engineered corners; the open ocean removes most land structure; and the experimental volcanic island introduces an ash-rich plume pocket.

Volcanic lightning is not meteorological lightning with an orange tint. The US Geological Survey describes [charge generation and discharge in different regions of explosive ash plumes](https://volcanoes.usgs.gov/volcanic_ash/lightning.html). The island preset consequently carries an “experimental” label and alters the charge layout. It remains a qualitative procedural scene, not an eruption model.

# What the model preserves—and what it refuses to claim

The generator preserves causality useful for exploration: charge geometry and strike scale influence a bounded field-guided search; live branches compete and retain hierarchy; nearby sites launch streamers; attachment establishes one route; the return stroke retraces it; the observer–channel distance delays thunder. A seed, parameter set, morphology scale, and strike number reproduce the same result. Branch emphasis, display quality, frame rate, and camera movement are excluded from that chain.

The model does **not** solve Maxwell’s equations, a Poisson or Laplace boundary-value problem, streamer plasma chemistry, cloud microphysics, fluid dynamics, electromagnetic radiation, acoustic ray tracing, protection-zone geometry or injury risk. Its Kalbaisakhi mode is a morphology and composition tuning, not a meteorological simulation of Bengal's pre-monsoon convection. Normalised field values cannot be converted into volts per metre. Relative intensity cannot be converted into peak current. Terrain Study percentages cannot leave the model.

Those refusals are part of the instrument. Use the layer toggles to expose its assumptions. Move the storm and observer separately. Place a feature, replay the identical strike, then call a new one. Export the versioned JSON or CSV and inspect what is truly recorded. Share the URL and the atlas will reconstruct the state rather than smuggling a screenshot into the query string.

The sky does not “find” the ground in the human sense. A rapidly evolving discharge makes local extensions, preserves some alternatives, abandons others and eventually forms a conductive connection. The atlas earns its spectacle only when it also lets you stop the clock and see that history.
