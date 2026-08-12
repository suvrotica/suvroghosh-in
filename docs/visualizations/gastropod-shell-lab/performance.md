# Performance integration record

This record covers the native laboratory: its pure benchmark lives under `src/lib/visualizations/gastropod-shell-lab/`, and its viewport host lives under `src/lib/components/visualizations/gastropod-shell-lab/`.

## Reference device

The historical measurements below were recorded locally on 12 August 2026 with:

- Windows 11 Home Single Language
- 12th Gen Intel Core i5-12500H
- 15.7 GiB system memory
- Intel Iris Xe Graphics
- Node.js v24.11.1

These values came from the earlier seven-sample standalone runner, which warmed each case once, sorted seven elapsed wall-clock samples, and reported the median and maximum sample. They are retained as a historical reference and are **not** reproduced exactly by the current Vitest benchmark command. They are pure engine CPU timings and exclude worker startup/transfer, Three.js buffer upload, shader compilation, and browser painting.

## Historical standalone geometry measurements

| Case                                        | Resolution | Triangles |    Median |    Maximum |
| ------------------------------------------- | ---------: | --------: | --------: | ---------: |
| Default drag preview                        |   240 × 56 |    26,824 |  42.42 ms |   60.81 ms |
| Default auto refine                         |   560 × 88 |    98,472 | 183.80 ms |  210.33 ms |
| Deep finite hierarchy, adaptive auto refine |   340 × 64 |    43,456 | 151.02 ms |  170.71 ms |
| Deep finite hierarchy, explicit Fine        |  900 × 128 |   230,272 | 995.49 ms | 1011.24 ms |

In that historical run, normal preview and ordinary refinement were inside the 50–100 ms preview and roughly 400 ms refinement goals on the reference CPU. Deep hierarchy was adaptively tessellated in Auto/Balanced and used pre-tabulated aperture-level Gaussian profiles. Explicit Fine took about one second; the interface kept the prior mesh visible while the worker ran.

## Current native benchmark contract

Run `npm run gastropod-shell-lab:benchmark` from the repository root. The command invokes Vitest's benchmark runner for four deterministic `generateShell` workloads:

| Case                             | Resolution |
| -------------------------------- | ---------: |
| Default preview                  |   240 × 56 |
| Default auto refine              |   560 × 88 |
| Finite hierarchy adaptive refine |   340 × 64 |
| Finite hierarchy explicit Fine   |  900 × 128 |

Each benchmark requests one warm-up iteration and seven benchmark iterations. Vitest owns the timing loop, aggregation, sample count, and displayed latency/throughput distribution, so its columns and sample counts may vary with the installed Vitest version and runtime. The command does not implement the historical runner's manually sorted median or seven-run maximum and does not enforce a wall-clock pass/fail threshold. The two default cases construct their default recipe inside the timed callback; the hierarchy cases reuse a preset recipe resolved before timing.

Use the current output for comparisons made on the same machine, Node version, dependency set, and power state. Record those conditions with any published measurements; do not compare its absolute values directly with the historical table as though the runners were identical.

## Viewport tiers

| Tier                    | Desktop target | Mobile target | Intended use                                       |
| ----------------------- | -------------: | ------------: | -------------------------------------------------- |
| Drag preview            |       240 × 56 |      160 × 40 | Immediate parameter feedback                       |
| Low                     |       240 × 56 |      240 × 56 | Constrained devices                                |
| Auto                    |       560 × 88 |      320 × 64 | Default adaptive viewing                           |
| Balanced                |       640 × 96 |      400 × 72 | Higher interactive detail                          |
| Fine                    |      900 × 128 |      560 × 88 | Explicit close inspection/export source            |
| Deep hierarchy Auto     |       340 × 64 |      280 × 56 | Keeps multilevel ornament inside the refine budget |
| Deep hierarchy Balanced |       420 × 72 |      340 × 64 | Extra inspection detail without selecting Fine     |

The aperture sample count is raised automatically when a valid Fourier harmonic, lobe/polygon count, cord, spine row, buckling mode, or imperfection band would otherwise exceed Nyquist. This changes sampling, not recipe semantics. Refined viewport meshes remain below 250,000 triangles at the listed tiers. Device pixel ratio is capped at 2 on desktop and 1.5 on narrow viewports.

## Rendering behavior

- Geometry generation runs in a module Worker and transfers typed-array buffers.
- Superseding edits terminate/restart the queued worker, so the newest preview is not blocked by stale jobs.
- The prior valid mesh remains visible during preview/refinement and invalid edits.
- Three.js renders only on invalidation; there is no idle RAF loop.
- OrbitControls damping is disabled, avoiding a continuous animation loop.
- Three.js GLB/OBJ exporters are lazy-loaded on first use.
- Resize, page visibility, context loss/restoration, and unmount have explicit lifecycle handlers.

The native Playwright configuration runs at 1440×1000, 768×1024, and 360×800. The browser suite checks that the article contains exactly one labelled shell canvas and that the page has no horizontal overflow at each viewport; it does not currently assert the canvas's pixel dimensions. Headless WebGL performance is deliberately not presented as an end-user FPS benchmark because virtualized Chromium/GPU scheduling is not representative.

## Triangle and memory expectations

Raw core mesh memory is approximately positions (12 bytes/vertex), normals (12), UVs (8), indices (12 bytes/triangle), history positions (12 bytes/ring vertex), plus Float64 frame/history arrays and transient worker data. The export dialog reports current triangle and raw mesh-buffer estimates before export.

GLB and OBJ describe the open visual outer surface. PNG scale affects render dimensions, not geometry. The app does not expose STL or promise a watertight printable solid.

## Known limits and next optimizations

- Fine deep hierarchy exceeds the ordinary interactive budget by design; keep Auto/Balanced for editing.
- Static aperture coordinates and finite-hierarchy level profiles are pre-tabulated once per generation, and the complete ornament evaluator is skipped for smooth recipes. Further speedups could pre-tabulate other aperture-only ornament fields and reuse age-only envelopes.
- Worker restart is robust and low-latency but trades some startup overhead for strict latest-request priority. A future chunked engine with an atomic cancellation flag could retain a warm worker.
- Conservative ring-envelope overlap diagnostics are bounded and may be truncated. The UI labels a capped scan incomplete; raw envelope candidates and the independent parameter-risk flag remain distinct. Exact triangle collision detection would add CPU/memory cost and should run as an optional validation pass.
- Mobile orbit/playback frame rate depends strongly on browser and GPU. Pixel-ratio and mesh caps protect stability, but the project does not claim one measured mobile-device FPS from this desktop-only benchmark.
