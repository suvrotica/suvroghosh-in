# The Living Archive — motion system

This document is the operating contract for the Phase 0–3 Living Archive
foundation. It describes the system as implemented, the boundaries later work
must preserve, and the checks to run when extending it.

The system is progressive enhancement. Content, navigation, route structure,
SEO/schema, themes, article tools, games, note canvases, and visualization
controls do not depend on motion or Canvas. The normal site remains meaningful
in server-rendered HTML and when JavaScript, Canvas, animation, or authored
colours are unavailable.

## Scope and ownership

Phase 0 recorded the pre-implementation repository, visual, command, bundle,
scroll-root, animation-owner, and generated-churn baseline in
[`motion-baseline.md`](./motion-baseline.md).

Phase 1 adds one shared motion operating system:

- early preference resolution in `static/app-bootstrap.js`;
- the compact/menu `MotionSelect.svelte` header control;
- pure motion types, preference resolution, route mapping, and deterministic
  seeds in `src/lib/motion`;
- one normal-shell `RouteAtmosphere.svelte`, with a static SSR layer and a
  dynamically imported Canvas 2D enhancement;
- guarded native root View Transitions;
- a shared Svelte 5 reveal attachment using the viewport as its observer root;
- reduced-motion, still, forced-colours, print, no-JavaScript, and
  special-route fallbacks.

Phase 2 uses that foundation for the home page:

- `LivingHero` and the finite, accessible `KineticLine`;
- `ReadingPathRail`, sourced from the validated `/start-here` definitions;
- distinct Professional and Writing `WorldPortal` link groups;
- `RecentSignalGrid` with deterministic inline-SVG `SignalGlyph` decoration;
- the shared `livingCard` attachment for bounded decorative interaction;
- responsive full-bleed composition with static SSR, no-JavaScript,
  high-contrast, forced-colour, reduced-motion, coarse-pointer, and print
  states.

Phase 3 extends the same owner to ordinary routes without adding a renderer:

- writing/archive headers receive static edge filaments, and two selected
  `/writing` cards reuse deterministic `SignalGlyph` decoration;
- article headers inherit the validated essay-ink family while the prose,
  tables, quotations, code, footnotes, TTS, images, and TOC remain still;
- article and résumé fields use a shared header scope that pauses the mounted
  Canvas after the marked top region leaves the viewport;
- healthcare/project/consulting/Gulf/résumé headers receive static system-grid
  edge detail;
- the notes index receives static graphite/under-sheet detail while public
  note canvases and the note studio remain excluded;
- the visualizations index receives static orbital detail while its existing
  Artificial Life component remains the only running local loop;
- the desktop active-route line responds only to semantic `aria-current`
  changes, with no JavaScript state or layout measurement.

The root layout owns route-level atmosphere and route transitions. Individual
pages must not mount another ambient renderer. Specialist experiences continue
to own their existing loops and shells.

## Architecture

| Layer                  | File                                               | Responsibility                                                                 |
| ---------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------ |
| Early bootstrap        | `static/app-bootstrap.js`                          | Validate stored preference and set resolved root attributes before hydration   |
| Public types           | `src/lib/motion/types.ts`                          | Define preferences, resolved modes, biomes, intensity, ambient mode, and scope |
| Pure preference policy | `src/lib/motion/preferences.ts`                    | Validate/normalise preferences and gate the Canvas                             |
| Pure route policy      | `src/lib/motion/route-biomes.ts`                   | Resolve route atmosphere and View Transition eligibility                       |
| Stable randomness      | `src/lib/motion/seed.ts`                           | Produce deterministic per-path, per-biome graphs                               |
| Header control         | `src/lib/components/motion/MotionSelect.svelte`    | Persist and synchronise a user preference                                      |
| SSR atmosphere owner   | `src/lib/components/motion/RouteAtmosphere.svelte` | Render the static layer and gate the client enhancement                        |
| Canvas component       | `src/lib/components/motion/AmbientField.svelte`    | Attach one Canvas controller and forward reactive options                      |
| Canvas engine          | `src/lib/motion/ambient-field.ts`                  | Draw, resize, pause, resume, update, and tear down Canvas 2D                   |
| Reveal attachment      | `src/lib/attachments/reveal.ts`                    | Share one viewport observer across pending reveal elements                     |
| Compatibility wrapper  | `src/lib/components/animation/ScrollReveal.svelte` | Preserve the existing `delay`, `class`, `tag`, and `children` API              |
| Living-card attachment | `src/lib/attachments/living-card.ts`               | Bound pointer influence, share route reset, and clean up card state            |
| Signal-glyph policy    | `src/lib/motion/signal-glyph.ts`                   | Generate stable, bounded inline-SVG geometry from post identity                |
| Home composition       | `src/lib/components/home/*`                        | Render hero, reading paths, portals, recent signals, and semantic cards        |
| Integration and CSS    | `src/routes/+layout.svelte`, `src/app.css`         | Own the normal shell, public attributes, visual tokens, and media fallbacks    |

The pure modules do not access browser globals. Do not replace them with an
SSR-shared mutable store. Runtime state belongs to the current document,
component, attachment, or Canvas controller.

## Public document contract

The root element exposes:

```html
<html
	data-theme-preference="paper"
	data-theme="paper"
	data-motion-preference="system"
	data-motion="gentle"
	data-biome="home"
></html>
```

The motion attributes have distinct meanings:

- `data-motion-preference` is the validated public choice: `system`, `still`,
  `gentle`, or `alive`.
- `data-motion` is the resolved runtime mode: `still`, `gentle`, or `alive`.
- `data-biome` is the route's resolved visual dialect: `home`, `writing`,
  `healthcare`, `calcutta`, `lab`, `notes`, `quiet`, or `off`.
- `data-view-transitions` is set after hydration to `available` or
  `unavailable`; it selects the native root transition or the short CSS
  atmosphere fade fallback.

`app.html` supplies `home` as the safe root default. The normal `.site-shell`
and its atmosphere carry the server-resolved route biome in SSR; after
hydration, the root layout mirrors that value to `html[data-biome]`. Therefore
the static route composition does not depend on that client-side mirror.

`site-motion` is the local-storage key. `site-motion-change` is dispatched on
`window` after a user selection; its `CustomEvent.detail` is the public
preference. Consumers should use the resolved root `data-motion` value rather
than interpreting that detail themselves.

`MotionSelect` has two variants:

- `compact`, used in the desktop header with the accessible name “Motion
  preference”;
- `menu`, used in the mobile menu with a visible “Motion” label.

Both are native `<select>` controls with System, Still, Gentle, and Alive
options. They remain disabled until their attachment has synchronised with the
pre-hydration root state.

## Preference precedence

The operating-system `prefers-reduced-motion: reduce` result is authoritative.
It cannot be overridden by an old or explicit `alive` value.

| Stored/public choice | OS reduces motion | Resolved `data-motion`                |
| -------------------- | ----------------- | ------------------------------------- |
| Invalid or missing   | No                | `gentle` through the `system` default |
| `system`             | No                | `gentle`                              |
| `still`              | No                | `still`                               |
| `gentle`             | No                | `gentle`                              |
| `alive`              | No                | `alive`                               |
| Any value            | Yes               | `still`                               |

Resolution happens in three places for different lifecycle stages:

1. `app-bootstrap.js` validates storage and resolves the media query
   synchronously in the document head, before Svelte hydration.
2. The root layout keeps the OS media query authoritative for every route,
   including game and note-studio special shells that do not mount the header.
3. `MotionSelect` adopts those attributes, persists deliberate changes,
   synchronises the desktop and mobile controls through
   `site-motion-change`, and re-resolves when the OS media query changes.

Storage and media-query access are defensive. Denied storage retains the
system default; a missing media-query implementation resolves non-explicit
motion to gentle. Theme bootstrap behaviour remains independent and intact.

## Route biome and animation-ownership matrix

`resolveRouteMotion(pathname, metadata?)` returns a `RouteMotionConfig`:

```ts
interface RouteMotionConfig {
	readonly biome: RouteBiome;
	readonly intensity: 'off' | 'minimal' | 'quiet' | 'header-only' | 'standard';
	readonly ambient: 'off' | 'static' | 'animated';
	readonly scope?: 'viewport' | 'header';
}
```

Path matching is segment-based, normalises duplicate/trailing slashes, and
ignores queries and hashes. This avoids false positives such as
`/blog/gamesmanship`. The exported `resolveRouteBiome` compatibility alias
currently returns the same full configuration.

| Route or route family                                                       | Biome        | Intensity     | Ambient    | Scope      |
| --------------------------------------------------------------------------- | ------------ | ------------- | ---------- | ---------- |
| `/`                                                                         | `home`       | `standard`    | `animated` | `viewport` |
| `/start-here`                                                               | `home`       | `quiet`       | `animated` | `viewport` |
| `/writing`                                                                  | `writing`    | `standard`    | `animated` | `viewport` |
| `/blog`                                                                     | `writing`    | `quiet`       | `animated` | `viewport` |
| Blog archives, category indexes, topic indexes                              | `writing`    | `standard`    | `animated` | `viewport` |
| Calcutta/Kolkata category or topic indexes, including `/blog/calcutta-life` | `calcutta`   | `standard`    | `animated` | `viewport` |
| `/topics` and ordinary topic headquarters                                   | `writing`    | `standard`    | `animated` | `viewport` |
| Calcutta/Kolkata topic headquarters                                         | `calcutta`   | `standard`    | `animated` | `viewport` |
| Ordinary `/blog/[category]/[slug]` article                                  | `quiet`      | `header-only` | `animated` | `header`   |
| `/projects`                                                                 | `healthcare` | `quiet`       | `animated` | `viewport` |
| `/consulting`                                                               | `healthcare` | `standard`    | `animated` | `viewport` |
| `/healthcare-it-gulf`                                                       | `healthcare` | `quiet`       | `animated` | `viewport` |
| `/resume`                                                                   | `healthcare` | `minimal`     | `animated` | `header`   |
| `/notes` and authentication routes                                          | `notes`      | `quiet`       | `animated` | `viewport` |
| `/contact` and unmatched normal-shell routes                                | `quiet`      | `minimal`     | `animated` | `viewport` |
| `/blog/visualizations` index                                                | `lab`        | `standard`    | `static`   | `viewport` |
| Specialist routes below                                                     | `off`        | `off`         | `off`      | —          |

Calcutta/Kolkata metadata may refine an index route. Metadata never turns an
article body into an animated region. `specialShell: true` or
`ownsAnimationLoop: true` always resolves to `off`.

### Specialist exclusions

The following routes deliberately do not receive the global Canvas or a root
View Transition:

- `/notes/studio` and descendants;
- public note-canvas routes other than the notes index and the sign-in,
  forgot-password, and reset-password routes;
- `/blog/games` and game descendants;
- `/blog/visualizations/[slug]` interactive experiences;
- `/images/sketches`, which may own a Three.js museum.

`/blog/visualizations` is a special middle case: it retains a static lab-themed
composition, but its existing Artificial Life feature already owns a visible
loop, so `ambient: 'static'` prevents a second running Canvas.

## Atmosphere progressive enhancement

`RouteAtmosphere` is decorative and singular. Its outer
`[data-route-atmosphere]` node exposes `data-biome`, `data-intensity`,
`data-ambient`, `data-scope`, and the scoped-region `data-active` state. It is
`aria-hidden="true"` and cannot receive pointer input. The root layout does not
mount it at all when the resolved biome is `off`.

The server-rendered layer contains:

```html
<div class="route-atmosphere__wash"></div>
<div class="route-atmosphere__lines"></div>
```

These CSS layers are the complete fallback, not a loading placeholder. They
derive colours from theme tokens and remain deterministic and useful without
JavaScript. Canvas is imported only on the client after all eligibility gates
pass.

`shouldRunAmbientField` requires:

- a visible document;
- resolved motion other than `still`;
- a biome and intensity other than `off`;
- `ambient: 'animated'`.

`RouteAtmosphere` additionally blocks the enhancement for print,
forced-colours, and the authored high-contrast theme. It watches `data-motion`,
`data-theme`, document visibility, the relevant media queries, and—on
`scope: 'header'` routes—the element marked `[data-route-atmosphere-region]`.
When the article or résumé header region leaves the viewport, its mounted
controller pauses and the static layer fades to its quiet
`data-active="false"` opacity. The field reports the same active state through
`data-ambient-active`. The server renders the region active so its static
atmosphere is intentional with no JavaScript; a supported viewport observer
then owns the enhanced lifecycle.

The Canvas chunk is requested only when the route is eligible and the field is
active. A failed dynamic import is not retried in a loop; the static SSR layer
remains the complete fallback.

The Canvas graph is stable for a normalised pathname and biome. It uses FNV-1a
plus `mulberry32`, not `Math.random()`, so navigation and screenshots do not
produce arbitrary layouts.

### Canvas lifecycle and limits

`AmbientField.svelte` attaches one controller to one unfocusable,
`aria-hidden` Canvas. The controller:

- uses Canvas 2D only—no WebGL, Three.js, p5, D3, video, or motion dependency;
- uses `ResizeObserver` to maintain the bitmap without layout reads in the
  frame loop, with a passive window-resize fallback;
- caps device pixel ratio at `1.5` on mobile/coarse pointers and `2` on
  desktop;
- uses a viewport `IntersectionObserver` with a `64px` margin;
- pauses for hidden documents, offscreen Canvas, still/reduced motion,
  forced-colours, print, inactive header regions, or zero geometry;
- caps resumed frame delta at `0.05s`;
- targets 30 fps for gentle mobile and 45 fps for gentle desktop; alive may
  follow the display refresh rate;
- bounds node, edge, and pulse counts by biome and viewport;
- reads palette variables only on setup, option/theme changes, and resize—not
  on every frame;
- allows at most 4 px of pointer influence in gentle and 10 px in alive, then
  scales that by route intensity (`minimal` has none);
- disables pointer influence for coarse pointers and still mode;
- uses passive pointer listeners;
- cancels animation frames and disconnects every observer, media listener,
  visibility listener, and pointer listener on teardown.

The Canvas exposes `data-ambient-state="off|paused|running"` and
`data-ambient-active="true|false"` for diagnostics. Changing route, biome,
intensity, or motion rebuilds the bounded deterministic graph. Changing only
active state pauses or resumes the existing graph without destroying it.

## Reveal contract

`ScrollReveal.svelte` retains its original public API:

```svelte
<ScrollReveal delay={100} class="optional-class" tag="section">
	<!-- SSR-visible content -->
</ScrollReveal>
```

Delay is clamped to `0–320ms`. Its attachment shares one
`IntersectionObserver` across all pending elements and uses the real scrolling
viewport (`root: null`), not `#main-content`. It reveals once, unobserves that
node, and releases the shared observer and motion listeners when the registry
becomes empty. There is no timer.

SSR/no-JavaScript content has only the final `.reveal` state. After hydration,
eligible nodes receive `.reveal-enhanced`; `.is-visible` marks the final state.
CSS must never move or conceal bare `.reveal`. Still mode, a switch to still
while nodes are pending, and browsers without `IntersectionObserver` all reveal
immediately. The final CSS state is explicitly `transform: none`.

Do not wrap every article paragraph in `ScrollReveal`. It is for small coherent
groups and index/page entry regions.

## Native View Transition rules

Root transitions are an optional enhancement around SvelteKit navigation. They
must use normal links and must not replace SvelteKit focus, history, or scroll
handling.

A transition is eligible only when:

- `document.startViewTransition` exists;
- the resolved root motion is not `still`;
- the navigation remains within this document;
- source and destination normalised pathnames differ, so hash-only changes are
  excluded;
- both routes are eligible according to `isViewTransitionRoute`;
- neither route is `off` or the static, loop-owning visualizations index.

Do not wait on a long animation promise or introduce a page loader. Unsupported
and ineligible cases use normal SvelteKit navigation. Only the root owns a
transition name in Phase 1; cards and repeated headings do not.

The CSS root transition is a restrained opacity/clip or paper-field change
using `::view-transition-old(root)` at `180ms` and
`::view-transition-new(root)` at `320ms`. Still mode, reduced motion,
forced-colours, and print explicitly disable these CSS animations. When the
native API is unavailable, the persistent atmosphere alternates two
`data-route-phase` values so a `280ms` CSS fade smooths discrete biome changes
without remounting the atmosphere or delaying navigation.

## CSS token contract

Motion values are centralised in `src/app.css`; components should consume
tokens rather than invent route-local timings or distances.

| Token                      |                     Phase 1 default | Purpose                                      |
| -------------------------- | ----------------------------------: | -------------------------------------------- |
| `--motion-instant`         |                              `80ms` | Immediate UI feedback                        |
| `--motion-fast`            |                             `150ms` | Existing small control and hover transitions |
| `--motion-base`            |                             `420ms` | Reveals and normal scene changes             |
| `--motion-scene`           |                             `900ms` | Slow, one-off decorative settling            |
| `--motion-breathe`         |                               `18s` | Very slow ambient CSS cycle                  |
| `--ease-out-quart`         |    `cubic-bezier(0.22, 1, 0.36, 1)` | Decelerating entry                           |
| `--ease-soft-spring`       | `cubic-bezier(0.2, 0.8, 0.2, 1.08)` | Restrained decorative response               |
| `--motion-distance`        |                      mode-dependent | Reveal/underlay travel                       |
| `--motion-parallax`        |                      mode-dependent | Maximum future decorative parallax           |
| `--motion-tilt`            |                      mode-dependent | Maximum future card underlay tilt            |
| `--motion-ambient-opacity` |                      mode-dependent | Static/Canvas atmosphere strength            |

Resolved modes set the amplitude contract:

| Mode     | Distance | Parallax |      Tilt | Ambient opacity |
| -------- | -------: | -------: | --------: | --------------: |
| `still`  |    `0px` |    `0px` |    `0deg` |          `0.12` |
| `gentle` |   `10px` |    `8px` |    `0deg` |          `0.28` |
| `alive`  |   `16px` |   `14px` | `1.15deg` |          `0.42` |

The atmosphere consumes theme-adaptive `--ambient-line`, `--ambient-node`, and
`--ambient-pulse` values. Their fallbacks come from existing paper, ink,
accent, rule, and essay tokens; do not scatter literal palette values through
components. The Canvas validates enhanced colours with both CSS and Canvas
parsing and falls back to computed plain theme colours. Authored high contrast
and browser forced colours are separate states. Phase 1 deliberately hides
decorative atmosphere in both while preserving their content, borders,
controls, focus, and active states.

Existing `--motion-medium`, `--motion-slow`, `--ease-standard`, and
`--ease-emphatic` consumers remain supported. Do not remove compatibility
tokens as part of an atmosphere extension.

## Phase 2 home composition

The home route keeps `SEO`, `siteSEO`, and `withSiteGraph()` at route level.
All public copy, links, heading order, and the four-post server load remain
ordinary HTML. The visual components are a composition layer, not a new data
source.

### Shared reading-path data

`src/lib/content/reading-paths.ts` remains the canonical copy and order for all
five paths. `getCuratedReadingPaths()` still resolves every configured slug
against published content and throws for an unpublished reference.
`getCuratedReadingPathSummaries()` performs that validation and returns only
`id`, `eyebrow`, `label`, and `description` to the home server load. The home
route therefore does not duplicate copy or serialize the fifteen selected
posts. Each rail card is one native link to `/start-here#<id>`; the complete
“Explore the reading paths” link remains separate.

### Hero and finite kinetic line

`LivingHero` uses a controlled breakout capped at `96rem` and keeps the
existing identity, role, paragraph, and five CTAs in SSR. Resume remains the
first primary action. The right-hand specimen is CSS-only, decorative, and
static; it does not mount another Canvas or request media.

`KineticLine` contains all four decorative statements in a stable shared grid
cell and one complete screen-reader sentence outside the `aria-hidden` visual
stack. One timeout at a time advances through the four whole statements,
returns to the first, and settles. It pauses while the document is hidden and
resets to its static first statement for still, reduced motion, authored high
contrast, forced colours, and print. It has no `aria-live` region, typewriter,
scramble, interval, or animation-frame loop.

Diagnostics:

```js
document.querySelector('[data-kinetic-line]')?.dataset.kineticState;
document.querySelector('[data-kinetic-line]')?.dataset.kineticIndex;
```

### Living cards and portals

`LivingCard.svelte` renders a real anchor for reading-path and recent-post
cards. `WorldPortal.svelte` renders an `<article>` containing normal link
groups, avoiding nested anchors and synthetic link roles.

The `livingCard` attachment:

- reads resolved `html[data-motion]`;
- requires `alive`, a fine hover pointer, no reduced motion, no authored high
  contrast, no forced colours, and no print;
- reads one bounding rectangle on pointer entry;
- coalesces pointer moves into at most one scheduled animation frame;
- caps decorative underlay displacement at 5 px horizontally, 4 px
  vertically, and 1.15 degrees;
- never transforms the text layer;
- resets on leave, cancel, focus, blur, policy change, route navigation, and
  attachment teardown;
- adds `will-change` only while
  `data-living-card-active="true"`.

Gentle hover uses only a fixed 1.5 px card lift and stable underlay/border
change. Keyboard focus receives a strong outline and fixed underlay state with
no pointer tilt. Container portals have no added `tabindex`; their existing
links retain the normal focus order.

### Recent signals

`generateSignalGlyph(slug, category)` uses the existing FNV-1a hash and
`mulberry32` stream. It returns one of four bounded path families with no
clock, `Math.random()`, browser API, runtime ID, request, or Canvas. The
component binds the generated values through normal inline-SVG attributes and
marks the SVG `aria-hidden="true"` and `focusable="false"`.

Glyphs are fully drawn and static in SSR, no JavaScript, still, gentle,
high-contrast, forced-colour, and print contexts. Alive plus a fine pointer may
draw one primary path once on hover or focus. No card owns a continuous loop.

### Responsive and fallback contract

- desktop breakouts are centred grid items and must stay within the viewport;
- the mobile reading rail uses native inline overflow,
  `scroll-snap-type: inline proximity`, 82 vw bounded cards, and a visible next
  edge;
- it has no autoplay, carousel controls, roving `tabindex`, or keyboard trap;
- below the desktop portal breakpoint, hero content comes first and the
  decorative specimen recedes;
- forced colours and authored high contrast remove underlays/specimens/glyphs
  while retaining real borders and focus;
- print removes decoration and transforms the rail/portals/signals into simple
  two-column document grids;
- without JavaScript, the first kinetic statement, complete assistive
  sentence, all copy, every link, and deterministic SVG markup remain present.

## Phase 3 route dialects and quiet reading

Phase 3 uses existing content and route structures as the composition. The new
`data-route-scene` markers are diagnostics and CSS hooks around existing
headers; they do not replace headings, breadcrumbs, forms, cards, SEO, or
schema.

### Writing and archive

`/writing`, `/blog`, category indexes, topic indexes, and year/month archives
mark their existing top header as `data-route-scene="writing"`. Static
theme-token contours occupy only the header edges. The centre remains clear,
and the existing `.page-enter` is the only route-entry motion.

The first two recent cards on `/writing` reuse `SignalGlyph.svelte`. Their paths
remain derived solely from slug and category, are fully present in SSR, and do
not receive LivingCard tilt or a local loop. High contrast, forced colours, and
print omit the glyph and edge ornament. Search/filter result layout remains
static because the Pagefind enhancement changes representation and a layout
transition would not reliably preserve orientation.

### Article header and reading body

The validated `essayInk` returned by the existing article loader is propagated
to `data-essay-ink` on `.site-shell`. Both static atmosphere layers and the
progressively loaded Canvas therefore inherit the same contrast-normalised
family as the existing title line and reading-progress indicator.

Only the existing article header is marked
`data-route-atmosphere-region data-route-scene="article"`. The Markdown
container is marked `data-article-reading-region` for diagnostics, but receives
no reveal, parallax, tilt, or animation behavior. The current reading-progress
indicator, TTS, actions, quick answer, notebook, mobile/desktop TOC, prose,
tables, code, medical content, images, word cloud, navigation, related posts,
SEO, and schema are unchanged. No title-level named View Transition is used
because unique title ownership has not been proven across all Markdown.

### Healthcare, projects, Gulf, and résumé

The existing top headers on `/projects`, `/consulting`,
`/healthcare-it-gulf`, and `/resume` expose
`data-route-scene="healthcare"`. Their static edge grid uses current theme
tokens to suggest ordered paths and junctions; it is pointer-inert and removed
in high contrast, forced colours, and print.

Projects, consulting, and Gulf keep their existing low/medium viewport fields.
The résumé uses `scope: 'header'` and marks only its document header as the
atmosphere region. Its minimal Canvas therefore pauses as soon as the reader
moves into the long document; print remains an undecorated résumé.

### Notes and lab ownership

The notes index retains its native GET search, pagination, links, and card text.
Its header gains a sparse graphite edge and cards receive static under-sheet
lines only. Real text and anchors are never rotated or tilted. A public note
continues to resolve `off` because its drawing canvas owns the experience;
`/notes/studio` and descendants remain isolated by their specialist shell.

The visualizations index keeps a `static` global lab atmosphere because its
featured Artificial Life component already owns the active loop. Static orbital
rings sit inside the existing decorative hero layer, and
`data-local-animation-owner="artificial-life"` makes ownership inspectable.
Every interactive visualization descendant still resolves `off`.

### Active route line

Desktop primary links remain normal anchors whose current state comes from
`aria-current="page"`. The two-pixel pseudo-element now expands only for the
current route, rather than also expanding on hover. A client navigation changes
semantic state once, allowing the old line to retract and the new line to
settle through one transform transition. Full SSR/no-JavaScript loads render
the final state immediately.

Still and reduced-motion modes remove the transition; forced colours replace
the pseudo-element with a real text underline; mobile keeps its existing
static border/background current state; print removes the header. This
refinement adds no script, state, layout read, scroll listener, animation frame,
or `will-change`.

## Accessibility and fallback matrix

| Environment                      | Required result                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------- |
| SSR before hydration             | Content and navigation visible; static atmosphere present                       |
| JavaScript disabled              | Same meaningful content; no Canvas dependency; reveals remain final             |
| `data-motion="still"`            | No continuous decoration; no delayed reveals or route animation                 |
| `prefers-reduced-motion: reduce` | Resolved still before hydration; CSS independently disables motion              |
| Forced colours                   | Atmosphere removed/simplified; borders, links, focus, and active state retained |
| Authored high-contrast theme     | Decorative atmosphere hidden; authored high-contrast content retained           |
| Print                            | Atmosphere and View Transitions absent; article structure and links printable   |
| Coarse pointer/touch             | No ambient pointer influence or LivingCard tilt                                 |
| Canvas/observer unsupported      | Static atmosphere and immediately visible reveal content                        |
| Background tab/offscreen field   | Animation frame loop paused                                                     |
| Specialist route                 | Existing shell/controls retain ownership; global field and transition absent    |

Decoration is `aria-hidden`, unfocusable, and `pointer-events: none`. It must
stay behind content and never cover selection, links, the sticky header, focus
rings, or skip links. No sound, flashing, scroll hijacking, custom cursor, or
animation required for comprehension is permitted.

## Tests and diagnostics

Pure policy coverage lives beside the implementation:

- `preferences.test.ts`: validation, OS precedence, and Canvas eligibility;
- `route-biomes.test.ts`: route matrix, prefix safety, specialist exclusions,
  metadata refinement, and View Transition eligibility;
- `seed.test.ts`: stable hashing, pathname normalisation, repeatable PRNG, and
  per-biome streams;
- `signal-glyph.test.ts`: repeatable content-derived models, seed
  differentiation, finite SVG instructions, and bounded nodes.

Run the focused unit and browser suites:

```sh
npm run motion:unit:test
npm run motion:browser:test
```

`playwright.motion.config.ts` isolates `tests/browser/motion.spec.ts`,
`tests/browser/home-motion.spec.ts`, and
`tests/browser/phase3-motion.spec.ts` from the existing component-test
configuration. It builds the SvelteKit site, serves it on port `4211`, and uses
one headless Chromium/Chrome worker. The focused browser suite covers
pre-hydration OS precedence, control accessibility and
synchronisation, persistence across navigation/reload, reduced-motion
authority, the paper/night/high-contrast and still/gentle/alive matrix,
forced-colours and print suppression, mobile overflow and menu focus return,
normal/static/off route ownership, protected note-studio isolation, article
body quieting, fixed inert atmosphere geometry, no-JavaScript SSR/static
fallback, View Transition API fallback, the eligible/off-route transition
handshake, article-header Canvas pause/resume without remounting, the shared
viewport reveal observer, removal of the timer fallback, still-mode reveal
flushing, and the no-`IntersectionObserver` fallback.

Home coverage additionally verifies the preserved content/SEO/link contract,
canonical reading paths, valid portal structure, deterministic inline glyphs,
finite kinetic lifecycle, desktop/mobile breakout geometry, native mobile
rail, still/reduced/coarse behavior, bounded fine-pointer variables, stable
keyboard focus, no-JavaScript meaning, one atmosphere owner, no video or local
Canvas, and inactive `will-change`.

Phase 3 coverage verifies all route scene/scope contracts, essay-ink
inheritance, a long healthcare article, article and résumé Canvas pausing,
reading-body class cleanliness, reading-progress/TTS/TOC/table preservation,
the semantic active-route line and all fallbacks, notes/public-note/studio
ownership, the static lab field beside its local Artificial Life Canvas,
games/visualization exclusions, deterministic glyphs across theme/motion
changes, 44 px touch targets, mobile overflow, and meaningful no-JavaScript
writing/article output.

The release command matrix remains:

```sh
npm run check
npm run lint
npm test
npm run build
```

The baseline documents the repository-wide Prettier failure that existed
before Phase 1. Regardless of that baseline, every new/touched motion file must
pass targeted Prettier and ESLint checks.

Useful browser diagnostics:

```js
document.documentElement.dataset.motionPreference;
document.documentElement.dataset.motion;
document.documentElement.dataset.biome;
document.querySelector('[data-route-atmosphere]')?.dataset;
document.querySelector('[data-route-atmosphere]')?.dataset.scope;
document.querySelector('[data-ambient-field]')?.dataset.ambientState;
document.querySelector('[data-ambient-field]')?.dataset.ambientActive;
document.querySelector('[data-route-scene]')?.dataset.routeScene;
document.querySelector('[data-local-animation-owner]')?.dataset.localAnimationOwner;
document.querySelector('[data-kinetic-line]')?.dataset;
document.querySelector('[data-living-card]')?.dataset;
document.querySelector('[data-signal-glyph]')?.dataset.signalGlyph;
```

Expected Canvas queries:

- ordinary animated route plus gentle/alive: one `[data-ambient-field]`, with
  state `running` while visible;
- still, authored high contrast, forced-colours, print, `off`, or `static`
  route: no running ambient Canvas;
- hidden tab or an inactive article/résumé header field: mounted field state
  `paused` after it has loaded;
- no route may contain more than one global `[data-route-atmosphere]`.

For browser testing, cover desktop `1440 × 1000`, mobile `390 × 844`, paper,
night, high contrast, reduced/no-preference, explicit still/gentle/alive,
JavaScript disabled, forced colours where supported, print, and representative
normal/special routes. Check console errors, horizontal overflow, persistence,
focus order, mobile-menu behaviour, Canvas ownership, and article-body class
pollution.

## Performance contract

The atmosphere is a quality layer, never the LCP candidate. Hero/page text and
meaningful HTML arrive without waiting for Canvas.

Phase 1–3 performance boundaries:

- no new external service, background-media, image, or video request; an
  eligible route fetches the required local lazy Canvas JavaScript chunk;
- no background video;
- no root import of Three.js, p5, D3, or a motion library;
- Canvas enhancement loaded with a dynamic import only after eligibility;
- one normal-shell renderer, never one Canvas per section or card;
- approximately 20–30 kB gzip maximum new homepage JavaScript, preferably less;
- no layout shift from late Canvas sizing;
- bounded arrays and no allocation-heavy layout reads in the frame loop;
- idle means no scheduled animation frame;
- no more than a five-point Lighthouse performance decline from the recorded
  baseline without explicit review.

The Phase 3 production checkpoint remains bounded:

| Measurement               |   Phase 2 |   Phase 3 |   Change |
| ------------------------- | --------: | --------: | -------: |
| Root layout node, raw     |  37,768 B |  37,928 B |   +160 B |
| Root layout node, gzip    |  12,055 B |  12,116 B |    +61 B |
| Root static closure, raw  | 132,457 B | 132,639 B |   +182 B |
| Root static closure, gzip |  52,158 B |  52,223 B |    +65 B |
| Root CSS, raw             | 183,135 B | 187,770 B | +4,635 B |
| Root CSS, gzip            |  30,055 B |  30,503 B |   +448 B |
| Root + home union, raw    | 194,598 B | 194,951 B |   +353 B |
| Root + home union, gzip   |  74,505 B |  74,764 B |   +259 B |

The lazy ambient chunk remains exactly 8,763 B raw / 3,501 B gzip. Current
route-incremental static JavaScript closures after excluding the root closure
are: writing 52,401 B / 18,979 B gzip; blog/archive 76,647 B / 26,858 B;
article 173,654 B / 43,308 B; projects 24,035 B / 9,014 B; résumé 80,116 B /
28,244 B; notes 12,657 B / 5,161 B; and lab index 82,160 B / 28,990 B. These
are total existing route closures, not Phase 3 deltas.

The root, writing, blog, projects, and notes closures contain no Three.js, p5,
D3, Observable runtime, or video signature. Phase 3 adds no network or media
request, Canvas owner, dependency, frame loop, pointer loop, or layout-reading
header code.

Compare production build output with the chunk observations in
`motion-baseline.md`. Inspect generated churn after `npm run build`; restore
only unrelated generated output after verifying exact paths and content. Do not
discard user-authored changes.

## Extension guide

### Add or change a route mapping

1. Add the narrowest segment-based rule to `resolveRouteMotion`.
2. Decide animation ownership before choosing a colour dialect.
3. Prefer `static` when a normal-shell route already owns a visible loop and
   `off` for specialist shells or interactive canvases.
4. Add positive, exclusion, query/hash/trailing-slash, and prefix-collision
   tests.
5. Confirm View Transition eligibility in both navigation directions.

Page metadata may refine an index or explicitly declare `specialShell` /
`ownsAnimationLoop`; it must not make article prose animated.

### Add a biome

1. Extend `ROUTE_BIOMES` and the `RouteBiome` type.
2. Add a bounded dialect in `ambient-field.ts`.
3. Add theme-adaptive static CSS and Canvas palette tokens.
4. Seed it with `createRouteRandom(pathname, biome)`.
5. Add resolver, determinism, all-theme, still, forced-colours, print, mobile,
   and performance coverage.

Do not create another renderer or import a broad visualization package into the
root layout.

### Add reusable element behaviour

Prefer a Svelte 5 attachment. Start from final SSR HTML, add an enhancement
class only after mount, observe the viewport rather than an arbitrary ID, and
return complete cleanup. The behavior must respond immediately if resolved
motion becomes still. Share observers where a list can create many elements.

### Add decorative interaction

Read resolved `data-motion`; do not infer it from the stored preference.
Keyboard focus must receive an equally rich but stable state. Coarse pointer,
still, reduced motion, forced colours, and print must remove interaction.
Cache geometry outside frame/pointer loops and keep pointer displacement inside
the central token contract.

## Deliberately deferred after Phase 3

Phase 3 completes route dialects and quiet-reading ownership without expanding
scope into later experiences. The following remain later-phase work:

- Phase 4 deterministic accessible Living Topic Map and mobile metro mode;
- Phase 5 profiling-led subtraction and only then consideration of one named
  title transition, one progressive scroll-linked line, adaptive quality, or a
  footer constellation.

Phase 3 deliberately does not add a title-level named transition, archive
filter/sort FLIP, article-card tilt, paragraph reveal, header scroll-opacity
listener, `.IN` pulse, second ambient engine, new homepage copy or sections,
background media, continuous portal/card/glyph loops, custom cursor, scroll
hijacking, or dependency.
