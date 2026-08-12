# Scientific scope and equations

> Integration note: this document covers the native laboratory embedded in the article. Pure shell, worker, state, and data-export modules live under `src/lib/visualizations/gastropod-shell-lab/`; the Svelte and Three.js host lives under `src/lib/components/visualizations/gastropod-shell-lab/`.

The Living Aperture is a **procedural, mathematically grounded shell-design laboratory**. It is not a complete simulation of molluscan development. Its analytic engine describes geometry; its ring history is a kinematic construction; its ornament mechanisms are reduced browser models unless stated otherwise. No specimen parameters have been fitted in this release.

## What is represented

At normalized age \(\tau\), the application constructs an aperture curve and joins it to the previous aperture. Moving the timeline backwards removes later rings; it does not scale down an adult mesh. This reflects the key growth fact motivating the laboratory: molluscan shells extend by accretion at the mantle-lined opening, with previously calcified material retained as history.

The project deliberately does **not** solve biomineralization chemistry, gene regulation, embryonic cell division, mantle cell dynamics, three-dimensional nonlinear finite elasticity, or evolutionary fitness. Parameters named mismatch, stiffness, instability, strain, or growth burst are dimensionless model inputs or proxies—not measured tissue properties and not stress fields.

## Geometry layer

### Logarithmic coiling

For growth angle \(\theta\), measured over a finite interval ending at \(\theta_1\),

\[
r(\theta)=r\_{\max}\exp[a(\theta-\theta_1)],\qquad
W=\exp(2\pi a),\qquad a=\frac{\ln W}{2\pi}.
\]

\(W\) is the whorl expansion after one turn. The angle between the planar tangent and radial direction is \(\alpha=\operatorname{atan2}(1,a)\), including the circle limit \(a=0\Rightarrow\alpha=\pi/2\). The ordinary model uses a free logarithmic expansion parameter; it is neither a golden-ratio nor Fibonacci prescription. An Archimedean comparison \(r=r_0+c\theta\) is included only to contrast constant additive spacing with proportional growth.

The analytic centreline is

\[
\mathbf C(\theta)=\left(r\cos\theta,\;\chi r\sin\theta,\;z(\theta)\right).
\]

The implemented axial laws are:

- **Planispiral:** \(z=0\). Here \(\chi\) is winding sense in the selected view, not intrinsic biological chirality.
- **Lecture lift:** \(z=z_0+p(\theta-\theta_0)\). Its top view has logarithmic self-similarity, but the lifted 3D curve is not invariant under uniform scaling.
- **Cone-similar:** \(z=z_0+q[r(\theta)-r(\theta_0)]\). About the similarity centre \(\mathbf S=(0,0,z_0-qr(\theta_0))\), one turn gives \(\mathbf C(\theta+2\pi)-\mathbf S=W[\mathbf C(\theta)-\mathbf S]\).
- **Keyframed/experimental:** a bounded age law, accompanied by fold/intersection warnings.

We use a discrete rotation-minimizing (Bishop/parallel-transport) frame rather than a raw Frenet frame. Authored aperture roll is applied after transport. Aperture roll about the centreline, centreline torsion, and gastropod developmental torsion are distinct phenomena; the application does not conflate them.

### Aperture sweep

\[
\mathbf X(\theta,u)=\mathbf C(\theta)+s(\theta)
[p_x(u,\theta)\widetilde{\mathbf E}_1(\theta)+p_y(u,\theta)\widetilde{\mathbf E}_2(\theta)],
\quad s=s\_{\max}\exp[b(\theta-\theta_1)].
\]

The aperture may be circular, elliptical, a positive-radius superellipse, rounded polygon, lobed curve, or star-shaped polar Fourier profile

\[
\rho(u)=1+\sum_m[A_m\cos(mu)+B_m\sin(mu)].
\]

The implementation densely checks positivity and raises viewport sampling for authored harmonics where possible. The pure engine returns an explicitly invalid diagnostic result with a finite circular fallback buffer; the interactive viewport reports that error and retains the last valid displayed mesh instead of swapping in the fallback.

When \(a=b\), centreline radius and aperture size have the same per-turn factor. The UI calls this a **matched self-similar base growth law**, not automatically a globally self-similar finite shell. A finite cap, truncation, lip flare, non-periodic ontogeny or ornament, meander, and transported-frame holonomy can all break full-surface similarity. Exact vertex-level claims require a one-turn correspondence test and an invariant aperture frame.

The circular planispiral contact guide

\[
\frac{A}{R}\approx\frac{W-1}{W+1}
\]

is displayed only as a useful special case, not a universal collision theorem.

## Living-aperture kinematics

For successive aperture samples the app computes a finite-difference deposition velocity and may decompose it locally as

\[
\partial_t\mathbf A=V_T\mathbf t+V_G\mathbf g+V_N\mathbf n.
\]

This is a calculated field from the selected kinematics; it is not a claim that the organism numerically evaluates these components.

The generalized local-frame option integrates

\[
\mathbf C'=v\mathbf T,\quad
\mathbf T'=\kappa_1\mathbf E_1+\kappa_2\mathbf E_2,\quad
\mathbf E_1'=-\kappa_1\mathbf T+\omega\mathbf E_2,\quad
\mathbf E_2'=-\kappa_2\mathbf T-\omega\mathbf E_1,\quad s'=gs.
\]

Here primes denote the angular coiling parameter \(\theta\), and \(\kappa_1,\kappa_2,\omega\) are authored rates per coiling radian—not automatically curvature/twist per arclength. Growth-law values are sampled over normalized age \(\tau\); before RK4 integration in \(\tau\), the engine multiplies the authored rates by the shell's total \(\theta\)-span. The implementation re-orthonormalizes the frame. This is a deterministic **local kinematic frame model**, not the nonlinear mechanical coiling solver of the 2021 paper.

Every time-varying value uses a serializable `GrowthLaw`: constant, linear, bounded Hermite, episodic step, sinusoid, or ordered keyframes. Recipe age is normalized \(0\le\tau\le1\); it is a developmental coordinate, not a measured chronological clock.

## Reduced ornament mechanisms

All structural ornament is evaluated as a continuous displacement in growth/aperture coordinates before tessellation. It is not a collection of cone primitives glued onto an adult mesh.

### Ribs and varices

Periodic ribs and wider episodic varices are direct deterministic geometry controls. The pure math module retains an unexposed generic reference helper for

\[
\ddot q+2\zeta\omega_0\dot q+\omega_0^2q=F(\tau).
\]

No current recipe field, ornament evaluator, or UI control invokes this oscillator helper; it does not generate the ribs or varices shown by the laboratory. The equation is a reduced reference model, not the exact 2012 circular-ring feedback equation. Comarginal ornament runs parallel to the current aperture/growth line; varices are episodic growth traces and are not automatically daily increments.

### Buckling/instability surrogate

The direct modal surrogate uses

\[
h(u,\tau)=\sum_m a_m(\tau)\cos(mu+\phi_m),\qquad
\dot a_m=\sigma_m a_m-\lambda a_m^3.
\]

After nondimensionalization, the app-authored compressed-beam-on-foundation growth rate is

\[
k_m=\frac{2\pi m}{L},\qquad
\sigma_m=\gamma_0[\xi k_m^2-Kk_m^4-1].
\]

\(\xi\) is a normalized compressive mismatch/load proxy, \(K\) a normalized bending-stiffness proxy, \(L\) the aperture-domain length, and the fixed unit term a normalized foundation penalty. This is a dimensionally coherent Landau/beam surrogate that selects a finite unstable band; it is not a fitted governing equation from the cited shell papers. Modes are limited below mesh Nyquist. Any false colour is an **instability/displacement/strain proxy**, never measured stress.

### Spine windows

Spines are smooth compact episodes in \((\theta,u)\), carried forward with deposition. This direct Gaussian-kernel construction is procedural geometry inspired by the accretive/mechanical literature. It does not solve the 2013 growing elastic-rod boundary-value problem, in which excess mantle-edge length buckles on an evolving foundation.

### Finite hierarchy

The implemented hierarchy superposes deterministic peak levels at progressively finer aperture phases. Older levels remain present while smaller levels activate later; each peak stores its level, phase, amplitude, width, and onset age, and depth is capped at six. It is a **finite multilevel Gaussian-peak surrogate inspired by hierarchical shell ornament**, not an explicit gap-threshold insertion algorithm and not the 2025 constrained energy minimization. It is finite and fractal-like, never an infinite or true fractal.

The source model represents a pattern as Gaussian subunits and, under stated approximations, reduces energy to terms of the form

\[
E\approx\sum_i N_i\left(\frac{a_i^2}{\sigma_i^3}+\mu a_i^m\sigma_i\right),\qquad
\sum_iN_i\frac{a_i^2}{\sigma_i}=2\delta(t).
\]

Nonlinear interaction and memory are important to the published hierarchy; direct experimental validation of that specific hypothesis remains open.

### Controlled imperfection

A repository-owned seeded PRNG creates low-amplitude, band-limited asymmetry. Within the same code build and runtime, a fixed recipe, seed, and resolution reproduce the same buffers. The recipe's `engineVersion` records provenance; it is not a cross-version compatibility dispatcher. This is controlled model variation, not specimen noise or a biological mutation rate.

## Mechanical models that are not solved here

The 2019 three-dimensional morphoelastic framework distinguishes surface accretion, mantle volume growth, elastic deformation, secretion, and a moving calcification front. It uses multiplicative morphoelasticity \(\mathbf F=\mathbf F^e\mathbf F^g\), constitutive stress from a strain energy, and finite-element equilibrium. The browser laboratory does not implement these fields or equilibrium solves.

The 2021 coiling study couples body/shell mismatch and elastic stiffness to planispiral, helicospiral, and meandering centreline torsion. Its mechanism-specific mismatch is a whole-body versus secreted-tube arc-length ratio. Our general meander and roll controls are geometric/kinematic experiments unless an exact published curvature–torsion mode is selected in a future engine.

These papers propose physically realizable routes by which form can arise under constraints. They do not, by themselves, establish molecular cause, adaptive function, or evolutionary selection.

## Taxonomy and naming

- Gastropod presets are morphological archetypes inspired by named forms, not reconstructions of specimens.
- Nautilus is an extant cephalopod. Ammonites, including _Nipponites_, are extinct cephalopods. They live on a separate Comparative molluscs shelf.
- A Nipponites-inspired recipe uses alternating centreline torsion/perversions rather than claiming gastropod chirality change.
- Limpets are gastropods; limpet-shaped conical shells evolved in multiple lineages. If shown, a mathematical coiling-limit preset is not a claim that biological limpets are “degenerate.”
- For non-planar gastropod-inspired shells, the conventional visual description is apex up: aperture on the viewer's right is dextral, on the left sinistral. The coordinate sign \(\chi\) alone does not establish biological handedness without this viewing convention.

## Primary and author-hosted sources

- Alain Goriely, [The Shape of Shells: She Sells Self-Similar Spiral Seashells on the Seashore](https://www.gresham.ac.uk/watch-now/she-sells), Gresham College (2026), with [lecture text](https://www.gresham.ac.uk/sites/default/files/transcript/R_2026_01_18_1416_Goriely_R.pdf).
- Moulton, Goriely & Chirat, [Mechanical growth and morphogenesis of seashells](https://doi.org/10.1016/j.jtbi.2012.07.009), _Journal of Theoretical Biology_ 311 (2012), with [author manuscript](https://people.maths.ox.ac.uk/moulton/Papers/JTheorBio_Revised.pdf).
- Chirat, Moulton & Goriely, [Mechanical basis of morphogenesis and convergent evolution of spiny seashells](https://doi.org/10.1073/pnas.1220443110), _PNAS_ 110 (2013), with [open full text](https://pmc.ncbi.nlm.nih.gov/articles/PMC3625336/).
- Rudraraju et al., [A computational framework for the morpho-elastic development of molluskan shells by surface and volume growth](https://journals.plos.org/ploscompbiol/article?id=10.1371/journal.pcbi.1007213), _PLOS Computational Biology_ 15 (2019).
- Chirat, Goriely & Moulton, [The physical basis of mollusk shell chiral coiling](https://doi.org/10.1073/pnas.2109210118), _PNAS_ 118 (2021), with [open full text](https://pmc.ncbi.nlm.nih.gov/articles/PMC8651239/).
- Moulton, Goriely & Chirat, [Hierarchical mechanical patterns in morphogenesis](https://doi.org/10.1098/rsif.2024.0918), _Journal of the Royal Society Interface_ 22 (2025), with [open full text](https://pmc.ncbi.nlm.nih.gov/articles/PMC12188252/).
