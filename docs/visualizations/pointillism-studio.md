# Pointillism Studio (`Pointillism: San Antonio and Texas in Dots of Color`)

Fullscreen procedural pointillist painting generator (`/tools/pointillism-studio`) and published companion essay (`src/lib/posts/pointillism-san-antonio-and-texas-in-dots-of-color.md` at `/blog/visualizations/pointillism-san-antonio-and-texas-in-dots-of-color`).

## Running and verifying locally

- **Development server (full SvelteKit app):**
  ```bash
  npm run dev
  ```
  Open `http://localhost:5173/tools/pointillism-studio`.
- **Fast standalone studio preview:**
  ```bash
  npm run pointillism-studio:preview
  ```
  Builds and serves the isolated studio + embedded draft essay at `http://127.0.0.1:4329/tools/pointillism-studio`.
- **Deterministic scene, sampling, palette, material, and pixel-parity unit tests:**
  ```bash
  npm run pointillism-studio:test
  ```
- **Regenerate or check committed PNG assets (`social.png`, 6 `example-*.png` plates, and `assets.json`):**
  ```bash
  npm run pointillism-studio:assets
  npm run pointillism-studio:assets:check
  ```
- **Playwright browser suite (playback, reduced motion, Inspect dots, resize stability, keyboard/mobile UI, state-preserving essay reader, and whole-painting PNG export):**
  ```bash
  npm run pointillism-studio:browser:test
  ```
- **Routine site build on Windows (PowerShell):**
  ```powershell
  $env:NODE_OPTIONS = "--max-old-space-size=8192"; npm run build
  ```

## Module responsibilities

| Path | Responsibility |
| --- | --- |
| `src/lib/visualizations/pointillism-studio/types.ts` | Scene families (`river-path`, `neighborhood-street`, `plaza-market`, `hill-country-creek`), 19 surface categories, 6 isolated PRNG stream names, 4 primary knob specs (`dotSize`, `dotSpacing`, `paletteContrast`, `colorVariation`), secondary knob specs (`paintTexture`, `paintingTime`), and curated seeds (`418206`, `529314`, `684129`, `793409`). |
| `src/lib/visualizations/pointillism-studio/prng.ts` | Idempotent `normalizeSeed`, Mulberry32 + FNV-1a stream generator (`createStreamRng`), stateless per-mark hashes (`hashMarkUnit`, `hashMarkSigned`), and 2D value noise (`smoothNoise2D`). |
| `src/lib/visualizations/pointillism-studio/scene-primitives.ts` | Z-buffered `FieldBuilder` recording RGB, depth, `SurfaceCategory`, `objectId`, edge importance, shadow strength, and directional surface flow (`flowCos`, `flowSin`), plus researched tree species (`bald-cypress`, `live-oak`, `pecan`, `ashe-juniper`, `crape-myrtle`), grounded 6-pose human figures, and column-aligned water reflections. |
| `src/lib/visualizations/pointillism-studio/scene.ts` | `generateSceneModel` implementing coherent procedural templates across all four San Antonio and Texas Hill Country scene families, seasonal Hill Country spring-bloom selection, verified signage (`PANADERÍA`, `MERCADO`, `FRUTAS`), and accessible scene descriptions. |
| `src/lib/visualizations/pointillism-studio/sampling.ts` | `generateCandidateHierarchy` and `selectActiveCandidates`: jittered 2D Roberts $R_2$ quasirandom candidate generation with approximate spatial clearance and importance-weighted priority sorting into a cached `26,500`-candidate list (`1200 × 800` artboard) supporting strict prefix subsets. |
| `src/lib/visualizations/pointillism-studio/palette.ts` | `assignMarkColors`: perceptual OKLab light-dark contrast (`paletteContrast`) kept orthogonal to category-specific neighboring hue families (`colorVariation`). |
| `src/lib/visualizations/pointillism-studio/timeline.ts` | `computeLogicalBaseRadius` and `buildPaintSchedule`: maps `Dot size` to logical dab footprint around fixed centers and orders active marks into 4 passes with a foreground-silhouette depth guard so background marks near closer figures land in earlier passes. |
| `src/lib/visualizations/pointillism-studio/material.ts` | `renderCanvasGround`, `stampDab`, `buildPaintingModel`, `renderPaintingCrop`, and `ProgressivePaintingBuffer`: logical-coordinate primed warm-linen ground (containing zero hidden scene shapes), matte 3-harmonic irregular oil dabs with parabolic bristle relief, crop/scale rendering, and stepped batch playback converging pixel-for-pixel with still rendering. |
| `src/lib/visualizations/pointillism-studio/state.ts` | Versioned URL serialization (`?v=1&sf=...&s=...`), `localStorage` persistence (`pointillism-studio.state.v1`), `Inspect dots` crop calculation, uniform `Fill`/`Fit` viewport placement, and undo comparisons. |
| `src/lib/visualizations/pointillism-studio/export.ts` | Standalone offscreen whole-painting PNG rendering (`2048 px` and `4096 px` long side) using the exact scheduled mark list regardless of current zoom/crop, with automatic memory-fallback dimension reporting. |
| `src/lib/components/visualizations/pointillism-studio/` | `PointillismStudio.svelte`, `RotarySliderKnob.svelte`, `PointillismArticleLaunch.svelte`, and `pointillism-studio.css`. |

## Progressive sampling, approximate spacing, and artboard invariants

- **Approximate separation and prefix subsets:** `generateCandidateHierarchy` proposes candidate positions from a jittered 2D Roberts $R_2$ low-discrepancy sequence filtered through a spatial hash with `minClearance = 2.05` logical units, then sorts accepted candidates once per `(seed, sceneFamily, artboardWidth, artboardHeight)` by importance (focal proximity, boundary strength, figure/foliage weight, and tie-break jitter). Because priority sorting intentionally concentrates marks near figures and silhouettes while leaving sky and open ground quieter, `Dot spacing` controls **approximate separation** via a strict prefix `[0 .. activeCount)` (`100%` down to `~15%` of candidates) rather than enforcing a uniform exact minimum distance at every slider position.
- **Honest size-and-spacing coverage:** `Dot size` scales each mark's logical semi-minor/semi-major footprint around its fixed `(x, y)` center; `Dot spacing` changes `activeCount` from the cached hierarchy. Neither slider secretly adjusts the other, and `renderCanvasGround` draws only primed warm linen and weave so open spacing exposes bare painted ground rather than a hidden reference image.
- **Logical artboard & resize stability:** Each painting owns fixed logical dimensions (`1200 × 800` default on landscape desktop, `1080 × 900` near-square, `960 × 1080` portrait). Resizing the browser scales and positions the stage uniformly (`Fill screen` or `Fit painting`) without stretching marks or regenerating the artboard.

## Generated examples (`static/images/visualizations/pointillism-studio/`)

1. **San Antonio river path — whole painting (`example-river-path.png`)**
   - Seed: `418206` · Family: `river-path` (`river-bridge`) · Artboard: `1200 × 800` · Active marks: `14,392` / `26,500`
   - Settings: Dot size `40%` · Dot spacing `35%` · Palette contrast `45%` · Color variation `40%` · Paint texture `45%` · Painting time `10 s`
   - URL: `/tools/pointillism-studio?v=1&sf=river-path&s=418206&ds=40&sp=35&pc=45&cv=40&pt=45&t=10&aw=1200&ah=800`
2. **San Antonio river path — close-up inspection (`example-river-closeup.png`)**
   - Same painting and `14,392` marks as above viewed in `Inspect dots` (`3.40×` zoom centered at `(0.292, 0.688)`, logical crop `[173.9, 432.4, 352.9, 235.3]`)
   - URL: `/tools/pointillism-studio?v=1&sf=river-path&s=418206&ds=40&sp=35&pc=45&cv=40&pt=45&t=10&aw=1200&ah=800&vm=inspect&iz=3.40&ix=0.292&iy=0.688`
3. **San Antonio river path — larger dots (`example-river-larger-dots.png`)**
   - Seed: `418206` · Family: `river-path` (`river-bridge`) · Artboard: `1200 × 800` · Active marks: `14,392` / `26,500`
   - Settings: Dot size `74%` · Dot spacing `35%` · Palette contrast `45%` · Color variation `40%` · Paint texture `45%` · Painting time `10 s`
   - URL: `/tools/pointillism-studio?v=1&sf=river-path&s=418206&ds=74&sp=35&pc=45&cv=40&pt=45&t=10&aw=1200&ah=800`
4. **Neighborhood street and porch (`example-neighborhood.png`)**
   - Seed: `529314` · Family: `neighborhood-street` (`corner-shop-street`, sign `PANADERÍA`) · Artboard: `1200 × 800` · Active marks: `14,392`
   - Settings: Dot size `40%` · Dot spacing `35%` · Palette contrast `45%` · Color variation `40%` · Paint texture `45%` · Painting time `10 s`
   - URL: `/tools/pointillism-studio?v=1&sf=neighborhood-street&s=529314&ds=40&sp=35&pc=45&cv=40&pt=45&t=10&aw=1200&ah=800`
5. **Public plaza, park, or small market (`example-plaza-market.png`)**
   - Seed: `684129` · Family: `plaza-market` (`plaza-market-stalls`, sign `FRUTAS`) · Artboard: `1200 × 800` · Active marks: `14,392`
   - Settings: Dot size `40%` · Dot spacing `35%` · Palette contrast `45%` · Color variation `40%` · Paint texture `45%` · Painting time `10 s`
   - URL: `/tools/pointillism-studio?v=1&sf=plaza-market&s=684129&ds=40&sp=35&pc=45&cv=40&pt=45&t=10&aw=1200&ah=800`
6. **Hill Country creek and trail (`example-hill-country.png`)**
   - Seed: `793409` · Family: `hill-country-creek` (`limestone-creek-summer`) · Artboard: `1200 × 800` · Active marks: `14,392`
   - Settings: Dot size `40%` · Dot spacing `35%` · Palette contrast `45%` · Color variation `40%` · Paint texture `45%` · Painting time `10 s`
   - URL: `/tools/pointillism-studio?v=1&sf=hill-country-creek&s=793409&ds=40&sp=35&pc=45&cv=40&pt=45&t=10&aw=1200&ah=800`

## Publication routes

- **Studio:** `/tools/pointillism-studio` (prerendered, `sitemap.xml`, featured on `/blog/visualizations`).
- **Companion essay:** `/blog/visualizations/pointillism-san-antonio-and-texas-in-dots-of-color` (`published: true`, `registry.ts` summary `pointillism-san-antonio-and-texas-in-dots-of-color`, and readable inside the studio via **Read the post** / `?view=article`).
