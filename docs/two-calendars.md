# Two Calendars, One Life

The historical edition covers 1940–1959 at the ordinary Visualizations article
`/blog/visualizations/two-calendars-one-life`. It is a curated comparison centred
on Calcutta and the United States, with explicit geographic scope for Bengal,
India, American states and individual cities. The initial selection has 32
historical records, 35 references, 10 comparisons and five guided chapters.

## Boundaries and authoring

| Path                                                                  | Responsibility                                                                                                      |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `src/lib/posts/two-calendars-one-life.md`                             | Published metadata, introductory prose and short methodological reading guide.                                      |
| `src/lib/components/visualizations/two-calendars/TwoCalendars.svelte` | SSR historical reading, paired ribbons, component-owned selection, native scroll enhancement and postcard controls. |
| `src/lib/visualizations/two-calendars/data.ts`                        | Curated records, comparisons, chapters and supporting references.                                                   |
| `src/lib/visualizations/two-calendars/types.ts`                       | Browser-safe editorial and chronology contracts.                                                                    |
| `src/lib/visualizations/two-calendars/chronology.ts`                  | Pure calendar positioning, date labels and bounded public selection state.                                          |
| `src/lib/visualizations/two-calendars/postcard.ts`                    | Postcard composition from the same selection, records and sources as the interactive view.                          |
| `static/images/visualizations/two-calendars/`                         | Actual-experience social preview and publication assets.                                                            |

The article uses the generic blog route and existing publication/discovery
pipeline. The feature adds no route exception, endpoint, provider, credential,
dependency or global state manager. Selection and scroll observation belong to
one mounted component. Historical content and source links remain readable in
server-rendered HTML before hydration and with JavaScript disabled.

Keep the dataset deliberately small and reviewable. Each record needs a stable
ID, place and geographic scope, headline, concise explanation, theme, date at its
supported precision and specific supporting references. Retain qualifications
that materially change interpretation. Each comparison needs two identified
records, an explicit relationship kind and an editorial rationale.

Use source pages or documents that support the particular claim. Check dates
against the source itself, and retain page numbers for scanned works where
useful. A source list is evidence for the authored selection, not a claim that
the atlas describes every experience in either place.

## Chronology and relationship contract

The shared backbone is Gregorian civil chronology. An event's precision and
duration are separate concepts:

- Day precision supports placement on one civil day.
- Month or year precision supports a broader placement window, with an explicit
  label; it does not imply that the event lasted for that whole window.
- A documented duration has a separate start and end.
- An uncertain date has its own qualification; uncertainty must not be rendered
  as documented duration.

A record's actual scope remains visible. A Calcutta event cannot silently stand
for all of India, and an American city cannot stand for the entire United
States. Selection gaps mean “not included here”.

Thread types have independent meanings:

| Relationship            | Claim                                                           |
| ----------------------- | --------------------------------------------------------------- |
| Shared time             | Records occupy the same date or period at the stated precision. |
| Thematic comparison     | The author has paired records to illuminate a theme.            |
| Documented relationship | Sources establish an actual connection between the records.     |

Proximity and thematic similarity do not establish causation. A documented
relationship still needs prose that describes the evidence rather than asking
the line alone to explain it.

## Postcards and public state

`npm run two-calendars:poster` regenerates the real default 1947
postcard SVG, its PNG sample under `artifacts/two-calendars/`, and the 1200 × 630
social preview. It reads the same typed data and postcard module with Node's
type stripping and a feature-scoped module resolver. It does not start Vite or
replace production output. After changing publication artwork, refresh the
normal image/media manifests through their existing generators.

The postcard uses the current validated selection and the same dataset as the
ribbons. Its SVG composition supplies the downloadable SVG and browser-rendered
PNG; an opaque background, wrapped text, source credit and replayable link make
the export usable outside the page. The copyable caption retains the selected
comparison's precision and relationship meaning.

Public links carry supported selection IDs and years, validated before they
reach feature state. They do not carry arbitrary historical text or private
records. The article has one static default social preview. Selection-specific
links do not imply selection-specific server-generated Open Graph imagery.

## Lifecycle, accessibility and future editions

Scrolling remains native. Chapter observation updates emphasis without taking
over scroll position. The component owns and releases observers and listeners.
Motion preferences, including the site's Still setting, must preserve the
comparison and reading path. Essential content uses visible text and semantic
HTML; thread meaning is stated in words as well as graphical treatment. Native
controls, focus indication and touch-sized targets support direct exploration.

The authoring contract may later host a Calcutta–Texas memoir edition. Only
author-approved public memories belong in that dataset. No personal record,
medical detail, relationship or first-person recollection may be invented.
Exact-instant records would require one canonical UTC instant, explicit IANA
time zones, verified historical offsets, daylight-saving handling and civil-date
rollover. Today's offsets must not be applied indiscriminately to historical
dates. That future edition has no unfinished interface in this release.

## Verification

Focused tests cover chronology precision, duration/uncertainty separation,
relationship contracts, URL validation and replay, and postcard composition.
Run `npm run two-calendars:test` and
`npm run two-calendars:browser:test`, together with
`npm run check`, the routine production build and the repository's
feature-specific build requirements. The browser suite uses one local Chromium
session with service workers blocked; its default server is a loopback production
preview. `TWO_CALENDARS_BASE_URL` and `PLAYWRIGHT_REUSE_SERVER=1` support an
already running local server. It writes desktop/mobile captures and actual
downloaded postcards to `artifacts/two-calendars/`. Inspect desktop, tablet
and 360px layouts, keyboard selection, source access, reduced motion,
JavaScript-free reading and actual downloaded SVG/PNG postcards. Open the
exports to check wrapping, fonts, date labels and attribution; a successful
compile alone does not verify those visual properties.

Local verification on **21 October 2026** completed 26 focused unit tests and
all 10 browser tests against a fresh loopback production preview. The production
build passed, including article discoverability. Browser checks covered 1440,
768, 390 and 360px widths; Light and Night themes; computed serif headings and
sans-serif summaries; paired mobile chapter reading; JavaScript-free records
and sources; keyboard access; chapter scrolling; selection replay; reduced
motion and Still; actual clipboard contents; and downloaded SVG/PNG postcards.
The exported PNG was verified as an opaque 1600 × 1000 image and visually
inspected alongside the SVG and desktop/mobile captures.

Browser evidence is from Chromium with mobile viewport emulation. It does not
establish Safari, physical-device or complete screen-reader coverage. Captures
and sample downloads are retained under `artifacts/two-calendars/`.

Architecture impact: yes

Architecture rationale: The canonical reference was reviewed. This feature adds
a documented feature-local editorial dataset, chronology and validated
selection-to-postcard flow within the existing generic article and component
ownership pattern. The current-state description and diagram are updated in
architecture §6. No foundational decision changes, so a separate ADR is not
required.
