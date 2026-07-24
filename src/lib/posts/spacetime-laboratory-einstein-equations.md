---
title: "Spacetime Laboratory"
description: "An interactive shader laboratory for exploring black holes, gravitational lensing, cosmic expansion, gravitational waves, and Einstein’s field equation."
date: "2026-07-22"
dateModified: "2026-07-24"
thumbnail: "/images/spacetime-laboratory-einstein-equations.webp"
thumbnailAlt: "A black hole bending starlight into arcs and an Einstein ring beside a luminous warped accretion disk"
category: "Visualizations"
tags: ["Boyer Lindquist","Black Holes","Anti-De Sitter","Visualization Deliberately Simplifies","Cosmological Constant","Horizon","Schwarzschild","Metric","Frac","Geometry"]
published: true
color: "#161A2B"
author: "Suvro Ghosh"
readingTime: "32 min"
inPlainEnglish: "There is one Einstein equation, but it has many solutions — each solution is a different universe. This interactive page lets you fly a camera through nine of those universes in your browser, bend light around black holes, expand a cosmos, and stretch a ring of test particles with a passing gravitational wave."
keyTerms: ["Einstein field equation", "Metric tensor", "Schwarzschild metric", "Kerr metric", "FLRW cosmology", "Cosmological constant", "Gravitational waves", "Gravitational lensing", "Null geodesic", "Geometrized units"]
faq:
  - question: "Does the shader solve Einstein’s field equation in real time?"
    answer: "No. The field equation is a set of ten coupled nonlinear partial differential equations; solving it for arbitrary matter requires supercomputers. The page evaluates known exact solutions — Schwarzschild, Kerr, FLRW, and others — and propagates light through them with a fast, stable integration scheme."
  - question: "Are the visual effects physically accurate?"
    answer: "The qualitative geometry is faithful: shadow sizes, photon-sphere radii, frame-dragging direction, redshift sign, and horizon formulas all match the exact solutions. Effects that are far too small to see — gravitational-wave strain of about 10⁻²¹, for instance — are magnified by clearly labelled exaggeration factors."
  - question: "Why does the laboratory use geometrized units?"
    answer: "Setting G = c = 1 removes enormous and tiny powers of ten from the arithmetic, which keeps the GPU’s floating-point numbers in a comfortable range. Lengths and times are then both measured in units of the black hole’s mass."
  - question: "What is the difference between the event horizon and the black-hole shadow?"
    answer: "The horizon is the boundary in spacetime beyond which no signal can escape, at r = 2GM/c² for a non-rotating hole. The shadow is the larger dark disk actually seen by a distant observer, about 2.6 times wider, because gravity captures light rays aimed even somewhat wide of the horizon."
---

<script>
	import SpacetimeLaboratory from '$lib/components/visualizations/spacetime-laboratory/SpacetimeLaboratory.svelte';
</script>

<TTS />

<Pi
	src="/images/spacetime-laboratory-einstein-equations.webp"
	alt="A black hole bending starlight into arcs and an Einstein ring beside a luminous warped accretion disk"
	caption="The universe is not drawn on graph paper. Starlight passing a black hole arrives curved, shifted, and sometimes multiplied — behaviour you can steer in the laboratory below."
/>

There is a quiet moment in every physics education when the furniture of common sense is pushed against the wall. For me it was the realization that the question “where did that photon go?” does not have an answer written anywhere in space. Space, it turns out, is not the stage. It is one of the actors.

This page is a small interactive museum built around that reversal. One equation hangs on the wall; behind nine doors are nine different universes it permits. You can walk a camera through each of them, in the browser, on the graphics card you already own.

<SpacetimeLaboratory
	title="Spacetime Laboratory"
	caption="Nine solutions and limits of one equation, rendered by tracing light through curved geometry in a WebGL2 fragment shader."
/>

# The universe is not drawn on graph paper

School physics begins on graph paper. Distances are measured with rulers that do not stretch, times with clocks that do not drift, and light travels obediently along the grid lines. This is not a bad approximation — it is spectacularly good for throwing a cricket ball or landing a probe on the Moon, given a little help. But it is an approximation.

General relativity replaces the fixed stage with a dynamic one. The central claim is not that gravity is a force pulling objects through space. It is that matter and energy alter the geometry of spacetime itself, and free objects — planets, photons, you, falling — follow the straightest available paths within that curved geometry. What we call the “force” of gravity is the geometry asserting itself.

The practical consequence is startling: to know what the universe looks like, you must first specify its geometry. Change the geometry and the same star field, the same galaxy, the same ring of dust will look different — bent, reddened, multiplied, dragged sideways, stretched apart.

# One equation, many possible spacetimes

It is important to be precise here, because popular writing often speaks of “Einstein’s equations” as though there were a shelf of unrelated formulas, one for black holes, one for cosmology, one for gravitational waves. There is one central equation — the Einstein field equation:

$$
G_{\mu\nu} + \Lambda g_{\mu\nu} = \frac{8\pi G}{c^4} T_{\mu\nu}
$$

That compact line is worth unpacking piece by piece, because every universe in the laboratory is hidden inside it:

- $g_{\mu\nu}$ is the **metric tensor** — the machinery for measuring intervals. Given two nearby events, the metric tells you their separation in space and time. Everything else is built from it.
- $G_{\mu\nu}$ is the **Einstein tensor**, a particular combination of the metric’s curvature, assembled so that it automatically respects the conservation of energy and momentum.
- $T_{\mu\nu}$ is the **stress–energy tensor** — the complete inventory of matter, energy, momentum, pressure, and stress at each point.
- $\Lambda$ is the **cosmological constant**, the energy density of empty space itself. Einstein called it his greatest blunder; the accelerating universe put it back on the payroll.
- $8\pi G/c^4$ is the **coupling constant**, the exchange rate between geometry and contents. Its smallness is why spacetime is so stiff — why you need a star’s worth of mass to bend it noticeably.

John Archibald Wheeler’s famous summary is the right way to hold it:

> Matter and energy tell spacetime how to curve; curved spacetime tells matter and light how to move.

Useful — but incomplete. The equation is nonlinear: gravity itself gravitates, and “the energy stored in the gravitational field” cannot be localized into a tidy entry in $T_{\mu\nu}$. The geometry on the left and the matter on the right must be solved *together*, self-consistently. That is why the equation is ten coupled nonlinear partial differential equations wearing a trench coat, and why exact solutions are treasures.

The different “universes” in this laboratory are not different equations. They are different **solutions and limits of this one equation**, obtained by choosing different distributions of mass, angular momentum, charge, pressure, and $\Lambda$ — and then asking what the geometry does to light.

# How a shader can bend a ray of light

A fragment shader is a small program that the GPU runs once per pixel. The laboratory’s version does the following, sixty times a second:

1. Build a camera ray from the observer through this pixel.
2. Sample a deterministic procedural sky — stars with varied temperature and brightness, a Milky-Way band, sparse galaxies — seeded so that split-screen comparisons always see the same universe.
3. March the ray forward through the selected metric. Far from mass, light goes straight; near mass, the ray’s direction is deflected at each step by an amount derived from the geometry, with smaller steps where curvature is strong.
4. Decide the ray’s fate: it escapes to the sky, crosses the accretion disk and collects its light, or passes the event horizon — in which case it never returns, and the pixel is dark.
5. Apply the accumulated gravitational redshift or blueshift, relativistic beaming from the disk’s orbital motion, and tone mapping.

Two honesty notes belong here, before you touch the controls. First, the shader **does not solve the Einstein field equation**. It evaluates known metrics — Schwarzschild, Kerr, FLRW, and friends — and integrates simplified null geodesics through them. Second, where an exact treatment would be too slow for a phone GPU (Kerr’s full geodesic equations are notoriously stiff), the laboratory uses a clearly-labelled curved-ray approximation tuned to reproduce the exact shadow, the photon-sphere capture, and the frame-dragging direction. The panels always say which is which.

# Flat spacetime: the control experiment

Every experiment needs a control, and ours is the Minkowski metric:

$$
ds^2 = -c^2\,dt^2 + dx^2 + dy^2 + dz^2
$$

Select **Flat spacetime** in the laboratory. Light rays travel in straight lines. The coordinate grid is regular. Stars sit exactly where the seed put them. Clocks at different positions tick at the same rate — the “What am I seeing?” panel will report a time dilation of exactly 1.

This is the universe of special relativity: no matter, no curvature, no surprises. Keep this picture in your head, because everything else on this page is a deviation from it.

# Weak gravity and the Newtonian limit

General relativity did not abolish Newton; it absorbed him. When gravity is weak and speeds are slow, the Einstein field equation reduces to Newton’s law, and the metric is only slightly dented:

$$
g_{00} \approx -\left(1 + \frac{2\Phi}{c^2}\right), \qquad \Phi = -\frac{GM}{r}
$$

The **Newtonian weak-field** mode shows this regime: mild lensing, mild redshift, gently curved trajectories — no shadow, no horizon. The compactness slider $GM/rc^2$ runs from a planet (essentially zero) toward a compact object. Watch the deflection-angle graph shrink as you pull back; at zero compactness the scene is indistinguishable from Minkowski space.

Newtonian gravity is not a competitor theory on a shelf here. It is the low-speed, weak-curvature **limit** of general relativity — which is precisely why the exaggeration slider exists. Real planetary lensing is arcseconds; the educational magnification is always labelled.

# Schwarzschild: the quiet black hole

In 1916, months after Einstein published his theory, Karl Schwarzschild found the first exact solution from the trenches of the Eastern Front: the geometry outside any spherically symmetric, non-rotating mass. In Schwarzschild coordinates:

$$
ds^2 = -\left(1-\frac{2GM}{rc^2}\right)c^2dt^2 + \left(1-\frac{2GM}{rc^2}\right)^{-1}dr^2 + r^2d\Omega^2
$$

Everything about a non-rotating black hole is in that line. The structure falls out of the radius at which the terms misbehave:

- **The Schwarzschild radius** $r_s = 2GM/c^2$. For the Sun, about 3 kilometres; for the black hole at our galaxy’s centre, about 12 million. The metric’s $r^2d\Omega^2$ part is fine here; the time and radial terms blow up. This is a **coordinate singularity** — an artefact of the coordinates, not a place where spacetime tears. The actual curvature invariant (the Kretschmann scalar, $K = 48G^2M^2/c^4r^6$) is perfectly finite at $r_s$ and diverges only at $r = 0$, the physical singularity.
- **The event horizon** sits at $r = r_s$. It is not a material surface. Nothing blocks you there; no wall, no membrane, no sign. It is a one-way causal boundary: light emitted inside it never reaches the outside universe. The shader honours this honestly — rays crossing the horizon are terminated not because they hit something, but because they cannot come back.
- **The photon sphere** at $r = 3GM/c^2 = 1.5\,r_s$: the radius where light itself can (unstably) orbit. Photons arriving near this radius loop the hole one or more times before escaping — this is what produces the higher-order “ghost” images of the disk.
- **The ISCO** at $r = 6GM/c^2 = 3\,r_s$: the innermost stable circular orbit for matter. Inside it, no circular orbit is stable; gas spirals in. This sets the inner edge of the accretion disk.
- **The shadow**: because gravity captures rays aimed even somewhat wide of the horizon, the dark region a distant observer sees is about $2.6\,r_s$ across — substantially larger than the horizon itself.

Turn on the horizon, photon-sphere, and ISCO overlays and slide the observer inward. Watch the disk — rendered as a thin annulus from the ISCO outward — warp *above and below* the shadow: that is light from the far side, bent over and under the hole. It is not a flat ring pasted behind a black circle.

One more honesty note, about clocks. The panel reports $d\tau/dt = \sqrt{1 - r_s/r}$ at your position: how your proper time compares to a distant clock. As you approach the horizon this ratio plunges toward zero — a distant watcher would see your signals arrive ever slower and redder, and (in principle) never see you cross. But *you* fall through in finite proper time, feeling nothing special at the horizon. The “freezing” is a property of the distant observer’s coordinates, not of the infalling traveller’s experience.

# Kerr: when spacetime itself is dragged around

Real black holes spin, and spin changes the geometry qualitatively. The Kerr solution (1963) describes a rotating black hole. Its full metric is long enough that it lives in the collapsible section below; its structure is defined by two functions:

$$
\Sigma = r^2 + a^2\cos^2\theta, \qquad \Delta = r^2 - \frac{2GMr}{c^2} + a^2
$$

where $a$ is the angular momentum per unit mass, in geometrized units. The horizons solve $\Delta = 0$: $r_\pm = M \pm \sqrt{M^2 - a^2}$ (with $G = c = 1$). They exist only when $a \le M$ — the **extremal limit** — which is why the spin slider stops at 0.998 and will not quietly let you build a naked singularity.

Rotation introduces an effect with no Newtonian analogue: **frame dragging**. Spacetime itself is wound around the spin axis. Inside the **ergosphere** — the region $r < M + \sqrt{M^2 - a^2\cos^2\theta}$, which touches the equator at $2M$ — nothing can remain stationary against the drag, not even light. The consequences are all visible in the laboratory:

- the shadow is **offset and deformed**, flattened on the prograde side;
- prograde photons swing closer to the hole than retrograde ones;
- the disk’s approaching side is boosted brighter and bluer by relativistic beaming; the receding side dims and reddens;
- stable prograde orbits exist closer to the horizon than any orbit in Schwarzschild.

Set spin to zero and the Kerr scene reduces smoothly to Schwarzschild — the control experiment again. Set it to 0.97 with the ergosphere overlay and watch the geometry acquire a handedness.

<details>
<summary>The full Kerr metric, for the patient</summary>

In Boyer–Lindquist coordinates, with $\Sigma$ and $\Delta$ as defined above and $G = c = 1$:

$
ds^2 = -\left(1 - \frac{2Mr}{\Sigma}\right)dt^2 - \frac{4Mra\sin^2\theta}{\Sigma}\,dt\,d\phi + \frac{\Sigma}{\Delta}dr^2 + \Sigma\,d\theta^2 + \left(r^2 + a^2 + \frac{2Mra^2\sin^2\theta}{\Sigma}\right)\sin^2\theta\,d\phi^2
$

The mixed $dt\,d\phi$ term is frame dragging made algebraically explicit: the geometry couples time and rotation. Setting $a = 0$ collapses every extra term and returns the Schwarzschild line element — the same limit the spin slider performs visually.

</details>

# Charged black holes and mathematical edge cases

The Reissner–Nordström solution adds electric charge $Q$ to the Schwarzschild geometry:

$$
f(r) = 1 - \frac{2GM}{rc^2} + \frac{GQ^2}{4\pi\varepsilon_0 r^2 c^4}, \qquad ds^2 = -f(r)\,c^2dt^2 + \frac{dr^2}{f(r)} + r^2 d\Omega^2
$$

Charge contributes a *repulsive* $1/r^2$ term — the electromagnetic field’s energy fights the attraction. The horizons now solve $f(r) = 0$, giving two of them, $r_\pm = M \pm \sqrt{M^2 - Q^2}$ in geometrized units: an outer event horizon and an inner (Cauchy) horizon. As $Q \to M$ they merge into one **extremal** horizon.

Push the charge slider past 1 and the laboratory refuses to pretend: you get an explicit warning that you have left the black-hole regime and entered naked-singularity territory, not a silent extrapolation.

A candid caveat: astrophysical black holes are expected to carry negligible sustained net charge — a charged hole in a plasma universe neutralizes quickly. This mode is a window into the *mathematical family* of solutions, not a portrait of anything likely overhead.

# FLRW: the geometry of an expanding universe

Zoom out from one black hole to the whole cosmos. Assuming the universe is homogeneous and isotropic on large scales, the field equation admits the Friedmann–Lemaître–Robertson–Walker metric:

$$
ds^2 = -c^2dt^2 + a(t)^2\!\left(\frac{dr^2}{1 - kr^2} + r^2d\Omega^2\right)
$$

All the dynamics live in the **scale factor** $a(t)$; $k \in \{-1, 0, +1\}$ labels open, flat, and closed spatial curvature. The laboratory replaces the central mass with a large-scale view: galaxies pinned to fixed *comoving* coordinates while the grid itself grows, proper distances stretch, and arriving light is redshifted by $1 + z = a_{\text{now}}/a_{\text{then}}$.

Two things this mode is careful *not* to say. First, expansion is not galaxies flying outward through a static box — that is why the grid expands with the metric rather than the dots drifting across a fixed frame. Second, expansion does not stretch bound systems. Atoms, people, planets, and galaxies are held together by forces far stronger than the local Hubble drag; they do not swell with the universe. Only the distances between gravitationally unbound structures grow.

The timeline graph beside the shader shows $a(t)$ for the dominant component you have selected: $a \propto t^{1/2}$ for radiation, $a \propto t^{2/3}$ for matter, exponential for dark energy. Switch between comoving and proper view and watch the same history told in two coordinate languages.

# The cosmological constant

Set $T_{\mu\nu} = 0$ and keep only $\Lambda$:

$$
G_{\mu\nu} + \Lambda g_{\mu\nu} = 0
$$

Empty space still has geometry, and $\Lambda$ decides its character. With $\Lambda > 0$ you get **de Sitter space**: exponential expansion, $a(t) \propto e^{Ht}$, and a **cosmological event horizon** at distance $c/H$ — beyond it, recession outruns light, and those regions are causally cut off from you permanently. Raise the strength slider and the horizon marker closes in.

With $\Lambda < 0$ you get **anti-de Sitter space**, a confining, saddle-like geometry in which light sent outward is refocused back toward the centre — visualized here as refocusing rays and repeating grid echoes. AdS is unphysical as a cosmology but central to modern theory: it is the stage on which the holographic correspondence (AdS/CFT) plays.

A caution the laboratory takes seriously: a two-dimensional screen cannot display the full global geometry of these spacetimes. What you see is an honest *metaphor with correct sign and scaling* — acceleration for positive $\Lambda$, confinement for negative — not a literal embedding.

# Gravitational waves: geometry in motion

Linearize the field equation around flat space — $g_{\mu\nu} = \eta_{\mu\nu} + h_{\mu\nu}$ with $|h_{\mu\nu}| \ll 1$ — and the vacuum equation becomes a wave equation. The solutions are **gravitational waves**: propagating perturbations of the metric itself, travelling at $c$, with two polarizations, plus and cross. They are not waves moving *through* a medium; the geometry is the thing waving.

A ring of test particles makes the effect visible. As a plus-polarized wave passes perpendicular to the ring, distances along one axis stretch while the perpendicular axis squeezes, then the reverse — the ring breathes into ellipses. Cross polarization is the same pattern rotated 45°. That differential stretching is exactly what interferometers like LIGO measure: two arms, kilometres long, changing length in opposite phase by less than a ten-thousandth of a proton’s width.

Which brings us to the necessary confession. Real astrophysical strain is $h \sim 10^{-21}$. Rendered literally, it would move the ring by far less than one ten-billionth of a pixel. The laboratory offers **Physical scale** — which multiplies the true strain by an always-displayed exaggeration factor (default ×10²¹) — and **Educational exaggeration**, an arbitrary visible amplitude. The current factor is shown in the panel at all times. The chirp mode sweeps frequency and amplitude upward like a compact-binary inspiral: geometry ringing as two black holes coalesce.

# What the visualization calculates

- **Known metrics, evaluated exactly.** Schwarzschild, Kerr (Boyer–Lindquist structure), Reissner–Nordström, FLRW, de Sitter, anti-de Sitter, Minkowski, and linearized gravity are drawn from the exact solutions.
- **Null-ray propagation through those metrics.** A curved-ray integrator marches each camera ray with adaptive step sizes — small near strong curvature, large far away — reproducing the exact shadow size, photon-sphere capture, disk warping, and frame-dragging direction.
- **Observer-dependent effects.** Gravitational redshift, Doppler beaming, time-dilation readouts, and cosmological redshift are computed per mode from the metric functions.
- **Deterministic sky.** One seeded star field serves every mode, so comparisons are controlled experiments.

Internally, everything runs in **geometrized units** $G = c = 1$: lengths and times are measured in units of the black-hole mass, which keeps the arithmetic in the GPU’s comfortable range. The article quotes SI; the conversion is $r_s = 2GM/c^2 \approx 2.95\ \text{km}$ per solar mass. The signature convention throughout is $(-, +, +, +)$.

# What the visualization deliberately simplifies

This section is part of the exhibit, not fine print.

- It does **not** solve the Einstein field equation from arbitrary matter distributions.
- It does not simulate black-hole formation, full numerical relativity, or magnetohydrodynamic accretion.
- The Kerr mode uses a curved-ray approximation with an exact frame-dragging direction — not a full Boyer–Lindquist geodesic integration, which is too stiff for real-time phone GPUs.
- The disk is a thin, optically thin annulus with a Keplerian velocity profile — not a radiative-transfer model.
- Gravitational-wave strain and weak-field lensing are magnified by labelled exaggeration factors.
- de Sitter and anti-de Sitter modes are signed, correctly-scaled metaphors — a screen cannot show you four-dimensional global geometry.
- The embedding-diagram language elsewhere in physics (rubber sheets, funnels) is a teaching analogy for a spatial slice. Spacetime does not bend *into* anything; there is no external dimension receiving the dip.

# Experiments to try

1. **Build an Einstein ring.** In Schwarzschild mode, drop the observer inclination to nearly zero and narrow the field of view. When observer, hole, and a bright background galaxy align, the galaxy smears into a full ring.
2. **Race prograde against retrograde.** In Kerr mode at spin 0.95, orbit the camera to each side of the disk. One side’s photons skim closer and arrive brighter — rotation has a handedness.
3. **Watch your clock diverge.** In Schwarzschild mode, slide the observer from $10\,r_s$ to $1.1\,r_s$ and read $d\tau/dt$ in the panel. Your proper time, relative to infinity, nearly stops — while nothing dramatic happens locally.
4. **Speak two coordinate languages.** In FLRW mode, toggle comoving versus proper view. Same history, same galaxies, two metrics’ worth of intuition.
5. **Compare the polarizations.** In gravitational-wave mode with the test ring on, switch plus to cross: the breathing ellipse rotates 45°.
6. **Close the horizon.** Raise the de Sitter strength and watch the cosmological horizon marker shrink toward you.
7. **Flatten everything.** Zero the mass, spin, charge, compactness, $\Lambda$, and wave amplitude one mode at a time. Every scene should relax back toward the Minkowski control. If it doesn’t, you’ve found a bug worth reporting.

# Where the equations stop being comfortable

The laboratory ends where honesty requires it. Inside the Schwarzschild radius, the roles of the $t$ and $r$ coordinates exchange; the singularity at $r = 0$ is not a place but a moment that cannot be avoided. The Kerr interior contains a Cauchy horizon beyond which predictability fails. Extremal and super-extremal regimes brush against the cosmic-censorship conjecture, unproven after half a century. The FLRW metric extrapolated backward meets the Big Bang singularity, where the classical equation simply stops being the right theory. And the cosmological constant — measured, nonzero, and tiny in units where it has no business being tiny — is either the deepest clue in physics or the most expensive red herring ever purchased.

One equation. Many universes. The sliders are yours; the geometry does not negotiate.

## What this laboratory does—and does not calculate

**It does:** evaluate known exact metrics; propagate light through them with a numerically stable simplified integrator; visualize coordinate- and observer-dependent effects; exaggerate tiny effects only with labels; and aim to be a teaching instrument.

**It does not:** solve arbitrary Einstein equations; simulate black-hole formation or full numerical relativity; model realistic accretion flows; produce observatory-grade images; display four-dimensional spacetime; or claim that a rubber-sheet picture is physically literal.

## Technical note: numerical methods and performance

- **Integration.** Camera rays are marched through the metric with adaptive step sizes (step ∝ radius, clamped), a maximum step budget set by the quality selector (56–224 steps), an escape radius, and a horizon test. The curved-ray scheme uses the exact far-field deflection rate $\propto r_s/r^2$ and is calibrated so the shadow edge, photon capture, and disk image match the exact Schwarzschild geodesics to within a few percent — the honest trade for 60 fps on an ordinary GPU.
- **Frame dragging** enters as the leading-order gravitomagnetic term $\propto a/r^3$, correct in sign and decay.
- **Determinism.** The sky is hashed from a single integer seed; split-screen and shared URLs reproduce the identical universe.
- **Safety.** NaN guards, a hard iteration cap, an invalid-state fallback colour, and shader error reporting are built in. WebGL resources are explicitly released on navigation, and the context is lost politely.
- **Accessibility.** Reduced-motion freezes animation and twinkle; every control is keyboard-reachable with visible focus; the non-WebGL fallback serves the poster, the equations, and the parameter table below.

| Parameter | Physical meaning | Visible effect |
| --- | --- | --- |
| Mass $M$ | Central gravitating mass | Larger shadow, wider lensing, stronger redshift |
| Compactness $GM/rc^2$ | Weak-field strength | Mild deflection and time dilation |
| Spin $a/M$ | Kerr rotation rate | Frame dragging, offset shadow, disk asymmetry |
| Charge $Q/Q_*$ | Normalized electric charge | Smaller shadow, double horizon, extremal warning |
| $a(t)$, $H_0$, $\Omega$ | FLRW expansion history | Stretching grid, cosmological redshift |
| $\Lambda$ | Vacuum energy | Acceleration (positive Λ) or confinement (negative Λ) |
| Strain $h$ | GW metric perturbation | Breathing ring, alternating arm lengths |
| Observer $r$, $\theta$ | Camera position | Dilation readout, shadow angular size |
| Integration steps | Numerical budget | Accuracy of bending vs. frame rate |
