# Drip Painting Studio (`Abstract Expressionist Drip Painting: Corruption in India — Gesture, Chance, and Control`)

Fullscreen procedural Abstract Expressionist drip-painting generator (`/tools/drip-painting-studio`) and published companion essay (`src/lib/posts/abstract-expressionist-drip-painting-corruption-in-india.md` at `/blog/visualizations/abstract-expressionist-drip-painting-corruption-in-india`).

## Running and verifying locally

- **Development server (full SvelteKit app):**
  ```bash
  npm run dev
  ```
  Open `http://localhost:5173/tools/drip-painting-studio`.
- **Standalone studio preview (build check or live server):**
  ```bash
  node scripts/preview-drip-painting-studio.mjs --build
  npm run drip-painting-studio:preview
  ```
  Builds and serves the isolated studio and embedded `mdsvex` essay at `http://127.0.0.1:4330/tools/drip-painting-studio` (port overridable via `DRIP_PAINTING_STUDIO_PREVIEW_PORT`).
- **Deterministic engine, invariant, and motion-biome unit tests:**
  ```bash
  npm run drip-painting-studio:test
  npx vitest run src/lib/motion/route-biomes.test.ts --maxWorkers=1
  ```
- **Regenerate or check committed PNG assets (`social.png`, companion `example-*.png` plates, and `assets.json`) and cross-feature asset gate:**
  ```bash
  npm run drip-painting-studio:assets
  npm run images:optimize
  npm run gallery:generate
  npm run images:verify
  npm run drip-painting-studio:assets:check
  npm run features:check
  ```
- **Playwright browser suite (playback cadence, `prefers-reduced-motion`, `Inspect surface`, resize stability, keyboard/ARIA/mobile UI, state-preserving essay reader, and 2048/4096 px PNG export):**
  ```bash
  npm run drip-painting-studio:browser:test
  ```
- **Routine site build and full feature build on Windows (PowerShell):**
  ```powershell
  $env:NODE_OPTIONS = "--max-old-space-size=8192"; npm run build
  $env:NODE_OPTIONS = "--max-old-space-size=8192"; npm run build:full
  ```

## Module layout and responsibilities

| Path                                                                                          | Responsibility                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/visualizations/drip-painting-studio/types.ts`                                        | Generator constants (`DRIP_GENERATOR_VERSION = 1`, `MIN_PASSES=4..MAX_PASSES=40`, `MIN_LAYERS=2..MAX_LAYERS=6`), six studio enamel/oil pigments (`#1C1B1A`, `#A8342A`, `#B8873D`, `#29435C`, `#594638`, `#E6DFD1`), `GROUND_BASE_RGB` (`[228, 219, 202]`), `CURATED_STUDY_SEEDS` (`729104`, `528419`, `642913`, `781305`), four `PRESET_SPECS`, `KNOB_SPECS`, `SECONDARY_KNOB_SPECS`, `EXPERIMENT_CONFIG`, and typed pipeline interfaces. |
| `src/lib/visualizations/drip-painting-studio/prng.ts`                                         | FNV-1a (`fnv1aString`), `mix32`, idempotent `normalizeSeed`, `createNextSeed`, Mulberry32 `createStreamRng` across five isolated named streams (`paths`, `layers`, `flow`, `surface`, `timeline`), stateless per-pass/per-mark hashes, and `smoothNoise2D`.                                                                                                                                                                               |
| `src/lib/visualizations/drip-painting-studio/studies.ts`                                      | `STUDY_SPECS` for all four non-figurative studies (`pending-file`, `public-works-tenders`, `counter-middleman`, `whitewash-record`), per-layer (`1..6`) pigment affinities, kinematic tuning, `computePaintingFocalPoint`, and `describePaintingAccessible`.                                                                                                                                                                              |
| `src/lib/visualizations/drip-painting-studio/paths.ts`                                        | 16-entry LRU `canonicalCache`, `buildPassLayerAndPigmentSchedule`, `buildCanonicalPassTable` (40 continuous gestures with centripetal Catmull-Rom splines, velocity, signed curvature, dwell, and soft boundary containment), zero-PRNG `applySweepWidth` scaling around stable `(anchorX, anchorY)` with $C^1$ `softContain`, `selectActivePasses`, and `getPassPathPoints`.                                                             |
| `src/lib/visualizations/drip-painting-studio/deposition.ts`                                   | `buildDepositionPasses` using isolated `'flow'` substreams: velocity-coupled ribbon `halfWidth`/`thickness`, low-flow capillary necking/beading, monotonic-threshold 2–3 harmonic earned `pools` at local dwell maxima, and curvature-weighted `droplets` detachment with zero mutation of path coordinates, velocities, curvatures, or layer assignments.                                                                                |
| `src/lib/visualizations/drip-painting-studio/timeline.ts`                                     | `buildPaintTimeline` using the `'timeline'` stream: arc-length/speed/dwell pass weights, inter-pass pauses and layer breaths budgeted to `Painting time` (`4–20 s`) within `[0, 0.985]`, and frame-1 visible stroke guarantee on pass `0` (`revealAt <= 0.0003`).                                                                                                                                                                         |
| `src/lib/visualizations/drip-painting-studio/surface.ts`                                      | `buildPaintingModel`, `SurfaceRasterizer` (woven cotton-duck ground or flat ground at `paintTexture = 0`, per-pass max-envelope `(passCov, passThick)` buffers preventing self-overlap seams, conformal burial `0.72 * oldH + passThick`, fixed oblique lighting `(-0.56, -0.64, 0.524)` with matte-to-satin response and zero plastic glare or flicker), `renderPaintingStill`, `ProgressiveDripBuffer`, and `measurePaintingMetrics`.   |
| `src/lib/visualizations/drip-painting-studio/state.ts`                                        | `createDefaultState`, `normalizeState`, `normalizeViewState`, seed-preserving `applyPreset`, `chooseArtboardForViewport`, `computeUniformStagePlacement`, `computeInspectCropRect`, URL serialization (`serializeStateParams` / `deserializeStateParams`), and `localStorage` persistence (`drip-painting-studio.state.v1`).                                                                                                              |
| `src/lib/visualizations/drip-painting-studio/export.ts`                                       | `computeExportDimensions`, `formatExportFilename` (`drip-painting-${study}-seed-${seed}-${width}x${height}.png`), `renderWholePaintingRgba`, `exportWholePainting` (`[4096, 2048, 1280]` OOM fallback chain via `OffscreenCanvas`, `HTMLCanvasElement`, or Node-only stored PNG), and `triggerBlobDownload`.                                                                                                                              |
| `src/lib/visualizations/drip-painting-studio/index.ts`                                        | Barrel module exporting all public engine types, constants, and functions.                                                                                                                                                                                                                                                                                                                                                                |
| `src/lib/visualizations/drip-painting-studio/model.test.ts`                                   | Vitest suite verifying PRNG stream isolation, cross-study determinism, path-flow invariance (`10–100%`), strict `Passes` prefix (`4–40`), bit-identical lower layers (`2–6`), `Paint texture`/`Painting time` invariants, `ProgressiveDripBuffer` / still / PNG pixel parity, URL/storage round-trips, and `[4096, 2048, 1280]` fallback behavior.                                                                                        |
| `src/lib/components/visualizations/drip-painting-studio/`                                     | `DripPaintingStudio.svelte` (fullscreen canvas, toolbar, tray/sheet, `Inspect surface` cropping directly from the cached `1200 × 800` `bufferCanvas`, `import.meta.glob` essay overlay, deep-link interception), `RotarySliderKnob.svelte` (native range semantics + decorative dial), `DripPaintingArticleLaunch.svelte` (hidden inside `?view=article`), and `drip-painting-studio.css`.                                                |
| `src/routes/tools/drip-painting-studio/`                                                      | `+page.ts` (`prerender = true`, `immersivePainting: true`) and `+page.svelte` (`<SEO>` metadata + `<DripPaintingStudio />`).                                                                                                                                                                                                                                                                                                              |
| `scripts/preview-drip-painting-studio.mjs` & `scripts/render-drip-painting-studio-assets.mjs` | Standalone Vite preview/build harness (`127.0.0.1:4330`) and deterministic PNG + `assets.json` generator/verifier calling `renderPaintingStill` (including `{ crop }` at `960 × 640` for `example-inspect-surface.png`).                                                                                                                                                                                                                  |

## Pass-to-layer scheduling and geometric/surface invariants

- **Exact pass-to-layer rule (`paths.ts:buildPassLayerAndPigmentSchedule` & `selectActivePasses`):**
  1. For each `(seed, study)`, `layersPoolRng = createStreamRng(seed, 'layers', studyIdx * 64 + 63)` and per-pass `passLayerRng = createStreamRng(seed, 'layers', studyIdx * 64 + passIndex)`.
  2. Passes `0..3` are fixed to `[1, 1, 2, 2]` (so `Single Trail` at `passes = 4, paintLayers = 2` renders four passes across layers 1–2).
  3. Passes `4..9` use a Fisher-Yates shuffle of `[1, 2, 3, 4, 5, 6]`, guaranteeing all six strata appear by `passes = 10`.
  4. Passes `10..17` use a Fisher-Yates shuffle of `[1, 2, 3, 3, 4, 4, 5, 6]`.
  5. Passes `18..39` draw per pass from the weighted CDF `[1: 0.05, 2: 0.09, 3: 0.16, 4: 0.22, 5: 0.24, 6: 0.24]`.
  6. Active passes are filtered by `passIndex < passes && layerIndex <= paintLayers` and sorted strictly by `(layerIndex ASC, passIndex ASC)`, guaranteeing strict prefix invariance on `Passes` and bit-for-bit lower-strata invariance on `Paint layers`. Note that because passes `0..17` include layers `5` and `6`, `activePasses` equals `12` at `passes = 16, paintLayers = 4` (`14` at `passes = 18, paintLayers = 4`) and reaches `36` when `paintLayers = 6`.
- **Artboard & resize stability:** Initial artboards adapt once to viewport shape (`1200 × 800` landscape, `1080 × 900` near-square for `ratio < 1.15`, `960 × 1080` portrait for `ratio < 0.88`). Subsequent window resizes scale and center the logical artboard uniformly (`Fill screen` or `Fit painting`) without rerolling seeds or stretching circular droplets into ovals.
- **Sweep invariance:** `applySweepWidth` draws zero PRNG numbers and scales each canonical pass around its stable centroid `(anchorX, anchorY)` by `0.32..1.18`, using $C^1$-smooth asymptotic `softContain` inside `[8, artboard - 8]` with `pad = 28`.
- **Path-flow invariance:** `buildDepositionPasses` consumes `'flow'` substreams exclusively and never alters `(x, y, vx, vy, signedCurvature, layerIndex)`. Raising `Paint flow` (`10%` -> `100%`) thickens velocity-coupled ribbons, relaxes low-flow capillary necking, unlocks monotonic-threshold 2–3 harmonic pools at slow bends, and increases curvature-weighted droplet detachment along the exact same movement paths.
- **Matte conformal surface & pixel parity:** `SurfaceRasterizer` tracks a per-pass maximum-coverage/thickness envelope `(passCov, passThick)` before committing (`settledHeight = alpha * (oldH * 0.72 + passThick) + (1 - alpha) * oldH`), shaded under one fixed oblique studio light (`(-0.56, -0.64, 0.524)`). `paintTexture = 0` renders flat marks on `[228, 219, 202]`. Completed `ProgressiveDripBuffer`, `Finish now`, `renderPaintingStill`, and same-size `exportWholePainting` outputs match bit-for-bit; live `Inspect surface` crops directly from the cached `1200 × 800` `bufferCanvas` via `drawImage` without recomputing marks, whereas the static plate `example-inspect-surface.png` invokes `renderPaintingStill({ crop })` at `960 × 640` from the identical painting model.

## Generated plates and reproducible deep links (`static/images/visualizations/drip-painting-studio/`)

All eight deterministic plates and metadata in `static/images/visualizations/drip-painting-studio/assets.json` (`generatorVersion = 1`):

> **Provenance note (`assets.json` vs. optimized PNGs on disk):** `assets.json` `bytes` and `sha256` record the deterministic generator's raw 24-bit PNG output (matching `sourceBytes` and `sourceHash` in `scripts/image-optimization-manifest.json`), consistent with sibling `pointillism-studio`. Running `npm run images:optimize` losslessly compresses the committed PNGs on disk, recording the compressed sizes and hashes under `outputBytes` and `outputHash` in `scripts/image-optimization-manifest.json` and in `src/lib/generated/media-gallery.ts`.

1. **Social preview (`social.png`, `1200 × 630`)**
   - `Pending File` · Seed: `729104` · Passes: `18` (`14` active across `4` layers) · Paint flow: `45%` · Sweep width: `68%` · Paint layers: `4` · Paint texture: `50%`
   - Verified metrics (`600 × 400`): coverage `23.88%`, mean height `0.1932`, max height `2.6252`, `30` pools, `135` droplets.
   - URL: `/tools/drip-painting-studio?v=1&st=pending-file&s=729104&p=18&pf=45&sw=68&pl=4&pt=50&t=10&aw=1200&ah=630`
2. **Pending File — Thin flow (`example-pending-thin.png`, `960 × 640`, `EXPERIMENT_CONFIG.thin`)**
   - Seed: `729104` · Passes: `16` (`12` active across `4` layers) · Paint flow: `20%` · Sweep width: `68%` · Paint layers: `4` · Paint texture: `50%`
   - Verified metrics (`600 × 400`): coverage `13.66%`, mean height `0.0441`, max height `1.5468`, `4` pools, `3` droplets.
   - URL: `/tools/drip-painting-studio?v=1&st=pending-file&s=729104&p=16&pf=20&sw=68&pl=4&pt=50&t=10&aw=1200&ah=800`
3. **Pending File — Heavy flow (`example-pending-heavy.png`, `960 × 640`, `EXPERIMENT_CONFIG.heavy`, identical paths)**
   - Seed: `729104` · Passes: `16` (`12` active across `4` layers) · Paint flow: `80%` · Sweep width: `68%` · Paint layers: `4` · Paint texture: `50%`
   - Verified metrics (`600 × 400`): coverage `41.29%`, mean height `0.5801`, max height `4.3953`, `27` pools, `299` droplets.
   - URL: `/tools/drip-painting-studio?v=1&st=pending-file&s=729104&p=16&pf=80&sw=68&pl=4&pt=50&t=10&aw=1200&ah=800`
4. **Pending File — Buried upper coats (`example-pending-buried.png`, `960 × 640`, `EXPERIMENT_CONFIG.buried`)**
   - Seed: `729104` · Passes: `36` (`36` active across `6` layers) · Paint flow: `80%` · Sweep width: `68%` · Paint layers: `6` · Paint texture: `50%`
   - Verified metrics (`600 × 400`): coverage `67.05%`, mean height `1.4408`, max height `5.1453`, `67` pools, `895` droplets, `lime-whitewash` mass share `35.08%`.
   - URL: `/tools/drip-painting-studio?v=1&st=pending-file&s=729104&p=36&pf=80&sw=68&pl=6&pt=50&t=10&aw=1200&ah=800`
5. **Pending File — Inspect surface close-up (`example-inspect-surface.png`, `960 × 640`, `3.50×` zoom)**
   - Identical painting model and mark schedule as `example-pending-buried.png`: `scripts/render-drip-painting-studio-assets.mjs` calls `renderPaintingStill({ crop })` at `960 × 640` using `computeInspectCropRect` around focal point `(0.5201, 0.5007)` (`crop = { x: 452.69, y: 286.27, width: 342.86, height: 228.57 }`), whereas live `DripPaintingStudio.svelte` `Inspect surface` crops directly from the cached `1200 × 800` `bufferCanvas` via `drawImage` without recomputing marks.
   - Crop height-field stats: min `-0.0715`, mean `2.4844`, max `4.8298`.
   - URL: `/tools/drip-painting-studio?v=1&st=pending-file&s=729104&p=36&pf=80&sw=68&pl=6&pt=50&t=10&aw=1200&ah=800&vm=inspect&iz=3.50&ix=0.520&iy=0.501`
6. **Public Works & Tenders (`example-public-works-tenders.png`, `960 × 640`)**
   - Seed: `528419` · Passes: `26` (`26` active across `6` layers) · Paint flow: `60%` · Sweep width: `68%` · Paint layers: `6` · Paint texture: `50%`
   - Verified metrics (`600 × 400`): coverage `46.79%`, mean height `0.6764`, max height `4.2770`, `50` pools, `489` droplets, `lime-whitewash` share `46.18%`, `ledger-ochre` `32.13%`, `road-tar-umber` `15.69%`.
   - URL: `/tools/drip-painting-studio?v=1&st=public-works-tenders&s=528419&p=26&pf=60&sw=68&pl=6&pt=50&t=10&aw=1200&ah=800`
7. **Counter & Middleman (`example-counter-middleman.png`, `960 × 640`)**
   - Seed: `642913` · Passes: `26` (`26` active across `6` layers) · Paint flow: `60%` · Sweep width: `68%` · Paint layers: `6` · Paint texture: `50%`
   - Verified metrics (`600 × 400`): coverage `52.61%`, mean height `0.5050`, max height `3.5492`, `38` pools, `865` droplets, `carbon-black` `30.66%`, `file-tape-red` `29.29%`, `carbon-indigo` `12.26%`.
   - URL: `/tools/drip-painting-studio?v=1&st=counter-middleman&s=642913&p=26&pf=60&sw=68&pl=6&pt=50&t=10&aw=1200&ah=800`
8. **Whitewash & Record (`example-whitewash-record.png`, `960 × 640`)**
   - Seed: `781305` · Passes: `26` (`26` active across `6` layers) · Paint flow: `60%` · Sweep width: `68%` · Paint layers: `6` · Paint texture: `50%`
   - Verified metrics (`600 × 400`): coverage `49.97%`, mean height `0.6461`, max height `3.5388`, `44` pools, `542` droplets, `lime-whitewash` `32.21%`, `carbon-black` `27.60%`, `carbon-indigo` `15.00%`, `file-tape-red` `13.03%`.
   - URL: `/tools/drip-painting-studio?v=1&st=whitewash-record&s=781305&p=26&pf=60&sw=68&pl=6&pt=50&t=10&aw=1200&ah=800`

## Publication status and routes

- **Studio:** `/tools/drip-painting-studio` (`prerender = true`, `immersivePainting: true`, `ROUTE_MOTION_CONFIGS.off`, listed in `src/routes/sitemap.xml/+server.ts`, featured on `/blog/visualizations`).
- **Companion essay:** `/blog/visualizations/abstract-expressionist-drip-painting-corruption-in-india` (`src/lib/posts/abstract-expressionist-drip-painting-corruption-in-india.md`, `published: true`, registered in `src/lib/visualizations/registry.ts` with `status: 'published'`, and readable inside the studio via **Read the essay** / `?view=article` with state preserved across **Return to painting** and in-article `/tools/drip-painting-studio?...` deep links).
