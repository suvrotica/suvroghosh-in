# Mondrian Studio (`Piet Mondrian: A Pioneer of Abstract Art`)

Fullscreen procedural rectilinear painting generator (`/tools/mondrian-studio`) and published companion essay (`src/lib/posts/piet-mondrian-a-pioneer-of-abstract-art.md` at `/blog/visualizations/piet-mondrian-a-pioneer-of-abstract-art`).

## Running and verifying locally

- **Development server (full SvelteKit app):**
  ```bash
  npm run dev
  ```
  Open `http://localhost:5173/tools/mondrian-studio`.
- **Fast standalone studio preview:**
  ```bash
  npm run mondrian-studio:preview
  ```
  Builds and serves the isolated studio + embedded essay at `http://127.0.0.1:4328/tools/mondrian-studio`.
- **Deterministic model, geometry, material, and pixel-parity unit tests:**
  ```bash
  npm run mondrian-studio:test
  ```
- **Regenerate or check committed PNG assets (`social.png`, `example-spare.png`, `example-balanced.png`, `example-dense.png`, and `assets.json`):**
  ```bash
  npm run mondrian-studio:assets
  npm run mondrian-studio:assets:check
  npm run images:optimize
  ```
- **Playwright browser suite (playback, reduced motion, accessibility, responsive layouts, and clean PNG export):**
  ```bash
  npm run mondrian-studio:browser:test
  ```

## Module responsibilities

| Path | Responsibility |
| --- | --- |
| `src/lib/visualizations/mondrian-studio/types.ts` | Palette (`#F3EFE3`, `#171714`, `#C83B30`, `#E8BE35`, `#245294`, `#D8D5CC`), six knob specifications, four presets (`balanced`, `spare`, `red-accent`, `dense`), and `INITIAL_CURATED_SEED` (`100779`). |
| `src/lib/visualizations/mondrian-studio/prng.ts` | Deterministic Mulberry32 + FNV-1a PRNG with isolated streams (`layout`, `color`, `material`, `timeline`). |
| `src/lib/visualizations/mondrian-studio/layout.ts` | `generateLayout` and `mergeBoundaries`: 12-candidate 29-split hierarchical subdivision evaluated at a fixed reference configuration, cached per seed, bounded to `<= 8` columns/rows so all `Panels` (`6–30`), `Uneven spacing` (`0–100%`), and `Line width` (`0.25–1.5%`) preserve positive interiors without secret re-seeding, and collinear shared-edge merging. |
| `src/lib/visualizations/mondrian-studio/colors.ts` | `assignColors` and `describeComposition`: normalized pre-boundary area calculation, open white-field reservation, non-adjacent priority ranking, and cumulative priority hue assignment so reducing `Color area` keeps surviving primary panels the same color. |
| `src/lib/visualizations/mondrian-studio/timeline.ts` | `buildPaintTimeline`: two-coat panel brush pass schedule (`[0.01, 0.68]`) + coherent axial boundary strokes (`[0.63, 0.955]`) + brief settling window (`[0.96, 1.0]`) budgeted to `Painting time` (`3–18 s`). |
| `src/lib/visualizations/mondrian-studio/material.ts` | `prepareMaterial`, `renderPainting`, and `computeExportDimensions`: stylized six-layer oil-on-canvas surface in painting coordinates, unified single-pass boundary coverage without crossing double-darkening, and exact convergence of `renderPainting(prepared, 1.0)` to `finishedRgba`. |
| `src/lib/visualizations/mondrian-studio/state.ts` | URL query serialization (`?v=1&s=...`), `localStorage` persistence (`mondrian-studio.state.v1`), preset application preserving `seed`, and undo comparisons. |
| `src/lib/visualizations/mondrian-studio/export.ts` | Standalone offscreen PNG rendering (`2048 px` and `4096 px` long side, plus saved original aspect ratio option when restored state differs from the current viewport) with explicit fallback dimension reporting if device memory limits an allocation. |
| `src/lib/components/visualizations/mondrian-studio/` | `MondrianStudio.svelte`, `RotarySliderKnob.svelte`, `MondrianArticleLaunch.svelte`, and `mondrian-studio.css`. |

## Aspect-ratio remapping and reproducibility

- Normalized splits (`[0, 1] × [0, 1]`), region IDs, and color assignments are retained across resizes so the edge-to-edge viewport never crops panels away or rerolls the seed.
- Because physical proportions depend on the painting's aspect ratio (`width / height`), changing the viewport's shape changes rectangle proportions (and checks `Line width` against the shorter physical dimension).
- Serialized URLs and `localStorage` snapshots record `ar` (`aspectRatio`). When opened on a differently shaped screen, the live viewport ratio governs display while **Save image** also offers export at the original saved ratio. Exact visual reproduction requires matching seed, parameters, generator version, and aspect ratio; subtle Canvas/PNG raster differences can still exist across different browser engines.

## Generated examples (`static/images/visualizations/mondrian-studio/`)

All three preset examples use curated seed `100779` at `960 × 640` (`aspectRatio = 1.5`) so the prefix relationship across `9`, `14`, and `24` panels is directly visible:

1. **Spare (`example-spare.png`)**
   - Seed: `100779` · Panels: `9` · Uneven spacing: `72%` · Color area target: `14%` (**14.7% actual**) · Line width: `0.50%` · Paint texture: `36%` · Painting time: `7 s` · Color emphasis: `balanced`
   - URL: `/tools/mondrian-studio?v=1&s=100779&p=9&u=72&ca=14&lw=0.5&pt=36&t=7&ce=balanced&ar=1.500`
2. **Balanced (`example-balanced.png`)**
   - Seed: `100779` · Panels: `14` · Uneven spacing: `65%` · Color area target: `28%` (**27.7% actual**) · Line width: `0.70%` · Paint texture: `40%` · Painting time: `8 s` · Color emphasis: `balanced`
   - URL: `/tools/mondrian-studio?v=1&s=100779&p=14&u=65&ca=28&lw=0.7&pt=40&t=8&ce=balanced&ar=1.500`
3. **Dense (`example-dense.png`)**
   - Seed: `100779` · Panels: `24` · Uneven spacing: `58%` · Color area target: `34%` (**35.1% actual**) · Line width: `0.60%` · Paint texture: `42%` · Painting time: `10 s` · Color emphasis: `balanced`
   - URL: `/tools/mondrian-studio?v=1&s=100779&p=24&u=58&ca=34&lw=0.6&pt=42&t=10&ce=balanced&ar=1.500`

## Publication routes

- **Studio:** `/tools/mondrian-studio` (prerendered, `sitemap.xml`, featured on `/blog/visualizations`).
- **Companion essay:** `/blog/visualizations/piet-mondrian-a-pioneer-of-abstract-art` (`published: true`, `registry.ts` summary `piet-mondrian-a-pioneer-of-abstract-art`).
