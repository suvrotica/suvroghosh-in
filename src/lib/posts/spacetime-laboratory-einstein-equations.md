---
title: "Spacetime Laboratory"
description: "An interactive shader laboratory for exploring black holes, gravitational lensing, cosmic expansion, gravitational waves, and Einstein’s field equation."
date: "2026-07-22"
dateModified: "2026-10-20"
thumbnail: "/images/spacetime-laboratory-einstein-equations.webp"
thumbnailAlt: "A black hole bending starlight into arcs and an Einstein ring beside a luminous warped accretion disk"
category: "Visualizations"
tags: ["General Relativity", "Black Holes", "Gravitational Lensing", "Cosmology", "Gravitational Waves", "Interactive Physics", "Schwarzschild Geometry", "Kerr Geometry", "Charged Black Holes", "FLRW Cosmology"]
pinnedTags: ["General Relativity", "Black Holes", "Gravitational Lensing", "Cosmology", "Gravitational Waves", "Interactive Physics", "Schwarzschild Geometry", "Kerr Geometry", "Charged Black Holes", "FLRW Cosmology"]
published: true
color: "#161A2B"
author: "Suvro Ghosh"
readingTime: "32 min"
inPlainEnglish: "There is one Einstein equation, but it has many solutions — each solution is a different universe. This interactive page lets you fly a camera through nine of those universes in your browser, bend light around black holes, expand a cosmos, and stretch a ring of test particles with a passing gravitational wave."
keyTerms: ["Einstein field equation", "Metric tensor", "Schwarzschild metric", "Kerr metric", "FLRW cosmology", "Cosmological constant", "Gravitational waves", "Gravitational lensing", "Null geodesic", "Geometrized units"]
faq:
  - question: "Does the shader solve Einstein’s field equation in real time?"
    answer: "No. The page numerically integrates Schwarzschild and subextremal or extremal Reissner–Nordström light rays, integrates a homogeneous FLRW expansion history, and uses teaching approximations for the other scenes. It does not solve the field equation for arbitrary matter."
  - question: "Are the visual effects physically accurate?"
    answer: "Accuracy varies by mode. Spherical black-hole rays use null-geodesic equations with finite numerical error; Kerr rays and all disk colours are illustrative. FLRW uses the mixed-density Friedmann equations, while its sky is a diagram. The wave ring uses linear strain geometry with a labelled display magnification. None of these scenes is an observatory-grade image."
  - question: "Why does the laboratory use geometrized units?"
    answer: "Setting G = c = 1 removes enormous and tiny powers of ten from the arithmetic, which keeps the GPU’s floating-point numbers in a comfortable range. Lengths and times are then both measured in units of the black hole’s mass."
  - question: "What is the difference between the event horizon and the black-hole shadow?"
    answer: "For a Schwarzschild hole, the horizon is at r_s = 2GM/c². For a very distant static observer, the shadow’s critical impact parameter is 3√3 GM/c², about 2.6 r_s; its diameter is about 5.2 r_s. The apparent angular size also depends on the observer."
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

This page is a small interactive museum built around that reversal. One equation hangs on the wall; behind nine doors are nine solutions and limits it permits. The interactive view needs a browser with working WebGL2 support; the equations, graphs and explanatory panels remain available when that graphics context cannot be created.

<SpacetimeLaboratory
	title="Spacetime Laboratory"
	caption="Nine solutions and limits of one equation: numerical spherical light rays, an integrated expansion history, and clearly labelled teaching diagrams. WebGL2 is required for the animated view."
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

A fragment shader is a small program that the GPU runs once per pixel. The laboratory's black-hole views do the following, within the numerical budget selected by the quality control:

1. Build a camera ray from the observer through this pixel.
2. Sample a deterministic procedural sky — stars with varied temperature and brightness, a Milky-Way band, sparse galaxies — seeded so that split-screen comparisons always see the same universe.
3. For Schwarzschild and Reissner–Nordström, integrate the spherical null-geodesic equations using fourth-order Runge–Kutta steps. For Kerr and weak gravity, use a labelled bending approximation instead.
4. Decide the ray’s fate: it escapes to the sky, crosses the accretion disk and collects its light, or passes the event horizon — in which case it never returns, and the pixel is dark.
5. Colour the disk and sky with illustrative shift and brightness effects, then apply tone mapping. These colours are not a radiative-transfer calculation.

The shader **does not solve the Einstein field equation**. Its spherical black-hole ray equations follow from the known metrics, but their numerical trajectories have finite error. Near the shadow edge a ray can loop repeatedly and exhaust the step budget; faint higher-order images need particular caution. Kerr's spin-dependent swirl is an illustration, with no claim to the exact Kerr silhouette. The cosmology and wave sky patterns are diagrams, rather than integrations of light through their full metrics.

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

The **Newtonian weak-field** mode illustrates this regime with a bending approximation. The compactness and magnification sliders set its strength. The graph shows the inverse-impact-parameter trend; it is a reference curve, not a measurement extracted from the displayed pixels. At zero compactness the bending vanishes. Large compactness or magnification takes this illustration outside the weak-field approximation.

Newtonian gravity is not a competitor theory on a shelf here. It is the low-speed, weak-curvature **limit** of general relativity — which is precisely why the exaggeration slider exists. Real planetary lensing is arcseconds; the educational magnification is always labelled.

# Schwarzschild: the quiet black hole

In 1916, months after Einstein published his theory, Karl Schwarzschild found the first exact solution from the trenches of the Eastern Front: the geometry outside any spherically symmetric, non-rotating mass. In Schwarzschild coordinates:

$$
ds^2 = -\left(1-\frac{2GM}{rc^2}\right)c^2dt^2 + \left(1-\frac{2GM}{rc^2}\right)^{-1}dr^2 + r^2d\Omega^2
$$

Everything about a non-rotating black hole is in that line. The structure falls out of the radius at which the terms misbehave:

- **The Schwarzschild radius** $r_s = 2GM/c^2$. For the Sun, about 3 kilometres; for the black hole at our galaxy’s centre, about 12 million. Here the time coefficient tends to zero and the radial coefficient diverges. This is a **coordinate singularity**, rather than a divergence of spacetime curvature. The Kretschmann scalar, $K = 48G^2M^2/(c^4r^6)$, is finite at $r_s$ and diverges only at $r = 0$.
- **The event horizon** sits at $r = r_s$. It is not a material surface. Nothing blocks you there; no wall, no membrane, no sign. It is a one-way causal boundary: light emitted inside it never reaches the outside universe. The shader honours this honestly — rays crossing the horizon are terminated not because they hit something, but because they cannot come back.
- **The photon sphere** at $r = 3GM/c^2 = 1.5\,r_s$: the radius where light itself can (unstably) orbit. Photons arriving near this radius loop the hole one or more times before escaping — this is what produces the higher-order “ghost” images of the disk.
- **The ISCO** at $r = 6GM/c^2 = 3\,r_s$: the innermost stable circular geodesic for massive particles in Schwarzschild spacetime. The default disk starts there, but its edge is an editable illustration rather than a simulated accretion flow.
- **The shadow**: for a very distant static observer, the critical impact parameter is $3\sqrt{3}\,GM/c^2 \approx 2.6\,r_s$. That is a radius in the observer's image plane; the corresponding shadow diameter is about $5.2\,r_s$. Close observers require an angular calculation.

Turn on the horizon, photon-sphere, and ISCO guides and slide the observer inward. These circles mark reference radii schematically; they are not lensed images of material surfaces. The annular disk is sampled where traced rays cross its plane, so far-side light can appear above and below the shadow.

The clock panel reports $d\tau/dt = \sqrt{1 - r_s/r}$ for a **static** observer held at the chosen radius, relative to Schwarzschild time at infinity. This ratio tends to zero near the horizon. It is not the clock formula for an orbiting or falling camera. A freely falling traveller crosses a sufficiently large hole's horizon in finite proper time; the static-observer formula does not describe that journey.

# Kerr: when spacetime itself is dragged around

Real black holes spin, and spin changes the geometry qualitatively. The Kerr solution (1963) describes a rotating black hole. Its full metric is long enough that it lives in the collapsible section below; its structure is defined by two functions:

$$
\Sigma = r^2 + a^2\cos^2\theta, \qquad \Delta = r^2 - \frac{2GMr}{c^2} + a^2
$$

where $a$ is the angular momentum per unit mass, in geometrized units. The horizons solve $\Delta = 0$: $r_\pm = M \pm \sqrt{M^2 - a^2}$ (with $G = c = 1$). They exist only when $a \le M$ — the **extremal limit** — which is why the spin slider stops at 0.998 and will not quietly let you build a naked singularity.

Rotation introduces an effect with no Newtonian analogue: **frame dragging**. Between the outer horizon and the **stationary-limit surface**, $r = M + \sqrt{M^2 - a^2\cos^2\theta}$, a worldline cannot stay at fixed Boyer–Lindquist spatial coordinates. The outer surface meets the equator at $2M$. In the exact Kerr solution:

- the shadow is **offset and deformed**, flattened on the prograde side;
- prograde photons swing closer to the hole than retrograde ones;
- the disk’s approaching side is boosted brighter and bluer by relativistic beaming; the receding side dims and reddens;
- stable prograde orbits exist closer to the horizon than any orbit in Schwarzschild.

The laboratory's Kerr view illustrates this handedness with a spin-dependent swirl. Its analytic horizon and prograde equatorial ISCO readouts are quantitative; its shadow deformation and disk appearance are not. At zero spin it uses the spherical Schwarzschild ray calculation. An equatorial reference circle cannot depict the full angle-dependent ergosphere.

<details>
<summary>The full Kerr metric, for the patient</summary>

In Boyer–Lindquist coordinates, with $\Sigma$ and $\Delta$ as defined above and $G = c = 1$:

$
ds^2 = -\left(1 - \frac{2Mr}{\Sigma}\right)dt^2 - \frac{4Mra\sin^2\theta}{\Sigma}\,dt\,d\phi + \frac{\Sigma}{\Delta}dr^2 + \Sigma\,d\theta^2 + \left(r^2 + a^2 + \frac{2Mra^2\sin^2\theta}{\Sigma}\right)\sin^2\theta\,d\phi^2
$

The mixed $dt\,d\phi$ term is frame dragging made algebraically explicit: the geometry couples time and rotation. Setting $a = 0$ returns the Schwarzschild line element. This displayed equation explains the physics; the spinning scene does not numerically integrate the full equation.

</details>

# Charged black holes and mathematical edge cases

The Reissner–Nordström solution adds electric charge $Q$ to the Schwarzschild geometry:

$$
f(r) = 1 - \frac{2GM}{rc^2} + \frac{GQ^2}{4\pi\varepsilon_0 r^2 c^4}, \qquad ds^2 = -f(r)\,c^2dt^2 + \frac{dr^2}{f(r)} + r^2 d\Omega^2
$$

Charge contributes a *repulsive* $1/r^2$ term — the electromagnetic field’s energy fights the attraction. The horizons now solve $f(r) = 0$, giving two of them, $r_\pm = M \pm \sqrt{M^2 - Q^2}$ in geometrized units: an outer event horizon and an inner (Cauchy) horizon. As $Q \to M$ they merge into one **extremal** horizon.

Push the charge slider past 1 and the panel reports that there are no horizons. The renderer stops the black-hole calculation in this naked-singularity regime; it does not silently clamp the charge to an extremal hole or simulate the singular interior.

A candid caveat: astrophysical black holes are expected to carry negligible sustained net charge — a charged hole in a plasma universe neutralizes quickly. This mode is a window into the *mathematical family* of solutions, not a portrait of anything likely overhead.

# FLRW: the geometry of an expanding universe

Zoom out from one black hole to the whole cosmos. Assuming the universe is homogeneous and isotropic on large scales, the field equation admits the Friedmann–Lemaître–Robertson–Walker metric:

$$
ds^2 = -c^2dt^2 + a(t)^2\!\left(\frac{dr^2}{1 - kr^2} + r^2d\Omega^2\right)
$$

The **scale factor** $a(t)$ describes the homogeneous expansion; $k \in \{-1, 0, +1\}$ labels open, flat, and closed spatial curvature. The background obeys

$$
\left(\frac{H}{H_0}\right)^2 = \frac{\Omega_r}{a^4} + \frac{\Omega_m}{a^3} + \frac{\Omega_k}{a^2} + \Omega_\Lambda,
\qquad \Omega_k = 1 - \Omega_m - \Omega_r - \Omega_\Lambda.
$$

The laboratory integrates this mixed-density background from a reference epoch with $a=1$. Its graph, grid scale and redshift readout use the same history. The animated sky remains a schematic picture; it does not place sources on a computed past light cone. The colour shift compares emission at that reference epoch with observation at the current epoch, using $1+z=a_{\text{observed}}/a_{\text{emitted}}$. It is not inferred from each drawn galaxy's distance. The equations and density closure follow the [Friedmann background in David Tong's cosmology notes](https://www.damtp.cam.ac.uk/user/tong/cosmo/cosmohtml/S1.html).

Two things this mode is careful *not* to say. First, expansion is not galaxies flying outward through a static box — that is why the grid expands with the metric rather than the dots drifting across a fixed frame. Second, expansion does not stretch bound systems. Atoms, people, planets, and galaxies are held together by forces far stronger than the local Hubble drag; they do not swell with the universe. Only the distances between gravitationally unbound structures grow.

Radiation, matter, curvature and dark energy all contribute to the integration. The familiar single-fluid power laws are analytical checks, rather than a substitute for the mixed history. The normalized time axis is $H_0\Delta t$ from the reference epoch. Each simulation second advances $0.04\,(70\ \mathrm{km\,s^{-1}\,Mpc^{-1}})^{-1}$ times the expansion-speed setting; the chosen $H_0$ determines the dimensionless evolution. Selecting open, flat or closed rescales the density mix to totals 0.75, 1 or 1.25 respectively. Subsequent density edits set the curvature through the closure relation. The comoving/proper grid toggle changes the drawing convention, not the calculated history. A contracting solution is followed to the displayed small-scale cutoff; very large scale factors and very late times also have explicit display limits.

# The cosmological constant

Set $T_{\mu\nu} = 0$ and keep only $\Lambda$:

$$
G_{\mu\nu} + \Lambda g_{\mu\nu} = 0
$$

Empty space still has geometry, and $\Lambda$ decides its character. With $\Lambda > 0$ you get **de Sitter space**: its flat slicing has exponential expansion, $a(t) \propto e^{Ht}$, and a comoving observer's **cosmological event horizon** has proper radius $c/H$. The marker here is a schematic shrinking circle, rather than a calibrated angular image. In general cosmology, recession faster than light does not by itself imply permanent causal disconnection.

With $\Lambda < 0$ you get **anti-de Sitter space**, with curvature scale $L$ and a timelike conformal boundary. Its global causal structure and boundary conditions differ from de Sitter's; replacing $H$ by a negative number in an exponential is not an AdS model. The view here uses a patterned distortion as a teaching metaphor. Its graph shows the analytic static-coordinate clock factor $\sqrt{1+r^2/L^2}$, not an expansion history. AdS is central to the holographic correspondence, AdS/CFT.

These two screen views do not integrate their global null geodesics. Use the equations and graph for the stated analytical relations, and the sky patterns as illustrations.

# Gravitational waves: geometry in motion

Linearize the field equation around flat space — $g_{\mu\nu} = \eta_{\mu\nu} + h_{\mu\nu}$ with $|h_{\mu\nu}| \ll 1$ — and the vacuum equation becomes a wave equation. The solutions are **gravitational waves**: propagating perturbations of the metric itself, travelling at $c$, with two polarizations, plus and cross. They are not waves moving *through* a medium; the geometry is the thing waving.

A ring of test particles makes the effect visible. At linear order, a plus-polarized wave gives fractional changes $+h/2$ and $-h/2$ along perpendicular axes. Cross polarization rotates these axes by 45°. Detector orientation matters: the fixed horizontal and vertical arms drawn here respond to plus polarization, while a pure cross wave has zero first-order length response in those particular arms.

Astrophysical waves reaching Earth can have strain of order $10^{-21}$. **Physical scale** now applies that small input without magnification, producing no visible deformation. The exaggerated mode multiplies it by the displayed factor, with peak display strain capped at 0.5 to keep the diagram legible. At that magnification the picture exceeds the small-strain regime, so it is not a quantitative strong-wave solution. The repeating chirp sweeps an invented frequency and envelope; it is not a fitted binary-merger waveform.

# What the visualization calculates

- **Spherical null rays.** Schwarzschild and charged black-hole modes use the spherical static metric's null-geodesic equations, initialized in a static observer's orthonormal frame, with finite Runge–Kutta steps.
- **Analytical readouts.** Horizon radii, circular photon orbits, applicable ISCO radii and static-clock factors depend on the selected model. Kerr has no single spherical photon-orbit radius.
- **A mixed FLRW background.** Matter, radiation, curvature and vacuum energy determine one expansion history, shared by the graph and diagram. This is a homogeneous background calculation, not a cosmological sky survey.
- **A linear wave diagram.** The test ring uses tensor strain with the $h/2$ displacement and a 45° rotation between plus and cross.
- **Deterministic sky.** One seeded star field serves every mode, so comparisons are controlled experiments.

Black-hole scene lengths use **geometrized units** with $G=c=M=1$: one scene unit is $GM/c^2$, and the Schwarzschild horizon is at 2 units. The physical conversion is $r_s=2GM/c^2\approx2.95\ \text{km}$ per solar mass. Changing solar mass changes this physical scale; with camera and disk radii held in $M$, it does not enlarge the normalized image. Cosmology and wave scenes use their separately labelled presentation units. The metric signature is $(-,+,+,+)$.

# What the visualization deliberately simplifies

This section is part of the exhibit, not fine print.

- It does **not** solve the Einstein field equation from arbitrary matter distributions.
- It does not simulate black-hole formation, full numerical relativity, or magnetohydrodynamic accretion.
- The spinning Kerr view is a bending and swirl approximation. Its silhouette is not a verified Kerr shadow.
- The disk is a thin annulus with an illustrative velocity and colour model. Brightness, redshift colours and beaming are not a calibrated radiative-transfer calculation.
- Gravitational-wave strain and weak-field lensing are magnified by labelled exaggeration factors.
- FLRW, de Sitter and anti-de Sitter sky patterns are schematic. Only the explicitly stated background and analytical relations are quantitative.
- The embedding-diagram language elsewhere in physics (rubber sheets, funnels) is a teaching analogy for a spatial slice. Spacetime does not bend *into* anything; there is no external dimension receiving the dip.

# Experiments to try

1. **Compare spherical shadows.** Keep the same camera and sky, then compare Schwarzschild with charged Reissner–Nordström at zero charge. They should agree. Increase charge below the extremal limit and compare the analytical radii.
2. **Separate numbers from illustrations.** Change Kerr spin and watch its horizon and prograde ISCO readouts. Treat the accompanying swirl as an illustration, rather than a precision test of Kerr lensing.
3. **Check a static clock.** At $r=3M$ in Schwarzschild mode the ratio should be $d\tau/dt=1/\sqrt{3}$. Move toward the minimum allowed radius, $2.1M$, and watch it decrease.
4. **Change the cosmic contents.** In FLRW mode adjust matter and dark energy, then compare the resulting mixed-density graph. Toggle comoving/proper grid drawings without changing the calculated scale factor.
5. **Compare polarizations and detector orientation.** Switch plus to cross with the ring enabled: the principal axes rotate 45°. The fixed screen-axis detector arms have a different response.
6. **Remove magnification.** Choose physical wave strain and observe the ring become visually circular. Return to the amplified mode and read its actual display factor and cap.
7. **Test the controls.** Zero weak-field compactness, RN charge, Kerr spin or wave amplitude separately. Compactness removes weak bending, zero charge gives Schwarzschild, zero spin selects spherical rays, and zero amplitude removes the wave deformation. These are different physical limits.

# Where the equations stop being comfortable

The laboratory ends where honesty requires it. Inside the Schwarzschild radius, the roles of the $t$ and $r$ coordinates exchange; the singularity at $r = 0$ is not a place but a moment that cannot be avoided. The Kerr interior contains a Cauchy horizon beyond which predictability fails. Extremal and super-extremal regimes brush against the cosmic-censorship conjecture, unproven after half a century. The FLRW metric extrapolated backward meets the Big Bang singularity, where the classical equation simply stops being the right theory. And the cosmological constant — measured, nonzero, and tiny in units where it has no business being tiny — is either the deepest clue in physics or the most expensive red herring ever purchased.

One equation. Many universes. The sliders are yours; the geometry does not negotiate.

## What this laboratory does—and does not calculate

**It does:** numerically integrate spherical black-hole light rays and a homogeneous FLRW background; report selected analytical radii and clock factors; and draw labelled illustrations for rotating holes, waves and cosmological skies.

**It does not:** solve arbitrary Einstein equations; simulate black-hole formation or full numerical relativity; model realistic accretion flows; produce observatory-grade images; display four-dimensional spacetime; or claim that a rubber-sheet picture is physically literal.

## Technical note: numerical methods and performance

- **Spherical ray integration.** Fourth-order Runge–Kutta uses radius-scaled finite steps and a quality-dependent step budget, with escape and capture checks. The static spherical shadow boundary is classified from the analytical photon potential. Finite trajectories, disk crossings and higher-order images still depend on numerical resolution. The highest quality setting is a larger rendering budget, not a research certification.
- **Kerr.** A spin-dependent swirl supplies an illustrative asymmetry. The full Kerr geodesic equations are not integrated.
- **FLRW.** Fourth-order Runge–Kutta integrates the acceleration equation from $a=1$, including recollapse when the selected background turns around. Analytical single-fluid and flat matter-plus-vacuum limits, the Friedmann constraint and time controls are tested independently.
- **Determinism.** The sky is hashed from a single integer seed; split-screen and shared URLs reproduce the identical universe.
- **Runtime limits.** A hard iteration cap bounds GPU work. Initialization, shader compilation and context-loss failures have distinct error handling. WebGL resources are released on navigation. Frame rate depends on the GPU, browser, viewport and quality setting; there is no guaranteed 60 fps.
- **Accessibility and fallback.** Reduced motion pauses animation; controls and explanations remain available if WebGL2 cannot initialize. A poster is an illustration, not evidence that the live renderer is running.

| Parameter | Physical meaning | Visible effect |
| --- | --- | --- |
| Mass $M$ | Central gravitating mass | Changes physical distance scale; normalized image stays fixed at equal radii in $M$ |
| Compactness $GM/rc^2$ | Weak-field strength | Illustrative deflection |
| Spin $a/M$ | Kerr rotation rate | Analytical horizon and prograde ISCO; illustrative swirl |
| Charge $Q/Q_*$ | Normalized electric charge | Charged spherical rays, model-specific radii and extremal warning |
| $a(t)$, $H_0$, $\Omega$ | FLRW expansion history | Integrated background, schematic grid and reference-epoch redshift |
| $\Lambda$ | Vacuum energy | Analytical reference graph with a schematic sky |
| Strain $h$ | GW metric perturbation | Breathing ring, alternating arm lengths |
| Observer $r$, $\theta$ | Camera position | Dilation readout, shadow angular size |
| Integration steps | Numerical budget | Accuracy of bending vs. frame rate |
