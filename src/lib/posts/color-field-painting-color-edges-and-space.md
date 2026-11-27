---
title: "Color Field Painting — Color, Edges, and Space"
seoTitle: "Color Field Painting — Color, Edges, and Space | Interactive Studio"
description: "Keep two color fields fixed, soften their edges, and raise paint transparency to watch opaque blocks dissolve into translucent glazes over woven canvas."
date: "2026-11-27"
dateModified: "2026-11-27"
category: "Visualizations"
tags: ["Color Field Painting","Mark Rothko","Helen Frankenthaler","Abstract Expressionism","Generative Art","Creative Coding","Color Perception","Glaze Layering","Interactive Art","Visualizations"]
pinnedTags:
  - "Color Field Painting"
  - "Mark Rothko"
  - "Helen Frankenthaler"
  - "Abstract Expressionism"
  - "Generative Art"
  - "Creative Coding"
  - "Color Perception"
  - "Glaze Layering"
  - "Interactive Art"
  - "Visualizations"
thumbnail: "/images/visualizations/color-field-studio/social.png"
thumbnailAlt: "A non-figurative Color Field painting on warm unbleached cotton-duck canvas showing softly feathered horizontal areas of charcoal umber, Venetian maroon, and pale gold haze layered with translucent glazes."
color: "#6E2326"
author: "Suvro Ghosh"
readingTime: "8 min"
inPlainEnglish: "Start with two fixed color areas on a woven cotton-duck canvas—first with crisp, near-opaque boundaries, then with feathered edge masks and high paint transparency. As edge softness and translucency rise, sharp blocks open into glowing glazes where neighboring colors and canvas weave interact without changing region anchors or assigning fixed emotions to hues."
keyTerms:
  - "Color Field painting"
  - "Soak-stain"
  - "Edge mask"
  - "Beer–Lambert glaze"
  - "Color adjacency"
faq:
  - question: "Do these procedural paintings recreate actual works by Mark Rothko or Helen Frankenthaler?"
    answer: "No. Every canvas is an original non-figurative procedural study inspired by formal ideas—stacked softly bounded rectangles and fluid soak-stain washes—rather than a historical reconstruction or replica of museum paintings."
  - question: "Why do the two color fields stay in the exact same positions when Edge softness and Paint transparency change?"
    answer: "Region anchors and pigments draw from isolated composition and pigment random streams, while Edge softness and Paint transparency alter only boundary feathering, glaze absorption, and weave visibility without shifting coordinates."
  - question: "Does the studio assign fixed emotional meanings to specific colors?"
    answer: "No. Perceived warmth, weight, and stillness depend on scale, proportion, edge softness, and adjacent colors rather than universal color-emotion rules."
  - question: "Can I inspect the woven canvas up close or save a clean high-resolution image?"
    answer: "Yes. Inspect surface crops into the active painting buffer at 2x to 5x zoom without inventing marks, and Save image exports the complete finished painting alone as a 2048 px or 4096 px PNG."
published: true
mediaReviewed: true
interactiveFirst: true
---

<script>
	import ColorFieldArticleLaunch from '$lib/components/visualizations/color-field-studio/ColorFieldArticleLaunch.svelte';
</script>

<ColorFieldArticleLaunch />

<TTS />

Begin with two fixed color areas on warm, unbleached cotton-duck canvas. On the **Rothko Nocturne** study at seed `482917`—set to `2` **Color areas**, `60%` **Area size**, and `55%` **Canvas texture**—turn **Edge softness** down to `0%` and **Paint transparency** down to `14%`. Two rounded horizontal bands appear, Charcoal Umber above Pale Gold Haze, sitting like solid cut plates on the cloth (`37.70%` painted coverage). The boundary gradient measures `27.01` (`edgeGradientSmoothness = 0.3999`), and underlying weave stays faint (`canvasWeaveVisibility = 0.2719`). Each shape stops cleanly at a crisp perimeter.

<Pi
	src="/images/visualizations/color-field-studio/example-two-areas-sharp.png"
	width={960}
	height={640}
	alt="Two fixed horizontal color areas on warm cream cotton-duck canvas at seed 482917—Charcoal Umber above Pale Gold Haze—rendered with crisp 0% edge softness and dense 14% paint transparency."
	caption="Two fixed color areas — sharp & near-opaque (seed 482917, 2 areas, 60% size, 0% edge softness, 14% transparency, 55% texture): 37.70% coverage, boundary gradient 27.01, weave visibility 0.2719."
/>

Now hold both regions, their proportions, and seed `482917` completely fixed (`2` **Color areas** at `60%` **Area size**). Turn **Edge softness** up to `82%`, raise **Paint transparency** to `68%`, and nudge **Canvas texture** to `60%`. Neither band moves by a pixel, yet the picture changes character completely. The sharp edges dissolve into feathered atmospheric halos—mean boundary gradient drops more than fivefold from `27.01` to `4.75` (`edgeGradientSmoothness` rises to `0.7913`)—while thinner translucent glazes spread painted coverage to `49.33%` and lift canvas weave visibility from `0.2719` to `0.4385`. Instead of two opaque blocks resting *on top* of a background, color and cloth now share the same visual depth.

<Pi
	src="/images/visualizations/color-field-studio/example-two-areas-soft-translucent.png"
	width={960}
	height={640}
	alt="The identical two horizontal color areas on seed 482917—Charcoal Umber above Pale Gold Haze—transformed by 82% edge softness and 68% paint transparency so feathered halos and woven cotton-duck texture show through."
	caption="Two fixed color areas — softened edges & higher transparency (seed 482917, 2 areas, 60% size, 82% edge softness, 68% transparency, 60% texture): 49.33% coverage, boundary gradient 4.75, weave visibility 0.4385."
/>

## Color Field painting: Rothko's glazes and Frankenthaler's soak-stain

In post-war New York abstraction, [The Met's overview of Abstract Expressionism](https://www.metmuseum.org/essays/abstract-expressionism) traces how artists diverged between energetic, wrist-driven gesture and quieter, large-scale **Color Field painting**. Rather than organizing a picture around drawn contours or swirling brushstrokes, Color Field painters treated broad expanses of color, edge transition, and scale as the primary carriers of space.

Two artists illustrate how differently that idea behaves in physical paint. From the late 1940s onward, [Mark Rothko](https://www.moma.org/artists/5047) (`1903–1970`)—documented extensively in the [National Gallery of Art's Rothko collection](https://www.nga.gov/collection/artist-info.1879.html)—generally worked on sized or primed upright canvases, stacking two or three soft-edged horizontal rectangles in thin, successive translucent washes and glazes. Because each coat stayed permeable, lower colors could glow dimly through upper veils, making fuzzy boundaries vibrate rather than lock flat.

By contrast, [Helen Frankenthaler](https://www.moma.org/artists/1992) (`1928–2011`) changed the relationship between pigment and support altogether. In *Mountains and Sea* (1952), she laid raw, unprimed, unsized cotton-duck canvas flat on the floor and poured oil paint heavily thinned with turpentine directly onto the bare cloth. That **soak-stain** method let diluted color sink straight into the fabric fibers instead of sitting as a separate film on top of gesso, uniting figure and ground into one stained sheet and opening a path later explored by Morris Louis and Kenneth Noland.

<Pi
	src="/images/visualizations/color-field-studio/example-frankenthaler-layers.png"
	width={960}
	height={640}
	alt="Frankenthaler Wash study on seed 619304 with five overlapping organic soak-stain regions in deep cobalt, terracotta rose, warm apricot, and raw sienna gold bleeding softly across unbleached cotton-duck canvas."
	caption="Frankenthaler Wash — 5 overlapping soak-stain layers (seed 619304, 5 areas, 68% size, 58% edge softness, 42% transparency, 50% texture, 15 glaze passes): 53.81% coverage, boundary gradient 3.71."
/>

This studio is a contemporary algorithmic study, not a physical paint-chemistry simulator or historical reconstruction of Rothko's or Frankenthaler's studio recipes. Its five studies—**Rothko Nocturne**, **Frankenthaler Wash**, **Ochre Horizon**, **Cobalt Veil**, and **Terra Stillness**—contrast two formal geometries (`stacked-multiform` rectangles versus asymmetric `soak-stain` washes) so you can watch how edges, overlap, and weave clarity alter what a flat screen surface feels like.

## Color regions, edge masks, and transparent layers

Everything renders deterministically in your browser with zero external image textures or server calls. Four architectural pieces connect the engine's math to the studio's four primary controls:

- **Isolated random streams (`prng.ts`):** Every `seed` initializes five separate pseudorandom streams—`composition`, `pigment`, `edges`, `surface`, and `timeline`. Dragging **Edge softness** or **Paint transparency** reads only from the edge and glaze math; it never touches `composition` or `pigment`, which is why the two opening plates keep identical region coordinates and hues.
- **Color regions (`fields.ts`):** For any `(seed, study, artboard)` triple, the engine pre-builds `6` canonical slots in a stable priority order. **Color areas** (`2` to `6`) simply selects how many of those slots are active, while **Area size** (`25%` to `90%`) scales each region's horizontal and vertical half-axes around its fixed center—using rounded superellipses for `stacked-multiform` studies and organic harmonic-lobed ellipses for `soak-stain` studies.
- **Edge masks (`fields.ts`):** For each pixel, an edge mask evaluates normalized signed distance from the region boundary, perturbed by multi-octave quintic noise from the `edges` stream and smoothed through a quintic smootherstep falloff across a transition band controlled by **Edge softness** (`0%` to `100%`). At `0%`, the falloff collapses to a crisp anti-aliased boundary; at `82%`, the mask tapers gradually into an atmospheric halo, and `soak-stain` regions add subtle capillary pooling near the outer rim.
- **Transparent layers & woven canvas (`surface.ts`, `timeline.ts`):** Each active area paints in `3` successive glaze passes (weighted `42%`, `36%`, and `22%` across `64` swept swaths per pass, animated gently over **Painting time**). Rather than stamping flat alpha, each pass blends Beer–Lambert optical absorption with body opacity in linear RGB over a procedural warp-and-weft cotton-duck cloth ground (**Canvas texture**). Raising **Paint transparency** (`10%` to `95%`) lowers per-pass opacity, revealing both the cloth tooth underneath and the darkened or warmed third tones created wherever overlapping regions cross.

## Scale, adjacency, and why colors carry no fixed emotions

Hold **Rothko Nocturne** on seed `482917` with `3` **Color areas**, `58%` **Edge softness**, and `52%` **Paint transparency**, and vary only **Area size**. At `36%` (`example-scale-compact.png`), Charcoal Umber, Venetian Maroon, and Pale Gold Haze occupy just `22.25%` of the canvas (`meanBoundaryGradient = 13.21`). Generous belts of pale warm cloth separate all three shapes, so each band reads as an isolated object framed by open space.

<Pi
	src="/images/visualizations/color-field-studio/example-scale-compact.png"
	width={960}
	height={640}
	alt="Rothko Nocturne on seed 482917 with 3 color areas compressed to 36% area size, leaving wide warm-cream canvas margins and open cloth bands between Charcoal Umber, Venetian Maroon, and Pale Gold Haze."
	caption="Compact scale (seed 482917, 3 areas, 36% size, 58% edge softness, 52% transparency, 55% texture): 22.25% coverage, boundary gradient 13.21, region separation 98.53."
/>

Now raise **Area size** from `36%` to `84%` (`example-scale-expanded.png`) while keeping seed, colors, edge softness, and transparency untouched. Coverage surges to `71.95%` (`meanBoundaryGradient` drops to `5.85`, and `regionSeparation` rises from `98.53` to `127.56`). The canvas margins shrink to narrow strips, and the central Venetian Maroon veil now overlaps both Charcoal Umber above and Pale Gold Haze below.

<Pi
	src="/images/visualizations/color-field-studio/example-scale-expanded.png"
	width={960}
	height={640}
	alt="The same 3 color areas on seed 482917 expanded to 84% area size, pushing Charcoal Umber, Venetian Maroon, and Pale Gold Haze close to the frame edges so their translucent halos overlap across the middle."
	caption="Expanded scale (seed 482917, 3 areas, 84% size, 58% edge softness, 52% transparency, 55% texture): 71.95% coverage, boundary gradient 5.85, region separation 127.56."
/>

Two perceptual shifts happen at once—neither requiring mystical claims about what colors "mean":

1. **Scale changes spatial enclosure:** Small fields sit inside a page; large fields fill your peripheral vision, turning bare ground from background into tight perimeter tension.
2. **Adjacency rewires apparent color:** As Josef Albers demonstrated in *Interaction of Color* (`1963`), we never perceive a hue in isolation. Where Venetian Maroon touches pale cream cotton at `36%` size, it reads muted and dusty; where its upper edge overlaps Charcoal Umber and its lower edge grazes Pale Gold Haze at `84%` size, simultaneous contrast makes the upper seam look denser and the lower edge look warmer and more luminous.

Critically, this studio does **not** assign universal emotional meanings to particular colors. Red is not universally "anger" or "warmth," blue is not universally "melancholy" or "calm," and dark umber is not universally "grief." What feels quiet, heavy, buoyant, or tense in a Color Field painting emerges from proportion, edge softness, light, adjacency, and the viewer's own context—not from a fixed emotional dictionary lookup table.

## A guided sequence in the live studio

Click any step below (or open the full studio) to load that exact deterministic state directly onto the live canvas:

1. [**Two fixed areas — sharp & near-opaque**](/tools/color-field-studio?v=1&areas=2&size=60&edge=0&trans=14&texture=55&time=10&study=rothko-nocturne&seed=482917&artboard=landscape) — Crisp `0%` edges and dense `14%` transparency (`37.70%` coverage) show two isolated blocks resting on cloth.
2. [**Two fixed areas — softened edges & higher transparency**](/tools/color-field-studio?v=1&areas=2&size=60&edge=82&trans=68&texture=60&time=10&study=rothko-nocturne&seed=482917&artboard=landscape) — Identical anchors opened to `82%` edge softness and `68%` transparency so the weave breathes through.
3. [**Default three-area Rothko Nocturne**](/tools/color-field-studio?v=1&areas=3&size=62&edge=58&trans=52&texture=55&time=10&study=rothko-nocturne&seed=482917&artboard=landscape) — Adds Venetian Maroon between Charcoal Umber and Pale Gold Haze at balanced `58%` edge softness and `52%` transparency.
4. [**Compact 36% area size**](/tools/color-field-studio?v=1&areas=3&size=36&edge=58&trans=52&texture=55&time=10&study=rothko-nocturne&seed=482917&artboard=landscape) — Pulls all three areas inward (`22.25%` coverage) so open ground separates every band.
5. [**Expanded 84% area size**](/tools/color-field-studio?v=1&areas=3&size=84&edge=58&trans=52&texture=55&time=10&study=rothko-nocturne&seed=482917&artboard=landscape) — Pushes the same three hues to `71.95%` coverage, creating overlapped translucent seams across the center.
6. [**Frankenthaler Wash — 5 overlapping soak-stain layers**](/tools/color-field-studio?v=1&areas=5&size=68&edge=58&trans=42&texture=50&time=10&study=frankenthaler-wash&seed=619304&artboard=landscape) — Switches to seed `619304` and `15` organic soak-stain glaze passes bleeding into unprimed cotton duck.
7. [**Inspect surface at 3.50× over the soak-stain overlap**](/tools/color-field-studio?v=1&areas=5&size=68&edge=58&trans=42&texture=50&time=10&study=frankenthaler-wash&seed=619304&artboard=landscape&vm=inspect&iz=3.50&ix=0.507&iy=0.489) — Zooms into the existing `1200 × 800` buffer without inventing extra marks to examine how layered glazes modulate the woven warp and weft.
