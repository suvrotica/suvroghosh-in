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
