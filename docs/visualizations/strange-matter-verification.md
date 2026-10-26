# Strange Matter verification

Verified locally on 27 October 2026 in Chrome against both a production feature
bundle and the complete SvelteKit production article. Service workers were blocked.

## User story

A visitor opens the immersive article, selects a procedural world, changes bounded
artwork settings and camera position, then downloads an image or short video, or
shares a URL that reconstructs the design and animation position. These operations
stay in the browser.

## Automated evidence

| Check                                                                    | Result                                                                                                              |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `npm run strange-matter:test`                                            | 36 tests passed across the state and geometry suites                                                                |
| `npm run strange-matter:browser:test` against production feature preview | 10 tests passed                                                                                                     |
| Full-site production browser checks                                      | All 10 cases passed; the downloaded-video decoder was rerun separately after the harness correction described below |
| `npm run check`                                                          | 0 errors, 0 warnings                                                                                                |
| Final feature-scoped Svelte/TypeScript check                             | 0 errors, 0 warnings                                                                                                |
| Scoped Prettier check                                                    | Passed                                                                                                              |
| `npm run strange-matter:assets:check`                                    | Actual exported poster, dimensions and source/pixel provenance verified                                             |

The browser suite exercises readable SSR fallback, real visible geometry in every
world and its alternate preset, reduced motion, playback and speed zero, native
range controls, palette changes, Undo, camera controls, malformed URL recovery,
reproducible share state, mobile layout and clean presentation.

Each of the eight curated presets must show substantial bright artwork pixels in
three consecutive canvas samples. This guards against a black render passing
solely because its image hash differs from a previous world. Geometry tests cover
finite positions, unit normals, noncollapsed indexed triangles, valid indices and
bounded geometry at minimum, default and maximum Shape/Detail settings. Positive
petal-tip width fixes the zero-normal defect that originally contaminated the HDR
bloom pipeline.

Export checks verify these actual downloaded PNG dimensions:

| Composition | Standard export |
| ----------- | --------------- |
| Landscape   | 1600 × 1000     |
| Square      | 1600 × 1600     |
| Portrait    | 1280 × 1600     |

The recorded native video successfully decoded and advanced playback. A forced
WebGL context loss during recording stopped capture, displayed the fallback and
prevented a corrupt download. A design exported immediately after Shape and
Colour changes matches the corresponding shared design's replay. Camera links
preserve orientation after multiple full rotations.

On the complete site, the recording downloads successfully but the article's
existing CSP blocks inline `blob:` media playback. The test originally tried to
decode the downloaded artifact inside that article and encountered this policy.
The decoder now opens the downloaded bytes in a separate, empty browser document,
and that test passed against the complete production site. This verifies the
actual exported file without changing or bypassing the article's security policy.
An independent `securitypolicyviolation` observation confirmed `media-src` blocked
the inline blob; that evidence is retained with the browser inspection results.

## Repository build and integration

The full feature-artifact audits and notebook verification passed. The first
full-site discoverability pass caught the loading shell's absent SSR heading and
the article's absent visible update date. The shell and hydrated studio now each
provide exactly one `h1`, and the authored date matches `dateModified`. The SSR
browser regression checks both requirements.

After those corrections, the site build and discoverability validation passed.
A further production build verified the studio's bundled fonts and heading
selectors inside the real article typography. The complete-site browser checks
confirmed the intended Newsreader heading family, visible sculpture, restored
share state, mobile layout, image exports and video download/playback. Final
route-asset verification reported no forbidden assets or budget failures; poster
source/pixel provenance and `git diff --check` passed.

The feature workflow is configured to run the state/geometry suite and production
feature browser suite, with article/spec changes included in its trigger paths.
Its local workflow fixtures passed. No hosted GitHub Actions run is claimed.

## Additional browser inspection

An independent production-browser pass confirmed fullscreen, a 2560 × 1600 PNG,
multiple-turn camera sharing, immediate-edit export fidelity and recording
cancellation after context loss, with no unhandled page errors. The immediate
export/replay comparison averaged 0.00105 byte levels of difference per colour
channel, below the one-level regression tolerance.

- [Desktop studio](../../artifacts/strange-matter/studio-final.png)
- [Mobile studio](../../artifacts/strange-matter/studio-final-mobile.png)
- [Alien Bloom](../../artifacts/strange-matter/renderer-bloom-fixed.png)
- [Neon Current](../../artifacts/strange-matter/renderer-current.png)
- [Impossible Tunnel](../../artifacts/strange-matter/renderer-tunnel.png)
- [Additional browser evidence](../../artifacts/strange-matter/final-browser-evidence.json)

## Isolated release preparation

The release checkout starts at production commit `526b0e39` and carries only
Strange Matter's feature files, additive gallery/build/test/documentation wiring,
and its regenerated publication records. Existing Splat Studio, HTTP/TCP,
Prompt Atlas and other main-branch content remain intact.

On this clean checkout, all 36 state/geometry tests and all 16 publishing-workflow
fixtures passed. `npm run check` reported zero errors and warnings, and
`npm run build:full` completed successfully, including feature provenance,
notebook preparation, publication validation, production compilation,
discoverability and route-asset budgets. Production verification is performed
after the resulting commit is released; this record describes the local gates.

## Boundaries and limits

This is local verification, not evidence of a hosted deployment. The renderer
requires WebGL 2; the poster and guide remain readable without it. Native recording
availability and encoding format depend on browser support. Other browser engines
and physical mobile GPUs were not tested. Procedural design and camera state are
reproducible; exact pixels can vary across graphics hardware.

Architecture impact: yes

Architecture rationale: The canonical reference was reviewed and updated with the
feature-owned design, renderer, lazy Svelte shell, local exports and poster
provenance flow. The implementation follows the existing dedicated visualization
pattern and reuses Three.js; it adds no endpoint, credential, provider or shared
state framework, so a new ADR was unnecessary.
