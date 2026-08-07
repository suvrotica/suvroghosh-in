---
title: "The Museum of Invisible Weather"
seoTitle: "The Museum of Invisible Weather — Generative Art Exhibit"
description: "Curate nine deterministic prints from one nested-noise weather field, then freeze, share, inspect, and export the same procedural exhibition."
date: "2026-08-07"
dateModified: "2026-08-07"
thumbnail: "/images/the-museum-of-invisible-weather.png"
thumbnailAlt: "A quiet plaster gallery wall holding asymmetrical framed prints whose high-contrast lines bend through nested flow fields, with dark river-like bands winding through several works."
category: "Visualizations"
tags: ["Generative Art","p5.js","Creative Coding","Flow Fields","Perlin Noise","Procedural Art","Colour Theory","Svelte","Directional Alphabets","Generator Version"]
pinnedTags: ["Generative Art", "p5.js", "Creative Coding", "Flow Fields", "Perlin Noise", "Procedural Art", "Colour Theory", "Svelte"]
published: true
interactiveFirst: true
color: "#6B645C"
author: "Suvro Ghosh"
readingTime: "24 min"
inPlainEnglish: "One deterministic, smoothly varying field passes through an imaginary gallery. Each framed work samples that shared field through a different transformation, directional rule, mask, and compatible pair of colors. A seed records the structural choices, while a frozen phase records the field's moment in time, so a URL can reconstruct the exhibition rather than merely point at a screenshot."
keyTerms: ["Coherent noise", "Domain warping", "Nested noise", "Flow field", "Angle quantization", "Numerical integration", "Clipping mask", "Level set", "Threshold band", "Contrast matrix", "Seeded pseudorandom generator", "Sub-seed", "Normalized coordinates", "State serialization", "Recipe hash"]
faq:
  - question: "What is the invisible weather in this exhibit?"
    answer: "It is a deterministic scalar field used as artistic material. The field varies smoothly across normalized space and phase, but it is not a meteorological simulation and its values have no physical weather units."
  - question: "Why do the framed works look related without being identical?"
    answer: "They sample one master field and derive stable sub-seeds from the same exhibition seed. Each frame then translates, rotates, stretches, mirrors, warps, quantizes, thresholds, or clips that shared material differently."
  - question: "Why does River mode select values near one half?"
    answer: "A narrow band around a middle value is a thickened level set of a smooth field. Away from critical points, such a set tends to trace long contour-like channels. Selecting extreme tails more often isolates neighborhoods around local highs and lows, producing islands."
  - question: "Will the same permanent URL reconstruct the same exhibition?"
    answer: "Yes, within the declared generator version: the URL restores the structural state, seed, and any frozen phase. Browser antialiasing, font rasterization, and device pixel density may cause small pixel-level differences, but the recipe, frame identities, and normalized geometry remain the same."
  - question: "Does the exhibit copy Little Galleries?"
    answer: "No. It is an independent implementation inspired by general techniques discussed around that project. No source code, assets, palettes, exact compositions, or project name were copied; this work develops a different shared-weather premise, interface, state model, explanatory system, and export pipeline."
  - question: "What happens when reduced motion is preferred?"
    answer: "The exhibit begins in a still state and does not require animation for access to the artwork, controls, selected-work details, sharing, focus view, or export. Motion can also be paused or frozen explicitly."
---

<script>
	import InvisibleWeatherExhibit from '$lib/components/visualizations/invisible-weather/InvisibleWeatherExhibit.svelte';
	import FieldAnatomy from '$lib/components/visualizations/invisible-weather/FieldAnatomy.svelte';
</script>

A museum wall is normally where weather ends. Rain remains outside, wind is asked to stop troubling the doors, and humidity is treated as an administrative enemy of paper. This wall has admitted one exception: an invisible mathematical event passes through every frame.

Each print measures the same event with a different instrument. One permits only right-angled directions. Another accepts diagonals. A third listens for values close to the middle of a smooth field and turns them into a dark, wandering channel. The works are siblings because their disturbance is shared; they disagree because measurement is never innocent.

<InvisibleWeatherExhibit />

<TTS />

Begin with the finished wall. Select a frame and move left or right through the hanging. Pause the faint migration, then freeze it: pausing stops the clock on this device, whereas freezing writes the current phase into the shareable state. **New exhibition** changes the seed. **Replay** restores the current seed. The quieter controls are curatorial; Studio controls expose the machinery after there is a reason to inspect it.

# 1. A gallery made from one invisible event

The central problem is not how to draw nine attractive rectangles. Nine independent sketches could accomplish that and still feel like strangers obliged to share a lift. The harder problem is how to produce genuine variation while preserving evidence of a common cause.

Let the common cause be a scalar field

$$
W:\mathbb{R}^2\times\mathbb{R}\longrightarrow\{w\mid 0\le w\le1\}.
$$

The first two inputs are normalized spatial coordinates $u$ and $v$; the third is a phase $\phi$. The output $W(u,v,\phi)$ is a dimensionless number satisfying $0\le W\le1$. This equation is a definition of the exhibit's artistic field, not a claim that a wall possesses a measurable atmospheric variable. No kelvins, pascals, or millimeters of rainfall are hiding between those bounds.

If every frame sampled $W$ at the same coordinates and drew the same marks, the gallery would contain nine copies. Each local instrument therefore changes the coordinates before sampling. A useful general form is

$$
\begin{pmatrix}
u_i\\
v_i
\end{pmatrix}
=
A_i
\begin{pmatrix}
u\\
v
\end{pmatrix}
+\mathbf{b}_i.
$$

Here $i$ identifies a framed work, $A_i$ is a $2\times2$ dimensionless transformation matrix, and $\mathbf{b}_i$ is a translation. Rotation, reflection, and unequal stretching can all live inside $A_i$. The vector $\mathbf{b}_i$ moves the frame's sampling window through the master field. In ordinary language: every instrument encounters the same weather, but it may turn its head, stand elsewhere, or use a lens that elongates one direction.

The analogy has a boundary. A barometer and an anemometer measure distinct physical quantities with calibrated units. These frames are artistic transformations of one synthetic field. They are called instruments because the distinction between shared input and local rule is useful, not because the canvas is conducting meteorology.

Stable sub-seeds preserve the family resemblance. The exhibition seed determines the master field and curatorial choices; each frame derives its own repeatable seed from its index, layout, and field family. Changing the sixth frame's mask therefore need not send the first five through a bureaucratic identity crisis.

# 2. Noise is not static

The word _noise_ is unhelpful at first. It suggests television snow: neighboring pixels with no obligation to agree. That kind of independent randomness is excellent for static and poor for drawing a current. A path that samples unrelated directions at adjacent points jitters without acquiring structure.

Coherent noise instead gives nearby coordinates related values. One mathematical property we need is continuity. If $\mathbf{p}=(u,v,\phi)$ and $\mathbf{h}$ is a small displacement, then

$$
\lim_{\lVert\mathbf{h}\rVert\to0}
\left|N(\mathbf{p}+\mathbf{h})-N(\mathbf{p})\right|=0.
$$

$N$ is a coherent-noise function and $\lVert\mathbf{h}\rVert$ is the Euclidean length of the displacement. The statement says that sufficiently close samples have sufficiently close values. It does not say the field is flat, periodic, physically natural, or equally smooth at every scale. It buys us local continuity—enough for marks to bend rather than chatter.

Scale enters by changing the coordinates presented to the noise:

$$
N_s(u,v,\phi)=N(su+o_x,\,sv+o_y,\,\phi).
$$

The dimensionless factor $s$ is spatial frequency, while $o_x$ and $o_y$ are offsets. Increasing $s$ crosses more of the noise domain within one frame, so visible features become smaller and more numerous. Calling $s$ “detail” would conceal this trade: very high frequency does not reveal a more truthful field; it asks the same construction to turn more often per unit of gallery space.

Motion adds a third coordinate instead of generating a fresh two-dimensional field for every animation frame. With

$$
\phi(t)=\phi_0+\nu t,
$$

$t$ is elapsed time in seconds, $\phi_0$ is the seeded starting phase, and $\nu$ is a deliberately small phase speed. Successive pictures are neighboring slices through one three-dimensional noise volume. That is why the default can breathe without sparkling. Replacing the field with new random values on every draw would be cheaper conceptually and much more expensive aesthetically: the wall would fizz like a faulty cable.

# 3. Putting weather inside weather

Ordinary coherent noise supplies broad hills and hollows. It is too polite for some of the knots, folds, and abrupt changes of allegiance that make the prints worth inspecting. The next tool is **domain warping**: use one noise value to alter the coordinates at which another noise value is sampled.

A compact nested construction is

$$
\begin{aligned}
n_0&=N(s_0u+o_x,\ s_0v+o_y,\ \phi),\\
n_1&=N\!\left(s_1u+m_1(n_0-\tfrac12),\
               s_1v+m_2(n_0-\tfrac12),\
               0.73\phi\right),\\
n_2&=N\!\left(s_2u+m_3(n_1-\tfrac12)+w\sin(kv),\
               s_2v+m_4(n_0-\tfrac12)+w\cos(ku),\
               1.17\phi\right).
\end{aligned}
$$

All coordinates are dimensionless. The $s_j$ values set spatial frequencies; $m_j$ values set warp strengths; $w$ controls a bounded sinusoidal fold; and $k$ controls that fold's frequency. Subtracting $1/2$ centers a normalized noise value before using it as a displacement, so the warp can push in either direction rather than always marching toward positive coordinates. The phase multipliers keep the layers related without making them advance in lockstep.

Depth one uses $n_0$. Depth two allows $n_0$ to move the sampling domain of $n_1$. Depth three lets an already warped value influence another sample. A restrained fourth depth repeats the operation with clamped parameters. The final field can combine the available layers,

$$
W=\operatorname{clamp}_{0\le\,\cdot\,\le1}
\left(
\frac{a_0n_0+a_1n_1+a_2n_2}{a_0+a_1+a_2}
\right),
$$

where the non-negative weights $a_j$ control the contribution of each depth. The division is normalization by total weight; the clamp is a numerical guard, not an artistic revelation. If a malformed control value or accumulated floating-point error tries to leave the declared range, the renderer enforces $0\le W\le1$ rather than feeding an invalid direction into every subsequent mark.

What has the nesting bought us? The first layer offers broad continuity. The second folds coordinate space, so neighboring regions can curve around one another. The third creates smaller pockets in which the local direction changes unexpectedly. At excessive depth or warp strength, those pockets collapse into visual porridge. More machinery is not automatically more weather.

Nested noise should not be promoted into a profound natural theory. It is an artistic coordinate-warping device. Clouds, rivers, and turbulent fluids obey conservation laws, forces, transport, and boundary conditions that these few samples do not solve. The resemblance is useful for making and seeing structure; it is not evidence that nature runs the same formula behind the curtain.

The four synchronized plates below hold the seed fixed. Scrub through the steps to compare plain coherent noise, the warped domain, free and quantized directions, and the clipped final print. Because the input is fixed, a difference between panels belongs to the transformation rather than to a conveniently changed random draw.

<FieldAnatomy />

# 4. Directions with manners

A scalar field provides a number, not a direction. To make paths, the exhibit converts the field value into an angle. One free-angle rule is

$$
\theta(\mathbf{r})=
\operatorname{wrap}_{2\pi}
\left(2\pi\tau W(\mathbf{r},\phi)+b\right).
$$

$\mathbf{r}=(u,v)$ is the current normalized position, $\tau$ is the number of angular turns available across the field's value range, and $b$ is a local angular bias in radians. The wrap operation returns an equivalent angle satisfying $0\le\theta<2\pi$. In plain language, the scalar field becomes a compass whose needle may rotate through more than one full turn as $W$ goes from zero to one.

Free directions can curve anywhere. Geometry appears when the compass is restricted to an alphabet. For step size $q$,

$$
Q_q(\theta)=q\,\operatorname{round}\!\left(\frac{\theta}{q}\right).
$$

Orthogonal grammar uses $q=\pi/2$, so only multiples of $90^\circ$ survive. Diagonal grammar uses $q=\pi/4$, admitting $45^\circ$ increments. Hexagonal grammar uses $q=\pi/3$, admitting $60^\circ$ increments. Alternating grammar changes the applicable $q$ by seeded region or frame. Quantization acts on the direction field itself, before endpoints are calculated; drawing an unrestricted line and merely snapping its final pixel would not produce the same local logic.

Soft geometry must interpolate around the circle rather than through an arbitrary numerical discontinuity at $0$ and $2\pi$. The exhibit can move along the shortest signed angular difference:

$$
\theta_{\text{soft}}
=\theta+\alpha\,
\operatorname{wrap}_{\pi}\!\left(Q_q(\theta)-\theta\right),
\qquad 0\le\alpha\le1.
$$

Here $\operatorname{wrap}_{\pi}$ returns a difference $d$ satisfying $-\pi\le d<\pi$, and $\alpha$ is the blend. At $\alpha=0$ the direction is free; at $\alpha=1$ it is fully quantized. Without the wrapped difference, interpolating from $359^\circ$ to $1^\circ$ could take the scenic route through $180^\circ$, which is an impressive journey and the wrong one.

Sampling an angle once at the start of a segment is the crude Euler method; it cuts across bends when the field turns quickly. The renderer instead uses a midpoint, or second-order Runge–Kutta, step. Define the unit direction $\mathbf{d}(\mathbf{r})=(\cos\theta(\mathbf{r}),\sin\theta(\mathbf{r}))$. Then

$$
\begin{aligned}
\mathbf{k}_1&=\mathbf{d}(\mathbf{r}_j),\\
\mathbf{k}_2&=\mathbf{d}\!\left(\mathbf{r}_j+\tfrac12\ell\mathbf{k}_1\right),\\
\mathbf{r}_{j+1}&=\mathbf{r}_j+\ell\mathbf{k}_2.
\end{aligned}
$$

$j$ counts path segments and $\ell$ is a normalized step length. $\mathbf{k}_1$ predicts the direction to the halfway point; $\mathbf{k}_2$ samples there and supplies the actual step. This is a numerical tracing rule for an artistic vector field. It does not represent the velocity of air or a particle with mass. Smaller $\ell$ follows curvature more faithfully but requires more samples; a large $\ell$ can still jump across a narrow bend. RK2 reduces that error without pretending finite steps are continuous curves.

## A worked step through five directional alphabets

Suppose the free field at one point gives $\theta=67^\circ$ and is locally constant over the first short step, so the two RK2 direction samples agree. Start at $\mathbf{r}_0=(0.4000,0.5500)$ and take one step of length $\ell=0.0200$. In the exhibit's normalized canvas coordinates, $u$ increases rightward and $v$ downward.

The unrestricted step is

$$
\mathbf{r}_1
=(0.4000,0.5500)
+0.0200(\cos67^\circ,\sin67^\circ)
\approx(0.4078,0.5684).
$$

Orthogonal grammar rounds $67^\circ$ to $90^\circ$, yielding $(0.4000,0.5700)$. Diagonal grammar rounds it to $45^\circ$, yielding approximately $(0.4141,0.5641)$. Hexagonal grammar rounds it to $60^\circ$, yielding approximately $(0.4100,0.5673)$. A soft diagonal blend with $\alpha=0.4$ produces $67^\circ+0.4(45^\circ-67^\circ)=58.2^\circ$, yielding approximately $(0.4105,0.5670)$.

The sanity check is the distance traveled. Every endpoint remains $0.0200$ from the start, up to rounding. Quantization has changed direction, not speed. Repeat the midpoint step while resampling the field and the paths acquire their characteristic grammars: plumbing from right angles, weaving or rain from diagonals, a crystalline tendency from sixth-turns, and organic current from the unrestricted compass. The same scalar value has not changed; the permitted language for answering it has.

# 5. Texture becomes an object when it meets a boundary

A field drawn across an infinite plane is atmosphere. A frame requires a decision about where the atmosphere is allowed to become ink.

Let $A_i(u,v)$ be the procedural color calculated for artwork $i$, let $G_i(u,v)$ be its ground or mat color, and let $M_i(u,v)$ be a mask. With antialiased edges, the mask satisfies $0\le M_i\le1$ rather than taking only zero and one. The clipped print is

$$
P_i(u,v)=M_i(u,v)A_i(u,v)+\bigl(1-M_i(u,v)\bigr)G_i(u,v).
$$

Where $M_i=1$, the procedural artwork is visible. Where $M_i=0$, only the ground remains. Fractional values blend the boundary across a narrow pixel-scale transition. This is compositing, not a change to the weather field. An arch and an oval can sample identical values of $W$ while becoming different objects because their allowed regions differ.

The masks include rectangles of several proportions, arches, ovals, stepped niches, restrained quadrilaterals, split panels, diptychs, and multi-window frames. A disconnected mask is allowed: an offset diptych gives one instrument two apertures onto related coordinates. The frame, mat, rim, and shadow are drawn after the clipped artwork, because a frame is furniture around the print, not another pigment caught in its flow.

There is a tempting shortcut: draw beyond the intended boundary, paint the wall over the excess, and place a rim on top. It nearly works. It fails at semitransparent marks, high-resolution export, and soft edges, where covered strokes can leave dark fringes or contaminate a shadow. True clipping establishes the allowed region before marks are composited. The difference is most visible precisely where viewers are likely to look—the edge where texture becomes object.

Another failure arrives when density ignores scale. A narrow frame given long, heavy paths can become a uniformly dark lozenge. The renderer therefore scales stroke weight, mat width, and shadow softness with output size, while its live path budget stays bounded by the viewport class. A small work should look concentrated, not accidentally overprinted.

# 6. The river hiding around one half

The secondary ink is not scattered independently. It appears where a second coherent field $R(u,v,\phi)$ satisfies a threshold rule. River mode selects a narrow band around the midpoint:

$$
B_{\text{river}}(u,v)
=\mathbf{1}\!\left(\left|R(u,v,\phi)-\tfrac12\right|\le\delta\right).
$$

$\mathbf{1}(\cdot)$ is an indicator: one when the condition is true and zero otherwise. The half-width $\delta>0$ controls the band. If $R=0.53$ and $\delta=0.04$, the point is selected; if $R=0.55$, it is not. The arithmetic is modest. The geometry is not.

The equation $R(u,v,\phi)=1/2$ defines a **level set**. For a smooth two-dimensional field, and away from points where the gradient vanishes, a level set is locally curve-like. The threshold includes a thin neighborhood on both sides of that curve. Its approximate local thickness is

$$
d\approx\frac{2\delta}{\lVert\nabla R\rVert}.
$$

$\nabla R$ is the spatial gradient. Where the field changes steeply, the same value interval occupies a narrow strip. Where it changes slowly, the strip widens. Near a critical point, where $\lVert\nabla R\rVert$ approaches zero, the approximation breaks down and the band may swell, pinch, branch, or close. Those exceptions help produce the river's useful irregularity. They do not guarantee one connected channel from one side of the frame to the other.

Islands mode asks a different question. It selects both tails,

$$
B_{\text{islands}}(u,v)
=\mathbf{1}\!\left(R(u,v,\phi)\le\eta
\ \text{or}\
R(u,v,\phi)\ge1-\eta\right),
\qquad 0<\eta<\tfrac12.
$$

Small and large values tend to gather around local hollows and peaks, so the selected regions more often form separated patches. Delta mode compares two nearby samples from the decorrelated secondary field, then thresholds their difference so a principal channel can fan into smaller deterministic regions. The three names describe visual behavior, not hydrology: there is no elevation, discharge, sediment, erosion, or conservation of water in the calculation.

Thresholds expose a sampling boundary. If $\delta$ is narrower than the change in $R$ across one sampling step, a genuine mathematical band can fall between samples and disappear from the raster. If $\delta$ is too large, the channel floods most of the frame and stops functioning as a secondary structure. The renderer bounds the controls and samples at export resolution so that changing output size reveals detail rather than silently changing the recipe.

# 7. Contrast is a data structure

A palette list is insufficient. A pale yellow line may be handsome on charcoal and nearly absent on warm plaster. Selecting the ground and inks as three independent random choices produces combinations that are individually attractive and collectively apologetic.

The exhibit instead stores compatibility. If $g$ indexes grounds and $j$ indexes inks, define

$$
C_{gj}=
\begin{cases}
1,&\text{if ink }j\text{ is approved on ground }g,\\
0,&\text{otherwise.}
\end{cases}
$$

This matrix is curated data. A primary ink is sampled only from entries with $C_{gj}=1$. A secondary ink must also remain distinguishable from the ground and from the primary field where the two overlap. The constraint changes the sample space before randomness chooses; it does not draw an illegible pair and hope a shadow will negotiate peace.

One useful numerical check begins with relative luminance. For two colors with luminances $L_1$ and $L_2$, where $L_1\ge L_2$, the contrast ratio is

$$
K=\frac{L_1+0.05}{L_2+0.05}.
$$

Relative luminance and the $0.05$ offset follow the familiar accessibility contrast calculation. As an illustrative check, a ground with $L_1=0.82$ and an ink with $L_2=0.08$ give $K\approx6.69$. An ink at $L_2=0.23$ gives only $K\approx3.11$ against the same ground. The numbers do not settle the artistic decision: a broad decorative shape, a one-pixel thread, and twelve-point interface text do not have the same visual burden.

This is why the compatibility matrix is necessary and insufficient. Human review still catches simultaneous contrast, vibrating hue pairs, thin marks that vanish despite a respectable ratio, and dense crossings that merge into one dark mass. Interface text and controls obey the site's functional contrast requirements; the framed art is also checked as art, including in light, dark, high-contrast, and forced-color contexts. A legal number can certify a ratio. It cannot stand in a gallery and squint.

# 8. One room, many aspect ratios

The exhibition must fit a wide monitor, a portrait phone, a tablet, a focus view, and an export several times larger than the screen. Stretching one finished bitmap would make frames fat, lines soft, and shadows strangely athletic. The layout is therefore geometry, not a screenshot.

Each frame begins in normalized coordinates,

$$
F_i=(x_i,y_i,w_i,h_i),
\qquad
0\le x_i,\ y_i,\ x_i+w_i,\ y_i+h_i\le1.
$$

$x_i$ and $y_i$ locate the frame's upper-left corner within a canonical wall; $w_i$ and $h_i$ are its normalized dimensions. Layout validation checks these bounds, minimum gutters, overlap rules, and stable keyboard order. A triptych remains three primary works because a narrow screen appeared; responsive design is not permission to miscount.

For a canonical composition of size $W_c\times H_c$ fitted inside a pixel region $W_p\times H_p$, a non-distorting scale is

$$
\sigma=\min\!\left(\frac{W_p}{W_c},\frac{H_p}{H_c}\right).
$$

After choosing offsets for centring, all positions, lengths, mat widths, and shadows are multiplied by $\sigma$ and rendered afresh. Aspect ratio is preserved because both axes use the same scale. Portrait presentation can apply a deterministic hanging plan belonging to the same layout family—typically placing the stage above compact controls and giving selected-work information its own HTML space—without changing artwork sub-seeds or the structural recipe.

This separation matters for reproducibility. Resizing the browser changes the fitting transform and sampling density, not the identity of a frame, its field family, mask, palette, or normalized paths. Focus view similarly rerenders the selected work at the available size. It does not enlarge the existing canvas like a security camera zooming into yesterday's pixels.

Export makes the distinction visible. A requested PNG size creates a bounded off-screen render using the same normalized recipe and frozen phase. Density-aware stroke and shadow rules preserve the intended weight at the new resolution. Unsafe dimensions are refused or clamped, because a browser tab is a poor place to discover that “poster size” meant several gigabytes.

# 9. Curated chance

Randomness can choose. It cannot, by itself, curate.

The master seed is first converted into a repeatable pseudorandom stream. Structural decisions—layout family, frame subset, masks, field transformations, palette family, compatible inks, and density ranges—consume that stream in a fixed order. No call to `Math.random()` is allowed to wander in later and improvise a new frame during export.

Artwork $i$ receives a stable sub-seed of the form

$$
s_i=H\!\left(v\,\Vert\,s\,\Vert\,i\,\Vert\,\lambda\,\Vert\,f_i\right).
$$

$H$ is a deterministic hash, $v$ is the generator version, $s$ is the master seed, $i$ is the artwork index, $\lambda$ is the layout identifier, $f_i$ is the field-family identifier, and $\Vert$ denotes unambiguous concatenation. Including the version prevents a later algorithm from pretending to be the old one. Including the frame's stable identity means an unrelated interface action does not reshuffle every subsequent random choice.

Curation occurs through constraints. Normalized layout templates guarantee their edge insets and gutters before any frame is drawn, while a deterministic subset limits how many mask families enter one room. A ground admits only compatible inks. Depth four is uncommon and bounded. Shadow density follows output scale. Adjacent works may be discouraged from sharing the same directional grammar, while one repeated rule can be retained deliberately to make kinship visible. Randomness supplies choices; authored rules decide which combinations are eligible to appear together.

That eligibility has consequences. Filtering, weighting, and layout coercion are not neutral: they change the final distribution, sometimes sharply. If an oval mask is permitted only in a few coherent subsets, it will appear less often than a plain rectangle even when both exist in the code. The relevant promise is therefore not that every option appears equally often. It is that the constraints are explicit, deterministic, tested, and chosen for the exhibition's visual grammar.

The result sits between rigid design and indiscriminate variation. A preset such as **Monsoon Ledger** is not a stored picture. It is a bounded region of recipe space: certain layout tendencies, depths, directional alphabets, threshold behaviors, and palette compatibilities. The seed finds one lawful exhibition inside that region.

# 10. Reproducibility

A seed is necessary for reconstruction and not sufficient. The same seed under a different preset, layout, depth, threshold, angle grammar, generator version, or animation phase describes a different exhibition. Reproducibility requires a state model.

Write the shareable state schematically as

$$
S=(v,s,p,\lambda,c,d,q,b,m,\phi_f).
$$

The symbols record generator version $v$, master seed $s$, preset $p$, layout $\lambda$, palette family $c$, nesting depth $d$, direction grammar $q$, threshold-band settings $b$, motion mode $m$, and optional frozen phase $\phi_f$. The actual serialization uses named, versioned fields rather than asking a future reader to remember this compact tuple. Defaults may be omitted from the URL because the version defines them; invalid numbers are clamped, and unknown enum values fall back safely.

Freezing differs from pausing. Pause is a local playback choice: phase progression stops until resumed. Freeze captures the current phase as $\phi_f$ and includes it in the permanent state, turning the moving exhibition into a reconstructible still. A shared paused link without a frozen phase would otherwise know that the clock had stopped but not precisely where its hand was.

For comparison and testing, structural state is converted to canonical JSON and hashed:

$$
h_{\text{recipe}}=H\!\left(\operatorname{canonicalJSON}(S_{\text{structural}})\right).
$$

Canonical JSON fixes key ordering and normalized values before hashing. $S_{\text{structural}}$ excludes view-only choices such as the selected frame and browser dimensions. Selecting artwork seven or rotating a phone must not claim to have generated a new exhibition. Changing nesting depth or a frame-producing layout must.

The permanent URL serializes this state while preserving unrelated query parameters. On load, the exhibit parses and validates it before constructing the p5 instance. The JSON export records the same compact recipe with its version and hash. PNG export records the visible wall or selected work at the requested bounded resolution. Both operations are local to the browser; normal generation, sharing-state construction, and export require no server.

Determinism has an honest boundary. The same versioned recipe reconstructs the same fields, structural choices, normalized geometry samples, threshold classes, and hash. Exact pixels can still differ slightly across browsers because antialiasing, font rasterization, color management, and floating-point graphics paths are not one universal machine. Tests therefore compare state, hashes, counts, and stable geometry samples, using full-canvas pixel equality only inside a fixed visual-regression environment. Reproducibility is strongest when it states what is reproduced.

## Inspiration and implementation

This project was inspired by [*Little Galleries* by Steve's Makerspace on fxhash](https://www.fxhash.xyz/project/little-galleries). The artist's [process video](https://youtu.be/ofpwI84xDdI?si=l3QXdaLrWpQZ4OI7) discusses nested noise, restrictions on field direction, procedural textures clipped into shapes, palettes constructed around contrast-compatible combinations, and regions selected by thresholding a noise field.

*The Museum of Invisible Weather* is an independent implementation. It extends those general techniques into a different premise and system: one shared weather field interpreted by a room of local instruments, a responsive curator interface, synchronized explanatory diagrams, deterministic and versioned URL state, frozen-phase sharing, and PNG and JSON export. No source code, assets, palettes, exact compositions, or project name from the original work were copied.

The fxhash project is the context of the inspiration, not the subject of this article. The useful trail leads back to the techniques: how a smooth field becomes a family, how restrictions create visual grammar, how clipping gives atmosphere a boundary, and how deterministic curation turns chance into an exhibition one can revisit.

For adjacent instruments, [the Living Pigment Studio](/blog/visualizations/create-art-living-pigment-studio) treats a mark as evolving material, while [the Fractal Atlas](/blog/visualizations/the-fractal-atlas) examines a very different bargain between deterministic rules and inexhaustible pictures.
