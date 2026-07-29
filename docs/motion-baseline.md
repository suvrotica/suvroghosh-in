# The Living Archive — motion baseline

Baseline recorded on 29 July 2026, before Phase 1 implementation.

## Repository state

- Branch: `main`
- Starting worktree: clean
- Node.js: `v24.11.1`
- npm: `11.12.1`
- Framework: Svelte 5.54.0 and SvelteKit 2.50.2
- No `.openai/hosting.json` is present.
- Existing dependencies were already installed. No package was installed for this work.

The normal shell scrolls the document viewport (`window` /
`document.documentElement`). `#main-content` has neither a constrained height
nor vertical overflow, so it is not an `IntersectionObserver` root.

## Baseline screenshots

The screenshots are viewport captures of the existing home page. They use the
requested desktop and mobile sizes and were reviewed before implementation.

| View        | Paper                                                                           | Night                                                                           |
| ----------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 1440 × 1000 | [`home-desktop-paper.png`](../artifacts/motion/baseline/home-desktop-paper.png) | [`home-desktop-night.png`](../artifacts/motion/baseline/home-desktop-night.png) |
| 390 × 844   | [`home-mobile-paper.png`](../artifacts/motion/baseline/home-mobile-paper.png)   | [`home-mobile-night.png`](../artifacts/motion/baseline/home-mobile-night.png)   |

These are review artefacts, not pixel-diff goldens. A continuous Canvas frame
would make a conventional screenshot golden unnecessarily brittle.

## Commands before implementation

| Command         | Result                                                                             |   Elapsed |
| --------------- | ---------------------------------------------------------------------------------- | --------: |
| `npm run check` | Pass: 0 errors and 0 warnings                                                      |  52.145 s |
| `npm run lint`  | Pre-existing failure at `prettier --check .`; ESLint did not run                   |  26.272 s |
| `npm test`      | Pass: all 355 reported tests/assertions                                            | 121.056 s |
| `npm run build` | Pass, including content generation, validators, Vite, adapter, and discoverability | 403.618 s |

The baseline lint failure reports 31 existing files:

```text
docs/handwritten-notes-architecture.md
README.md
scripts/build-search-index.mjs
scripts/generate-media-gallery.mjs
src/app.d.ts
src/lib/components/layout/CommandPalette.svelte
src/lib/components/layout/Footer.svelte
src/lib/components/layout/Header.svelte
src/lib/components/search/PostSearch.svelte
src/lib/content/categories.ts
src/lib/notes/schema.test.ts
src/lib/notes/schema.ts
src/lib/server/notes/rate-limit.ts
src/lib/server/notes/recovery.test.ts
src/lib/server/notes/recovery.ts
src/lib/server/notes/supabase.ts
src/routes/+layout.svelte
src/routes/+page.server.ts
src/routes/+page.svelte
src/routes/blog/[category]/[slug]/+page.server.ts
src/routes/blog/+page.server.ts
src/routes/blog/+page.svelte
src/routes/notes/forgot-password/+page.server.ts
src/routes/notes/reset-password/+page.server.ts
src/routes/notes/sign-in/+page.server.ts
src/routes/rss.xml/+server.ts
src/routes/sitemap.xml/+server.ts
src/routes/writing/+page.server.ts
src/routes/writing/+page.svelte
src/service-worker.ts
vitest.config.ts
```

Because the lint script is `prettier --check . && eslint .`, the baseline run
does not reach ESLint. New and touched files must still be formatted and linted
directly.

## Existing motion and appearance inventory

- `static/app-bootstrap.js` resolves the colour theme before hydration from
  `site-theme` and sets `data-theme-preference`, `data-theme`, `.dark`,
  `color-scheme`, and the theme-colour meta value.
- Paper, light, night, and authored high-contrast themes share semantic
  `--paper`, `--ink`, `--accent`, `--rule`, `--focus`, and related tokens.
- Paper grain is a fixed, non-interactive `body::before` layer.
- Global motion currently includes colour transitions, a nav underline, small
  card lifts, `.page-enter`, `ScrollReveal`, article reading progress, and
  dormant topic-constellation styles.
- The existing reduced-motion media query disables page entry, reveals, nav and
  progress transitions, card lifts, and constellation loops.
- Forced-colours rules remove paper grain and decorative nav lines while
  preserving system-colour borders, focus outlines, and active navigation.
- Print rules remove navigation chrome, paper grain, motion, and reveal
  transforms while preserving the article layout.
- Article pages already expose a contrast-normalised `--essay-ink` on the inner
  article shell and include reading progress, quick-answer content, TTS/actions,
  notebook support, table of contents, word cloud, post navigation, related
  posts, and SEO/schema.

## Baseline defect and constraints

`ScrollReveal.svelte` observes against `#main-content`, although the viewport is
the real scroller. Its 500 ms timer masks that incorrect root. Phase 1 will use
the viewport, remove the timer, retain the public component API, and keep
content visible in SSR and without JavaScript.

Special animation owners and shells:

- `/notes/studio` and descendants use the dedicated studio shell.
- `/blog/games/[slug]` uses the dedicated game shell and owns a Canvas loop.
- `/blog/games` remains in the normal shell but must opt out of the archive
  atmosphere.
- `/blog/visualizations` is a normal-shell index, but its featured
  `ArtificialLifeLab` already owns a visible Canvas loop. It may receive a
  static lab composition, not a second running ambient loop.
- `/blog/visualizations/[slug]` uses the ordinary article shell but contains a
  specialist interactive experience and must opt out.
- `/images/sketches` can load the Three.js museum and must opt out unless a
  future explicit ownership handshake is added.
- Public note canvases and the notes studio must not inherit pointer or ambient
  Canvas behaviour.

## Bundle and build observations

Baseline emitted sizes from the production build:

- Root layout chunk: 28,163 B raw / 9.18 kB gzip.
- Root layout direct JavaScript import closure: 16 files / 120,828 B raw.
- Root CSS: 151,499 B raw / 24.87 kB gzip.
- All emitted client JavaScript: 657 files / 14,570,945 B raw.
- All emitted CSS: 28 files / 392,115 B raw.
- The largest existing client chunks are 1,024.95 kB raw / 301.07 kB gzip and
  551.25 kB raw / 145.70 kB gzip.

The existing build also reports:

- 329 grandfathered SEO descriptions outside the preferred length;
- 475 grandfathered thumbnails without authored alt text;
- 20 images above the media review budget;
- a non-fatal local `GET /_vercel/image` 404;
- optional dependency/platform scan warnings from the Vercel adapter;
- 534 posts and 8 Topic Headquarters indexed into 7,684.5 KiB of Pagefind data.

No Lighthouse package is present, and the brief forbids installing one.
Therefore the Phase 0 comparison uses production chunk output, browser
geometry/console checks, and targeted Playwright runtime assertions rather than
inventing a Lighthouse score.

## Generated churn identified at baseline

The baseline `npm run build` changed three tracked generated files:

```text
scripts/post-tags-manifest.json
static/wordcloud/how-a-scanner-sees-reconstructing-a-body-from-shadows.svg
static/wordcloud/manifest.json
```

The changes refresh one CT article hash/date and regenerate its word-cloud
layout. They are unrelated to the motion system and must not remain in the
final implementation diff.

## Phase 1 plan adjusted to this repository

1. Extend the synchronous bootstrap with validated, OS-authoritative
   `site-motion` resolution.
2. Add a native compact/menu Motion control beside the existing theme control.
3. Add pure, SSR-safe preference, route-biome, animation-ownership, and seed
   modules with focused Vitest coverage.
4. Mount one static, theme-derived atmosphere at normal-shell level and
   dynamically import one Canvas 2D enhancement only for eligible routes and
   non-still motion.
5. Keep the lab index static because it already owns an active Canvas loop;
   fully opt games, interactive visualizations, note canvases/studio, and the
   Three.js museum out.
6. Use Svelte 5 attachments for reveal and Canvas element lifecycles, including
   complete observer/listener/frame teardown.
7. Add guarded root View Transitions without replacing SvelteKit focus or
   scroll handling.
8. Preserve all page markup, data loading, SEO/schema, content, routes, and
   specialist shells; the home sections are not redesigned in Phase 1.
9. Add a separate focused Playwright configuration so the current
   CT-specific `hasTouch` suite remains unchanged.
10. Re-run focused tests, the repository command matrix, production build,
    bundle comparison, browser screenshots, and generated-churn inspection.

## Phase 2 comparison checkpoint

Phase 2 replaces only the home-page composition while retaining its exact
headline, supporting copy, destinations, recent-post ordering, SEO graph, and
server-rendered meaning. The Phase 1 “after” captures are the visual baseline
for this comparison:

- `artifacts/motion/after/home-desktop-paper.png`
- `artifacts/motion/after/home-desktop-night.png`
- `artifacts/motion/after/home-mobile-paper.png`
- `artifacts/motion/after/home-mobile-night.png`

The full-page Phase 2 captures are:

- `artifacts/motion/phase2-after/home-desktop-paper.png` (1440 × 4375)
- `artifacts/motion/phase2-after/home-desktop-night.png` (1440 × 4375)
- `artifacts/motion/phase2-after/home-mobile-paper.png` (390 × 5986)
- `artifacts/motion/phase2-after/home-mobile-night.png` (390 × 5986)

These are review captures rather than pixel-diff fixtures: the Phase 2 page is
intentionally taller, and the prior captures used viewport dimensions rather
than matching document heights.

### Production bundle comparison

Sizes below come from the SvelteKit client manifest after `build:site`. Import
closures include recursively reachable static imports; gzip totals compress
each emitted file independently before summing.

| Measurement                    |   Phase 1 |   Phase 2 |    Change |
| ------------------------------ | --------: | --------: | --------: |
| Root layout node, raw          |  37,742 B |  37,768 B |     +26 B |
| Root layout node, gzip         |  12,043 B |  12,055 B |     +12 B |
| Home node, raw                 |   9,381 B |  16,266 B |  +6,885 B |
| Home node, gzip                |   2,912 B |   5,904 B |  +2,992 B |
| Root static closure, raw       | 132,431 B | 132,457 B |     +26 B |
| Root static closure, gzip      |  52,146 B |  52,158 B |     +12 B |
| Home incremental closure, raw  |  54,688 B |  62,141 B |  +7,453 B |
| Home incremental closure, gzip |  18,993 B |  22,347 B |  +3,354 B |
| Root + home union, raw         | 187,119 B | 194,598 B |  +7,479 B |
| Root + home union, gzip        |  71,139 B |  74,505 B |  +3,366 B |
| Root CSS, raw                  | 162,108 B | 183,135 B | +21,027 B |
| Root CSS, gzip                 |  26,469 B |  30,055 B |  +3,586 B |
| Prerendered home HTML          |  64,138 B |  69,658 B |  +5,520 B |

The home-specific JavaScript increase is 3.35 kB gzip, substantially below the
brief's 20–30 kB home-page allowance. The Phase 1 atmosphere remains a separate
dynamic chunk and is slightly smaller after chunk recomposition
(8,763 B raw / 3,501 B gzip). The root/home closure contains no Three.js, p5,
D3, or Observable runtime signatures.

The prerendered home contains its single visible `h1`, all four recent-signal
SVG markers, and no Canvas. Canvas enhancement remains progressive and
route-owned by the Phase 1 atmosphere. Phase 2 adds no raster image, media,
video, animation library, or network dependency to the home page.

## Phase 3 comparison checkpoint

Phase 3 starts from committed Phase 2 state `bec6ea71` and extends only the
existing route-motion owner. No dependency was installed and no second Canvas,
SVG animation engine, background image, video, WebGL layer, or root
visualization library was added.

### Route capture baseline

The following 1440 × 1000 paper-theme viewport captures record the committed
Phase 2 route state immediately before the Phase 3 edit:

| Route         | Capture                                                                                          |
| ------------- | ------------------------------------------------------------------------------------------------ |
| `/writing`    | [`writing-desktop-paper.png`](../artifacts/motion/phase3-before/writing-desktop-paper.png)       |
| Long article  | [`article-desktop-paper.png`](../artifacts/motion/phase3-before/article-desktop-paper.png)       |
| `/projects`   | [`projects-desktop-paper.png`](../artifacts/motion/phase3-before/projects-desktop-paper.png)     |
| `/consulting` | [`consulting-desktop-paper.png`](../artifacts/motion/phase3-before/consulting-desktop-paper.png) |
| `/resume`     | [`resume-desktop-paper.png`](../artifacts/motion/phase3-before/resume-desktop-paper.png)         |
| `/notes`      | [`notes-desktop-paper.png`](../artifacts/motion/phase3-before/notes-desktop-paper.png)           |
| Lab index     | [`lab-desktop-paper.png`](../artifacts/motion/phase3-before/lab-desktop-paper.png)               |
| Games index   | [`games-desktop-paper.png`](../artifacts/motion/phase3-before/games-desktop-paper.png)           |

The in-app browser accepted this first capture batch, then rejected the planned
night-theme navigation batch under its local-URL security policy. No alternate
browser surface was used to bypass that decision. The production Playwright
suite instead verifies the Phase 3 after-state across paper, night, high
contrast, forced colours, print, reduced motion, touch, and no-JavaScript
conditions using DOM, computed-style, lifecycle, and overflow assertions.

### Production bundle comparison

Sizes use the same SvelteKit client-manifest and per-file gzip method as the
Phase 2 checkpoint.

| Measurement               |   Phase 2 |   Phase 3 |   Change |
| ------------------------- | --------: | --------: | -------: |
| Root layout node, raw     |  37,768 B |  37,928 B |   +160 B |
| Root layout node, gzip    |  12,055 B |  12,116 B |    +61 B |
| Root static closure, raw  | 132,457 B | 132,639 B |   +182 B |
| Root static closure, gzip |  52,158 B |  52,223 B |    +65 B |
| Root + home union, raw    | 194,598 B | 194,951 B |   +353 B |
| Root + home union, gzip   |  74,505 B |  74,764 B |   +259 B |
| Root CSS, raw             | 183,135 B | 187,770 B | +4,635 B |
| Root CSS, gzip            |  30,055 B |  30,503 B |   +448 B |

The root JavaScript increase is 65 B gzip across its complete static closure.
Most Phase 3 visual treatment is therefore the 448 B gzip CSS increase. The
lazy ambient chunk remains unchanged at 8,763 B raw / 3,501 B gzip.

Current route-incremental static JavaScript closures, after excluding the root
closure, are:

| Route entry          |       Raw |     Gzip |
| -------------------- | --------: | -------: |
| Writing              |  52,401 B | 18,979 B |
| Blog index           |  76,647 B | 26,858 B |
| Year archive         |  64,104 B | 23,053 B |
| Article shell        | 173,654 B | 43,308 B |
| Projects             |  24,035 B |  9,014 B |
| Résumé               |  80,116 B | 28,244 B |
| Notes index          |  12,657 B |  5,161 B |
| Visualizations index |  82,160 B | 28,990 B |

These are current total route closures, not Phase 3 additions. The root,
writing, blog, projects, and notes closures contain no Three.js, p5, D3,
Observable runtime, or video signature. The article and résumé node text
contains authored references to visualization technologies, so naive string
searches there are not treated as import evidence.

Representative prerendered HTML remains substantial and meaningful before
JavaScript:

| Page                    | HTML size |
| ----------------------- | --------: |
| `/writing`              |  84,175 B |
| `/projects`             | 112,489 B |
| `/resume`               |  86,475 B |
| `/blog/visualizations`  | 117,380 B |
| Long healthcare article | 133,017 B |

The no-JavaScript browser test additionally proves that writing headings,
normal links, deterministic glyph SVG, the two static atmosphere layers,
article essay ink, long prose, and the healthcare table are present while
Canvas is absent.

## Phase 4 comparison checkpoint

Phase 4 starts from the committed Phase 3 state recorded above. It adds only a
deterministic, accessible topic-map representation to `/topics` and changes the
missing/invalid theme fallback to Night. It does not install a dependency,
redesign the homepage, replace the canonical topic cards, or add D3, Canvas,
WebGL, force simulation, pan/zoom, a frame loop, or a video background.

### Topic route capture baseline

The following pre-implementation captures record the Phase 3 `/topics` route.
Dimensions were read from the image files rather than inferred from the
requested viewport.

| View/theme    | Before capture                                                                           | Dimensions   |
| ------------- | ---------------------------------------------------------------------------------------- | ------------ |
| Desktop Night | [`topics-desktop-night.png`](../artifacts/motion/phase4-before/topics-desktop-night.png) | `1425 × 990` |
| Desktop Paper | [`topics-desktop-paper.png`](../artifacts/motion/phase4-before/topics-desktop-paper.png) | `1425 × 990` |
| Mobile Night  | [`topics-mobile-night.png`](../artifacts/motion/phase4-before/topics-mobile-night.png)   | `375 × 812`  |
| Mobile Paper  | [`topics-mobile-paper.png`](../artifacts/motion/phase4-before/topics-mobile-paper.png)   | `375 × 812`  |

The Playwright capture test records stable, map-centred after states with
resolved motion set to Still. All six were visually reviewed after capture:

| View/theme            | After capture                                                                                                                           | Dimensions    | Review                                                    |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------- | --------------------------------------------------------- |
| Desktop Night         | [`topics-desktop-night.png`](../artifacts/motion/phase4-after/topics-desktop-night.png)                                                 | `1440 × 1000` | Six territories, eight labels, and quiet routes legible   |
| Desktop Paper         | [`topics-desktop-paper.png`](../artifacts/motion/phase4-after/topics-desktop-paper.png)                                                 | `1440 × 1000` | Territory washes and sparse routes remain distinguishable |
| Desktop High Contrast | [`topics-desktop-high-contrast.png`](../artifacts/motion/phase4-after/topics-desktop-high-contrast.png)                                 | `1440 × 1000` | Two-pixel structure, labels, and links remain clear       |
| Desktop focused topic | [`topics-desktop-focus-interactive-mathematics.png`](../artifacts/motion/phase4-after/topics-desktop-focus-interactive-mathematics.png) | `1440 × 1000` | Focus plus all five direct relationships is unmistakable  |
| Mobile Night          | [`topics-mobile-night.png`](../artifacts/motion/phase4-after/topics-mobile-night.png)                                                   | `390 × 844`   | Metro stops and group labels fit without overflow         |
| Mobile Paper          | [`topics-mobile-paper.png`](../artifacts/motion/phase4-after/topics-mobile-paper.png)                                                   | `390 × 844`   | Paper tokens resolve correctly and every stop stays clear |

### Architecture and fallback checkpoint

`src/lib/topics/topic-map.ts` is the pure deterministic geometry policy.
`LivingTopicMap.svelte` consumes that model as a desktop semantic SVG and a
mobile vertical metro list. The summary-level `relatedTopicSlugs` contract
supplies curated canonical relationships without copying full post collections
or complete topic-headquarters payloads into the route.

The map is additive: its normal links are followed by the existing grouped
canonical cards. Fixed coordinates make the server-rendered result stable.
Entry motion is finite CSS; still, reduced-motion, forced-colour, authored High
Contrast, print, and no-JavaScript paths preserve usable names and
destinations. No D3, Canvas, force solver, runtime layout pass, timer, or
continuous animation is part of the Phase 4 design.

Night is the first-visit and failure fallback in both static HTML and the early
bootstrap. A valid saved theme remains authoritative, including System; System
continues to resolve against the OS colour-scheme preference. The default
fallback is not persisted, so it does not silently replace a later explicit
choice.

### Focused and release validation

| Command or evidence                    | Phase 4 result                                                                                                                                     |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Focused topic-map unit tests           | Passed: 2 files, 20 tests                                                                                                                          |
| Focused topic-map Playwright tests     | Passed: 8 tests, including the deterministic screenshot capture                                                                                    |
| Existing motion-focused browser suite  | Passed: 35 tests total (27 existing plus 8 Phase 4)                                                                                                |
| `npm run check`                        | Passed: 0 errors and 0 warnings                                                                                                                    |
| `npm run lint`                         | Expected baseline failure: 24 untouched Prettier files; direct full ESLint reaches the existing `YtCredit.svelte:37` error; all touched files pass |
| `npm test`                             | Passed, including 33 Vitest files / 301 tests and every chained Node/SQL suite                                                                     |
| `npm run build`                        | Passed: content generation, validators, production build, adapter output, and discoverability validation                                           |
| Console and horizontal-overflow review | Passed: no unexpected page/console error and no desktop/mobile overflow; local Vercel analytics/image 404s remain expected                         |
| Generated-churn inspection             | Clean: no generated tracked file changed; package manifests and lockfile are unchanged                                                             |

The focused assertions cover deterministic finite coordinates, future
territories containing up to ten non-overlapping landmarks, relationship
validation and de-duplication, canonical order, named SVG links, keyboard and
hover parity including mixed input, mobile metro equivalence and tap
navigation, 44 px touch targets, canonical cards, SSR/no-JavaScript meaning,
Night-first fallback, saved-preference authority,
still/reduced/high-contrast/forced-colour/print behaviour, and no continuous
map animation.

### Production bundle and HTML comparison

Final byte counts were read from the production manifest and prerendered output
with the same per-file gzip method as the earlier checkpoints:

The fresh pre-Phase-4 rebuild recomposed the unchanged Phase 3 gzip output by
2 B for the root node and 3 B for its closure relative to the recorded Phase 3
checkpoint above. The comparison therefore uses that immediately preceding
rebuild rather than treating the tiny compression variance as Phase 4 work.

| Measurement                          | Fresh pre-Phase-4    | Phase 4              | Change               |
| ------------------------------------ | -------------------- | -------------------- | -------------------- |
| Root layout node, raw/gzip           | 37,928 B / 12,118 B  | 37,928 B / 12,116 B  | 0 B / −2 B           |
| Root static closure, raw/gzip        | 132,639 B / 52,226 B | 132,639 B / 52,227 B | 0 B / +1 B           |
| Root CSS, raw/gzip                   | 187,770 B / 30,503 B | 187,770 B / 30,503 B | 0 B / 0 B            |
| Topics route node, raw/gzip          | 5,487 B / 2,291 B    | 17,734 B / 6,626 B   | +12,247 B / +4,335 B |
| Topics incremental closure, raw/gzip | 13,934 B / 5,709 B   | 26,749 B / 10,406 B  | +12,815 B / +4,697 B |
| Topics route CSS, raw/gzip           | none                 | 8,964 B / 1,955 B    | +8,964 B / +1,955 B  |
| Root + topics union, raw/gzip        | 146,573 B / 57,935 B | 159,388 B / 62,633 B | +12,815 B / +4,698 B |
| Prerendered `/topics` HTML           | 70,914 B             | 88,730 B             | +17,816 B            |

The final SSR contains eight desktop map nodes, eight mobile metro stops,
thirteen relationship paths, six territories represented in each responsive
mode, one canonical directory, and zero Canvas or video elements. Source and
closure inspection found no Phase 4 D3, Three.js, p5, Observable runtime,
video, or Canvas import. The increase is route-scoped model/component code,
static SVG/HTML, and scoped finite CSS; the root static boundary and root CSS
are effectively unchanged.

Only Phase 5 remains deliberately deferred: profiling-led subtraction, then
possible consideration of one named title transition, one progressive
scroll-linked line, adaptive quality, or a footer constellation.
