---
title: "Complex Functions as Landscapes: A 3D Domain-Colouring Laboratory"
seoTitle: "3D Domain Colouring Laboratory | Suvro Ghosh"
description: "Explore complex functions in synchronised 2D and 3D: read log-magnitude terrain, phase colour, zeros, poles, branch cuts, winding, and Riemann sheets."
date: "2026-07-25"
dateModified: "2026-08-22"
thumbnail: "/images/domain-coloring-explorer.svg"
thumbnailAlt: "The two-dimensional identity map shown as a cyclic phase-colour wheel with logarithmic contours and labelled real and imaginary axes"
category: "Visualizations"
tags: ["Complex Analysis","Complex Functions","Domain Colouring","Zeros","Poles","Branch Cuts","Riemann Surfaces","Argument Principle","WebGL","Interactive Mathematics"]
pinnedTags: ["Complex Analysis","Complex Functions","Domain Colouring","Zeros","Poles","Branch Cuts","Riemann Surfaces","Argument Principle","WebGL","Interactive Mathematics"]
published: true
color: "#155E75"
author: "Suvro Ghosh"
readingTime: "21 min"
inPlainEnglish: "A complex function has four real coordinates, so no 3D graph can show the whole object. This laboratory keeps the input plane as the ground, lifts clipped log₂|f(z)| into terrain, and paints phase onto the surface. Beside the original 2D map and genuine multi-sheet views for selected branches, that makes growth, winding, zeros, poles, critical points, and branch choices easier to inspect without pretending that the projection is the function itself."
keyTerms: ["Complex function", "Domain colouring", "Log modulus", "Phase (argument)", "Zero", "Pole", "Critical point", "Branch cut", "Riemann surface", "Argument principle"]
faq:
  - question: "What does the height mean in the 3D domain-colouring landscape?"
    answer: "By default, height is log₂|f(z)|, clipped equally above and below an adjustable display cap. A rise of one unclipped height unit means that the magnitude has doubled, and sea level marks |f(z)| = 1."
  - question: "Does the 3D view show the whole complex function?"
    answer: "No. The input and output each have real and imaginary parts, so the full graph needs four real coordinates. The landscape is an honest three-dimensional projection: input position uses two coordinates, height encodes one output quantity, and colour encodes phase."
  - question: "Is the log-magnitude landscape a Riemann surface?"
    answer: "No. The ordinary landscape places one displayed height above each input point. The separate Riemann-sheets view constructs and joins multiple values only for curated square-root, cube-root, and logarithm examples."
  - question: "Why are logarithmic heights clipped?"
    answer: "The logarithm tends to negative infinity at a zero and positive infinity at a meromorphic pole. Finite caps keep the rest of the surface readable, while the probe retains the unclipped value or the justified limiting status."
  - question: "What is the difference between a branch cut and a joined sheet?"
    answer: "A principal branch chooses one value per input and needs a seam where that choice changes discontinuously. A genuine sheet model keeps the other values and glues the appropriate cut edges, so travelling around a branch point can move from one sheet to another."
  - question: "Does the winding-loop result prove how many zeros and poles are inside?"
    answer: "It is a numerical estimate, not a proof. It represents zeros minus poles only when the function is meromorphic on and inside the loop, the path avoids zeros and poles, every sample is valid, and repeated refinement converges."
  - question: "What remains if 3D or WebGL is unavailable?"
    answer: "The laboratory keeps the interactive 2D map when only the 3D path fails. If WebGL is unavailable, the article, equations, numerical explanations, and an honestly labelled static rendering remain readable."
---

<script>
	import DomainColoringExplorer from '$lib/components/visualizations/domain-coloring/DomainColoringExplorer.svelte';
</script>

<TTS />

<Pi
	src="/images/domain-coloring-explorer.svg"
	alt="The identity function shown in two dimensions as a phase-colour wheel with circular logarithmic magnitude contours around its zero"
	caption="The retained 2D identity map is the calibration image: input angle becomes hue, powers of two become contour rings, and one anticlockwise circuit records one positive turn around the zero. The 3D laboratory raises the same log-magnitude information into height without claiming to show the entire function."
/>

# Four coordinates, one honest compromise

Write the input to a complex function as

$$
z=x+iy,
$$

and its output as

$$
f(z)=u(x,y)+iv(x,y).
$$

The full graph therefore consists of points $(x,y,u,v)$ in four-dimensional real space. A screen cannot place all four coordinates along three spatial axes. Adding depth does not uncover a hidden “imaginary dimension”, and it does not make the whole complex function suddenly visible. Something must still be omitted or carried by colour, contours, labels, or a second coordinated view.

This laboratory makes that compromise explicit. The ordinary landscape uses $\operatorname{Re}z$ and $\operatorname{Im}z$ as the two horizontal directions, raises one named quantity into height, and colours the surface by the phase of $f(z)$. The default height is $\log_2|f(z)|$. Other lenses can raise the real part, imaginary part, or principal phase, while the flat lens returns to the original domain-colouring plane.

The 2D view remains alongside the terrain because it is often the better instrument. It gives exact top-down location, avoids occlusion, makes small features easier to count, and works on weaker devices. In comparison mode both views use the same function, mathematical domain, colour convention, contours, and pinned probe. Moving the 2D plane changes that shared domain; orbiting the 3D camera changes only the viewpoint. “Reset function view” and “Reset camera” are deliberately different operations.

The separate **Riemann sheets** view is narrower in scope. It appears only where the laboratory actually constructs several values and joins their edges: square root, cube root, and a finite window of the logarithm. The ordinary height field is not relabelled as a Riemann surface. That distinction follows the careful tradition of coloured analytic landscapes described by [Elias Wegert](https://arxiv.org/abs/1007.2295) and of genuinely lifted, domain-coloured surfaces studied by [Poelke and Polthier](https://doi.org/10.1111/j.1467-8659.2009.01479.x).

<DomainColoringExplorer />

<noscript><p><strong>The interactive laboratory needs JavaScript.</strong> The full mathematical explanation and the static identity calibration remain on this page. In that image, hue records phase and the circular bands mark powers of two in magnitude; it is not a static rendering of every selectable function.</p></noscript>

# How to read the landscape

Suppose $f(z)=u+iv$ is finite and non-zero. Its magnitude and principal phase are

$$
|f|=\sqrt{u^2+v^2},
\qquad
\operatorname{Arg}f=\operatorname{atan2}(v,u).
$$

In plain language, magnitude says how far the output lies from zero, while phase says which direction it points in the output plane. The hue wheel is cyclic, so the colours at $-\pi$ and $+\pi$ meet even though the numerical labels jump. Constant-phase contours supplement hue for readers who cannot reliably distinguish every colour.

The default terrain starts with

$$
L(z)=\log_2|f(z)|
$$

and displays

$$
h(z)=s\,\operatorname{clip}(L(z),-K,K).
$$

Here $s$ is vertical exaggeration and $K$ is the symmetric log-height cap. Before clipping, one vertical log unit means a factor of two in magnitude. The plane $L=0$ is therefore **sea level**, where $|f(z)|=1$. Integer contour levels mark $|f|=\ldots,1/4,1/2,1,2,4,\ldots$. The upper and lower caps are display boundaries, not finite values substituted into the mathematics.

At a known zero, $L$ tends to $-\infty$, so the terrain descends into a well and ends on the labelled low cap. At a known meromorphic pole, it tends to $+\infty$, so the terrain rises into a spire and ends on the high cap. The numerical probe does not replace either limit with $-K$ or $K$: it reports the unclipped value when finite and a justified limiting status otherwise. An indeterminate $0/0$, a domain error, or an unexplained non-finite result becomes an invalid hole rather than being promoted to a pole. For an arbitrary custom expression, “zero-like” and “pole-like” are numerical descriptions, not proofs.

The other height lenses answer different questions:

- **Real output** and **imaginary output** apply a signed symmetric logarithm to the selected component $t$:

  $$
  Q_a(t)=\operatorname{sgn}(t)\log_2\!\left(1+\frac{|t|}{a}\right),
  \qquad
  h_c=s_c\,\operatorname{clip}(Q_a(t),-K_c,K_c).
  $$

  The component scale $a$, component cap $K_c$, and vertical scale $s_c$ belong to this transform; they are not silently borrowed from log magnitude. The probe still gives the untransformed real or imaginary value.

- **Principal phase** uses

  $$
  h_\theta=s_\theta\frac{\operatorname{Arg}f(z)}{\pi}.
  $$

  This raises the chosen principal argument into a height between approximately $-s_\theta$ and $s_\theta$. Its visible seam is unavoidable for that choice. It is not a globally unwrapped intrinsic surface: around a zero or pole, global continuous phase is topologically obstructed and any numerical unwrapping depends on a path.

- **Flat** sets height to zero. It contains the same mathematical colour information as the retained 2D map.

Top view with neutral lighting is the cleanest comparison with 2D. Lighting may clarify orientation, but it is kept weak enough that it does not rotate hue or erase contours. Caps, contours, axes, known features, the mesh, and lighting can be toggled; a faint zero-height reference plane remains fixed in the ordinary 3D view. For the log-magnitude lens it is $|f|=1$; for the real, imaginary, and phase lenses it marks zero of the selected quantity. The numerical probe reports $z$, $f(z)$, magnitude, phase in radians and degrees, unclipped log magnitude, the raw selected height quantity, displayed height, clipping or validity status, and proximity to known features. Where the expression is eligible and safely away from cuts or singularities, it can also estimate $f'(z)$, local scale $|f'(z)|$, and local rotation $\operatorname{Arg}f'(z)$. At a critical point with $f'(z)=0$, scale is zero and rotation has no defined angle.

# Wells, spires, and multiplicity

Near a zero $z_0$ of order $m$, a holomorphic function can be written

$$
f(z)=(z-z_0)^m g(z),
\qquad g(z_0)\ne0.
$$

Taking base-two log magnitude gives

$$
\log_2|f(z)|
=m\log_2|z-z_0|+\log_2|g(z)|.
$$

The first term makes a logarithmic well. Its coefficient $m$ controls both the local log slope and the number of positive hue turns made by one small anticlockwise circuit around the zero. The identity has one turn; $z^2$ has two; $z^3$ has three. Multiplicity is encoded twice, in geometry and in winding.

A pole of order $n$ has the corresponding local form with $(z-z_0)^{-n}$. Its log coefficient is $-n$, so the well becomes a spire and the hue winding reverses. Compare `z`, `z^2`, and `1/z`, then try `(z-1)^2 * (z+1)^3`: the two wells have different orders and different winding counts.

A **critical point** is different. It satisfies $f'(z)=0$ and need not be a zero or a pole. For

$$
f(z)=z^2+1,
$$

the zeros lie at $\pm i$, but $z=0$ is a finite critical point with $f(0)=1$. It lies at sea level rather than at an infinite well or spire. The map locally loses its usual one-to-one, angle-preserving behaviour there, and the log terrain has a finite saddle. Markers distinguish that event from a singularity.

The two-dimensional view is especially useful here: it lets you count hue cycles without a peak hiding another feature. The 3D view makes relative steepness and the separation of wells, spires, and finite saddles easier to grasp. Neither alone is the “true” graph; together they expose complementary parts of the same computation.

# Harmonic terrain

There is a deeper reason log magnitude produces such disciplined landscapes. On a patch where $f$ is holomorphic and non-zero, one may choose a local logarithm and write

$$
\operatorname{Log}f(z)=U(x,y)+iV(x,y)
=\ln|f(z)|+i\arg f(z).
$$

The real and imaginary parts $U$ and $V$ are harmonic conjugates. Their gradients satisfy

$$
\nabla U\cdot\nabla V=0,
\qquad
|\nabla U|=|\nabla V|=\left|\frac{f'(z)}{f(z)}\right|.
$$

Thus equal-magnitude and equal-phase curves cross at right angles away from excluded and critical places. Constant-phase curves follow steepest ascent or descent of natural-log magnitude, and the analytic natural-log slope measures $|f'/f|$. This is a structural consequence of holomorphicity, not an artistic convention. [Hans Lundmark’s domain-colouring guide](https://users.mai.liu.se/hanlu09/complex/domain_coloring.html) gives a particularly approachable account of how these visual cues fit together.

The laboratory displays base-two rather than natural-log height, so the scale must be converted:

$$
|\nabla L|
=\frac{1}{\ln2}\left|\frac{f'(z)}{f(z)}\right|.
$$

If the rendered surface is $h=sL$, its unclipped gradient magnitude is $s|f'/f|/\ln2$, provided the two horizontal axes use equal world-unit scales. A rectangular canvas may be wider than it is high, but the geometry compensates for that aspect ratio before making claims about angles or slopes.

Harmonicity also gives

$$
\Delta U=0
$$

away from zeros, poles, cuts, and other excluded points. A smooth harmonic patch cannot contain a strict interior hilltop or bowl. It must pass through in a saddle-like or flat way. The exact saddle for `exp(z^2)` is an unusually clear example; the finite critical saddle of `z^2+1` shows that the same idea need not sit at height zero.

<details>
<summary>One level deeper: why regular log patches have no positive Gaussian curvature</summary>

For the literal graph $h=U$, its Gaussian curvature is

$$
K_G=
\frac{U_{xx}U_{yy}-U_{xy}^2}
{(1+U_x^2+U_y^2)^2}.
$$

Because $U$ is harmonic, $U_{yy}=-U_{xx}$. Therefore

$$
K_G=
-\frac{U_{xx}^2+U_{xy}^2}
{(1+|\nabla U|^2)^2}
\le0.
$$

Every regular, unclipped natural-log-modulus patch is locally saddle-like or flat to second order, never an ordinary smooth dome or bowl. Changing the logarithm base or multiplying vertical scale preserves the sign, though not the numerical curvature. The conclusion does not apply on clipped caps, under a nonlinear height transform, at a singularity or cut, or merely because a non-holomorphic function such as `conj(z)` happens to share the same magnitude.

</details>

# Rational functions as superposed potentials

For a rational function written in factored form,

$$
f(z)=C\,
\frac{\prod_j(z-a_j)^{m_j}}
{\prod_k(z-b_k)^{n_k}},
$$

log magnitude separates into a sum:

$$
\ln|f(z)|=\ln|C|
+\sum_j m_j\ln|z-a_j|
-\sum_k n_k\ln|z-b_k|.
$$

In everyday terms, the terrain is a superposition of logarithmic wells from zeros and logarithmic hills from poles. The analogy resembles a potential field, but it is an analogy rather than an assertion that the surface is a particular physical system.

Use it predictively. Before drawing `(z^2 - 1) / (z^2 + 1)`, expect wells at $\pm1$ and spires at $\pm i$. For `(z^5 - 1) / (z^5 + 1)`, expect two interlaced five-point constellations. The picture then tests a calculation you have already begun, instead of merely supplying a surprise.

# Winding and the argument principle

The loop tool turns hue changes into a numerical experiment. Place a positively oriented circular path $\gamma$ in the domain. The laboratory samples $f$ along it and adds wrapped phase increments

$$
\Delta\theta_j=
\operatorname{atan2}\!\left(
\sin(\theta_{j+1}-\theta_j),
\cos(\theta_{j+1}-\theta_j)
\right).
$$

Wrapping each step chooses the small signed change across the cyclic phase boundary. That alone is not enough: a coarse sample could miss an even number of complete turns. The tool therefore evaluates recursive midpoints, checks scale-normalised chord error, keeps the output curve a safe distance from zero, doubles the primary sample count, and requires agreement with a coprime $N+1$ audit grid as well as successive stable totals within a bounded budget. The coprime grid specifically disrupts exact dyadic aliases such as large powers of $z$. If the path meets an invalid value, approaches a zero or pole too closely, crosses an incompatible cut, or refuses these convergence checks, the laboratory declines to print a confident integer.

When $f$ is meromorphic on and inside the loop and has no zero or pole on the path, the argument principle says

$$
\frac{1}{2\pi}\Delta_\gamma\arg f=N-P,
$$

where $N$ and $P$ count enclosed zeros and poles with multiplicity. Equivalently,

$$
\frac{1}{2\pi i}\oint_\gamma\frac{f'(z)}{f(z)}\,dz=N-P.
$$

The first formula is what the colour winding suggests; the second states the classical contour integral. [Frank Farris’s account of domain colouring and the argument principle](https://scholarcommons.scu.edu/math_compsci/29/) develops this connection in detail.

The hypotheses matter. Around a branch example or a non-holomorphic custom expression, a converged output-curve winding may still be informative, but it is not automatically $N-P$. Even for a meromorphic preset, a numerical estimate remains a reproducible guide rather than a proof. Try loops around the identity zero, the reciprocal pole, the three roots of unity, and then a balanced region containing equal numbers of zeros and poles.

# Periodicity and growth

The exponential separates magnitude and phase with unusual clarity:

$$
e^{x+iy}=e^x(\cos y+i\sin y).
$$

Its natural-log magnitude is $x$, so base-two terrain is the tilted plane $x/\ln2$. Its hue repeats every $2\pi$ in the imaginary direction, and there are no zero wells. In `exp(z^2)`, by contrast,

$$
\ln|e^{z^2}|=x^2-y^2,
$$

so the height is an exact saddle, scaled by $1/\ln2$, while phase is governed by $2xy$.

The complex sine retains zeros at $k\pi$ on the real axis and grows rapidly above and below it. Tangent alternates zeros at $k\pi$ with poles at $\pi/2+k\pi$. These are infinite families, so the marker system generates only the members inside the visible bounds, caps their number, and labels the list as non-exhaustive. `exp(z)-1` similarly repeats zeros at $2\pi ik$. Moving the domain is not merely camera movement here: it changes which members of an infinite family are being sampled.

# Removable and essential singularities

The written formula `sin(z)/z` produces $0/0$ at the origin, but the surrounding values tend to $1$. Its analytic continuation is

$$
\operatorname{sinc}(0)=1,
\qquad
\operatorname{sinc}(z)=\frac{\sin z}{z}\quad(z\ne0).
$$

The `sinc(z)` preset evaluates that continuation stably, using its near-zero series rather than labelling the raw indeterminate expression a pole. This is a removable singularity: the apparent hole can be filled consistently.

An essential singularity behaves very differently. If $z=re^{i\theta}$, then

$$
\ln|e^{1/z}|=\frac{\cos\theta}{r},
\qquad
\arg(e^{1/z})\equiv-\frac{\sin\theta}{r}\pmod{2\pi}.
$$

Approaching the origin from different directions produces extreme ascent, descent, and phase acceleration. `sin(1/z)` adds infinitely many zero wells at $z=1/(k\pi)$, accumulating at the origin. A finite mesh cannot resolve all of them. Undersampled cells are marked or omitted rather than presented as evidence of “mathematical chaos”, and increasing quality only moves the numerical limit; it does not remove it.

This is also where false geometry is most tempting. A mesh must not connect two finite samples across an invalid centre with a giant triangle. Preset cut geometry, evaluator diagnostics, midpoint tests, and bounded refinement decide whether a cell is safe. Clipping a legitimate steep value onto a labelled cap is different from declaring the cell invalid.

# Branch cuts versus sheets

Principal branches answer a practical question: if the expression must return one value for each input pixel, which value should it choose? The principal logarithm uses

$$
\operatorname{Log}z=\ln|z|+i\operatorname{Arg}z,
\qquad -\pi<\operatorname{Arg}z\le\pi.
$$

It has a branch point at zero, a zero at $z=1$, and a chosen cut along the negative real axis. The principal square root makes the corresponding choice after halving the argument. Its log-modulus height is simply

$$
\log_2|\sqrt z|=\frac12\log_2|z|.
$$

So the principal value changes across its cut even though that particular height formula does not jump. A colour seam need not be a cliff. The origin is a branch point, not an ordinary planar “zero of order one-half”. [NIST’s treatment of principal values and branch cuts](https://dlmf.nist.gov/4.2) provides the standard conventions used here.

The sheet view asks a different question. For square root it constructs both values

$$
w_k=r^{1/2}e^{i(\theta+2\pi k)/2},
\qquad k=0,1,
$$

and glues each cut edge to the opposite sheet with matched orientation. For cube root it constructs $k=0,1,2$ and cycles the three sheets correctly. Moving once around the branch point changes the selected value; only after the required number of turns do you return to the original sheet. [MIT OpenCourseWare’s square-root construction](https://ocw.mit.edu/courses/18-04-complex-variables-with-applications-fall-1999/pages/study-materials/riemann-surfaces-the-square-root/) is a useful companion explanation.

The logarithm has infinitely many values

$$
\log_k z=\ln r+i(\theta+2\pi k).
$$

The laboratory can show only a finite, adjustable window of that infinite covering. A helicoid-like projection may raise the unwrapped angle and colour by $\ln r$, with visible sheet indices. The excluded origin, outer radial edge, and top and bottom of the chosen sheet range are **visualisation boundaries**, not additional branch cuts.

These displays are still projections of four-dimensional graphs. A root surface may be projected as $(\operatorname{Re}z,\operatorname{Im}z,\operatorname{Re}w)$ and coloured by $\operatorname{Im}w$; different points of the abstract surface can then appear to intersect on screen. Such self-intersection need not be a singularity. Root surfaces also have a branch point at infinity on the extended plane, beyond the finite display. The sheet connections are tested by paired edge indices and matching values, not accepted merely because the rendering looks plausible. [Stefan Kranich’s work on GPU domain-coloured algebraic Riemann surfaces](https://arxiv.org/abs/1507.04571) explains why continuation, sheet tracking, and projection must be kept distinct.

# Safe custom expressions

The custom input is a deliberately small language. It accepts numbers, `z`, `i`, `e`, `pi`, parentheses, explicit `+ - * / ^`, and the tested complex functions `exp`, `log`, `sin`, `cos`, `tan`, `sqrt`, `abs`, `conj`, and `sinc`. Implicit multiplication, property access, arbitrary JavaScript, oversized input, and oversized syntax trees are rejected with specific errors.

The browser tokenises the text, builds a restricted abstract syntax tree, validates it, and only then translates known nodes into CPU arithmetic and GLSL helpers. It never passes raw text to JavaScript `eval`, `Function`, or a shader template. The current safety bounds remain 180 source characters and 128 AST nodes. If a new expression fails validation or shader compilation, the last valid function stays visible.

General powers use the principal definition

$$
z^w=\exp(w\operatorname{Log}z),
$$

while small integer powers use direct multiplication. That is why `z^i`, `z^z`, and `z^(1/3)` inherit principal-log branch structure, whereas familiar polynomial powers retain their expected zeros cleanly. Unit tests exercise the CPU values at ordinary and branch-adjacent samples, verify the corresponding restricted GLSL structure, and the browser suite requires representative generated shaders to compile and render. These checks reduce implementation drift; they are not a proof of bit-for-bit CPU/GPU identity on every graphics driver.

`conj(z)` is an instructive control. It has the same magnitude and therefore the same log-modulus landscape as `z`, but its phase turns in the opposite direction and the map is antiholomorphic. A beautiful harmonic magnitude surface alone cannot certify holomorphicity or conformality.

# What the picture does not prove

This laboratory is an instrument for inspection, calculation, and conjecture. It is not a proof-producing camera.

- A 3D projection loses or encodes part of the four-dimensional graph.
- Height caps hide the distance to infinity beyond a stated display limit. Optional nonlinear compression changes slopes and curvature.
- Perspective, occlusion, aspect mistakes, and lighting can distort apparent geometry.
- A finite mesh can interpolate across a feature that lies between its samples. Guarding, splitting, and refinement reduce that risk but do not create infinite resolution.
- Principal branches depend on conventions. A principal-phase height exposes a chosen seam, and numerical phase unwrapping is path-dependent.
- A winding estimate can miss behaviour unless distance, continuity, refinement, and convergence tests all succeed.
- Floating-point overflow, underflow, and CPU/GPU differences become serious near violent growth or cancellation.
- Essential singularities contain structure below every finite pixel scale; aliasing is not a new theorem about the function.
- Custom expressions may be non-holomorphic. Smooth colour does not by itself establish conformality.
- Known-feature markers are curated or bounds-aware guides, not a proof that every zero, pole, critical point, or cut has been found.

Accessibility and fallback are part of that honesty. Hue is reinforced by phase contours, labels, markers, and numerical readouts. Pinned probe values remain as text. Camera presets, view and height choices, resets, and the winding loop have keyboard-operable controls. Reduced-motion mode removes unnecessary transitions and automatic movement. On a narrow screen, separate 2D, 3D, and sheets tabs are clearer than two crushed canvases; ordinary page scrolling remains available until the scene is deliberately engaged.

If 3D fails while the 2D WebGL path survives, the 2D explorer remains interactive. If WebGL is disabled, lost, or unable to compile, the server-rendered article and an honestly labelled static rendering remain. Share URLs contain bounded, validated, quantised state rather than transient pointer noise, and an invalid shared expression falls back safely to identity.

Used with those limits in view, the combination is powerful. Two dimensions locate and count; log terrain makes relative growth and singular structure spatial; component lenses expose other projections; a cautious loop connects colour to the argument principle; and the curated sheets show how a branch seam becomes a passage when the missing values are actually restored. The picture does not replace the mathematics. It gives the mathematics a surface on which to ask better questions.

# Sources and further reading

- Elias Wegert, [“Phase Plots of Complex Functions: A Journey in Illustration”](https://arxiv.org/abs/1007.2295), for phase plots, logarithmic analytic landscapes, and the relationship between log magnitude and phase.
- Frank A. Farris, [“Domain Coloring and the Argument Principle”](https://scholarcommons.scu.edu/math_compsci/29/), for reading winding as zeros minus poles under the correct hypotheses.
- NIST Digital Library of Mathematical Functions, [Functions of a Complex Variable](https://dlmf.nist.gov/1.10) and [principal logarithms, powers, and roots](https://dlmf.nist.gov/4.2), for standard terminology and branch conventions.
- Konstantin Poelke and Konrad Polthier, [“Lifted Domain Coloring”](https://doi.org/10.1111/j.1467-8659.2009.01479.x), and Stefan Kranich, [“GPU-based visualization of domain-coloured algebraic Riemann surfaces”](https://arxiv.org/abs/1507.04571), for genuinely lifted sheets, continuation, and projection cautions.
