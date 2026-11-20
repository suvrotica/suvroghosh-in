---
title: "Abstract Expressionist Drip Painting: Corruption in India — Gesture, Chance, and Control"
seoTitle: "Abstract Expressionist Drip Painting: Corruption in India — Interactive Studio"
description: "Keep the seeded paths fixed, turn Paint flow from Thin to Heavy, and watch single drips tangle under opaque coats in an Abstract Expressionist studio."
date: "2026-11-20"
dateModified: "2026-11-20"
category: "Visualizations"
tags: ["Abstract Expressionism","Jackson Pollock","Generative Art","Creative Coding","Drip Painting","Procedural Surface","Corruption in India","Civic Accountability","Interactive Art","Visualizations"]
pinnedTags:
  - "Abstract Expressionism"
  - "Jackson Pollock"
  - "Generative Art"
  - "Creative Coding"
  - "Drip Painting"
  - "Procedural Surface"
  - "Corruption in India"
  - "Civic Accountability"
  - "Interactive Art"
  - "Visualizations"
thumbnail: "/images/visualizations/drip-painting-studio/social.png"
thumbnailAlt: "Procedural non-figurative drip painting on unbleached woven cotton-duck cloth showing carbon-black, file-tape red, ledger ochre, and chalky lime-whitewash ribbons pooling and crossing over seed 729104."
color: "#A8342A"
author: "Suvro Ghosh"
readingTime: "8 min"
inPlainEnglish: "Hold every movement path on a woven canvas fixed and raise Paint flow from 20% to 80%: thin necked filaments widen into heavy ribbons, slow bends swell into pools, and flicked droplets scatter across the cloth. Add more passes and upper layers, and broad lime-whitewash coats bury earlier dark trails while leaving raised ridges underneath."
keyTerms:
  - "Action painting"
  - "Color Field painting"
  - "Seeded PRNG stream"
  - "Path-flow invariance"
  - "Conformal height field"
faq:
  - question: "Do these drip paintings measure corruption statistics or represent real people?"
    answer: "No. Every canvas is strictly non-figurative procedural art exploring gesture, accumulation, and concealment. It does not encode empirical scores, official datasets, or identifiable individuals or companies."
  - question: "Why do the ribbons stay on the exact same tracks when Paint flow changes from 20% to 80%?"
    answer: "Movement paths and layer order draw from isolated random streams (paths and layers), while Paint flow reads only from the separate flow stream. Changing pigment volume alters ribbon width, pooling thresholds, and droplet detachment without shifting a single curve coordinate."
  - question: "Does Inspect surface invent extra marks or smooth out dried paint?"
    answer: "No. Inspect surface zooms into a crop of the existing logical painting buffer without rerunning path generation, adding droplets, or changing thickness relief."
  - question: "Why can raised ridges remain visible even after lime-whitewash coats cover dark lines?"
    answer: "The engine tracks pigment color and physical paint thickness separately in a conformal height field. Upper coats replace visible color where they land, while a fixed fraction of underlying paint height remains in the relief shaded by oblique top-left studio lighting."
published: true
mediaReviewed: true
interactiveFirst: true
---

<script>
	import DripPaintingArticleLaunch from '$lib/components/visualizations/drip-painting-studio/DripPaintingArticleLaunch.svelte';
</script>

<DripPaintingArticleLaunch />

<TTS />

Start with twelve thin threads on raw, unbleached cotton-duck cloth. On the **Pending File** study at seed `729104`—set to `16` passes (`12` active across `4` layers), `68%` sweep, and **Paint flow** turned down to `20%` (`Thin`)—almost nine-tenths of the cloth stays bare. Carbon black, ledger ochre, file-tape red, a little carbon indigo, and one smudge of lime-whitewash pinch into beaded filaments, hesitate briefly at `4` small bends, and drop only `3` stray beads of pigment (`13.66%` coverage). You can trace every entry and exit with a finger.

<Pi
	src="/images/visualizations/drip-painting-studio/example-pending-thin.png"
	width={960}
	height={640}
	alt="Pending File drip study on seed 729104 at 20% Thin paint flow, showing narrow beaded carbon-black, ochre, red, and indigo threads across open unbleached cotton-duck cloth with 4 small pools and 3 droplets."
	caption="Pending File — Thin flow (seed 729104, 16 passes, 20% Paint flow, 68% Sweep width, 4 layers): 13.66% coverage, 4 pools, 3 droplets."
/>

Now hold the paths completely still. Keep **Passes** at `16`, **Sweep width** at `68%`, and **Paint layers** at `4`, and turn only **Paint flow** up to `80%` (`Heavy`). The identical gestures flood their bends: coverage jumps to `41.29%`, matte pools multiply to `27`, droplets scatter to `299`, and average dried paint height climbs from `0.0441` to `0.5801`. Only the pigment volume changed.

<Pi
	src="/images/visualizations/drip-painting-studio/example-pending-heavy.png"
	width={960}
	height={640}
	alt="Pending File drip study on seed 729104 with Paint flow raised to 80% Heavy on the identical paths, widening ribbons into thick bands, 27 dark and ochre pools, and 299 spatter droplets."
	caption="Pending File — Heavy flow (seed 729104, 16 passes, 80% Paint flow, 68% Sweep width, 4 layers): identical tracks, 41.29% coverage, 27 pools, 299 droplets."
/>

Push the same seed to `36` passes and `6` layers at `80%` flow, and the surface closes in. Coverage hits `67.05%` (`67` pools, `895` droplets), with lime-whitewash supplying `35.08%` of paint mass. Broad pale ribbons drape over earlier black and red knots, hiding the dark ink while leaving raised bumps underneath.

<Pi
	src="/images/visualizations/drip-painting-studio/example-pending-buried.png"
	width={960}
	height={640}
	alt="Pending File drip study expanded to 36 passes and 6 layers at 80% flow on seed 729104, where broad chalky lime-whitewash ribbons veil earlier carbon-black, ochre, and red knots while raised bumps persist underneath."
	caption="Pending File — Buried upper coats (seed 729104, 36 passes, 80% Paint flow, 68% Sweep width, 6 layers): 67.05% coverage, 67 pools, 895 droplets, 35.08% lime-whitewash mass share."
/>

Zoom into the center knot with **Inspect surface** (`3.5×` at `(0.520, 0.501)`) and zero extra marks appear. This plate renders the `3.5×` focal crop via `renderPaintingStill` from the same painting model and height-field math (while the live studio crops its cached `1200 × 800` backing buffer directly), showing stacked dried-enamel shelves (`mean height 2.4844`, `max height 4.8298` inside the crop) catching oblique studio light.

<Pi
	src="/images/visualizations/drip-painting-studio/example-inspect-surface.png"
	width={960}
	height={640}
	alt="3.5x Inspect surface close-up over the center knot of seed 729104 showing layered black, ochre, file-tape red, and lime-whitewash ridges in dried matte relief without extra marks."
	caption="Inspect surface (3.5× crop over focal knot at 0.520, 0.501 of the 36-pass buried painting): identical painting model, crop mean height 2.4844, max height 4.8298."
/>

## Retail friction, stalled files, and wholesale coats

Living in Calcutta, you learn quickly that civic friction rarely arrives as a lone villain under a spotlight. More often it feels like thickening paint on an ordinary counter: a small delay here, an unexplained extra sheet there, a road surface patched thinly before monsoon and repainted on paper afterward. None of these canvases depict real people, firms, or empirical datasets—every mark is strictly non-figurative art, never a statistical score. The four studies contrast distinct tempos of accumulation and cover.

**Counter & Middleman** runs fast and restless. Sharp directional whips throw off tangential spatter halos—`865` droplets in `26` passes at `60%` flow (`52.61%` coverage, `38` pools)—building an unavoidable crust of carbon black (`30.66%`), file-tape red (`29.29%`), and carbon-copy indigo (`12.26%`) out of tiny rapid motions rather than grand sweeps.

<Pi
	src="/images/visualizations/drip-painting-studio/example-counter-middleman.png"
	width={960}
	height={640}
	alt="Counter and Middleman drip study on seed 642913 showing brisk, sharp-angled black, red, indigo, and ochre whips with dense spatter halos across unbleached cloth."
	caption="Counter & Middleman (seed 642913, 26 passes, 60% Paint flow, 68% Sweep width, 6 layers): 52.61% coverage, 38 pools, 865 droplets."
/>

**Public Works & Tenders** opens the arm wide. Long full-canvas arcs of road-tar umber (`15.69%`), ledger ochre (`32.13%`), and carbon black (`6.00%`) cross the cloth before broad late passes of lime-whitewash (`46.18%` of paint mass) sweep across `50` pools and `489` droplets (`46.79%` coverage), hiding deep clots without flattening the bumps beneath.

<Pi
	src="/images/visualizations/drip-painting-studio/example-public-works-tenders.png"
	width={960}
	height={640}
	alt="Public Works and Tenders drip study on seed 528419 showing sweeping arcs of tar umber and ledger ochre overlaid by wide chalky lime-whitewash coats."
	caption="Public Works & Tenders (seed 528419, 26 passes, 60% Paint flow, 68% Sweep width, 6 layers): 46.79% coverage, 50 pools, 489 droplets, 46.18% lime-whitewash."
/>

**Whitewash & Record** sharpens the contrast between archive and cover. Dense early threads of carbon indigo (`15.00%`), file-tape red (`13.03%`), and black (`27.60%`) knot underneath broad pale coats (`32.21%` lime-whitewash, `49.97%` total coverage), leaving older dark loops visible only through narrow breaks.

<Pi
	src="/images/visualizations/drip-painting-studio/example-whitewash-record.png"
	width={960}
	height={640}
	alt="Whitewash and Record drip study on seed 781305 showing dense lower loops of carbon indigo, red oxide, and black veiled behind broad lime-whitewash ribbons with dark arcs peeking through gaps."
	caption="Whitewash & Record (seed 781305, 26 passes, 60% Paint flow, 68% Sweep width, 6 layers): 49.97% coverage, 44 pools, 542 droplets, 32.21% lime-whitewash."
/>

India's own anti-corruption architecture reflects that same tension between visible surface and underlying paper trail. Following the 1962–1964 Santhanam Committee review, the [Central Vigilance Commission](https://cvc.gov.in/) was set up in February 1964 as an apex oversight body (and later given statutory footing in 2003). Parliament's [Prevention of Corruption (Amendment) Act, 2018](https://prsindia.org/billtrack/the-prevention-of-corruption-amendment-bill-2013), summarized in the [PRS passed-bill text](https://prsindia.org/files/bills_acts/bills_parliament/2013/Prevention%20of%20corruption%20as%20passed%20by%20both%20Houses.pdf) that came into force on July 26, 2018, reshaped the 1988 statute by criminalizing bribe-giving directly (with a seven-day reporting safeguard when coerced) alongside prior-approval rules for investigating officials. Earlier, the [Right to Information Act, 2005](https://rti.dopt.gov.in/rtiact.html) opened administrative files to ordinary citizens' requests, letting people ask who signed a ledger before a fresh coat went over it. Even cross-country snapshots remain indirect: on [Transparency International's 2025 Corruption Perceptions Index](https://www.transparency.org/en/cpi/2025) ([India country summary](https://www.transparency.org/en/countries/india)), India scores `39` out of `100` and ranks `91` among `182` countries—a composite of *perceived* public-sector corruption gathered from expert and business surveys, not a count of bribes or cases.

## Jackson Pollock, unprimed cloth, and the arena on the floor

When [Jackson Pollock](https://www.moma.org/artists/4675-jackson-pollock) (`1912–1956`) laid unprimed, unstretched canvas flat on the floor of his Long Island barn and poured commercial household and industrial enamels alongside oil paint from cans, sticks, and stiffened brushes, he changed what a viewer looks for in a painting. Walking around all four sides instead of facing an upright easel, he could work into the surface from every direction. In monumental works such as MoMA's [*One: Number 31, 1950*](https://www.moma.org/collection/works/78386) (`8' 10" × 17' 5 5/8"`, oil and enamel on canvas) and The Met's [*Autumn Rhythm (Number 30), 1950*](https://www.metmuseum.org/art/collection/search/488978) (`8 ft. 10 1/4 in. × 17 ft. 4 in.`, enamel on unprimed canvas), the frame stops behaving like a window onto a staged room. Every square inch holds equal weight across an all-over web where raw cloth still peers through the gaps. Black threads whip across tan aluminum and pale off-white over bare woven fabric, soaking in where paint runs thin, pooling where motion lingers, and breaking into beads where velocity spikes.

Critics split post-war American abstraction roughly into two camps, described clearly in [The Met's essay on Abstract Expressionism](https://www.metmuseum.org/essays/abstract-expressionism) and [MoMA's Abstract Expressionism theme](https://www.moma.org/learn/moma_learning/themes/abstract-expressionism/). **Color Field painting** spread wide, quiet, luminous expanses of soaked or hovering color across the canvas, minimizing overt brushwork in favor of scale and saturation. **Action painting**—a phrase popularized by critic Harold Rosenberg in his December 1952 *ARTnews* essay—treated the canvas not as a picture to copy from life, but as *"an arena in which to act,"* where the finished surface is the physical aftermath of an event rather than a pre-sketched design.

Nothing in this digital studio claims to reconstruct Pollock's body biomechanics, studio gravity, or historical enamel chemistry. His paintings belonged to their own postwar moment and craft. What the poured technique offers here is a clean structural metaphor: simple local rules—how fast a pour travels, where it stalls, how thick the pigment runs, and which layer lands last—can turn legible individual gestures into an impenetrable surface.

## Gesture, chance, and plausible deniability

Look closely at any single pass on seed `729104` and nothing looks mysterious. One ribbon enters from the left, loops around an interior hub, slows at a tight corner, leaves a matte puddle, and exits. Anyone watching pass one or pass four knows exactly where the hand went.

Wait until pass thirty-six, however, and an odd alibi appears. A dense tangle of crossings, stray droplets, and chalky topcoats looks accidental at a glance—as though paint merely splashed where gravity took it. That ambiguity is the heart of plausible deniability. If a bad patch or an unrecorded detour sits under enough overlapping coats, the person holding the can can point to chance, haste, or noise and dare an outsider to prove which bend was deliberate. Only the physical thickness profile remembers that every heavy knot was earned at a slow turn.

## How the studio builds each coat without moving the tracks

Everything runs deterministically in your browser with zero external textures or server calls. Five plain ideas explain the engine:

- **Five card decks (`prng.ts`):** A `seed` like `729104` is a starting lock number. From it, the engine hashes five isolated pseudorandom streams—separate numbered decks called `paths`, `layers`, `flow`, `surface`, and `timeline`—using Mulberry32 and FNV-1a mixing so changing **Paint flow** never steals a card meant for geometry.
- **Locked paths and immutable strata (`studies.ts`, `paths.ts`):** Each `(seed, study, artboard)` caches a `40`-pass table around interior hubs using centripetal `Catmull-Rom` splines—smooth curves threaded through anchor pins without wild spikes. Passes `0..3` sit in layers `1..2`, passes `4..9` shuffle layers `1..6`, passes `10..17` fill a balanced pool, and passes `18..39` favor upper coats. **Passes** slices a strict prefix; **Paint layers** hides higher strata without altering lower ones; **Sweep width** scales around fixed pass anchors with zero random draws.
- **Volume without drift (`deposition.ts`):** Only the `flow` stream shapes pigment volume—pinching ribbons into capillary necks below `56.8%` **Paint flow** (`0.52` on the normalized flow scale), swelling slow bends into 2–3-lobed pools, and flinging curvature-weighted droplets—leaving `(x, y)` coordinates, velocities, and layers byte-identical.
- **Color separate from relief (`surface.ts`):** The rasterizer weaves unbleached cotton-duck cloth (`#E4DBCA`) mathematically, holding RGB pigment separate from a `height field`—a pixel-for-pixel thickness map. Upper coats build `conformal` relief (`72%` of prior height stays underneath) under one fixed top-left light.
- **One shared schedule (`timeline.ts`, `state.ts`, `export.ts`):** Pass cadences are computed upfront so playback, **Pause**, **Finish now**, `Inspect surface` crops, and `2048`/`4096 px` PNG exports draw identical pixels.

## Five deliberate moves on seed 729104

Keep **Pending File** fixed on seed `729104` (`1200 × 800` artboard) and click these five links in order to watch the surface change in place:

1. [**Start at 20% Thin flow on 16 passes**](/tools/drip-painting-studio?v=1&st=pending-file&s=729104&p=16&pf=20&sw=68&pl=4&pt=50&t=10&aw=1200&ah=800) — Twelve active trails across four layers cover only `13.66%` of the raw cloth (`4` pools, `3` droplets), leaving every turn easy to trace.
2. [**Raise Paint flow to 80% on identical tracks**](/tools/drip-painting-studio?v=1&st=pending-file&s=729104&p=16&pf=80&sw=68&pl=4&pt=50&t=10&aw=1200&ah=800) — Not a single coordinate moves, yet coverage jumps to `41.29%` (`27` pools, `299` droplets) as thin threads swell into heavy ribbons.
3. [**Pull Sweep width tight to 38%**](/tools/drip-painting-studio?v=1&st=pending-file&s=729104&p=16&pf=80&sw=38&pl=4&pt=50&t=10&aw=1200&ah=800) — Passes contract inward around their fixed anchors without changing seed or layer order, crowding dark clots toward the center.
4. [**Restore 68% sweep and expand to 36 passes and 6 layers**](/tools/drip-painting-studio?v=1&st=pending-file&s=729104&p=36&pf=80&sw=68&pl=6&pt=50&t=10&aw=1200&ah=800) — Coverage reaches `67.05%` (`67` pools, `895` droplets) as `35.08%` lime-whitewash buries early carbon and red trails.
5. [**Inspect surface at 3.50× over the buried knot**](/tools/drip-painting-studio?v=1&st=pending-file&s=729104&p=36&pf=80&sw=68&pl=6&pt=50&t=10&aw=1200&ah=800&vm=inspect&iz=3.50&ix=0.520&iy=0.501) — Zoom into the existing buffer without adding a mark; only the dried ridge shadows betray what was laid down first.

Even at full magnification, scraping with your eyes does not lift the whitewash off the dark ink underneath—it only leaves you measuring the bump in the light.
