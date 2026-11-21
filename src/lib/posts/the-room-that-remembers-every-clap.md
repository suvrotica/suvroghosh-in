---
title: "The Room That Remembers Every Clap"
seoTitle: "The Room That Remembers Every Clap — 2D Acoustic Wavefield & Room-Impulse Lab"
description: "Sketch walls, absorbers, and acoustic lenses in a live 2D wave chamber, watch Chladni sand gather at nodes, and hear any sound inside the room you built."
date: "2026-11-21"
category: "Visualizations"
published: true
interactiveFirst: true
immersiveLead: true
thumbnail: "/images/visualizations/acoustic-wavefield/social.png"
thumbnailAlt: "A dark slate 2D acoustic wavefield chamber showing copper and cyan circular pressure fringes focusing inside an elliptical stone gallery with settled bone-ivory Chladni sand along nodal curves and a Room Impulse Response oscillogram below."
color: "#38BDF8"
author: "Suvro Ghosh"
readingTime: "16 min"
tags:
  - "Acoustics"
  - "Wave Equation"
  - "FDTD Simulation"
  - "Chladni Figures"
  - "Room Impulse Response"
  - "Reverberation"
  - "Web Audio"
  - "Scientific Computing"
  - "Physics"
  - "Architectural Acoustics"
pinnedTags:
  - "Acoustics"
  - "Wave Equation"
  - "FDTD Simulation"
  - "Chladni Figures"
  - "Room Impulse Response"
  - "Reverberation"
  - "Web Audio"
  - "Scientific Computing"
  - "Physics"
  - "Architectural Acoustics"
inPlainEnglish: "Every room leaves a mathematical fingerprint on sound called its impulse response. By solving the 2D acoustic wave equation across stone walls, foam absorbers, diffusers, and slow-air lenses, this chamber lets you watch standing-wave sand patterns settle and listen to everyday sounds convolved inside any architecture you sketch."
keyTerms:
  - "Wave equation"
  - "FDTD leapfrog stencil"
  - "Room Impulse Response"
  - "Schroeder integration"
  - "RT60 reverberation time"
  - "Clarity C80"
  - "Chladni nodal lines"
  - "Acoustic reciprocity"
  - "Convolution reverb"
  - "Helmholtz resonator"
faq:
  - question: "What is a Room Impulse Response (RIR)?"
    answer: "A Room Impulse Response is the exact pressure waveform recorded at a listener microphone after an ideal instantaneous impulse—such as a sharp hand clap—is emitted at a source point. In a linear room, convolving any dry sound with that impulse response reproduces how the sound would behave in that space."
  - question: "Why do Chladni sand grains gather along quiet lines instead of loud peaks?"
    answer: "Standing waves create stationary antinodes where air pressure oscillates strongly and nodal lines where pressure variance remains near zero. Sand grains are bounced away from regions of high root-mean-square pressure and settle where vibrational agitation vanishes."
  - question: "What does swapping Source and Probe prove?"
    answer: "Swapping the emitter and listener coordinates tests acoustic reciprocity: in a linear, time-invariant room, the Green's function G(rB, rA; t) equals G(rA, rB; t), meaning the impulse response measured from A to B matches the impulse response measured from B to A."
  - question: "How does a slow-air acoustic lens bend sound?"
    answer: "Sound bends toward regions of slower wave speed by Snell's law. Painting a slow-air zone with wave speed 0.55 times ambient air delays the center of an approaching wavefront while its edges race ahead, curving the front into a focus."
  - question: "What are the physical limits of this 2D browser simulation?"
    answer: "The solver models linear, scalar 2D wave propagation on a 224 by 144 grid rather than full 3D ceiling-and-floor reflections, frequency-dependent porous air viscosity, or nonlinear shock waves. Grid resolution also band-limits clean propagation to low and mid architectural frequencies."
---

<script>
	import AcousticWavefieldChamber from '$lib/components/visualizations/acoustic-wavefield/AcousticWavefieldChamber.svelte';
</script>

<AcousticWavefieldChamber />

<noscript>
	<figure class="my-6">
		<img
			src="/images/visualizations/acoustic-wavefield/poster.png"
			alt="2D Acoustic Wavefield Chamber diagram showing an elliptical stone gallery with copper and cyan pressure rings focusing from Emitter S onto Listener L, settled Chladni sand grains, and a Room Impulse Response trace."
			width="1200"
			height="630"
			loading="eager"
			decoding="async"
		/>
		<figcaption>
			Interactive WebGL or JavaScript is required to run the live 2D wavefield solver, sketch rooms,
			and audition room convolution audio. The static diagram above captures the Elliptical
			Whispering Gallery preset, while the physics walkthrough and equations below remain readable
			without JavaScript.
		</figcaption>
	</figure>
</noscript>

<TTS />

Clap your hands once inside an empty tiled room, and before your eyes have finished scanning the walls, your ears already know the room's rough volume, how hard its surfaces are, and whether two parallel walls are slapping an echo back and forth between them. A single sharp pressure pulse probes every corner of an enclosure at 343 meters per second and returns with a complete acoustic autobiography.

In architectural acoustics, that returned waveform is called the **Room Impulse Response (RIR)**. Because linear air obeys superposition, the room acts like a giant physical filter: if you record its response to a single clap between an emitter $S$ and a listener microphone $L$, you can mathematically pass *any* dry sound—a plucked string, a spoken vowel, a snare rimshot—through that impulse response and hear exactly how the room transforms it.

This laboratory solves the 2D scalar acoustic wave equation live on a $224 \times 144$ grid, tracks $2{,}000$ Chladni sand grains across standing-wave nodes, measures $RT_{60}$, Clarity $C_{80}$, and resonant eigenmodes from the full $1.2\text{ s}$ impulse response, and feeds that real simulated RIR directly into a Web Audio `ConvolverNode`.

## 1. A Room as a Linear Machine: The Wave Equation on a Grid

Inside a $14.0\text{ m} \times 9.0\text{ m}$ chamber with spatially varying wave speed $c(x, y)$ and volumetric damping $\sigma(x, y)$, small excess air pressure $p(x, y, t)$ obeys the damped scalar wave equation:

$$
\frac{\partial^2 p}{\partial t^2} + \sigma(x, y)\frac{\partial p}{\partial t} = c(x, y)^2 \nabla^2 p + s(x, y, t).
$$

To keep wave propagation nearly circular rather than artificially square along the grid axes, the solver discretizes $\nabla^2 p$ with a **9-point isotropic leapfrog stencil** combining axial neighbors (weight $4$) and diagonal neighbors (weight $1$) on a $\Delta x = 0.0625\text{ m}$ lattice at Courant number $S_c = c_0 \Delta t / \Delta x = 0.50$ ($f_{\text{sim}} = 10{,}976\text{ Hz}$). Rigid stone cells enforce zero normal pressure gradient (Neumann reflection), including axial-shoulder blocking so energy never tunnels across one-cell diagonal corners. When the perimeter is switched to **Open Absorbing (PML)**, a $14$-cell cubic sponge ramp and 1st-order Mur rim swallow outgoing wavefronts cleanly.

**Experiment 1 — Whisper across the ellipse.** Keep the default **Elliptical Whispering Gallery** and press **Clap**. Watch the outgoing copper-and-cyan pressure ring reflect off the curved stone perimeter from every direction and arrive simultaneously at **Listener (L)**—creating a sharp secondary focal spike on the **Room Impulse Response $h(t)$** trace. Now switch the brush tool to **Move Beacons (S / L)**, drag **Emitter (S)** a meter away from the focus, and press **Clap** again: the focal spike smears into a broad cluster of staggered arrivals.

## 2. The Sand Remembers Where the Air Holds Still (Chladni Nodes)

When a room is driven by a steady pure tone instead of a single clap, outgoing waves and wall reflections interfere continuously. At resonant frequencies—the room's **eigenmodes**—certain locations oscillate violently (antinodes) while curves between them remain almost motionless (nodal lines).

The chamber maintains an exponentially smoothed root-mean-square pressure field $E(x, y) = p_{\text{rms}}^2$ and drives $2{,}000$ sand grains along $-\nabla E$ with vibration agitation proportional to $\sqrt{E(x, y)}$. Grains sitting on loud antinodes bounce rapidly until they drift into dark nodal valleys where the air stands still.

**Experiment 2 — Freeze a standing wave in sand.** Select **Bare Stone Bathhouse**, press **Continuous Tone**, and watch the top peaks listed below the **Eigenmode Spectrum** plot. Click any resonant peak chip (for example around $245\text{ Hz}$) to lock the tone directly onto that room mode, wait a few seconds as $E(x, y)$ stabilizes, and watch the bone-ivory **Chladni Sand** trace crisp geometric nodal curves across the bathhouse floor. Press **Scatter Sand** to test how reliably the same standing wave re-carves the pattern.

## 3. Hearing Architecture: Room Impulse Responses and Convolution

If a linear room produces response $h(t)$ to an impulse $\delta(t)$, then any dry input signal $x(t)$ emerges at the listener microphone as the convolution integral:

$$
y(t) = (x * h)(t) = \int_0^t x(\tau)\, h(t - \tau)\, d\tau.
$$

From $h(t)$ we separate **Direct Arrival ($t_0$)**, **Early Reflections ($t_0$ to $t_0 + 80\text{ ms}$)** that reinforce loudness and speech clarity, and the **Late Tail ($> t_0 + 80\text{ ms}$)** that creates enveloping bloom or muddy wash. Integrating energy backward from the end of the recording produces the **Schroeder Decay Curve**:

$$
L(t) = 10 \log_{10}\left(\frac{\int_t^{T_{\text{rir}}} h(\tau)^2 \, d\tau}{\int_0^{T_{\text{rir}}} h(\tau)^2 \, d\tau}\right),
$$

whose linear slope gives the reverberation time **$RT_{60}$** (time for sound energy to decay by $60\text{ dB}$), while the ratio of early-to-late energy defines **Clarity $C_{80}$** in decibels. Crucially, the Web Audio `ConvolverNode` runs with automatic normalization disabled (`convolver.normalize = false`) and a single fixed calibration gain, preserving genuine acoustic loudness differences between rooms.

**Experiment 3 — Walk from a stone bathhouse into an anechoic chamber.** Click **Enable Room Audio**, switch to **Bare Stone Bathhouse**, and press **Dry Pluck** or **Audition Clap**. Notice the negative Clarity $C_{80}$ and long ringing tail. Now switch to **Anechoic Foam Wedge Chamber** and press **Dry Pluck** again: the porous wedges absorb almost every reflection, $C_{80}$ leaps upward, and the pluck snaps dead instantly. Toggle **Room Wet** vs. **Dry Source** to compare the raw dry excitation directly against the room's physical filtering.

## 4. Bending and Scattering Sound: Lenses, Slits, Diffusers, and Helmholtz Traps

Architecture shapes sound with more than bare flat walls:

- **Refractive Slow-Air Lenses** slow sound to $c = 0.55\,c_0$ ($n = 1.82$), bending wavefronts inward by Snell's law just as glass bends light.
- **Double-Slit Apertures** diffract plane-like waves into twin circular wavelets that cancel along hyperbolic nodal lanes.
- **Quadratic Residue Diffusers (QRDs)** use prime-depth wells to scatter reflections evenly in phase across angles instead of producing a harsh specular slap echo.
- **Helmholtz Resonators** couple a small enclosed cavity of air to a narrow damped neck: at the cavity's resonant frequency $f_H$, air in the neck oscillates out of phase with incoming duct waves and cancels transmission downstream.

**Experiment 4 — Bend, diffract, and trap one pitch.** Load **Parabolic Dish & Slow-Air Lens** and fire a **Clap** to see a stone parabola collimate spherical waves into a beam that the central lens bends onto **Listener (L)**. Next load **Double-Slit Diffraction & Interference** with **Continuous Tone** at $420\text{ Hz}$ to watch sand trace interference hyperbolas. Finally load **Helmholtz Resonator Duct**, compare the transmission spectrum near $245\text{ Hz}$ (the resonator's trap notch) against $420\text{ Hz}$ (which passes freely down the duct), or pick **Helmholtz Cavity** in the brush dock to click-stamp extra side-branch traps of your own.

## 5. Acoustic Reciprocity: Why Trading Places Sounds Identical

In any linear, time-invariant acoustic medium with symmetric boundary conditions, Green's function satisfies Helmholtz reciprocity:

$$
G(\mathbf{r}_B, \mathbf{r}_A; t) = G(\mathbf{r}_A, \mathbf{r}_B; t).
$$

Even inside an asymmetric hall packed with angled baffles, porous seating blocks, and a rear slotted diffuser, the pressure history recorded at $B$ from a clap at $A$ must match the pressure history recorded at $A$ from an identical clap at $B$.

**Experiment 5 — Swap Source ↔ Probe.** Load **Shoebox Concert Hall** (or sketch an asymmetric room of your own with the **Stone Wall** and **Porous Foam** brushes). Let the RIR telemetry finish, then press **Swap Source ↔ Probe**. The chamber trades **Emitter (S)** and **Listener (L)** while retaining the previous waveform as a dashed coral **Previous RIR (Ghost)** trace on the oscillogram. Watch the live cyan waveform align over the dashed trace peak-for-peak and verify the measured normalized cross-correlation $\rho(S \leftrightarrow L) > 0.98$.

## 6. What This 2D Chamber Explains — and What It Leaves Out

Real concert halls and bedrooms are three-dimensional volumes where sound spreads spherically ($1/r$ amplitude decay rather than cylindrical $1/\sqrt{r}$ decay in 2D), reflects off floors and ceilings, encounters frequency-dependent thermoviscous losses in air and upholstery, and bends slightly around air-temperature gradients. Likewise, a discrete $0.0625\text{ m}$ lattice introduces numerical dispersion above roughly $1{,}000\text{ Hz}$, which is why excitations are band-limited around $420\text{ Hz}$ and upsampled through an anti-imaging low-pass filter before reaching your speakers. Within those clear boundaries, every wave front, nodal ridge, Schroeder slope, and convolved clap above comes straight from solving the acoustic wave PDE live in your browser.

---

### Sources & Further Reading

- John William Strutt (Lord Rayleigh), *The Theory of Sound* (Macmillan, 1877; Dover reprint) — foundational theory of room modes, Helmholtz resonators, and acoustic reciprocity.
- Manfred R. Schroeder, [*New Method of Measuring Reverberation Time*](https://doi.org/10.1121/1.1909343), *Journal of the Acoustical Society of America* 37 (1965), pp. 409–412 — backward energy integration for $RT_{60}$.
- Ernst Florens Friedrich Chladni, *Entdeckungen über die Theorie des Klanges* (1787) — discovery of standing-wave nodal sand figures.
- Heinrich Kuttruff, *Room Acoustics* (CRC Press) — architectural clarity metrics ($C_{80}$), QRD diffusers, and porous absorption physics.
- Julius O. Smith III, *Physical Audio Signal Processing* (W3K Publishing) — FDTD waveguide equivalence, dispersion analysis, and digital convolution.

### Related Writing & Interactive Laboratories

- [The Equation That Eats Its Own Tail](/blog/mathematics/the-equation-that-eats-its-own-tail) — how the 1D wave equation and other partial differential equations encode change across space and time.
- [Binaural Acoustic Soundboard](/blog/visualizations/binaural-acoustic-soundboard) — procedural Web Audio synthesis for ambient noise and stereo binaural tones.
- [The Strange Attractor Orchestra: When Chaos Learns to Sing](/blog/visualizations/the-strange-attractor-orchestra) — real-time deterministic dynamical systems coupled to Web Audio sonification.
- [The Chemistry That Draws Without a Hand: A Reaction–Diffusion Atlas](/blog/visualizations/reaction-diffusion-atlas) — parabolic pattern-forming PDEs on a 2D grid.

<style>
	:global(.article-prose .math-display) {
		max-width: 100%;
		overflow-x: auto;
		overflow-y: hidden;
		overscroll-behavior-inline: contain;
		-webkit-overflow-scrolling: touch;
	}
</style>
