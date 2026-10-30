---
title: "Why Soap Bubbles Change Colour"
seoTitle: "Why Soap Bubbles Change Colour — An Interactive Soap Bubble"
description: "Change a soap bubble’s wall thickness and look around its coloured surface. Explore thin-film interference with a simple example you can try."
date: "2026-10-31"
thumbnail: "/images/visualizations/soap-film/poster.png"
thumbnailAlt: "A round soap bubble with bright flowing bands of reflected colour against a black background"
category: "Visualizations"
tags: ["Physics", "Optics", "Light", "Thin-film Interference", "Colour", "Shaders", "WebGL", "Interactive Learning", "Soap Bubbles", "Iridescence"]
pinnedTags: ["Physics", "Optics", "Light", "Thin-film Interference", "Colour", "Shaders", "WebGL", "Interactive Learning", "Soap Bubbles", "Iridescence"]
published: true
interactiveFirst: true
immersiveLead: true
color: "#b7c6ef"
author: "Suvro Ghosh"
readingTime: "4 min"
inPlainEnglish: "A soap bubble gets its colours from light reflected by the two faces of its very thin wall. Change the wall’s thickness to change the colours, or look around the bubble to see different patches of its flowing surface."
keyTerms: ["Thin-film interference", "Reflection", "Wavelength", "Film thickness", "Viewing angle"]
faq:
  - question: "Why do soap bubbles change colour?"
    answer: "Light reflected from the front and back surfaces of the thin soap film combines. The reflected mixture depends on the film’s thickness, the light and the viewing angle."
  - question: "Why does Even thickness still show coloured bands?"
    answer: "A sphere curves away from you towards its edge. Even when its wall has one thickness, different parts reflect light at different local angles, producing radial colour bands."
  - question: "Is the flowing film a fluid simulation?"
    answer: "No. The colour calculation uses a simplified optical model, while the flowing thickness pattern is an authored animation. It does not predict how a particular soap solution drains or bursts."
  - question: "Can I use the example without animation?"
    answer: "Yes. Pause the film and change the controls at your own pace. Reduced-motion preferences start it still; a static image and the article remain available if WebGL cannot run."
---

<script>
	import SoapFilm from '$lib/components/visualizations/soap-film/SoapFilm.svelte';
</script>

<SoapFilm />

<TTS />

## Change one thing first

Why does a soap bubble change colour even though the liquid itself looks clear?

Try the bubble above. Choose **Even thickness**, set it to **400 nm**, and move the thickness towards **200 nm**. Watch the coloured bands change across its curved surface.

Then choose **Flowing film**, pause it and change the **Viewing angle**. You are looking around the bubble, bringing other patches into view. Its outline stays round. Changing one control at a time makes each effect easier to see.

A nanometre is one billionth of a metre. The numbers here describe the thickness of the liquid wall, not the size of the bubble. The wall is the thin film that separates the air inside from the air outside.

## Two surfaces, one reflected colour

Some light reflects from the outer face of the wall. Some enters the liquid, reflects from the inner face and comes out again. These are the two faces of one small patch of wall, not opposite sides of the whole bubble. Their reflected light waves combine. Depending on wavelength and thickness, they can reinforce each other or reduce one another’s reflected contribution.

There is also a change in phase when light reflects at the air-to-liquid boundary. For a very thin soap film with air on both sides, the reflected contributions largely cancel. That is why the thinnest parts can look dark. Less reflected light does not mean the light has disappeared: an ideal transparent film also transmits light. [OpenStax’s thin-film explanation](https://openstax.org/books/university-physics-volume-3/pages/3-4-interference-in-thin-films) develops this picture step by step.

White light contains many wavelengths. Change the thickness or angle and their reflected contributions change by different amounts. Your eye receives a different mixture, which you perceive as a different colour.

## Let the thickness vary

With **Even thickness**, the wall has one thickness everywhere. It still shows coloured bands because a sphere curves away from you: the local angle changes from its centre towards its rim. Looking around an ideal, evenly coated sphere under uniform white illumination leaves the same radial pattern.

**Flowing film** adds different thicknesses in different places. Its control is the average over the whole bubble. Pause at a frame you like, then look around it. The pattern belongs to the surface, so different patches move into view. **Reset** restores the starting composition, and **Save image** keeps the current view without the controls.

The colours are easier to examine against the dark background. A real bubble reflects its surroundings, and those surroundings affect what you see. A bright window, a dark wall and a cloudy sky do not provide the same illumination.

## What this example calculates

The colour model represents a transparent, water-like film with air on either side. At each point on the visible wall, it calculates reflection using the local surface angle. It combines visible wavelengths into a display colour and uses a lookup table to keep interaction responsive. Computing thin-film colour requires attention to the spectrum; [Belcour and Barla’s graphics research](https://belcour.github.io/blog/research/publication/2017/05/01/brdf-thin-film.html) explains why a simple three-channel shortcut can miss important behaviour.

The flowing pattern is an authored animation. It does not calculate drainage, surface chemistry or bursting. This rendering uses the nearer wall; it does not trace light through the bubble to its far side. The material and illumination are simplified, and brightness and saturation are enhanced for the screen. Use it to understand the relationships, rather than to predict the exact colour of a real bubble.

The visual starting point was Paul Bakaus’s [Radiant shader collection](https://github.com/pbakaus/radiant). This piece gives its own optical calculation a small set of controls and a familiar question. You can leave the motion paused throughout: changing one value is enough to see something new.

Colour data: CIE (2019), [1931 standard observer](https://doi.org/10.25039/CIE.DS.xvudnb9b) and [standard illuminant D65](https://doi.org/10.25039/CIE.DS.hjfjmt59), sampled here every 5 nm from 380–780 nm. The sampled table retains the datasets’ [CC BY-SA 4.0 licence](https://creativecommons.org/licenses/by-sa/4.0/).
