# A Skin That Paints Itself

Article: `/blog/visualizations/a-skin-that-paints-itself`. Compare a pattern formed inside a fixed boundary with a broad pattern geometrically fitted to that same boundary after formation. The comparison does not model tissue growth or identify the chemistry of an animal coat.

## Model and geometry

The signals obey `u_t = 0.6 ∇²u + u − u³ − 1.2v + k` and `v_t = 9 ∇²v + 1.5(u − v)`. Both are signed, dimensionless signals. The appearance choices set `k` to `−0.075`, `0`, or `+0.075`. `model.ts` reuses the companion workbench's equilibrium `s³ + 0.2s = k`, deterministic Mulberry32 disturbance generator and masked right-hand side. It owns the new configuration, fixed domain, RK2 integration, finite state checks and fit. The previous workbench and the Gray–Scott atlas retain their existing engines.

The cell-centered master rectangle is 76.8 by 40 model units, with `h = 0.8` (96 by 50 cells). Set `x = 0` at the left boundary and `y = 0` on the transverse centerline. The straight patch ranges from 24% to 100% of the broad width in four percentage point increments. The taper interpolates from the chosen wide end to 8 units; the preset is 32 to 8 units. Each column's actual width is rounded to a centered union of whole cells, so a taper is a staircase and its narrowest part spans at least 10 rows. The slider changes the requested width in model units, and the outline shows the actual mask. Longitudinal length, grid and chemistry stay fixed during a width change.

For each seed and signal, deterministic ±0.03 disturbances at the coarse lattice centers define a physical field by bilinear interpolation with constant edge extension. Active overlapping coordinates at the same resolution get exactly the same disturbance. A finer grid samples that field at its own cell centers. No per-mask mean is subtracted. Missing mask neighbors return the center value in the five-point Laplacian, so there is zero exchange across inactive edges. Equal-and-opposite neighbor fluxes sum to zero. Explicit Heun integration uses `Δt = 0.01` and stops at `T = 60`. The diffusion-only timestep bound is a guard; the checks below also exercise the nonlinear model. Numerical divergence or a non-finite active value is an explicit failure.

For fitting, keep `x` fixed and map `y` to `y × 40 / columnWidth(x)`, where `columnWidth` is the width of the actual stepped mask at that column. Bilinear interpolation samples the broad scalar fields on the cell-centered lattice, extending an edge sample to the boundary. At full width, every target center maps to its matching source center. Sampling can mildly smooth the fitted field; no target evolution is performed on this path. The display also reconstructs scalar values bilinearly within the active mask before applying either the pigment transfer (smoothstep over `u = −0.16…+0.16` from ivory to charcoal) or the fixed signed signal range `−1…+1`. Mask-exterior samples are ignored and remaining weights are normalized. Pixels outside the actual mask are transparent. Changing the display never changes the underlying field.

## Runtime and reproduction

The initial computed pair is shown at straight 24% width (9.6 units), Stripes (`k = 0`), seed 1952, `t = 60`. The live component begins with those same raster images; the worker starts on demand. While dragging, the outline reflects the requested width and visible captions describe the last completed run. A committed change cancels obsolete work. The worker yields to newer requests and visibility changes between short batches. It owns one cached broad reference keyed by the entire broad configuration; the main thread holds at most one current comparison and its replay. Frames are captured every two units of model time from 0 to 58, with the final field at 60. Replay presents those saved states at a separate playback rate, keeps the fitted panel at 60, and pauses offscreen or while the tab is hidden. Reduced-motion and regular sessions start on the completed comparison. When JavaScript, canvas or worker support is missing, the published explanation and initial computed pair remain useful. Print uses the labeled saved pair.

The instrument's warm accent is reserved for controls and outlines, outside the data windows. Relative luminance checks on the authored tokens give 11.04:1 for body text on the case, 7.52:1 for secondary text, 9.72:1 for text on the selected ivory key, and 6.09:1 for the focus ring against a raised key.

- `npm run skin-comparison:assets` solves the reference, default and taper and renders the two per-panel fallbacks, labeled poster, social card, worked example and taper plate.
- `npm run skin-comparison:assets:check` verifies the source hash, image dimensions and decoded pixel hashes. The [manifest](../../static/images/visualizations/a-skin-that-paints-itself/assets.json) includes model inputs, renderer settings, fitting convention and scalar/mask hashes. The numeric input and field hashes are independent of fonts; text rasterization in newly generated labeled images uses the host's Arial or sans-serif fallback.
- `npm run skin-comparison:check` checks types and Svelte diagnostics within the feature. `npm run skin-comparison:test` covers numerical and display invariants. `node scripts/calibrate-skin-patterns.mjs` reruns the seed, timestep and mesh comparisons.
- `npm run skin-comparison:browser:test` builds and tests a local production preview; use `PLAYWRIGHT_REUSE_SERVER=1` to reuse an already built preview on port 4291. Set `SKIN_COMPARISON_EVIDENCE` to a local directory to capture the five responsive instrument screenshots.

## Numerical sensitivity

A crossing column has one sign of `u` from edge to edge. This directly tests the observed across-width bands. It is a sample count, with adjacent columns potentially belonging to the same band.

| Grid and step | Formed strip | Fitted strip | Formed taper | Fitted taper |
| --- | ---: | ---: | ---: | ---: |
| `h = 0.8`, `Δt = 0.01` | 9/96 | 0/96 | 1/96 | 0/96 |
| `h = 0.8`, `Δt = 0.005` | 9/96 | 0/96 | 1/96 | 0/96 |
| `h = 0.4`, `Δt = 0.0025` | 19/192 | 0/192 | 4/192 | 0/192 |

At seed 1952, halving the timestep leaves the signs and crossing counts unchanged. The formed field's RMS change in `u` is `5.68×10⁻⁸` for the strip and `4.20×10⁻⁷` for the taper (calibration tolerance `0.005`). With finer spacing, restrict each comparison to coarse cells whose four fine cells are all active and compare the coarse value to their average. RMS change in `u` is `0.0303` for the strip and `0.207` for the taper, and RMS change in `v` is `0.00857` and `0.0630`, respectively. All taper crossing columns are in the final quarter at both resolutions. The coarse taper's 10-cell minimum becomes 20 cells at finer spacing. The qualitative distinction persists; the exact positions of taper markings do not converge in this two-grid check.

At the default strip width, additional seeds 17, 83, and 221 produce 32, 16, and 24 formed crossing columns, respectively, against zero fitted crossing columns for each. Individual locations vary. These runs support the worked comparison, not a universal transition from spots to bands or an exact mode count for the taper. The threshold is a display choice; neither it nor the model time carries biological units.
