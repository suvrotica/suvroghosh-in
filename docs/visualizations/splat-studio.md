# Splat Studio

Splat Studio is a browser-local procedural art tool at `/tools/splat-studio`. It
creates seeded 3D sculptures from coloured splats and exposes controls for their
form, material, colour, movement and camera. The page uses the existing SvelteKit
immersive studio shell and the installed Three.js dependency.

The [visualization gallery](/blog/visualizations) links to the studio through a
static capture of Aurora Knot. The gallery does not start a second renderer;
the interactive scene loads when a visitor opens the tool. Its canonical URL is
also included in the site's sitemap, and the captured artwork supplies the
route's social preview.

## Local preview

Run the feature preview without regenerating the site's publication artifacts:

```sh
node scripts/preview-splat-studio.mjs
```

Open [the local studio](http://127.0.0.1:4326/tools/splat-studio). For a production
bundle of the same component, use:

```sh
node scripts/preview-splat-studio.mjs --preview
```

`--build` builds that bundle and exits. Its generated entry point and output live
under ignored `node_modules/.cache/splat-studio-preview/`; it does not replace
the site's production `build/` directory. `SPLAT_STUDIO_PREVIEW_PORT` changes the
loopback port. The feature preview mounts the production component with a small
local HTML shell; the SvelteKit route also supplies the site's minimal studio
shell and SEO component.

## Presets and rendering styles

| Preset           | Composition                                  |
| ---------------- | -------------------------------------------- |
| Aurora Knot      | Interwoven ribbons following a knotted loop  |
| Chromatic Nebula | Layered veils around a hollow centre         |
| Liquid Bloom     | Breathing petal-like sheets                  |
| Magnetic Storm   | Orbital filaments around multiple attractors |
| Prism Reef       | Branching clusters with a jewel-like palette |
| Impossible Torus | A twisted ring with internal currents        |

The style selector offers soft Gaussian marks, oriented anisotropic Gaussians,
elliptical surfels, textured ink marks, crisp sparks and a hybrid cloud/spark
material. These are procedural splat shaders and seeded mathematical forms. The
tool does not load a trained radiance field or reconstruct a photographed scene.
The renderer accumulates emissive marks with order-independent additive blending,
depth attenuation and bloom. Its surfel mode remains an artistic translucent
material rather than an opaque surface reconstruction.

Primary controls change density, size, flow, animation speed and glow. Expand
Shape, Splats, Colour, Motion and View for the remaining controls. A seed defines
the generated spatial samples; reusing it with the same settings reproduces that
geometry. “Surprise me” samples a bounded, curated group of settings.

Drag to orbit and scroll or pinch to zoom. With the canvas focused, arrow keys
orbit, `+`/`-` zoom and `Home` resets the camera. The transport pauses the animation,
the camera reset restores the initial view, and hiding controls gives the canvas
more room. The PNG export includes the artwork without interface controls.

“Copy scene link” serializes the bounded settings and seed into a versioned URL.
The link restores a scene configuration rather than an exact animation frame or
manually orbited camera pose. Settings are public in the copied URL; the tool
does not need a server account or save a private project.

## Module and resource ownership

- `src/lib/components/visualizations/splat-studio/SplatStudio.svelte` owns the UI,
  current settings, transport, exports and renderer mount lifetime.
- `src/lib/visualizations/splat-studio/model.ts` contains presets, numeric bounds,
  normalization, the URL codec, curated randomization and seeded geometry.
- `src/lib/visualizations/splat-studio/renderer.ts` owns the Three.js scene,
  shaders, controls, frame scheduling, observers and GPU resource disposal.
- `src/lib/visualizations/splat-studio/canvas-renderer.ts` owns the bounded CPU
  projection, cached mark sprites and compatibility-mode input/lifecycle resources.
- `src/routes/tools/splat-studio/+page.svelte` provides the route and SEO metadata.

Geometry generation runs when shape inputs change. The GPU applies per-frame
motion and material controls. Quality settings bound the splat count and display
resolution. Rendering respects reduced motion and pauses when the document or
canvas is not visible. WebGL initialization, shader or context failures switch to
an interactive Canvas 2D compatibility renderer on a fresh canvas. This uses the
same seeded 3D forms with fewer splats and approximate glow, retaining the six
styles, all settings, orbit/zoom, transport, scene links and PNG export. The
current settings and pause state survive the switch; animation time and camera
orbit restart. A readable error is shown only if Canvas 2D is also unavailable.
`?webgl=off` explicitly selects this mode. No browser settings need to be changed.

No application endpoint, provider, secret, database or cross-feature state store
is added. The renderer is loaded on the client and destroyed when the component
unmounts. Existing site CSP, measurement consent and security boundaries remain
owned by their current modules.

## Verification

The preview helper also writes a focused TypeScript configuration for the studio
component, model, renderer and route. After building the preview, check those
sources without requiring unrelated in-progress tools to pass:

```sh
node scripts/preview-splat-studio.mjs --build
npx svelte-kit sync
npx svelte-check --tsconfig node_modules/.cache/splat-studio-preview/tsconfig.json
```

Run the focused browser suite against a loopback production preview:

```sh
npx playwright test --config playwright.splat-studio.config.ts
```

The default suite runs Chromium, Firefox and WebKit. To also test installed
Chrome and Edge, set `SPLAT_STUDIO_BROWSERS=chromium,chrome,edge,firefox,webkit`.
The suite blocks service workers and covers all presets and styles, rendered
canvas content, keyboard tuning, clipboard-denial link restoration, PNG download,
transport, immersive controls and mobile overflow. Compatibility tests exercise
`?webgl=off`, failed/thrown WebGL creation, missing HDR buffer support and failed
GPU module loading. GPU context loss must switch to working Canvas 2D artwork
with settings and transport preserved. It writes
desktop and mobile captures to `artifacts/splat-studio/`.
An additional regression drags the paused canvas with the mouse and exercises
actual context loss and compatibility fallback through `WEBGL_lose_context`, when that optional
browser testing extension is available.

If the production preview is already running, set `PLAYWRIGHT_REUSE_SERVER=1`.
The full-site check and feature build remain separate verification of SvelteKit
integration; the feature preview alone does not establish a deployed release.

Release verification on 27 October 2026 used an isolated checkout of the latest
production branch. Repository-wide `npm run check` passed with zero errors and
warnings. All 14 model tests and all 13 architecture-gate fixtures passed.
`npm run build:full` completed successfully, including feature artifact audits,
notebook preparation, content generation and validation, search indexing,
link validation, server/client compilation, prerendering, discoverability checks
and the emitted Barnum route-asset audit.

Two build fixes preserve the existing checks: the Barnum corpus audit loads its
pure production modules through an in-memory esbuild bundle and retains all
1,000 sessions and release gates; the generated essay-anatomy TypeScript catalog
is pinned to LF line endings so fresh Windows checkouts retain its byte identity.
The studio's generated media changes contain only its captured poster and the
corresponding gallery, optimization and dimension records.

All seven browser tests passed against the complete SvelteKit production preview
in 14.8 seconds. A separate bounded smoke check verified the rendered studio,
canonical URL, social image and dimensions, gallery link, sitemap entry, mobile
layout and zero CSP or runtime errors. Tests reuse the site's remembered-media
fixture. On loopback previews only, they provide the Vercel-hosted analytics
script endpoint that Vite does not serve; live-host verification uses the real
platform endpoint without a stub.


## Browser compatibility repair — 30 October 2026

The reported Edge failure was reproduced in the owner's existing browser profile:
WebGL creation failed and the previous implementation displayed an error. The
same profile renders animated artwork with the compatibility renderer, and
preset switching and pause controls were verified without changing browser settings.

The repair uses actual context/HDR capability checks, releases failed or abandoned
GPU contexts, and replaces the canvas before selecting Canvas 2D. Its 3D CPU
projection draws at most 3,500 splats and caps animation at 30 fps. Glow and
morphing differ from the GPU implementation; settings, forms, styles, interaction,
sharing and artwork export remain available. This targets current JavaScript-enabled
browsers, not every historical browser or device configuration.

The full `npm run build:full`, all 14 model tests, repository-wide type checking
and the final focused type check passed (zero errors/warnings). Scoped ESLint
still reports nine existing UI-rule errors; linting the committed pre-change
component reproduces the exact same nine. New renderer and test files lint clean.
Architecture impact: yes. The canonical Splat Studio section and diagram were
reviewed and updated for the rendering/backend selection boundary. No API,
provider, security policy or persistence boundary changed; no new foundational
ADR was needed.

The final complete-site production preview passed all 55 browser checks in 2.4
minutes: 11 each in installed Edge, installed Chrome, Chromium, Firefox and
Playwright WebKit. WebKit coverage verifies that engine; it is not a test on a
physical iPhone or a macOS Safari installation. Service workers were blocked.
