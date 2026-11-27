# Color Field Studio (`Color Field Painting — Color, Edges, and Space`)

Fullscreen procedural Color Field painting generator (`/tools/color-field-studio`) and published companion essay (`src/lib/posts/color-field-painting-color-edges-and-space.md` at `/blog/visualizations/color-field-painting-color-edges-and-space`).

## Running and verifying locally

- **Development server (full SvelteKit app):**
  ```bash
  npm run dev
  ```
  Open `http://localhost:5173/tools/color-field-studio`.
- **Standalone studio preview (build check or live server):**
  ```bash
  npm run color-field-studio:preview
  node scripts/preview-color-field-studio.mjs --build
  ```
  Builds and serves the isolated studio (and embedded `mdsvex` essay) at `http://127.0.0.1:4331/tools/color-field-studio` (port overridable via `COLOR_FIELD_STUDIO_PREVIEW_PORT`).
- **Deterministic engine, invariant, contract, and motion-biome unit tests:**
  ```bash
  npm run color-field-studio:test
  npx vitest run src/lib/motion/route-biomes.test.ts --maxWorkers=1
  npm run visualizations:test
  ```
- **Deterministic static plates & manifest verification:**
  ```bash
  npm run color-field-studio:assets
  npm run color-field-studio:assets:check
  npm run features:check
  ```
- **Playwright 5-tier browser suite (78 tests across feature, boundary, cross-feature, real-world journey, and Tier 5 adversarial hardening):**

  ```powershell
  # Isolated studio preview (port 4331; 4 full-site blog/gallery tests skip cleanly)
  npm run color-field-studio:browser:test

  # Full-site production preview (port 4173; all 78 tests execute)
  $env:COLOR_FIELD_BASE_URL = "http://127.0.0.1:4173"
  npx playwright test --config=playwright.color-field-studio.config.ts
  ```

- **Architecture gate and repository validators:**
  ```bash
  node --test scripts/check-architecture.test.mjs
  node scripts/check-architecture.mjs --base origin/main --head HEAD
  npm run validate:media && npm run validate:links && npm run validate:seo
  ```
- **Routine site build and full feature build on Windows (PowerShell):**
  ```powershell
  $env:NODE_OPTIONS = "--max-old-space-size=8192"; npm run build
  $env:NODE_OPTIONS = "--max-old-space-size=8192"; npm run build:full
  ```

## Module layout and responsibilities

| Path                                                                                  | Responsibility                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/visualizations/color-field-studio/types.ts`                                  | Generator constants (`COLOR_FIELD_GENERATOR_VERSION = 1`, `CURATED_DEFAULT_SEED = 482917`, `GROUND_BASE_RGB = [232, 224, 210]`), bounds for 4 primary knobs (`areaCount` `2..6`, `areaSize` `25..90%`, `edgeSoftness` `0..100%`, `transparency` `10..95%`) and 2 secondary knobs (`canvasTexture` `0..100%`, `paintingTime` `4..20 s`), 3 `ARTBOARDS` (`landscape` `1200×800`, `square` `1080×900`, `portrait` `960×1080`), 4 `PRESET_SPECS` (`two-area-sharp`, `two-area-soft`, `luminous-veil`, `deep-stack`), `KNOB_SPECS`, `SECONDARY_KNOB_SPECS`, and typed pipeline interfaces.                                                    |
| `src/lib/visualizations/color-field-studio/prng.ts`                                   | FNV-1a (`fnv1aString`), `mix32`, `normalizeSeed`, `createNextSeed`, Mulberry32 `createStreamRng` across five isolated named streams (`composition`, `pigment`, `edges`, `surface`, `timeline`), stateless region/pass hashes, and quintic `smoothNoise2D` / `smoothNoise2DFast` / `fbm2D`.                                                                                                                                                                                                                                                                                                                                               |
| `src/lib/visualizations/color-field-studio/studies.ts`                                | `STUDY_BY_ID`, `STUDIES`, `STUDY_LIST`, OKLab/linear-sRGB conversions, Beer-Lambert pigment absorption derivation, five curated non-figurative studies (`rothko-nocturne`, `frankenthaler-wash`, `ochre-horizon`, `cobalt-veil`, `terra-stillness`), and `describePaintingAccessible`.                                                                                                                                                                                                                                                                                                                                                   |
| `src/lib/visualizations/color-field-studio/fields.ts`                                 | `buildCanonicalRegions` (6 fixed regions per `(seed, studyId, artboardWidth, artboardHeight)`), zero-PRNG `buildActiveRegions` (`areaCount`, `areaSize`), `buildGlazePasses` (3 coats `[0.42, 0.36, 0.22]`), `evaluateRegionMaskFast` (superellipse for `stacked-multiform`, harmonic lobes for `soak-stain`, 3-octave FBM edge perturbation, quintic smoothstep feathering), and `computePaintingFocalPoint`.                                                                                                                                                                                                                           |
| `src/lib/visualizations/color-field-studio/timeline.ts`                               | `buildTimeline` (`SWATHS_PER_PASS = 64` disjoint angled sweep swaths per glaze pass across `[0, 0.985]` with inter-pass/coat gaps and Pass-0 frame-1 core-first visibility at `revealAt <= 0.00012`).                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `src/lib/visualizations/color-field-studio/surface.ts`                                | `buildPaintingModel`, `SurfaceRasterizer` (woven cotton-duck ground or flat ground at `canvasTexture = 0`, hybrid Beer-Lambert absorption + linear body blend, soak-stain edge pooling, subtle oblique micro-relief), `renderPaintingStill`, `ProgressiveColorFieldBuffer`, and `measurePaintingMetrics`.                                                                                                                                                                                                                                                                                                                                |
| `src/lib/visualizations/color-field-studio/state.ts`                                  | `createDefaultState`, `setArtboard`, `normalizeState`, `normalizeViewState` (3-decimal inspect center quantization matching URL serialization), `statesEqual`, seed-preserving `applyPreset`, `findMatchingPreset`, `chooseArtboardForViewport`, `computeUniformStagePlacement`, `computeInspectCropRect`, URL serialization (`serializeStateParams` / `deserializeStateParams`), and `localStorage` persistence (`color-field-studio.state.v1`, `MAX_UNDO_HISTORY = 24`).                                                                                                                                                               |
| `src/lib/visualizations/color-field-studio/export.ts`                                 | `computeExportDimensions`, `formatExportFilename` (`color-field-${studyId}-seed-${seed}-${width}x${height}.png`), `renderWholePaintingRgba`, `exportWholePainting` (`[requestedLong, 2048, 1280]` OOM fallback chain via `OffscreenCanvas`, `HTMLCanvasElement`, or stored PNG), and `triggerBlobDownload`.                                                                                                                                                                                                                                                                                                                              |
| `src/lib/visualizations/color-field-studio/index.ts`                                  | Barrel module re-exporting all public engine constants, types, and functions.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `src/lib/visualizations/color-field-studio/model.test.ts`                             | Vitest suite (19 tests) verifying PRNG stream isolation, cross-study determinism, region prefix & size invariance, edge-softness gradient monotonicity, glaze transparency & weave visibility, timeline frame-1 visibility, fast/slow mask parity, mid-timeline resize parity, URL/storage round-trips, and export fallback.                                                                                                                                                                                                                                                                                                             |
| `src/lib/components/visualizations/color-field-studio/`                               | `ColorFieldStudio.svelte` (fullscreen canvas, preview-scaled progressive animation with full-resolution promotion on completion/pause/finish/inspect/tray-commit, HUD toolbar, collapsible tray, `Inspect surface` crops with focus restoration, `import.meta.glob` essay overlay with defensive `.cf-article-fallback`, deep-link interception), `RotarySliderKnob.svelte` (native range semantics + decorative dial with unmount drag-commit cleanup), `ColorFieldArticleLaunch.svelte` (suppressed inside `?view=article`), and `color-field-studio.css` (`.cf-*` styling, responsive breakpoints, `>= 44px` coarse-pointer targets). |
| `src/routes/tools/color-field-studio/`                                                | `+page.ts` (`prerender = true`, `immersivePainting: true`) and `+page.svelte` (`<SEO>` metadata + `<ColorFieldStudio />`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `scripts/preview-color-field-studio.mjs` & `tests/browser/color-field-studio.spec.ts` | Standalone Vite preview/build harness (`127.0.0.1:4331`) and Playwright browser verification suite.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

## Controls, studies, and geometric/optical invariants

- **Five curated studies & two archetypes (`studies.ts`):**
  - `rothko-nocturne` (`stacked-multiform`, defaultSeed `482917`, ground `#E8E0D2`)
  - `frankenthaler-wash` (`soak-stain`, defaultSeed `619304`, ground `#E9DFCD`)
  - `ochre-horizon` (`stacked-multiform`, defaultSeed `274815`, ground `#EFE8DA`)
  - `cobalt-veil` (`soak-stain`, defaultSeed `835192`, ground `#E8E7E0`)
  - `terra-stillness` (`stacked-multiform`, defaultSeed `391648`, ground `#EAE1D1`)
- **Primary & secondary controls (`types.ts`):**
  - Primary knobs: `Color areas` (`areaCount` `2..6`, default `3`), `Area size` (`areaSize` `25..90%`, default `62%`), `Edge softness` (`edgeSoftness` `0..100%`, default `58%`), `Paint transparency` (`transparency` `10..95%`, default `52%`).
  - Secondary knobs (under **More options**): `Canvas texture` (`canvasTexture` `0..100%`, default `55%`), `Painting time` (`paintingTime` `4..20 s`, default `10 s`).
  - Presets (seed-preserving): `two-area-sharp` (`2`, `60%`, `0%`, `14%`, `55%`), `two-area-soft` (`2`, `60%`, `82%`, `68%`, `60%`), `luminous-veil` (`3`, `66%`, `74%`, `72%`, `65%`), `deep-stack` (`5`, `68%`, `58%`, `42%`, `50%`).
- **PRNG stream isolation & region invariance:** Five isolated Mulberry32/FNV-1a streams (`composition`, `pigment`, `edges`, `surface`, `timeline`) keep geometry, edge feathering, pigment mottling, canvas weave, and swath timing decoupled. `buildCanonicalRegions` generates all 6 regions once per `(seed, studyId, artboardWidth, artboardHeight)`; `buildActiveRegions` slices `[0 .. areaCount)` and scales around fixed anchors without PRNG draws.
- **Glaze optics, progressive playback, & pixel parity:** Three glaze coats (`[0.42, 0.36, 0.22]`) rasterize via hybrid Beer-Lambert optical absorption (`u * exp(-kLoc * dEff)`) and linear body paint (`u * (1 - alpha) + cLoc * alpha`) over woven cotton-duck cloth (`canvasTexture = 0` produces a flat ground) with subtle oblique micro-relief (`clamp(1 + (gx * 0.45 + gy * 0.65) * 0.1 * texAmount, 0.92, 1.08)`). Interactive `requestAnimationFrame` reveal runs at preview resolution (`previewScale = Math.min(0.6, 720 / artW, 480 / artH)`) and promotes the `ProgressiveColorFieldBuffer` to full artboard resolution on completion, pause, **Finish now**, and `Inspect surface`. Completed buffer outputs, `renderPaintingStill`, and `exportWholePainting` match pixel-for-pixel.
- **Artboard & resize stability:** Initial artboards adapt once to viewport aspect (`1200 × 800` landscape, `1080 × 900` square for `ratio < 1.15`, `960 × 1080` portrait for `ratio < 0.88`). Subsequent resizes scale and center uniformly (`Fill screen` / `Fit painting`) without rerolling seeds.

## URL state and embedded essay coupling

- **URL query contract (`state.ts`):**
  - `?v=1&areas=<2..6>&size=<25..90>&edge=<0..100>&trans=<10..95>&texture=<0..100>&time=<4..20>&study=<id>&seed=<n>&artboard=<landscape|square|portrait>`
  - Inspection view appends `&vm=inspect&iz=<2.00..5.00>&ix=<0.000..1.000>&iy=<0.000..1.000>` (or `&vm=fit` for fit mode); `?view=article` opens the embedded essay overlay.
- **Persistence & embedded essay context:** State persists under `localStorage` key `color-field-studio.state.v1` (`MAX_UNDO_HISTORY = 24`). `ColorFieldStudio.svelte` sets Svelte context `'color-field-studio-embedded-article'` to `true` so `ColorFieldArticleLaunch.svelte` hides inside `?view=article`, loads the published `src/lib/posts/color-field-painting-color-edges-and-space.md` lazily via `import.meta.glob` (retaining `.cf-article-fallback` as a defensive load-failure fallback), and intercepts `/tools/color-field-studio?...` prose links to update parameters in-place without reloading.

## Companion essay, deterministic plates, and gallery registration

- **Published companion essay:** `src/lib/posts/color-field-painting-color-edges-and-space.md` at `/blog/visualizations/color-field-painting-color-edges-and-space` (`published: true`, `mediaReviewed: true`, `interactiveFirst: true`; opening two-area sharp vs. soft/translucent figures, Mark Rothko & Helen Frankenthaler discussion acknowledging their distinct approaches, regions/edge masks/transparent layers explanation, and scale & adjacency perception without universal color-emotion claims).
- **Deterministic static plates & generator:** `scripts/render-color-field-studio-assets.mjs` generating `static/images/visualizations/color-field-studio/` (`social.png` at `1200 × 630` using `{ x: 0, y: 85, width: 1200, height: 630 }`, `example-two-areas-sharp.png` `960 × 640`, `example-two-areas-soft-translucent.png` `960 × 640`, `example-frankenthaler-layers.png` `960 × 640`, `example-scale-compact.png` `960 × 640`, `example-scale-expanded.png` `960 × 640`, and `assets.json` provenance manifest verified by `npm run color-field-studio:assets:check` and `npm run features:check`).
- **Gallery & script aliases:** `src/lib/visualizations/registry.ts` (`status: 'published'`), `src/lib/components/visualizations/VisualizationsLanding.svelte` (featured studio card and `postSubjects`), and `package.json` `color-field-studio:*` / `features:check` scripts.

## Publication status and routes

- **Studio (published):** `/tools/color-field-studio` (`prerender = true`, `immersivePainting: true`, `studioShell` in `src/routes/+layout.svelte`, `ROUTE_MOTION_CONFIGS.off` in `src/lib/motion/route-biomes.ts`, listed in `src/routes/sitemap.xml/+server.ts`).
- **Companion essay & gallery (published):** `/blog/visualizations/color-field-painting-color-edges-and-space` (listed in `src/routes/sitemap.xml/+server.ts`) and `/blog/visualizations` featured card + post listing.
