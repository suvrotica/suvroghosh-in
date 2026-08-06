# Visualization performance

Audit date: 2026-08-06 (Asia/Calcutta, UTC+05:30)

## Scope and verdict

Two production routes represent opposite loading strategies:

- lightweight: `/blog/visualizations/hello-fragment-your-first-shader-from-scratch`;
- heaviest: `/blog/visualizations/the-fractal-atlas`.

The lightweight shader successfully defers p5/WebGL code until near-viewport activation, but normal-motion rendering lacks explicit offscreen and hidden-tab pausing after activation. Its activated canvas also failed to shrink during the automated 390 → 320 px resize probe.

The Fractal Atlas has stronger lifecycle controls — offscreen and hidden-tab pausing, bounded device-pixel ratio, Worker/WebGL cleanup, reduced-motion handling, and a rich static fallback — but its laboratory JavaScript arrives on initial navigation. On simulated mobile it produced 4.37 s main-thread time, 187 ms TBT, and a 772 ms maximum long task.

The correct response is to defer and split heavy code while preserving the visualizations, explanatory writing, state sharing, and fallbacks.

## Initial-navigation medians

| Route/profile          | Perf |      LCP |    TBT |    CLS | Total transfer | JavaScript | Unused JavaScript | Main thread | Long tasks / max |
| ---------------------- | ---: | -------: | -----: | -----: | -------------: | ---------: | ----------------: | ----------: | ---------------: |
| Hello Fragment mobile  |   94 | 2,758 ms |  36 ms |      0 |        501 KiB |    146 KiB |             0 KiB |    1,883 ms |       3 / 378 ms |
| Hello Fragment desktop |  100 |   723 ms |   0 ms | 0.0109 |        849 KiB |    145 KiB |             0 KiB |      457 ms |        1 / 81 ms |
| Fractal Atlas mobile   |   88 | 3,197 ms | 187 ms | 0.0415 |        817 KiB |    275 KiB |            72 KiB |    4,371 ms |       6 / 772 ms |
| Fractal Atlas desktop  |   95 | 1,025 ms |   0 ms | 0.0234 |      1,004 KiB |    275 KiB |            73 KiB |    1,063 ms |       1 / 214 ms |

These are medians of three telemetry-blocked Lighthouse 13.4.1 runs. TBT is a navigation-lab proxy, not INP. The initial-navigation audit did not click or manipulate either visualization.

## Directional runtime probe

The separate Playwright probe used Headless Chrome 151, a 390 × 844 viewport, device scale factor 2, and reduced motion. It blocked the same Vercel telemetry endpoints and recorded zero completed matching requests.

| Observation                                        |            Hello Fragment |                  Fractal Atlas |
| -------------------------------------------------- | ------------------------: | -----------------------------: |
| Initial script transfer                            |                 154,969 B |                      287,080 B |
| Script transfer after activation + 5 s             |                 499,451 B |                      287,080 B |
| Activation script delta                            |             **344,482 B** |                        **0 B** |
| Initial used JS heap                               |               5,805,090 B |                    8,738,976 B |
| Heap delta after activation + 5 s                  |             +12,993,683 B |                   −1,926,691 B |
| Heap delta during the following frame/resize probe |                −275,717 B |                     +112,759 B |
| Foreground rAF callback sample                     |      90.78 Hz over 2.00 s |           90.92 Hz over 2.00 s |
| Worker resource entries observed                   |                         0 |                              0 |
| Motion controls visible under reduced motion       | `Start`, `Restart motion` |            `Start guided tour` |
| Canonical                                          |          Base article URL |               Base article URL |
| Open Graph image                                   |   Dedicated shader poster | Dedicated Fractal Atlas poster |

The rAF values measure browser callback scheduling on this headless display. They are **not renderer FPS**, do not reveal missed GPU frames, and must not be used as a smoothness claim. Used-JS-heap deltas are GC-sensitive one-cycle observations, not leak proof. Zero Worker entries means the probed path did not expose a Worker resource entry; it does not prove Worker fallback paths are absent.

## Lightweight shader

### Loading and startup

`VisualizationShell.svelte` delays the visualization definition with an `IntersectionObserver` using a 320 px root margin. `P5Sketch.svelte` then dynamically imports p5. The lab's initial JavaScript stayed near 145–146 KiB, while explicit/near-viewport activation added 344,482 bytes in the browser probe. This demonstrates a real split rather than merely a lazy visual placeholder.

The canvas became visible within the probe's 20-second startup bound and exposed an accessible name. The runner does not emit a precise WebGL-ready performance mark, so no millisecond startup claim is supportable. Add marks around definition import, p5 import, context creation, shader compilation, and first painted frame if startup latency becomes an acceptance target.

### Motion, frame pacing, and lifecycle

With reduced motion enabled, the shader started paused and exposed `Start`; the canvas supports Arrow keys, Home, and Space. Device pixel ratio is capped at 1 on a narrow/low-core device and 1.5 otherwise.

The load observer disconnects after the first near-viewport event. Once p5 is active, neither `VisualizationShell` nor `P5Sketch` listens for later intersection or `visibilitychange` events. Normal-motion rendering can therefore continue when the visualization is far offscreen; hidden tabs may receive browser-level rAF throttling, but the application does not explicitly pause. Add a persistent visibility/intersection gate that preserves the user's play/pause intent.

Unmount cleanup is present: the component disconnects its `ResizeObserver`, removes canvas listeners, calls `p5.remove()`, and clears the instance. This is verified source behavior; the probe did not perform a repeated SPA-navigation soak or measure post-navigation heap.

### Resize defect

After activation at 390 px, the probe changed the viewport to 320 px. The visualization shell measured 256 px wide, but the canvas remained 398 px wide after 500 ms. Global document overflow stayed at zero because the shell clips overflow, so part of the interactive bitmap may be cropped rather than causing a horizontal scrollbar. At 768 px, the shell measured 618 px and the canvas 616 px.

The source has a `ResizeObserver`, but the narrow runtime result shows that this path needs repair. Check p5's inline canvas sizing, set `min-width: 0`/`max-width: 100%` on the host and canvas as appropriate, and add an orientation/resize regression test that asserts canvas CSS width never exceeds the shell.

### Static and semantic fallback

The route retains a dedicated poster, caption, source walkthrough, explanatory article, FAQ, and WebGL/no-script fallback. The runtime canonical is the base article URL and the Open Graph image is `/images/visualizations/hello-fragment-poster.jpg`.

## Fractal Atlas

### Initial bundle and main-thread work

The article imports the laboratory directly. The browser probe transferred 287,080 script bytes both before and after bringing the lab into view, so no additional activation split existed on this path. Lighthouse independently recorded 275 KiB of median initial JavaScript and 72–73 KiB of unused-JavaScript opportunity.

Split the laboratory behind the existing `Enter the laboratory` action or a conservative near-viewport boundary. Keep the hero/poster, article, formulas, figures, captions, FAQ, and fallback in the initial server-rendered document. Within the lab, isolate low-frequency precision, export, tour, palette, and Worker tools where measurement shows useful savings.

### Motion, low-end controls, and cleanup

`FractalCanvas.svelte`:

- caps device pixel ratio at 2 and applies additional resolution/pixel-count budgets; CPU rendering caps DPR at 1;
- observes the stage with a 240 px root margin;
- pauses Worker/progressive rendering when offscreen or when `document.visibilityState` is hidden;
- cancels render and overlay animation frames during cleanup;
- destroys WebGL and CPU renderers and disposes the Worker on unmount;
- exposes a labelled, focusable `role="application"` surface while render canvases are `aria-hidden`.

Reduced motion disables continuous/tour-style motion and the probe exposed `Start guided tour`, not an automatically running tour. Keyboard/touch instructions and extensive native form controls are present. The accessibility report records separate colour-contrast and visible-label/name defects that still need correction.

The simulated-mobile lab uses 4× CPU slowdown, but it is not a physical low-end handset or GPU. WebGL fallback, thermal pressure, texture limits, and sustained memory must be tested on representative Android hardware before making a low-end support claim.

### Resize behavior

At 320 px, the Atlas shell measured 288 px and its responsive primary canvas measured 286 px; at 768 px the shell measured 736 px and the primary canvas measured 734 px. No global overflow was recorded. A second rendered canvas retained a 356 px CSS width through the narrow transition, likely a companion/auxiliary surface; because the probe did not capture visual clipping or tab visibility for that canvas, treat it as a targeted manual check rather than a confirmed defect.

### Static fallback and shareable state

The route has a dedicated `/images/fractal-atlas.png` hero/Open Graph image, numerous captioned static figures, a long explanatory article, FAQ, and a `noscript` panel that keeps the article/formulas available while explaining that numerical navigation requires JavaScript.

The lab serializes a versioned state into query parameters, updates browser history, validates/clamps inputs, and rejects query strings longer than 30,000 characters. This produces many legitimate shareable states and potentially unbounded combinations. The server-generated canonical remains the base article URL, and sitemap generation emits canonical post paths without experiment parameters. Keep regression tests for canonical stability and never add parameter states to the XML sitemap. Search Console access is unavailable, so accidental parameter indexing remains unverified externally.

## Priority actions

1. **P1:** repair the lightweight canvas's narrow dynamic resize and add a 390 → 320 → 768 regression test.
2. **P2:** dynamically split the Fractal Atlas laboratory while preserving the static/server-rendered experience.
3. **P2:** explicitly pause the lightweight p5 loop when offscreen or hidden, without overriding a user's chosen paused state.
4. **P2:** add first-frame/shader-compile marks, renderer frame-time instrumentation, and long-task attribution for both visualizations.
5. **P2:** run a repeated activation/navigation/resize memory soak on physical low-end and mid-range devices; treat DevTools heap and GPU memory separately.
6. **P2:** manually verify the Atlas companion canvas during orientation changes and at 200%/400% zoom.
7. **P3:** retain canonical/query-state tests and inspect Search Console parameter/indexing evidence once the owner grants access.

## Evidence boundaries

- The probe verifies that canvases started and resized under one browser configuration; it does not benchmark GPU shader throughput.
- Foreground rAF callback rate is a scheduling proxy, not renderer FPS.
- Heap differences can move because of garbage collection and JIT behavior; repeated steady-state sampling is required for leak detection.
- Source cleanup is strong evidence of intent and implementation, but only repeated SPA navigation plus memory/GPU inspection can validate cleanup under load.
- No visualization was simplified or removed for an artificial score, and no production setting was changed.
