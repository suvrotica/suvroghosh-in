---
title: "The Pixel Has a Postbox: Build a 3D World with Ray Marching"
description: "Build an interactive 3D world from signed distance fields, one camera ray and one fragment shader—then walk through the mathematics that makes it visible."
date: "2026-08-15"
dateModified: "2026-08-15"
category: "Visualizations"
tags: ["Shaders","Ray Marching","Signed Distance Fields","WebGL","p5.js","Creative Coding","Computer Graphics","Fragment Shader","Sphere Tracing","Running Fragment Shader"]
pinnedTags: ["Shaders", "Ray Marching", "Signed Distance Fields", "WebGL", "p5.js", "Creative Coding", "Computer Graphics", "Fragment Shader"]
published: true
interactiveFirst: true
thumbnail: "/images/visualizations/ray-marching-cathedral/ray-marching-fragment-shader-og.jpg"
thumbnailAlt: "A symmetrical hall of dark arches recedes into blue fog around a floating black orb. A narrow cyan-and-gold ring expands from the orb and travels across the floor, columns, and archways."
color: "#22D3EE"
author: "Suvro Ghosh"
readingTime: "22 min"
---

<script>
	import RayMarchingExhibit from '$lib/components/visualizations/ray-marching/RayMarchingExhibit.svelte';
	import RayStepDiagram from '$lib/components/visualizations/ray-marching/RayStepDiagram.svelte';
</script>

<RayMarchingExhibit />

<TTS />

## Quick Answer

A ray-marched picture asks one question for each fragment: if a ray leaves the camera in this direction, what does it meet? A distance function returns a safe step towards the nearest surface. The ray advances and asks again until a near-zero answer marks a hit, or the finite budget marks a miss. The exhibit repeats that conversation inside one fragment shader, then estimates a normal and adds deliberately approximate light and fog. The browser still rasterises a full-screen plane; the apparent columns, arches, floor and orb are implicit surfaces calculated in the shader.

## Key Terms

- **Camera ray:** an origin and normalised direction for one line of sight.
- **Ray marching:** methods that sample repeatedly along a ray.
- **Sphere tracing:** ray marching with steps supplied by a distance bound.
- **Signed-distance function (SDF):** Euclidean distance to a surface, signed to distinguish outside from inside.
- **Distance estimator or bound:** a conservative distance-like value used when an operation no longer preserves an exact SDF.
- **Hit epsilon:** the distance below which the marcher accepts a hit.
- **Surface normal:** here, an estimated direction perpendicular to an implicit surface, not stored mesh data.
- **Constructive geometry:** union, intersection or subtraction made by combining distances.

## From a luminous field to a solid-looking world

In [Hello, Fragment: Your First Shader from Scratch](/blog/visualizations/hello-fragment-your-first-shader-from-scratch), every fragment turned position, time, pointer and resolution into colour. Its rings were a procedural field: no particle crossed the canvas and no water equation was solved.

This sequel keeps that honest little programme and changes its question. Instead of asking, “What colour belongs at this coordinate?”, each fragment asks, “What lies along the line from a camera through this coordinate?”

Think of the marcher as a tiny postman. At each address it asks, “How far may I travel without crossing a surface?” The distance field writes back. It takes that safe step and asks again. A tiny reply means the letter has reached a wall, floor, column or orb. Repeated across the view, those deliveries assemble the Cathedral of Distance.

The metaphor is useful because it names the conversation. The equations tell us precisely how the postman walks.

## Why a flat rectangle can depict an implicit 3D surface

WebGL does not invoke a fragment shader in a vacuum. The host supplies and rasterises a plane covering the view, and the fragment shader runs for the resulting fragments. Here one fragment usually contributes colour at one framebuffer location, but a fragment and a physical display pixel are not universally identical.

None of the visible architecture is sent as triangles. `mapScene` instead returns the nearest distance or conservative bound and a stable material identifier for any 3D point. Camera, marcher and lighting code interrogate that function. This is a rasterised rectangle depicting implicit 3D surfaces, not a world without host geometry.

## Give every fragment a camera ray

Let the camera origin be $\mathbf{r}_o$ and its normalised viewing direction for one fragment be $\mathbf{r}_d$. Every point along that ray is

$$
\mathbf{p}(t)=\mathbf{r}_o+t\mathbf{r}_d,
$$

where $t$ is accumulated travel distance. At $t=0$, the point is at the camera. Increasing $t$ moves it forwards.

The shader constructs $\mathbf{r}_d$ from a camera basis. **Forward** points to the target. **Right** is perpendicular to forward and world up; **up** is perpendicular to both. Centred, aspect-correct fragment coordinates choose amounts of right and up, while focal length controls how strongly forward dominates. Normalising the sum produces a ray direction.

Without aspect correction against the backing buffer's real dimensions, a sphere becomes an egg. Pointer mapping separately begins with the canvas's CSS rectangle and accounts for the shader's bottom-up coordinates.

## Signed distance: outside, surface, inside

For a sphere centred at $\mathbf{c}$ with radius $r$, the exact signed distance is

$$
D(\mathbf{p})=\lVert\mathbf{p}-\mathbf{c}\rVert-r.
$$

Outside, the answer is positive; on the surface, zero; inside, negative. The sign describes both a boundary and which side contains solid material.

Excerpt from the running fragment shader:

```glsl
float sdSphere(vec3 point, vec3 centre, float radius) {
  return length(point - centre) - radius;
}
```

The isolated sphere is exact, but that word does not extend casually to the whole cathedral. Smooth blends, displacement, non-uniform transforms and deformations may produce only an estimator or bound. The final scene therefore uses a conservative step multiplier: “distance-like and safe” is the honest claim for its composed architecture.

## Sphere tracing: how the postman walks

At iteration $i$, the marcher samples its current point:

$$
d_i=D\bigl(\mathbf{p}(t_i)\bigr).
$$

It then advances by

$$
t_{i+1}=t_i+s\,d_i,
$$

where $s$ is a conservative safety multiplier: here, $s=0.8$. An exact distance permits the whole step. The smaller multiplier leaves margin for blends, deformations and floating-point arithmetic where the composed field is only a bound.

Excerpt from the running fragment shader:

```glsl
vec4 marchScene(vec3 rayOrigin, vec3 rayDirection) {
  float distanceTravelled = NEAR_CLIP;
  float material = -1.0;
  float normalizedSteps = 1.0;
  float glowAccumulator = 0.0;

  for (int stepIndex = 0; stepIndex < RM_MAIN_STEPS; stepIndex++) {
    vec3 samplePoint = rayOrigin + rayDirection * distanceTravelled;
    vec2 sceneSample = mapScene(samplePoint);
    float epsilon = distanceAwareEpsilon(distanceTravelled);

    if (
      currentStage() >= 8.0 &&
      sceneSample.y > MATERIAL_STONE + 0.1 &&
      sceneSample.y < MATERIAL_ORB - 0.1
    ) {
      float nearbyGlow = max(0.0, 0.055 - abs(sceneSample.x)) * 0.045;
      glowAccumulator = min(0.16, glowAccumulator + nearbyGlow);
    }

    if (sceneSample.x < epsilon) {
      material = sceneSample.y;
      normalizedSteps = float(stepIndex + 1) / float(RM_MAIN_STEPS);
      break;
    }

    distanceTravelled += max(sceneSample.x * SAFETY_FACTOR, MINIMUM_STEP);
    if (distanceTravelled > FAR_CLIP) {
      distanceTravelled = FAR_CLIP + 1.0;
      normalizedSteps = float(stepIndex + 1) / float(RM_MAIN_STEPS);
      break;
    }
  }

  return vec4(distanceTravelled, material, normalizedSteps, glowAccumulator);
}
```

The constant ceiling keeps GLSL ES 1.00 portable. A hit needs a small distance within the finite range; the far clip or quality tier's step budget produces a miss. Fog hides that boundary instead of pretending calculation continues forever.

The diagram shows the same process in a 2D slice. Each circle is the returned safe distance; its controls select a step, while the table gives accumulated $t$, returned distance and hit or miss state without relying on motion or colour.

<RayStepDiagram />

John C. Hart named and analysed this distance-guided method as **sphere tracing**. Ray marching is the wider family; sphere tracing is the particular member whose field supplies the step bound.

## Build the cathedral in eight views

The exhibit starts at stage eight because the reward should arrive before the scaffolding. Choose **Build it** to make the same canvas and shader reveal the construction. An integer stage uniform changes the rendering mode; the page does not keep eight WebGL contexts burning below the prose.

### 1. Camera rays

The first view encodes ray direction as RGB. There is no march or surface. Dragging changes the camera basis and colours. Missing aspect correction bends the bands; a flipped vertical coordinate makes pointer and camera disagree.

### 2. One distance

The sphere SDF enters alone, distinguishing positive space, the zero boundary and negative interior before rendering a plain silhouette. This is the last simple object, not the destination. The final orb uses the same primitive outside the repeated architecture, keeping one stable focal object.

### 3. The walking loop

Now `marchScene` repeatedly calls `mapScene`. Colour and luminance encode normalised iteration count: broad empty regions are cheap; grazing angles ask more questions. Maximum steps limit work, the far clip ends fruitless journeys, the hit epsilon defines “near enough”, and a minimum step prevents vanishing progress. This is a work map, not a benchmark.

### 4. Surface direction

Only after a hit does the shader estimate a normal and map its signed components to RGB. Curves change smoothly; planes stay nearly constant. No visible mesh stores these directions.

### 5. Constructive geometry

A plane becomes the floor; rounded boxes and capped cylinders form bases, columns and beams. An extruded 2D arch profile is opened by subtraction. Union joins pieces and one restrained smooth union softens selected joints. Simple lighting waits until silhouettes read clearly.

Excerpt from the running fragment shader:

```glsl
vec2 mapScene(vec3 point) {
  float stage = currentStage();
  if (stage < 5.0) {
    return vec2(sdSphere(point, vec3(0.0, 1.55, -4.4), 1.0), MATERIAL_STONE);
  }

  vec2 result = vec2(sdPlane(point), MATERIAL_FLOOR);
  vec3 architecturalPoint = point;
  if (stage >= 6.0) {
    architecturalPoint = foldArchitecturalSpace(point);
  } else {
    architecturalPoint.z += 4.5;
  }
  result = nearer(result, mapBay(architecturalPoint, stage >= 8.0 ? 1.0 : 0.0));

  if (stage >= 6.0) {
    float orb = sdSphere(point, ORB_POSITION, 0.62);
    result = nearer(result, vec2(orb, MATERIAL_ORB));
  }

  if (stage >= 8.0) {
    float leftAisleSeam = sdRoundedBox(
      point - vec3(-1.28, 0.025, -12.8),
      vec3(0.035, 0.025, 11.8),
      0.012
    );
    float rightAisleSeam = sdRoundedBox(
      point - vec3(1.28, 0.025, -12.8),
      vec3(0.035, 0.025, 11.8),
      0.012
    );
    result = nearer(result, vec2(leftAisleSeam, MATERIAL_CYAN));
    result = nearer(result, vec2(rightAisleSeam, MATERIAL_AMBER));
  }

  return result;
}
```

The material ID travels beside distance, letting floor, stone, seams and orb receive stable treatments. Smooth blends choose IDs deliberately to prevent boundary flicker.

### 6. Fold space

The architectural coordinate repeats through bounded depth cells. It folds many world positions into one local question rather than allocating columns. A small per-cell rotation adds the slow impossible twist. The aisle remains open, the orb is separate, and solids stay away from modulo boundaries to avoid false seams.

### 7. Make light believable

Material colour gains hemispheric fill, diffuse light and restrained specular/Fresnel. AO makes a few short post-hit probes. High and Balanced trace a bounded soft-shadow ray from a normal-offset point; Saver compiles both the shadow and AO loops out. These are depth cues, not global illumination or a physical wet-floor renderer.

### 8. Lose the horizon

Cyan and amber emission reveals selected seams. Exponential fog merges distant geometry into a blue-black procedural background before the far clip shows. Tone mapping contains the pulse, gamma encoding prepares display colour, and coordinate-stable dither reduces banding without flicker. This is the Cathedral of Distance.

## Estimating a direction that was never stored

An implicit surface has no stored normal. Near a hit, its field changes fastest outwards, so nearby samples can estimate and normalise that gradient.

Excerpt from the running fragment shader:

```glsl
vec3 estimateNormal(vec3 point, float distanceTravelled) {
  float epsilon = max(0.0015, distanceAwareEpsilon(distanceTravelled) * 0.72);
  vec2 offset = vec2(epsilon, -epsilon);
  return normalize(
    offset.xyy * mapScene(point + offset.xyy).x +
    offset.yyx * mapScene(point + offset.yyx).x +
    offset.yxy * mapScene(point + offset.yxy).x +
    offset.xxx * mapScene(point + offset.xxx).x
  );
}
```

This tetrahedral estimate uses four post-hit queries. Too small an epsilon shimmers under limited precision; too large an epsilon erases nearby detail.

## Combining, subtracting and repeating questions

For two distances, `min(a, b)` selects their union; `max(a, -b)` subtracts `b` from `a`. A smooth minimum rounds a joint but may cease to be exact, so smooth union stays rare and the safety factor remains 0.8.

Rigidly rotating a query preserves distance. Centred repetition reuses a primitive without copied geometry when cells are bounded and features avoid fold boundaries. The cathedral transforms questions, not a warehouse of columns.

## Light, shadow, occlusion, emission and fog

The shading order is intentionally readable:

`material → ambient/hemisphere → diffuse → restrained specular/Fresnel → AO → shadow → emission/pulse → fog → tone map → gamma`

Ambient and hemispheric fill rescue unlit faces. Diffuse light follows the normal. Narrow specular and Fresnel terms make the floor look polished without tracing a reflection. AO darkens cramped neighbourhoods; soft shadow measures a ray's clearance towards the light. Emission is added, then fog spends distant contrast until the bounded hall feels vast.

Every query costs time. Misses skip normal, AO and shadow work; Saver removes expensive branches rather than merely blurring them.

## The signal carried from the first shader

A click, tap, **Pulse** button or focused `P` starts a JavaScript timer. The host converts pulse age to `u_pulseRadius`; the SDF remains untouched. At each hit, a narrow difference between world-space distance from the orb and that radius becomes emission.

Excerpt from the running fragment shader:

```glsl
float pulseDistance = length(point - ORB_POSITION);
float pulseOffset = (pulseDistance - max(u_pulseRadius, 0.0)) / 0.085;
float pulseBand = exp(-pulseOffset * pulseOffset) * clamp(u_pulseStrength, 0.0, 1.0);
float pulseColourMix = 0.5 + 0.5 * sin(point.x * 2.35 + point.z * 0.62);
vec3 pulseColour = mix(cyanEmission, amberEmission, pulseColourMix * 0.78);
linearColour += pulseColour * pulseBand *
  (0.72 + 0.28 * max(dot(normal, viewDirection), 0.0));
```

Every surface tests the band at its own hit position, so it crosses floor, columns, arches and ornament. It neither deforms `mapScene` nor starts another march, and simulates no physical light, sound, water or material wave. It is procedural illumination carrying the first article's motif into 3D.

Drag rotates without firing a pulse: release counts as a click only below a movement threshold. Clamped pitch and yaw prevent tumbles and floor entry.

## Break it deliberately

The debug views become clearer after these deliberate failures.

### Too few march steps

Rays stop before distant surfaces. Rear arches vanish, grazing edges tear, and fog cannot restore unsampled information. Lower tiers also remove shading and framebuffer demand so their geometry budget stays useful.

### A hit epsilon that is too large

The marcher accepts points away from surfaces: seams swell, corners round and shapes fuse. A distance-aware epsilon may grow gently as distant geometry covers fewer pixels; an indiscriminately large one is different.

### Unsafe overstepping

Stepping beyond a valid bound can leap through columns and flash holes. The `0.8` multiplier protects composed bounds, while details stay thicker than the hit epsilon.

### Starting the camera inside geometry

A negative first sample can become a false hit with a wrong normal. Camera clamps, the clear aisle and a near clip keep the origin outside every solid.

### Modulo seams

Naive repetition is discontinuous at cell boundaries, where a folded copy can become falsely nearest. Keeping architecture inside each cell stops the seam winning the query.

### Shadow acne

A shadow ray launched on a surface sees what it just left and produces dark freckles. A small normal offset prevents this; too much detaches shadows.

## What this visualization does—and does not—claim

This is ray marching; its distance-guided loop is sphere tracing. It is not path tracing, polygonal ray tracing, global illumination, physical glass, fluid simulation or a real building. No model, photograph, texture, cube map or recording supplies the world. p5.js manages WebGL and the host plane, not hidden architectural meshes.

Some primitives begin as exact SDFs. Composed `mapScene` is a distance estimator or conservative bound where operations break exactness. AO, shadows, wet highlights, fog, tone mapping and pulse are perceptual devices, not physical completeness.

## Why a phone may choose less work

Cost multiplies: fragments × primary steps × post-hit AO and shadow samples. A dense phone screen can request more fragments than a laptop with less sustained GPU headroom; CSS size hides that workload.

The exhibit starts Balanced. Auto measures active frames after warm-up, ignores compilation, resize, background and resume spikes, and may downgrade once after persistent trouble. It never silently climbs to High or oscillates.

| Tier | Main steps | Shadow steps | AO samples | Approximate framebuffer cap |
| --- | ---: | ---: | ---: | ---: |
| High | 96 | 24 | 5 | 1.35 million pixels |
| Balanced | 72 | 14 | 4 | 720 thousand pixels |
| Saver | 48 | 0 | 0 | 360 thousand pixels |

Saver removes the shadow and AO loops. `saveData` may retain the poster until explicitly loaded. Drawing stops while paused, offscreen or hidden and resumes only when still wanted. Reduced motion begins at a deterministic still, uses no camera drift or automatic pulse, and awaits **Start**; direct controls redraw one frame.

These are workload policies, not a frame-rate promise. Headless software rendering verifies behaviour, not phone performance.

## Experiments to try

1. Move between Camera rays, March cost and Normals. Which colours show direction, and which show work?
2. In March cost, compare a column's grazing edge with a ray aimed at the floor.
3. Reduce fog until you find the finite horizon it normally hides.
4. Compare Balanced with Saver for missing shadows and contact darkening, not only sharpness.
5. Pause and adjust the view: one static frame should redraw without continuous motion.
6. Launch a pulse in Distance bands. Illumination moves; geometry does not.
7. Enter fullscreen by keyboard, use arrows and Home, leave with Escape, and check focus returns.
8. Add `?webgl=off`: poster, prose, diagram and source should remain useful.

## Frequently asked questions

### What is ray marching?

Ray marching is a family of rendering methods that advance sample positions along a ray and evaluate something at each position. The advance may be fixed, adaptive or supplied by a field. The term alone does not guarantee an SDF, a particular lighting model or physical accuracy.

### What is sphere tracing?

Sphere tracing is distance-guided ray marching. At each point, a distance bound defines a sphere known not to cross the nearest surface, so the ray may advance by that radius, usually with a conservative multiplier when the field is only an estimator. John C. Hart formalised the method for implicit surfaces.

### How is this different from ordinary ray tracing?

Conventional polygonal ray tracing usually asks for intersections between a ray and explicit triangles or analytic primitives. This exhibit repeatedly samples an implicit distance field instead. Both send rays through a scene, but their geometry representation and intersection work differ. Neither term implies path tracing or multiple light bounces.

### What is a signed distance field?

An exact SDF returns Euclidean distance to the nearest surface, positive on one side and negative on the other. Zero identifies the boundary. Some composed functions in practical graphics preserve only a conservative distance estimate or bound, so the article names that distinction rather than calling every result exact.

### Why does the browser still draw a rectangle?

A fragment shader needs rasterised host geometry to create fragments. p5.js draws one full-screen plane or rectangle; the fragment shader calculates the apparent three-dimensional surfaces inside those fragments. The claim is that the visible architecture is implicit, not that the graphics pipeline has no triangles at all.

### Why can the scene run slowly on a phone?

Every framebuffer fragment may call `mapScene` dozens of times, and a surface hit can add normal, AO and shadow queries. High device-pixel ratio multiplies fragments. Saver reduces framebuffer pixels and removes shader work, while offscreen, hidden and paused states stop continuous drawing.

### Does the scene use Three.js, a model or a texture?

No. It uses the site's installed p5.js WebGL host and GLSL shaders. The hall, orb, materials, seams, background and dither are procedural. There is no imported mesh, model, photograph, cube map, stock texture or CSS filter pretending to be the scene.

### What happens when WebGL is unavailable?

The server-rendered poster remains in its reserved figure, followed by the full article, ray-step table and source material. A concise fallback explains that the live shader could not start and offers Retry when retrying could help. Context loss similarly keeps the poster and application state while GPU resources are rebuilt.

## Sources and further reading

- John C. Hart, [“Sphere Tracing: A Geometric Method for the Antialiased Ray Tracing of Implicit Surfaces” (1996)](https://experts.illinois.edu/en/publications/sphere-tracing-a-geometric-method-for-the-antialiased-ray-tracing/). The historical and technical anchor for distance-guided sphere tracing.
- p5.js, [`p5.Shader` reference](https://p5js.org/reference/p5/p5.Shader/), [`loadShader` reference](https://p5js.org/reference/p5/loadShader/), and [Introduction to Shaders](https://p5js.org/tutorials/intro-to-glsl/). These define the host API and shader conventions used here.
- MDN, [WebGL best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices). Guidance for precision, resource limits, back buffers and browser-friendly rendering.
- MDN, [`webglcontextlost`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/webglcontextlost_event) and [`webglcontextrestored`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/webglcontextrestored_event). The lifecycle events behind the exhibit's recoverable context-loss state.

The first article taught the fragment to turn shared numbers into colour. This one gave that fragment a postbox, a direction and permission to keep asking the world how far it may safely go.
