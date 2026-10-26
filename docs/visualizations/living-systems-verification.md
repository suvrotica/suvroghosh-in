# Living Systems verification — 26 October 2026

The implemented article is `/blog/visualizations/living-systems`. Final browser
checks used the complete SvelteKit production preview at
`http://127.0.0.1:4389`, with service workers blocked. The preview includes the
site layout, privacy controls, generic article renderer and production feature
chunks; it is separate from the faster feature-only authoring helper.

## Results

| Check                                              | Result                                                       |
| -------------------------------------------------- | ------------------------------------------------------------ |
| `npm run check`                                    | Zero errors and zero warnings                                |
| `npm run living-systems:test`                      | 24 tests passed in three files                               |
| `npm run build-workflow:test`                      | 15 workflow and generated-gallery tests passed               |
| `npm run living-systems:assets:check`              | Source hashes, decoded poster pixels and dimensions verified |
| Production browser suite                           | 13 tests passed together in 28.5 seconds                     |
| Scoped Prettier check                              | Passed                                                       |
| `git diff --check`                                 | Passed; Git emitted line-ending notices                      |
| Content and SEO validators                         | Passed after the final article corrections                   |
| Production build, discoverability and route assets | Completed successfully as described below                    |

The browser command was:

```powershell
$env:LIVING_SYSTEMS_BASE_URL='http://127.0.0.1:4389'
npx playwright test --config playwright.living-systems.config.ts
```

The suite verifies all four modes, single-step/reset behaviour, retained mode
state and seeds, editing through pan/zoom, diffusion mass accounting and
continuous sources, keyboard scope, deterministic replay, PNG export, distinct
rendered worlds and mobile overflow. Lifecycle checks cover offscreen suspension,
paused resize preservation, live reduced-motion changes and touch painting in
an actual 2× device-pixel-ratio browser context. Browser error capture found no
errors in the four-mode rendering run.

## Build execution

The initial `npm run build:full` passed its existing feature-artifact audits,
notebook verification, content generation, content/resource/contrast/SEO/media/
link validation and server/client compilation. Discoverability then correctly
rejected this new immersive article for lacking its own `<h1>` and visible
Updated date. Those two integration errors were fixed. Ten matching curated
tags/pinned tags also prevent the tag generator from adding incidental prose.

After the corrections, the affected tags, gallery metadata, word cloud and
search index were regenerated and validated. The unchanged expensive feature
audits were not repeated. The remaining build stages were resumed with:

```text
npm run build:site
npm run validate:discoverability
npm run barnum-lab:route-assets
```

All completed successfully, including the Vercel adapter. Discoverability
verified 725 published posts. Existing optional-dependency tracing and bundle
warnings were emitted by the shared site build; they did not prevent completion.
The final production preview was restarted against the corrected output before
the combined 13-test browser run.

The poster is an actual capture of seed 1847's random garden after 20 model
steps, at 1200 × 1183 pixels. Its intrinsic image attributes match its dimensions.
The existing PNG optimiser changed the encoding while preserving pixels;
verification uses decoded RGBA identity. Source hashes normalise CRLF/LF for
cross-platform verification. The manifest separately identifies the original
capture encoding hash.

## Performance scope

A separate four-second, default-speed sample per mode used local headless
Chrome 155, a 1440 × 1100 viewport and device pixel ratio 1. Observed simulation
rates were 11.74/12, 199.51/200, 23.74/24 and 23.70/24 steps per second for Life,
Ant, Diffusion and Walk respectively. The 95th-percentile application animation
callback CPU times were 0.9, 0.6, 0.9 and 0.7 ms. Initial and final partial steps
are included. These measurements establish neither a display frame-rate
guarantee nor worst-case or mobile hardware performance. The measurement JSON
and desktop/mobile screenshots are under `artifacts/living-systems`.

## Architecture review

Architecture impact: yes

Architecture rationale: the canonical architecture was reviewed and updated
with the four feature-owned models, feature-local clock/renderer, per-mount
state/lifecycle and article/gallery integration. A matching Mermaid diagram
describes those data flows. This extends the existing model/UI pattern without
a foundational decision requiring a separate ADR. Feature documentation and CI
now include numerical, browser and capture verification.

The initial checkout contained substantial unrelated work. The checks above
record the local implementation before the subsequent publication request.

## Publication preparation

The user requested live publication on 26 October 2026. The release was isolated
onto `origin/main` at `dc911d80bf975289d58b3b115c009d38522ed5f3` on
`codex/living-systems-release`. Only this feature's files and focused integration
additions were copied; main's newer HTTP/TCP, Prompt Atlas, comments, privacy and
architecture changes were preserved. Dependency versions and the lockfile are
unchanged.

Fresh checks in the release checkout passed all 24 model/clock fixtures, all
16 current build-workflow/gallery fixtures, capture provenance and the complete
Svelte/TypeScript check with zero errors and warnings. The release targets the
existing `suvroghosh-in` Vercel project and canonical URL
`https://www.suvroghosh.in/blog/visualizations/living-systems`. Deployment status
and the bounded public interaction check are recorded in the final task handoff.

The isolated checkout completed `npm run build:full` successfully, including
publication/discoverability checks and Vercel packaging. The complete production
route at `http://127.0.0.1:4394` then passed all 13 browser checks together in
36.5 seconds. Generated image/tag/gallery/dimension/word-cloud changes were
reviewed and contain this article's publication data only. The original dirty
checkout was preserved.
