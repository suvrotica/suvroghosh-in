---
title: "Fractal Trip: Change a Number, Follow the Pattern"
seoTitle: "Fractal Trip — Interactive Mandelbrot and 3D Fractals"
description: "Explore colourful fractals, change the equations behind them, and take a guided journey through Mandelbrot details and three-dimensional forms."
date: "2026-11-04"
dateModified: "2026-11-05"
thumbnail: "/images/visualizations/fractal-trip/poster.png"
thumbnailAlt: "Copper, cream and turquoise three-dimensional Mandelbulb ridges and cavities rendered in the Fractal Trip explorer"
category: "Visualizations"
tags: ["Fractals", "Mandelbrot Set", "Julia Sets", "Mathematics", "Generative Art", "3D Graphics", "Shaders", "WebGL", "Interactive Mathematics", "Creative Coding"]
pinnedTags: ["Fractals", "Mandelbrot Set", "Julia Sets", "Mathematics", "Generative Art", "3D Graphics", "Shaders", "WebGL", "Interactive Mathematics", "Creative Coding"]
published: true
interactiveFirst: true
immersiveLead: true
color: "#f2924b"
author: "Suvro Ghosh"
readingTime: "6 min"
inPlainEnglish: "Choose a fractal, change the numbers in its equation and explore the result. Start a slow trip or steer for yourself, then save an image or a link to the view."
keyTerms: ["Fractal", "Iteration", "Mandelbrot set", "Julia set", "Escape time", "Mandelbulb", "Mandelbox", "Floating-point precision"]
faq:
  - question: "What is Fractal Trip?"
    answer: "Fractal Trip is a browser-based explorer for Mandelbrot, Julia, Burning Ship, Tricorn, Newton, Mandelbulb and Mandelbox patterns. You can change their equation parameters, explore their detail and save a view."
  - question: "Are all the fractals three-dimensional?"
    answer: "No. Mandelbrot and the other plane views are two-dimensional calculations with optional relief shading. Mandelbulb and Mandelbox are three-dimensional constructions rendered by sampling along camera rays."
  - question: "What is the difference between changing a seed and changing a colour?"
    answer: "A Julia seed is part of the repeated equation and changes the pattern. A palette changes how the calculated result is displayed. Camera and light controls also change its appearance without changing the recurrence."
  - question: "Can I keep zooming forever?"
    answer: "No. The browser has a finite calculation budget and finite numerical precision. Fractal Trip bounds its zoom and trips so it does not pass off enlarged pixels or repeated numerical values as new detail."
  - question: "Can I save what I find?"
    answer: "Save image downloads a clean PNG. Copy view link preserves the selected equation, settings and view. Saved views stay in this browser; graphics hardware can produce small differences in the final pixels."
---

<script>
	import FractalTrip from '$lib/components/visualizations/fractal-trip/FractalTrip.svelte';
</script>

<FractalTrip />

<p><small>Published <time datetime="2026-11-04">4 November 2026</time> · Updated <time datetime="2026-11-05">5 November 2026</time></small></p>

<TTS />

## Change one number

Choose **Julia** and move the seed a little. The branches rearrange themselves. Change the colour and the same structure takes on a different appearance. You have changed two different things: the rule that produces the pattern, and the way the result is drawn.

Fractal Trip lets you explore both. Choose one of the four three-dimensional scenes or a plane fractal, start a slow journey, scrub along its timeline, or pause and steer for yourself. The dark controls are there to keep the bright, complicated part of the screen easy to handle. Knowing what every symbol means is optional. Being able to stop the thing is rather more important.

A fresh visit opens in **Copper Reef**, a three-dimensional Mandelbulb composition, with **Folded Cathedral**, **Alien Garden** and **Fractal Canyon** alongside it. Press **Start journey** to travel along a validated spatial path across ridges, vaults and branching tendrils, or switch to **Mandelbrot** in **Explore** to watch the complex-plane boundary become more elaborate as the view approaches it. Pause when something catches your attention. The picture is calculated from a repeated rule, so changing the view asks the browser to do the calculation again at a different scale.

## A small rule, repeated

The familiar Mandelbrot set begins with this equation:

$$
z_{n+1}=z_n^2+c.
$$

Start with $z=0$. Square it, add $c$, and use that answer as the next $z$. Repeat.

If $c=0$, the sequence is $0,0,0,0,\ldots$. It stays where it started. If $c=1$, the sequence begins $0,1,2,5,26,677,\ldots$. It leaves in a hurry. These are two easy cases. The interesting picture appears when the calculation is repeated across a plane of complex numbers, where a number has both a real and an imaginary part.

Each pixel chooses a different $c$. The renderer follows the sequence and records whether it escapes beyond an appropriate bound, and how quickly. Nearby choices can behave very differently, especially around the boundary. Draw those differences and the curls, branches and small repeated forms begin to appear.

The colours are our choice. They can follow escape behaviour or other measurements made during the calculation. The equation does not come with a compulsory turquoise setting.

A point that has not escaped before the calculation stops is still unresolved at that budget. A dark pixel is not, by itself, a mathematical proof that the sequence will remain bounded forever.

## The numbers that change the shape

**Power** replaces the square with a higher integer power. At two, the parameter-plane view is the ordinary Mandelbrot set. At higher powers it belongs to the Multibrot family. Changing power changes the rule; zooming simply lets you inspect its result more closely.

**Julia** uses the same sort of recurrence differently. Here $c$ is fixed, and each pixel chooses the starting $z$. The two seed controls change the real and imaginary parts of $c$. Keep one still and move the other slowly. It is easier to see a parameter's effect when everything else stops volunteering for attention.

**Burning Ship** folds the real and imaginary components through absolute values before taking the power. **Tricorn** uses complex conjugation. These small alterations produce recognisably different families. Their higher-power variants have their own settings too.

**Newton** asks a different question: which root does a starting point approach? Its iteration repeatedly improves an estimate of a polynomial root. Move the roots or change the relaxation, and the coloured basins change. Points near a dividing boundary can take a long time to settle; some do not converge within the allowed calculation.

Open **Equation** to find the controls for the selected family. The displayed rule and values belong to that family. **Reset equation** restores its starting parameters; **Reset view** brings the camera back. Undo is useful when a promising experiment becomes an unpromising one.

## Where the depth comes from

The plane views can have relief shading. Light and surface controls make the calculated field look raised or engraved. This is a way of displaying a two-dimensional result. Turning down the relief makes that distinction easy to see.

**Mandelbulb** and **Mandelbox** are three-dimensional constructions. The Mandelbulb uses a power-like operation expressed through spherical coordinates. The Mandelbox repeatedly folds, scales and shifts positions. Power, seed and fold parameters alter the forms themselves.

To draw these surfaces, the renderer follows a ray from the camera through each part of the image. A distance estimator guides its progress towards the shape, while sampled ambient occlusion, soft shadows and subtle distance haze help separate foreground ridges from deeper recesses. When a three-dimensional scene is paused, the renderer accumulates a bounded set of sub-pixel samples and then stops drawing.

The metallic and pearlescent finishes are artistic choices. They help reveal ridges, recesses and silhouette. They do not turn the equation into a lump of actual copper, however persuasive the highlights become.

## A useful way to explore

Begin with a 3D scene or a plane preset and change one equation parameter. Pause the journey while doing this. Then try another palette on the same view. Finally, adjust the surface and light. Keeping those steps separate makes it clear which change produced the result you liked.

Drag to pan in the plane views, or use **Free look** and **Orbit** in the three-dimensional scenes. While the viewer is focused on desktop, `W`/`S`, `A`/`D` and `Q`/`E` (or the on-screen spatial arrows and zoom buttons on touch devices) move through open space while checking clearance against the distance estimator. Manual exploration pauses the tour and surfaces **Return to tour** so you can rejoin the guided spline path whenever you like. Fullscreen gives the detail more room; hiding the controls leaves the artwork almost alone.

The quality options balance detail against the work your browser can manage. A smaller drawing buffer can make movement smoother. More calculation may refine a boundary, but it cannot recover coordinates the arithmetic can no longer distinguish. These journeys have limits. At very small scales, an honest stopping point is more useful than a confident blur.

**Save image** keeps a clean PNG. **Copy view link** keeps the equation settings and view. **Saved views** stay in this browser. The mathematical settings can be restored, although different graphics hardware may draw slightly different final pixels.

For a closer look at the mathematics, visit [The Fractal Atlas](/blog/visualizations/the-fractal-atlas). The [ray-marching exhibit](/blog/visualizations/ray-marching-fragment-shader-from-scratch) explains the camera-ray approach, while [Strange Matter](/blog/visualizations/strange-matter) offers another way to play with procedural form and colour.

Try Julia now: keep the imaginary seed fixed, move the real seed a little, and pause on the first arrangement you want to keep.
