---
title: How spots and stripes form
seoTitle: How Spots and Stripes Form | Interactive Turing Pattern Workbench
description: Grow spots and stripes from tiny random disturbances, then repeat the exact experiment with equal signal spreading rates to see why patterns vanish.
date: '2026-11-06'
dateModified: '2026-11-06'
category: Visualizations
tags:
  - Turing patterns
  - reaction-diffusion
  - morphogenesis
  - mathematical biology
  - partial differential equations
  - dynamical systems
  - interactive simulation
  - pattern formation
  - activator-inhibitor
  - Alan Turing
pinnedTags:
  - Turing patterns
  - reaction-diffusion
  - morphogenesis
  - mathematical biology
  - partial differential equations
  - dynamical systems
  - interactive simulation
  - pattern formation
  - activator-inhibitor
  - Alan Turing
thumbnail: /images/visualizations/how-spots-and-stripes-form/social.png
thumbnailAlt: Computed reaction-diffusion panels comparing isolated spots, labyrinthine stripes, inverse spots, and a uniform equal-spreading control.
color: '#D97536'
author: Suvro Ghosh
readingTime: 9 min read
inPlainEnglish: Two spreading signals can turn an almost uniform sheet into spots or stripes—provided the restraining signal spreads faster than the amplifying one.
published: true
mediaReviewed: true
interactiveFirst: true
---

<script>
	import SpotsAndStripesInstrument from '$lib/components/visualizations/how-spots-and-stripes-form/SpotsAndStripesInstrument.svelte';
</script>

How can a nearly uniform surface develop spots or stripes without a pre-drawn blueprint? In 1952, Alan Turing showed that two interacting signals spreading across a flat sheet can break symmetry on their own. One signal amplifies itself locally, whilst the second restrains it and spreads much faster through neighbouring regions.

The workbench below builds that idea around a single controlled comparison. First, let tiny random disturbances around a uniform equilibrium grow into a stable pattern. Then repeat the exact same experiment—from the identical starting array and random seed—with both signals spreading at the same rate.

<figure class="my-6 rounded-xl border border-slate-800/80 bg-[#101416] p-4 text-[#F1F0E8]" data-testid="computed-experiment-preview">
	<img
		src="/images/visualizations/how-spots-and-stripes-form/poster.png"
		alt="Computed comparison of four reaction-diffusion outcomes at model time t = 60 from seed 1952: Spots (k = -0.075, 15x), Stripes (k = 0.000, 15x), Inverse spots (k = +0.075, 15x), and Equal spreading (1x, Dv = Du = 0.6) which smooths back to a uniform surface."
		width="1200"
		height="750"
		loading="eager"
		decoding="async"
		class="w-full rounded-lg border border-slate-700/60"
	/>
	<figcaption class="mt-3 text-sm leading-relaxed text-[#B8C0C3]">
		<strong class="text-[#F1F0E8]">Computed preview of the experiment (seed 1952, model time t = 60.0):</strong>
		When the inhibitor signal spreads <code>15×</code> faster than the activator (<code>D_u = 0.6</code>, <code>D_v = 9.0</code>), tiny initial disturbances self-organise into isolated spots (<code>k = −0.075</code>), connected stripes (<code>k = 0.000</code>), or inverse spots (<code>k = +0.075</code>). Repeating the experiment at equal spreading rates (<code>1×</code>, <code>D_v = D_u = 0.6</code>) causes every disturbance to fade away.
	</figcaption>
</figure>

<SpotsAndStripesInstrument />

## Three short suggested experiments

1. **Grow a pattern from microscopic noise:** Leave the preset on **Spots** and press **Grow from noise**. The patch resets to tiny seeded disturbances ($\pm 0.03$) around its uniform equilibrium ($u = v = s \approx -0.273$). Watch local peaks reinforce themselves whilst fast-spreading inhibition carves quiet moats around each rising spot.
2. **Test equal spreading side by side:** Select **Compare equal spreading**. Both fields restart from the exact same initial arrays and evolve at the same model time, changing only the inhibitor spreading rate (`15×` on the left versus `1×`, where $D_v = D_u = 0.6$, on the right). Follow the spatial variation curve $\sigma_u$: differences amplify on the left and smooth to zero on the right.
3. **Shift the pattern balance and domain geometry:** Try **Stripes** ($k = 0.000$) and **Inverse spots** ($k = +0.075$), or drag **Pattern balance** yourself. Then open **Change the shape** to compare a **Broad sheet**, a **Narrow strip**, and a **Tapered patch**, or switch to the **Pigment** view to see how a simple display threshold turns a continuous signal into crisp markings.

---

## How local amplification and fast inhibition break symmetry

Everyday intuition says that diffusion is a smoothing process. Drop ink into still water and sharp edges blur until the liquid is uniform. For decades, biologists assumed that spatial patterns on animal coats—leopard rosettes, zebra stripes, or the dappled flanks of a trout—required either a pre-existing coordinate map or an external wave moving across the embryo.

Turing discovered a counter-intuitive exception. Suppose every point on a flat sheet carries two interacting signals:

- An **activator signal ($u$)** that promotes more of itself locally and also stimulates the production of an inhibitor.
- An **inhibitor signal ($v$)** that suppresses the activator and spreads through the sheet much faster than the activator does.

Imagine a nearly uniform surface sitting at equilibrium, perturbed only by tiny random fluctuations. Wherever the activator $u$ happens to sit slightly above the baseline, local self-amplification nudges that peak higher. At the same time, the growing peak produces extra inhibitor $v$.

Because the activator spreads slowly ($D_u = 0.6$), the upward push stays localised in a tight cluster. Because the inhibitor spreads rapidly ($D_v = 9.0$ at the `15×` setting), the newly created inhibitor escapes the nascent peak and floods its immediate surroundings. The peak survives at its own centre—where self-amplification outpaces the escaping inhibitor—whilst a ring of high inhibition around it prevents another peak from rising too close by. Farther away, where the inhibitor has diluted, another activator peak is free to grow.

The result is a characteristic wavelength: peaks space themselves out at a distance set by the contest between local amplification and the reach of the faster inhibitor.

## Why equal spreading destroys the pattern

When you turn on **Compare equal spreading**, the second viewport runs the identical equations from the exact same initial arrays, but sets the inhibitor spreading rate equal to the activator spreading rate:

$$D_v = D_u = 0.6 \quad (1\times)$$

Why does the pattern vanish instead of merely changing size?

When both signals spread at the same rate, any inhibitor generated by a rising activator peak remains bottled up inside the peak itself rather than running ahead into the surrounding neighbourhood. As soon as $u$ rises at a point, $v$ rises right alongside it at the same spatial scale and quenches the peak on the spot. Meanwhile, ordinary diffusion smooths out local differences between neighbouring cells.

Without a faster inhibitor to export restraint outward, no spatial wavelength enjoys positive growth. Every disturbance decays steadily back towards the flat equilibrium $u = v = s$, and the spatial variation $\sigma_u$ drops to zero. Crucially, the workbench uses a fixed colour scale ($[-1.0, +1.0]$) across both fields and throughout playback; automatic contrast stretching would artificially amplify microscopic residual noise and make a fading surface look patterned when it is actually flat.

## From spots to stripes and inverse spots

A faster inhibitor is necessary for pattern formation in this two-signal system, but it is not the only ingredient that decides *which* pattern appears. The **Pattern balance** parameter $k$ shifts the baseline drive on the activator signal and determines whether high-signal regions remain isolated islands or link up into continuous bands:

- **Spots ($k = -0.075$):** The uniform equilibrium sits below zero ($s \approx -0.273$). High-activator peaks face a headwind across the domain, so only compact, circular islands can sustain themselves amidst a connected low-signal sea.
- **Stripes ($k = 0.000$):** The equation is symmetric around $s = 0$. Neither positive peaks nor negative troughs enjoy an advantage; high- and low-signal regions share the surface equally (`~50%` each) and weave into labyrinthine stripes of uniform width.
- **Inverse spots ($k = +0.075$):** The uniform equilibrium sits above zero ($s \approx +0.273$). Now the high-activator state forms a connected background sheet punctuated by isolated low-signal pockets—the mirror image of the spots regime.

Whenever you adjust **Pattern balance** or **Inhibitor spreading rate**, the instrument restarts from the same deterministic random seed (`1952` by default) so that differences you see on screen come purely from the equations rather than a fresh roll of random noise.

## Signals versus visible pigment

A reaction–diffusion system produces smooth, continuous fields of $u$ and $v$. In this dimensionless model, $u$ and $v$ are **normalised, signed signal fields** measured relative to a reference state: positive values represent above-baseline signalling and negative values represent below-baseline signalling. Unlike raw chemical concentrations, negative numbers here are completely valid.

In biological skin or hair follicles, downstream cells often respond to such continuous morphogen gradients through a sharp switch: where the activator signal sits above a threshold, pigment cells produce dark melanin; where it sits below, they produce light coat colour.

The three view tabs directly above the canvas let you separate the underlying mathematics from that readout rule:

- **Activator** and **Inhibitor** display the continuous signed fields $u$ and $v$ against a fixed $[-1.0, +1.0]$ scale.
- **Pigment** applies a binary threshold rule to $u$. Moving the **Pigment threshold** slider changes only how the current field is coloured on screen; it never alters the numerical arrays, model time, or simulation state.

## How patch geometry shapes the pattern

Open **Change the shape** to solve the exact same equations—with the same grid spacing ($h = 0.8$) and diffusion coefficients—inside three flat, two-dimensional domains with no-flux boundaries (*the signals spread inside the patch; they do not cross its edges*):

- **Broad sheet (`76.8 × 76.8` model units):** Large enough in both directions to host many wavelengths, producing isotropic spots or winding labyrinthine stripes.
- **Narrow strip (`96.0 × 19.2` model units):** Wide enough along its length for multiple waves, but narrow across its height. Because no-flux boundaries require signal gradients to meet the edges perpendicularly, stripes frequently align into rungs across the strip.
- **Tapered patch (`96.0 × 38.4` model units):** A flat two-dimensional wedge that narrows from left to right. At the broad end, two-dimensional spots or branched stripes can sit side by side; towards the narrow tip, only single transverse bands fit across the width—mirroring the transition from body spots to tail rings seen on cheetahs, genets, and leopard geckos.

Keep in mind that all three domains here are flat, two-dimensional approximations on a fixed grid. Modelling curved three-dimensional animal surfaces or tissue that expands while the pattern is still forming requires additional geometric terms beyond a fixed planar mesh.

---

<details class="my-6 rounded-xl border border-slate-700/80 bg-[#171C1F] p-5 text-[#F1F0E8]" data-testid="equations-disclosure">
<summary class="cursor-pointer text-lg font-semibold text-[#F1F0E8]">Equations and implementation details</summary>

The instrument integrates the dimensionless cubic activator–inhibitor system on a two-dimensional domain $\Omega$:

$$\frac{\partial u}{\partial t} = 0.6\nabla^2 u + u - u^3 - 1.2v + k$$

$$\frac{\partial v}{\partial t} = D_v\nabla^2 v + 1.5(u - v)$$

Here $u(x, y, t)$ and $v(x, y, t)$ are normalised, signed signal fields where negative values are valid deviations below the reference baseline:

- **$u$:** activator signal.
- **$v$:** inhibitor signal.
- **$u - u^3$:** local self-amplification ($+u$) with a cubic limiting term ($-u^3$) that keeps growing peaks bounded.
- **$-1.2v$:** local inhibition of the activator by the inhibitor.
- **$k$:** pattern balance parameter shifting the baseline drive on $u$.
- **$D_u = 0.6$:** fixed activator diffusion coefficient.
- **$D_v$:** inhibitor diffusion coefficient, controlled via the spreading ratio $D_v / D_u$ (so `1×` means $D_v = D_u = 0.6$, and `15×` means $D_v = 9.0$).

### Uniform equilibrium and seeded initialisation

Setting $\nabla^2 u = \nabla^2 v = 0$ and $\partial u / \partial t = \partial v / \partial t = 0$ yields $v = u = s$, where the uniform equilibrium $s$ satisfies the depressed cubic:

$$s^3 + 0.2s = k$$

Because the derivative $3s^2 + 0.2$ is strictly positive for all real $s$, every pattern balance $k$ has a unique real uniform equilibrium solved analytically via Cardano’s formula. Each run initialises $(u, v)$ around $(s, s)$ using deterministic Mulberry32 pseudo-random disturbances of amplitude $\pm 0.03$. Controlled comparisons reuse the exact same disturbance offsets at every grid cell.

### Linear dispersion check and numerical discretisation

Linearising around $u = v = s$ gives the Jacobian reaction rates $f_u = 1 - 3s^2$, $f_v = -1.2$, $g_u = 1.5$, and $g_v = -1.5$. For $k \in [-0.075, +0.075]$, the homogeneous mode ($q = 0$) is stable because $\operatorname{tr}(J) = f_u + g_v = -0.5 - 3s^2 \lt 0$ and $\det(J) = 1.5(3s^2 + 0.2) \gt 0$. When $D_v = D_u = 0.6$, every spatial wavenumber $q \gt 0$ also has $\operatorname{Re}\lambda(q) \lt 0$. At $D_v = 9.0$ (`15×`), a band of discrete Neumann eigenmodes on the $96 \times 96$ grid ($h = 0.8$) acquires positive growth rate $\lambda(q) \gt 0$ with peak growth near $q^* \approx 0.65\text{ rad/unit}$ (wavelength $\Lambda \approx 9.7$ model units).

Spatial derivatives use a five-point finite-difference Laplacian with uniform spacing $h = 0.8$ and zero-flux Neumann boundary conditions across all domain masks. Time integration uses the explicit second-order Heun (RK2) predictor–corrector scheme with fixed dimensionless timestep $\Delta t = 0.01$ inside a dedicated Web Worker. Halving $\Delta t$ from $0.01$ to $0.005$ up to $t = 60.0$ changes the field by less than $10^{-6}$ RMS with $100\%$ cell-by-cell sign agreement.

</details>

## Sources and further exploration

- Alan M. Turing (1952), *The Chemical Basis of Morphogenesis*, Philosophical Transactions of the Royal Society of London B, 237(641), 37–72.
- James D. Murray (1981), *A Pre-pattern Formation Mechanism for Animal Coat Markings*, Journal of Theoretical Biology, 88(1), 161–199, and *Mathematical Biology II: Spatial Models and Biomedical Applications* (Springer, 2003).
- Shigeru Kondo and Takashi Miura (2010), *Reaction-Diffusion Model as a Framework for Understanding Biological Pattern Formation*, Science, 329(5999), 1616–1620.
- Once you have explored how differential spreading creates spots and stripes in this signed activator–inhibitor model, visit the companion **[Gray–Scott Reaction–Diffusion Atlas](/blog/visualizations/reaction-diffusion-atlas)** on this blog to explore self-replicating mitosis spots, coral mazes, and spiralling waves across a two-parameter feed-and-kill phase map.
