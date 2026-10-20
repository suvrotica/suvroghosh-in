# Spacetime Laboratory audit — 20 October 2026

## Scope and result

Reviewed the Einstein/Spacetime Laboratory's GPU startup, shader compilation and linking, all nine model branches, numerical equations, controls, graphs, URL state, accessibility, rendering lifecycle and error handling. The original implementation contained both browser compatibility problems and scientific discrepancies. Passing its previous source-pattern and formula tests did not establish a working renderer.

This is a feature audit, not certification of every GPU, exact Kerr imaging, numerical relativity or calibrated radiative transfer. Changes remain within the existing feature domain and article route; no new server endpoint or external service is introduced.

## Laptop diagnosis

The user identified **Microsoft Edge** as the failing browser. Windows reports **Intel Iris Xe Graphics**, driver **30.0.101.1660**, dated **18 March 2022**. A fresh native Edge test obtained WebGL2 through **ANGLE / Intel Iris Xe / Direct3D11**, including the stricter performance-caveat probe. The saved Edge configuration did not explicitly disable graphics acceleration or select an experimental graphics backend. Those observations do not inspect every effective policy or reproduce the user's existing browsing profile.

The original shader sources from Git HEAD created a context and compiled both stages in about **342 ms**, but native `LINK_STATUS` did not return before a **30-second** diagnostic timeout. The shader's repeated model, tracing and procedural-sky call sites expanded expensive driver compilation. Sharing the model/tracer calls alone still took about **39.7 seconds**. Evaluating the procedural sky once after model dispatch reduced a fresh native Edge context/compile/link measurement to **2.13 seconds**, without software rendering flags.

Consequently, the laptop's hardware supports WebGL2. There is a reproduced shader/native compiler interaction. The old generic “WebGL unavailable” title also conflated context failure and shader failure, and the parent could discard a renderer using a stricter separate capability probe. We cannot infer which of these produced the user's exact prior warning from its title alone.

Startup now uses the actual renderer as the capability authority, retains driver/compiler diagnostics, displays preparation status and supports retry. `KHR_parallel_shader_compile` permits nonblocking completion polling with a 15-second deadline and cancellation. Without that extension, WebGL exposes no guaranteed nonblocking completion query: the fallback yields once before its synchronous link check, whose driver wait cannot be interrupted by JavaScript. Context loss switches to an explanatory fallback and clears image capture.

## Original findings and repairs

| Severity | Original issue                                                                                                                              | Repair                                                                                                                       |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| High     | Repeated large shader branches caused native program linking to stall.                                                                      | One model dispatcher, compact-object trace and sky evaluation; explicit bounded dynamic march.                               |
| High     | A stricter independent support probe could reject a usable renderer; actual errors were overwritten.                                        | Renderer-owned context creation, original diagnostics, distinct failure titles and retry.                                    |
| High     | Schwarzschild/RN graphics used a normalized central bending force rather than their null-geodesic equations; charge did not affect bending. | Static spherical affine geodesics with RK4 and a static observer tetrad; charged metric enters the force and initialization. |
| High     | A distant observer at Low quality exhausted the ray budget before reaching the hole, showing sky through its centre.                        | Radius-scaled steps, capture classification from the spherical effective potential, bounded integration reserve.             |
| Medium   | Kerr capture ignored spin while readouts implied a correct Kerr image.                                                                      | Correct analytic horizon; explicit qualitative Kerr ray model and model-specific analytical readouts.                        |
| Medium   | Controls labelled M-based distances as Schwarzschild radii; static observers could be placed inside the Schwarzschild horizon.              | Consistent M units, r_s=2M, exterior minimum 2.1M and default disk inner edge 6M.                                            |
| Medium   | FLRW rendering ignored densities, curvature and epoch; its redshift stayed zero and its time reset each minute.                             | Shared mixed-density Friedmann background, density closure, explicit reference emission epoch and bounded future evolution.  |
| Medium   | GW cross axes rotated with time; ring displacement and detector response disagreed with tensor strain.                                      | Fixed 45° cross axes, h/2 displacement, appropriate fixed-arm response, bounded labelled magnification and matching graph.   |
| Medium   | Reversed smoothstep edges were undefined across graphics drivers.                                                                           | Defined increasing-edge smoothstep expressions.                                                                              |
| Medium   | Paused, hidden, offscreen and reduced-motion scenes kept rendering every animation frame.                                                   | Visibility/intersection suspension and redraw-on-change for paused scenes.                                                   |
| Medium   | Global shortcuts intercepted page/button keys; reset/presets did not reset time.                                                            | Focused viewport commands and consistent state/clock reset.                                                                  |
| Medium   | Shared links omitted multiple controls and animation time; malformed numbers and inverted disk radii were accepted.                         | Complete bounded scene/clock codec and sanitized finite settings.                                                            |
| Medium   | Failed initialization and context loss had incomplete cleanup; captures could use a detached/blank canvas.                                  | Abortable startup, partial resource cleanup, context-loss handling and capture only after an actual rendered frame.          |
| Low      | Zero star density still drew stars; irrelevant controls and unsupported preset claims were exposed.                                         | Genuine zero density, supported control visibility and honest preset/quality descriptions.                                   |

## Numerical evidence

Visual review also reproduced rectangular clipping of procedural galaxies at source-cell edges. The repair samples neighboring cells within a bounded source shell. A real-GLSL continuity fixture probes 6,656 paired directions across 13 cell boundaries: the old maximum colour jump was 226/255, while the repaired maximum was 1/255. At 1024×576, an isolated native sky draw plus readback changed from 4.27 ms to 5.38 ms; shader preparation remained approximately two seconds. These isolated timings do not establish a whole-page frame-rate guarantee.

An additional export fixture reproduced stale PNG capture after controls changed while the canvas was offscreen. Explicit capture now renders the current settings once before exporting, while ordinary offscreen reading remains suspended.

The original force's default-distance capture edge was approximately **5.68%** smaller than the analytical Schwarzschild static-observer prediction. Its circular-ray condition corresponded to 2M rather than the photon sphere at 3M.

The repaired spherical equations are

`p'' = (-3 M L²/r⁵ + 2 Q² L²/r⁶) p`, with conserved `L² = |p × p'|²`.

The initial spatial velocity is derived from the static observer's orthonormal direction and `f(r)=1−2M/r+Q²/r²`. This is a numerical integration of a known static metric, not a solution of the Einstein field equation.

An operation-rounded float32 trajectory grid covers charges **0, 0.6, 1**, observer radii **10M and 40M**, and **all four quality budgets**. It distinguishes captured and escaped rays at **±0.1%** of the analytical shadow boundary. Worst relative null-energy residual in this grid is **0.0133%**. The largest outgoing-direction discrepancy from a much finer-step reference is **0.781°**, including Low-quality rays only 0.1% outside the critical edge. These are bounded fixtures, not universal error bounds.

Independent FLRW tests cover matter, radiation, vacuum, Milne and flat mixed matter/vacuum analytical solutions, the Friedmann energy constraint, closed-universe turnaround/contraction, parameter effects and explicit numerical limits.

## Verification record

- `npm run spacetime:test`: all 54 feature wiring, analytical/numerical physics, cosmology and state/renderer regressions passed.
- `npm run check`: zero errors and warnings. The final `svelte-check` after the export correction also passed with zero errors and warnings.
- Focused ESLint and formatting checks passed; final diff integrity is checked at handoff.
- `npm run spacetime:browser:test` against the final production preview: **12/12 passed in 36.5 seconds**. This includes all nine modes in native Edge and SwiftShader, real-GLSL galaxy continuity, context failure/compilation failure/loss and retry, idle scheduling, focused keyboard interaction, valid PNG export, current settings after offscreen edits, portrait layout, a distant-observer captured central ray, and zero-charge RN/Schwarzschild image equivalence.
- `npm run build:full`: passed, including feature artifact/notebook checks, compilation, content/SEO/media/links, rendered discoverability and Barnum route assets. After the final capture and galaxy corrections, `npm run build:site` and the complete browser suite passed again; unchanged repository-wide artifact preflights were not repeated. Existing large-chunk, legacy SEO and optional Sharp dependency warnings were non-blocking.

Earlier browser runs during development caught a reserved GLSL identifier introduced during editing and the native linker stall. The identifier was corrected and the driver-sensitive source expansion was removed. Runs interrupted by source changes or development-server reloads are not counted as successful checks. Production deployment and the user's live browser profile are not verified by local tests.

## Remaining limits

- Kerr uses an illustrative swirl rather than Kerr null geodesics. The analytical horizon/ISCO/clock readouts do not certify its silhouette.
- Disk emission, RGB frequency tints and beaming are illustrative, with no calibrated radiative-transfer or magnetohydrodynamic calculation.
- Radius rings are schematic projected coordinate guides, not optical images of the event horizon or a photon sphere.
- FLRW's background is quantitative; its sky compares a shared reference epoch and does not calculate individual galaxies' light cones. de Sitter/AdS sky views remain teaching diagrams.
- Finite ray steps cannot resolve arbitrarily high-order images close to a critical orbit. Tiny procedural star points can still clip at hash-cell boundaries; the larger, visibly truncated galaxy footprints were repaired.
- Very large displayed wave strains are labelled visual magnifications outside the small physical strain regime. Physical mode removes the magnification.
- Native performance varies with viewport, quality, browser, driver and thermal/power state. No fixed frame-rate promise is made.

## Architecture handoff

Architecture impact: yes

Architecture rationale: Reviewed the canonical architecture and contribution gate. Updated sections 6 and 11, including the feature data-flow diagram, for renderer-owned capability detection, abortable startup, visibility-aware resource ownership, full scene/clock sharing and the shared FLRW background. These are feature-local changes; the public route, client/server boundary and security configuration are unchanged. A separate system-wide ADR is not warranted.

## Primary references

- [Perlick and Tsupko, Calculating black hole shadows](https://arxiv.org/abs/2105.07101): static spherical shadow geometry and finite-distance observers.
- [Belbruno and Pretorius, A Dynamical Systems Approach to Schwarzschild Null Geodesics](https://arxiv.org/abs/1103.0585): the central-force formulation and the critical photon orbit.
- [David Tong, Cosmology, section 1](https://www.damtp.cam.ac.uk/user/tong/cosmo/cosmohtml/S1.html): Friedmann background equations.
- [Khronos, smoothstep reference](https://github.com/KhronosGroup/OpenGL-Refpages/blob/main/gl4/smoothstep.xml): undefined reversed-edge behavior.
- [Khronos, KHR_parallel_shader_compile](https://registry.khronos.org/webgl/extensions/KHR_parallel_shader_compile/): asynchronous compilation completion semantics.
- [MDN, canvas context attributes](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/getContext): context modes and the performance-caveat flag.
