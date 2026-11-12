---
title: "Piet Mondrian: A Pioneer of Abstract Art"
seoTitle: "Piet Mondrian: A Pioneer of Abstract Art — Interactive Painting Studio"
description: "Explore how Piet Mondrian shaped geometric abstraction by adjusting proportions, primary color balance, line weight, and oil brushwork in the browser."
date: "2026-11-12"
dateModified: "2026-11-12"
category: "Visualizations"
tags: ["Piet Mondrian","Abstract Art","De Stijl","Geometric Abstraction","Generative Art","Creative Coding","Visual Balance","Composition","Art History","Interactive Art"]
pinnedTags:
  - "Piet Mondrian"
  - "Abstract Art"
  - "De Stijl"
  - "Geometric Abstraction"
  - "Generative Art"
  - "Creative Coding"
  - "Visual Balance"
  - "Composition"
  - "Art History"
  - "Interactive Art"
thumbnail: "/images/visualizations/mondrian-studio/social.png"
thumbnailAlt: "A procedurally painted composition of fourteen warm-white, red, yellow, and blue rectangles separated by near-black horizontal and vertical boundaries with directional oil brushwork."
color: "#245294"
author: "Suvro Ghosh"
readingTime: "7 min read"
inPlainEnglish: "Keep the black lines of a rectangular composition fixed and cut the primary color area in half: the warm-white panels stop acting like leftover background and take over the balance of the picture. This interactive studio and essay explore Piet Mondrian's geometric language and how a seeded subdivision and oil-surface renderer interpret selected formal ideas in code."
keyTerms:
  - "Neo-Plasticism"
  - "De Stijl"
  - "Asymmetrical balance"
  - "Hierarchical subdivision"
  - "Seeded randomness"
faq:
  - question: "Does this generator recreate actual paintings by Piet Mondrian?"
    answer: "No. Every image is a contemporary algorithmic interpretation inspired by formal relationships in Mondrian's interwar rectilinear abstractions—unequal rectangles, horizontal and vertical boundaries, warm white, and selective primary colors—not a historical reconstruction of his studio decisions."
  - question: "Why can the actual Color area percentage differ slightly from the target slider?"
    answer: "The program colors whole rectangles rather than slicing a panel in half just to hit an exact number. Coverage is measured as the share of normalized canvas area before black boundaries are drawn, so changing Line width never shifts the reported percentage."
  - question: "Why does turning up Paint texture keep every rectangle and color in the same place?"
    answer: "Layout, color assignment, paint surface, and brush-pass timing each draw from isolated random streams derived from the same seed. Adjusting surface texture changes weave, pigment body, and shallow brush ridges without touching geometry."
  - question: "Can I save a clean image without buttons or labels?"
    answer: "Yes. Save image renders the finished painting on its own offscreen canvas at 2048 or 4096 pixels on the longer side, without interface controls or watermarks."
published: true
mediaReviewed: true
interactiveFirst: true
---

<script>
	import MondrianArticleLaunch from '$lib/components/visualizations/mondrian-studio/MondrianArticleLaunch.svelte';
</script>

<MondrianArticleLaunch />

<TTS />

What changes when fewer rectangles carry color?

Start with seed `100779` at `14` panels and raise **Color area** to `30%`. Because the program colors whole rectangles rather than slicing a panel in half to chase a decimal, actual primary coverage lands at **30.5%**: a broad blue field on the right (`15.9%`), a vertical yellow column near the lower center (`6.3%`), a red block in the bottom-left corner (`5.5%`), and a small red accent near the lower right (`2.8%`). Four distinct blocks pull your eye around the grid.

Now keep every boundary where it is and lower **Color area** to `15%`. Both red panels and the yellow column return to warm white, leaving only the right-hand blue rectangle at **15.9%** actual coverage. Not a single line moved, yet the picture feels rebuilt. The open upper-left white region (`27.4%` of the canvas) and the white strips beneath it stop reading as neutral background; they become active planes pushing against that lone blue block. Increase **Line width** from `0.70%` to `1.15%`, and the near-black boundaries thicken in place, tightening each frame without shifting the layout.

With straight horizontal and vertical divisions, arrangement, proportion, line weight, and empty space have nowhere to hide.

## From Dutch landscapes to straight lines

People often meet Piet Mondrian (1872–1944) backward, through museum posters and design textbooks, as if he spent his whole life ruling black bars between primary rectangles. He arrived at pure abstraction gradually, well into adulthood. His earlier Dutch paintings and drawings show recognizable windmills, riverbanks, trees, and flowers—works in [MoMA's Piet Mondrian collection](https://www.moma.org/artists/4057-piet-mondrian) that trace how steadily he tested what descriptive detail a picture could drop while keeping its structure alive.

He did not invent abstract art by himself. Years in Paris between 1911 and 1914 brought him face to face with Cubism, where Picasso and Braque broke objects and surrounding space into interlocking planes. Cubism gave Mondrian a way to flatten depth and treat the canvas as a built surface rather than a window, part of the wider movement described in [The Met's essay on geometric abstraction](https://www.metmuseum.org/essays/geometric-abstraction). While the Cubists stopped short of abandoning recognizable subjects, Mondrian kept paring branches, facades, and sea horizons down to horizontal and vertical relationships.

Back in the Netherlands during the First World War, he became a central figure in [De Stijl](https://www.nationalgalleries.org/art-and-artists/glossary-terms/de-stijl-style), the Dutch movement and journal begun in 1917. He called his painting discipline **Neo-Plasticism**: organizing a flat surface through fundamental contrasts of straight horizontal and vertical lines, unequal planes of white, black, and gray, and red, yellow, and blue—chosen not as the sole scientific model of color, but as the basic primaries of this visual language. For Mondrian and his colleagues, stripping away private ornament was an artistic aspiration toward universal harmony, not a laboratory-proven psychological law. You do not need their philosophy to see how clearly those formal tensions register.

His work kept changing afterward, too. After moving to New York in 1940, drawn to Manhattan's grid and the rhythm of boogie-woogie piano music, he dropped continuous black lines altogether in [*Broadway Boogie Woogie* (1942–43)](https://www.moma.org/collection/works/78682), building pulsing bands out of small yellow, red, blue, and gray blocks. Our studio stays within his interwar black-line vocabulary; it does not represent that later New York work, nor does it reconstruct how Mondrian adjusted charcoal lines, paper strips, and paint edges by eye.

## What proportions and white space let you notice

Looking at a rectilinear composition is mostly an exercise in noticing asymmetrical balance. Mirror symmetry settles a picture at once; unequal rectangles keep your gaze traveling.

Here are three actual outputs from this generator on seed `100779` (`960 × 640`), using the **Spare**, **Balanced**, and **Dense** presets:

<Pi
	src="/images/visualizations/mondrian-studio/example-spare.png"
	width={960}
	height={640}
	alt="Spare preset output on seed 100779 showing nine unequal rectangles with thin near-black boundaries, dominated by warm white with one upper-right blue panel and one lower-right red strip."
	caption="Spare preset — seed 100779, 9 panels, 72% uneven spacing, 14% target color area (14.7% actual), 0.50% line width, 36% paint texture."
/>

<Pi
	src="/images/visualizations/mondrian-studio/example-balanced.png"
	width={960}
	height={640}
	alt="Balanced preset output on seed 100779 showing fourteen rectangles with warm-white fields balanced against a bottom-left red corner, a lower-center yellow column, and a broad right-hand blue rectangle."
	caption="Balanced preset — seed 100779, 14 panels, 65% uneven spacing, 28% target color area (27.7% actual), 0.70% line width, 40% paint texture."
/>

<Pi
	src="/images/visualizations/mondrian-studio/example-dense.png"
	width={960}
	height={640}
	alt="Dense preset output on seed 100779 showing twenty-four rectangles retaining the open upper-left white region while subdividing the surrounding network into red, yellow, blue, and warm-white panels."
	caption="Dense preset — seed 100779, 24 panels, 58% uneven spacing, 34% target color area (35.1% actual), 0.60% line width, 42% paint texture."
/>

In **Spare** (`9` panels, `14.7%` actual color), yellow stays absent so a sparse field does not look like a forced color checklist. **Balanced** (`14` panels, `27.7%` actual color) adds five splits, introducing the bottom-left red anchor and the yellow column while leaving the upper-left white expanse open. **Dense** (`24` panels, `35.1%` actual color) weaves ten finer crossbars across the right and bottom, yet the earlier nine-panel scaffold remains visible underneath.

Even the warm-white rectangles participate actively. Thin lines (`0.25%`) let neighboring white panels read almost as one airy sheet; bold lines (`1.50%`) lock each region into a separate cell. None of these settings is the one right answer—the controls exist so you can compare where open poise turns into crowding.

## How this generator works under the hood

Everything here runs deterministically in your browser from pure functions and cached pixel buffers, without calling an image-generation service or serving pre-made pictures.

A **seed** such as `100779` is simply a starting integer that makes a pseudorandom sequence repeatable. I divided that seed into four isolated streams—`layout`, `color`, `material`, and `timeline`—so changing one subsystem never consumes random values needed by another. Turning up **Paint texture** alters only the surface inside the rectangles; it cannot rearrange a single line or recolor a panel.

For **layout**, the program begins with one `[0, 1] × [0, 1]` rectangle and builds an ordered tree of `29` horizontal and vertical splits. For each seed, it evaluates twelve candidate trees once at a fixed reference setting (`14` panels, `65%` uneven spacing, `3:2` ratio), favoring a mix of one generous open field, medium blocks, narrow accents, and varied line lengths, then caches that choice so moving knobs never swaps trees. Selecting `N` **Panels** uses the first `N - 1` splits. Column and row stack bounds (at most `8` deep) linked to **Line width** and the viewport's physical aspect ratio guarantee positive visible interiors across the full **Uneven spacing** (`0%` to `100%`) range without secretly rerolling layouts. Shared collinear edges are merged so every boundary is painted once, keeping T-junctions clean.

For **color placement**, coverage is measured as normalized panel area before black boundaries are drawn, keeping **Color area** stable when **Line width** changes. The algorithm holds the largest white region open until coverage runs high and ranks remaining panels in a stable non-adjacent priority order. Assigning primaries along that fixed order ensures that reducing **Color area** returns later panels to white while panels that stay selected keep their exact color.

For the **oil-paint surface**, I built a stylized six-layer procedural material in stable painting coordinates—not a physical fluid simulation: sized linen weave, subtle pigment-tone variation, overlapping flat-brush ribbons aligned with each panel's span, fine directional bristle grooves across warm-white panels, primaries, and near-black boundaries alike, clipped edge micro-variation, and shallow raking light from the top left. Setting **Paint texture** to `0%` yields a clean flat rendering.

Before playback begins, `prepareMaterial` computes the warm ground, first oil coat, finished second coat, and per-pixel arrival times. `renderPainting` then sweeps two brush coats across the panels and draws coherent horizontal and vertical boundary strokes within the chosen **Painting time** (`3` to `18` seconds). Because the finished buffer is computed up front, **Pause**, **Resume**, **Finish now**, completed playback, and still previews match pixel for pixel. Live slider drags use a lighter intermediate resolution for responsiveness before completing full detail on release, while **Save image** renders a clean standalone PNG at `2048` or `4096` pixels on the longer side.

## A short experiment to try

Keep seed `100779` fixed at `14` panels and compare four steps directly in the studio:

1. [**Start at 30% target color (30.5% actual)**](/tools/mondrian-studio?v=1&s=100779&p=14&u=65&ca=30&lw=0.7&pt=40&t=8&ce=balanced&ar=1.500) — Four primary blocks balance the open white upper-left region.
2. [**Reduce Color area to 15% (15.9% actual)**](/tools/mondrian-studio?v=1&s=100779&p=14&u=65&ca=15&lw=0.7&pt=40&t=8&ce=balanced&ar=1.500) — Every boundary stays fixed, the red and yellow panels turn warm white, and the `15.9%` blue rectangle anchors `84.1%` white space alone.
3. [**Raise Line width to 1.15%**](/tools/mondrian-studio?v=1&s=100779&p=14&u=65&ca=15&lw=1.15&pt=40&t=8&ce=balanced&ar=1.500) — Layout and the `15.9%` color share stay unchanged while bolder black bars tighten the white compartments.
4. [**Raise Paint texture to 75%**](/tools/mondrian-studio?v=1&s=100779&p=14&u=65&ca=15&lw=1.15&pt=75&t=8&ce=balanced&ar=1.500) — Geometry and color stay locked while linen weave, brush ridges, and bristle tracks come forward across both white and blue paint.

Spend a few minutes moving one slider at a time and what stands out is how exposed every decision becomes once ornament is gone. Nudge a single boundary sideways, or let one red corner turn white, and the whole quiet frame has to find its footing all over again.
