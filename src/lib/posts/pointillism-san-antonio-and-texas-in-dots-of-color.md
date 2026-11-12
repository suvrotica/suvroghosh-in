---
title: "Pointillism: San Antonio and Texas in Dots of Color"
seoTitle: "Pointillism: San Antonio and Texas in Dots of Color — Interactive Studio"
description: "Explore how separate oil-paint dabs form ordinary San Antonio and Texas Hill Country scenes by adjusting dot size, spacing, contrast, and hue variation."
date: "2026-11-12"
dateModified: "2026-11-12"
category: "Visualizations"
tags: ["Pointillism","Neo-Impressionism","Georges Seurat","San Antonio","Texas Hill Country","Generative Art","Creative Coding","Color Perception","Interactive Art","Visualizations"]
pinnedTags:
  - "Pointillism"
  - "Neo-Impressionism"
  - "Georges Seurat"
  - "San Antonio"
  - "Texas Hill Country"
  - "Generative Art"
  - "Creative Coding"
  - "Color Perception"
  - "Interactive Art"
  - "Visualizations"
thumbnail: "/images/visualizations/pointillism-studio/social.png"
thumbnailAlt: "An interpreted San Antonio river path scene with walkers passing a seated person, a limestone footbridge, water reflections, and bald cypress, live oak, and pecan trees rendered in 11,333 small colored paint marks."
color: "#2F6652"
author: "Suvro Ghosh"
readingTime: "8 min read"
inPlainEnglish: "Zoom into a dotted riverside painting and a walker dissolves into separate irregular dabs of slate blue, ochre, cream, and olive over woven canvas ground; step back to the whole frame and those exact same marks become a shaded path, reflected water, and passing pedestrians again. This fullscreen studio and companion essay examine how pointillist mark size, progressive spacing, contrast, and neighboring hues construct everyday San Antonio and Texas Hill Country scenes."
keyTerms:
  - "Pointillism"
  - "Divisionism"
  - "Neo-Impressionism"
  - "Progressive candidate sampling"
  - "Perceptual color variation"
faq:
  - question: "Does zooming in with Inspect dots generate smaller marks or extra detail?"
    answer: "No. Inspect dots changes only the camera crop over the existing painting model. The mark count, centers, footprints, colors, and linen weave remain identical to the whole-painting view."
  - question: "Are these generated paintings photographs or reconstructions of exact San Antonio addresses?"
    answer: "No. They are procedural, interpreted scenes built from layered geometry and regional botanical and architectural cues—such as bald cypress, live oak, and pecan along San Antonio waterways, and Cretaceous limestone, live oak, and Ashe juniper in the Hill Country."
  - question: "Why can larger dots overlap or wider spacing show more bare canvas ground?"
    answer: "Dot size changes each mark's footprint around its fixed center, while Dot spacing selects more or fewer marks from a cached priority list. Because those two properties determine surface coverage together, neither knob secretly alters the other."
  - question: "Does Save whole painting export my zoomed close-up or the complete artwork?"
    answer: "Save whole painting always renders the complete logical artboard at 2048 or 4096 pixels on the longer side from the same scheduled marks, without interface buttons, crop framing, or watermarks."
published: true
mediaReviewed: true
interactiveFirst: true
---

<script>
	import PointillismArticleLaunch from '$lib/components/visualizations/pointillism-studio/PointillismArticleLaunch.svelte';
</script>

<PointillismArticleLaunch />

<TTS />

In the close-up below, the two walkers beside the river are hard to find. What shows up instead is a scatter of small, slightly uneven dabs—slate blue, warm cream, terracotta, olive, and dark umber—sitting on a quiet woven ground with pale gaps of primed cloth between them.

<Pi
	src="/images/visualizations/pointillism-studio/example-river-closeup.png"
	width={960}
	height={640}
	alt="A 3.4x close-up crop of seed 418206 showing separate matte oil-paint dabs of blue, ochre, cream, terracotta, and green with woven canvas ground visible between marks."
	caption="Close-up inspection (3.4× zoom) of seed 418206 — the same 14,392 paint marks viewed across a narrow riverside patch near the walkers and waterside railing."
/>

Step back to the whole painting and the pieces lock into place. Those same `14,392` marks read as two pedestrians passing a seated figure along a shaded San Antonio river path, an arched limestone footbridge spanning the channel, a dark iron railing, broken bands of sky and stone reflected on the water, and broad canopies of bald cypress, live oak, and pecan overhead. Not one dot moved, multiplied, or shifted hue. Only its apparent size in your field of view changed.

<Pi
	src="/images/visualizations/pointillism-studio/example-river-path.png"
	width={960}
	height={640}
	alt="Complete San Antonio river-path painting on seed 418206 showing walkers passing a seated figure under bald cypress, live oak, and pecan shade beside an arched limestone footbridge and reflected water."
	caption="Whole painting — seed 418206, San Antonio river path, 40% Dot size, 35% Dot spacing (14,392 active marks), 45% Palette contrast, 40% Color variation."
/>

Now hold that full view steady and raise **Dot size** from `40%` to `74%` while leaving **Dot spacing** at `35%`. Every mark stays pinned to its exact `(x, y)` center, and the count remains `14,392`, yet the picture coarsens immediately. Dabs swell across the primed ground, press into their neighbors, and trade crisp wrist, railing, and leaf boundaries for chunkier mosaic slabs.

<Pi
	src="/images/visualizations/pointillism-studio/example-river-larger-dots.png"
	width={960}
	height={640}
	alt="The same San Antonio river-path composition on seed 418206 rendered with Dot size raised to 74%, where wider overlapping paint dabs thicken figures, bridge stone, and foliage."
	caption="Larger marks on the same scene — seed 418206 with Dot size raised to 74% at fixed 35% Dot spacing (the same 14,392 centers, wider overlapping footprints)."
/>

Keeping four actions distinct makes the rest of the studio easy to read. **Inspect dots** changes only how closely you look at existing marks. **Dot size** changes the footprint of each mark in place. **Dot spacing** changes how many marks are drawn from a fixed candidate list. **New painting** builds a new composition altogether.

## Ordinary places rather than postcards

Texas is too big to fit inside a single visual shorthand, yet illustrations still reach automatically for empty desert, a ranch gate, a cowboy hat, a flag, or an orange sunset. Those subjects exist in parts of the state, just not everywhere. Treating them as defaults skips looking at how specific places differ.

This first studio focuses on everyday settings in San Antonio and the nearby Hill Country—two neighboring parts of a much larger state. None of the canvases is a photograph or a block-by-block reconstruction of a real street address. Each image is an interpreted procedural scene built from researched regional details, contemporary clothing, and ordinary routines: walking beside water, sitting in shade, carrying groceries, talking outside a corner shop, tending a stall, or walking a creek trail.

For the riverside scenes, [Visit San Antonio's guide to outdoor settings](https://www.visitsanantonio.com/blog/post/enjoy-the-sunshine-outdoor-adventures-to-experience-in-san-antonio/) identifies bald cypress, live oak, and pecan among the trees lining the downtown River Walk. Each species contributes a distinct painted silhouette: flared trunks and feathery tiers for bald cypress near the bank, wide evergreen domes for live oak casting deep shade across stone paths, and taller, airier crowns for pecan. Reflections on the channel let neighboring dots break stone arches, foliage, and shirt colors into horizontal ripples.

<Pi
	src="/images/visualizations/pointillism-studio/example-neighborhood.png"
	width={960}
	height={640}
	alt="Neighborhood street and porch painting on seed 529314 showing porch houses beside a corner PANADERÍA storefront, live oak and crape myrtle street trees, and neighbors talking while a shopper carries groceries."
	caption="Neighborhood street and porch — seed 529314, corner shop (PANADERÍA) and neighboring porches, 40% Dot size, 35% Dot spacing (14,392 marks)."
/>

**Neighborhood street and porch** arranges ordinary residential fronts, shaded porches, sidewalks, planted strips, and corner shops with varied setbacks and roof shapes—lived-in buildings rather than ruins or postcard landmarks. Storefront and stall signs use verified Spanish or English words (`PANADERÍA`, `MERCADO`, `FRUTAS`), falling back to a plain painted sign block when mark scale grows too coarse for clean lettering.

<Pi
	src="/images/visualizations/pointillism-studio/example-plaza-market.png"
	width={960}
	height={640}
	alt="Public plaza market painting on seed 684129 showing shaded canvas stalls including a FRUTAS banner, produce displays, shoppers, stone paving, and mature live oak and pecan trees."
	caption="Public plaza, park, or small market — seed 684129, shaded outdoor market template (FRUTAS), 40% Dot size, 35% Dot spacing (14,392 marks)."
/>

**Public plaza, park, or small market** chooses either a stone plaza with shaded market stalls or a tree-lined park with benches and a picnic, keeping open ground between small groups so silhouettes stay legible. **Hill Country creek and trail** moves onto rolling terrain outside the city. [Texas Parks and Wildlife's Hill Country overview](https://tpwd.texas.gov/landwater/water/environconcerns/regions/hillcountry.phtml) characterizes the region through karst limestone, live oak and Ashe juniper cover, springs, and rocky streams. Pale limestone ledges, dark juniper clumps, oaks, and shallow clear water anchor these compositions, while wildflowers appear only in an explicit seasonal spring-bloom variant rather than in every painting.

<Pi
	src="/images/visualizations/pointillism-studio/example-hill-country.png"
	width={960}
	height={640}
	alt="Hill Country creek and trail painting on seed 793409 showing rolling oak and Ashe juniper hills, exposed pale limestone ledges, a clear rocky stream, and a walker on a crushed-stone trail."
	caption="Hill Country creek and trail — seed 793409, limestone ledges, live oak and Ashe juniper cover, and clear creek water, 40% Dot size, 35% Dot spacing (14,392 marks)."
/>

## Pointillism, Divisionism, and Neo-Impressionism

Three related terms are worth keeping separate. **Pointillism** describes applying paint in small dot-like marks. **Divisionism** concerns separating colors into individual neighboring touches rather than mixing them thoroughly on the palette. **Neo-Impressionism** names the broader late-nineteenth-century movement developed by Georges Seurat (`1859–1891`) and Paul Signac (`1863–1935`), as detailed in [The Met's essay on Georges Seurat and Neo-Impressionism](https://www.metmuseum.org/essays/georges-seurat-1859-1891-and-neo-impressionism).

Seurat's *A Sunday on La Grande Jatte—1884* showed how a structured scene of public life beside water—walkers, seated figures, trees, shade, and boats—could be built from disciplined touches of pigment. The date in its title marks when Seurat began the project, not its full history: as the [Art Institute of Chicago's account of the painting's themes and development](https://archive.artic.edu/seurat/seurat_themes.html) notes, he developed and reworked the principal canvas across `1884–1886` before showing it in May `1886` at the final Impressionist exhibition.

The Neo-Impressionists studied nineteenth-century color theories and believed separate touches of pigment could produce greater luminosity than palette mixing—an artistic aim and working conviction rather than a universal scientific guarantee. Viewing reflective paint marks side by side differs from both physical pigment mixing and glowing screen subpixels, and blue dots next to yellow dots do not automatically read as bright green. Whether separate marks coalesce into larger forms and color areas depends on mark size, spacing, contrast, surrounding hues, exposed ground, and viewing conditions.

This digital studio is a contemporary interpretation. It neither reconstructs Seurat's studio process nor claims a historical tie between Pointillism and Texas.

## How a scene is built before a single dot lands

Everything runs deterministically in the browser without uploaded photographs or image-generation servers.

An integer seed such as `418206` feeds six independent pseudorandom streams—`scene`, `placement`, `candidates`, `color`, `texture`, and `reveal`—so changing **Paint texture** never shifts a person's foot and changing **Color variation** never alters a tree. On a fixed logical artboard (`1200 × 800` on desktop), the program first builds a layered scene model—sky, terrain, water and aligned reflections, structures, vegetation, grounded six-pose figures, cast shadows, and a focal area—recording local color, depth, surface category, object identity, and edge importance.

Next, a jittered quasirandom sampler with approximate clearance proposes `26,500` non-grid candidate positions and ranks them into one cached priority list favoring focal figures, silhouettes, and shadow edges while leaving quieter sky and ground calmer. **Dot spacing** selects a prefix of that list (`14,392` marks at `35%`), so wider spacing removes marks predictably and tighter spacing restores the same marks and stored variations. Size and spacing govern coverage together without hidden slider adjustments, and the primed warm-linen ground carries no hidden underpainting—only the dots construct the forms.

In perceptual OKLab color space, **Palette contrast** adjusts light-to-dark separation while **Color variation** spreads neighboring marks across coordinated color families: warm and cool mineral notes in limestone, varied greens and cool shadow notes in oak canopies, and sky blues, teals, and reflected warm tones in water. Each matte dab is stamped in logical coordinates with slight edge irregularity, subtle pigment variation, restrained directional bristle texture, and gentle top-left lighting. Before playback starts, `buildPaintSchedule` orders active marks into four passes—broad skeleton, midground and depth-guarded background marks near foreground silhouettes, foreground figures and edges, and final sunlit accents—shared identically by progressive playback, **Pause**, **Finish now**, still rendering, and `2048` or `4096 px` exports.

## One riverside painting, six deliberate steps

Keep the San Antonio river-path scene fixed on seed `418206` (`1200 × 800` artboard) and step through six links in order to see what changes and what holds firm:

1. [**Open the complete default painting**](/tools/pointillism-studio?v=1&sf=river-path&s=418206&ds=40&sp=35&pc=45&cv=40&pt=45&t=10&aw=1200&ah=800) — `14,392` marks build the shaded path, arched bridge, waterside railing, reflections, and three riverside figures at `40%` Dot size, `35%` Dot spacing, `45%` Palette contrast, and `40%` Color variation.
2. [**Inspect a 3.4× patch around the walkers and water**](/tools/pointillism-studio?v=1&sf=river-path&s=418206&ds=40&sp=35&pc=45&cv=40&pt=45&t=10&aw=1200&ah=800&vm=inspect&iz=3.40&ix=0.292&iy=0.688) — Only the viewport crop changes. The mark population stays `14,392`, and shirts, railing posts, and water ripples separate into individual matte dabs and woven linen gaps.
3. [**Return to the complete Fit view**](/tools/pointillism-studio?v=1&sf=river-path&s=418206&ds=40&sp=35&pc=45&cv=40&pt=45&t=10&aw=1200&ah=800&vm=fit) — The whole `1200 × 800` artboard returns uncropped, and those separate touches reassemble into clothing, foliage canopies, and reflected bridge arches.
4. [**Raise Dot size to 74% at fixed 35% spacing**](/tools/pointillism-studio?v=1&sf=river-path&s=418206&ds=74&sp=35&pc=45&cv=40&pt=45&t=10&aw=1200&ah=800) — Every mark center stays locked (`14,392` marks), while base semi-minor radius grows from `4.54` to `7.09` logical units, overlapping across bare ground and simplifying fine limbs into broader strokes.
5. [**Restore Dot size to 40% and open Dot spacing to 70%**](/tools/pointillism-studio?v=1&sf=river-path&s=418206&ds=40&sp=70&pc=45&cv=40&pt=45&t=10&aw=1200&ah=800) — Active marks drop to the top-priority `7,290` subset. Retained marks keep their exact centers and colors, warm canvas ground opens across sky and pavement, and focal edges hold the scene together with half as much paint.
6. [**Restore Dot spacing to 35% and raise Color variation to 82%**](/tools/pointillism-studio?v=1&sf=river-path&s=418206&ds=40&sp=35&pc=45&cv=82&pt=45&t=10&aw=1200&ah=800) — Scene geometry, mark count (`14,392`), and overall light-dark contrast (`45%`) stay fixed, while tree canopies split into wider olive, emerald, and cool slate-green neighbors and the river picks up livelier mineral-blue and warm reflected notes.

Lean close to any corner of the finished canvas and there is still no river channel, no limestone arch, and no cotton sleeve—only separate dabs of opaque pigment sitting beside bare woven ground, waiting for you to step back far enough for your eyes to accept the trade.
