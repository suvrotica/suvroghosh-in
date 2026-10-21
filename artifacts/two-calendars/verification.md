# Two Calendars verification — 21 October 2026

The complete story is the ordinary visualization article → sourced SSR records
→ component-owned year/event/thread selection → the shared postcard SVG → local
SVG/PNG and caption export → a validated link that restores the selection.

## Passed checks

- `npm run build`, including content, resource, contrast, SEO, media, internal-link,
  search and rendered discoverability validation. The final discoverability check
  covered 713 published posts and representative rendered routes.
- `npm run check`: zero errors and zero warnings.
- `npm run two-calendars:test`: 26 tests across chronology, publication data and
  postcard composition. Includes all 32 records, 35 source references, ten
  comparisons, five chapters, precision/duration separation, URL validation,
  selected-year isolation, partial years, complete excerpts and visible replay URLs.
- Scoped ESLint and Prettier checks for the feature, renderer, tests and configuration.
- Ten Playwright flows against the completed production preview: responsive
  composition, JavaScript-free historical reading, year/comparison replay, invalid
  URL recovery, event replay, keyboard source access, native chapter activation,
  actual SVG/PNG downloads, clipboard caption/link and motion preferences.
- Layout checks at 1440, 768, 390 and 360 pixels; dark and light captures; computed
  serif headings and normal sans summaries; paired mobile chapter records and dates.
- Downloaded PNG signature, MIME type, 1600 × 1000 dimensions and opacity, plus SVG
  source attribution, selected-year preservation and replay content.
- Visual inspection of the page captures and actual postcards, including the
  narrow mobile header, chapter pairs, date labels, text wrapping and source footer.
- `git diff --check`.

The browser command used an existing loopback production preview:

```powershell
$env:TWO_CALENDARS_BASE_URL = 'http://127.0.0.1:4283'
$env:PLAYWRIGHT_REUSE_SERVER = '1'
npm run two-calendars:browser:test
```

## Evidence

- `desktop.png` and `desktop-light.png`: opening and explorer, 1440 × 1800.
- `mobile.png`, `mobile-light.png`, `mobile-narrow.png`: responsive reading.
- `mobile-chapter.png`: both places and dated records inside a mobile chapter.
- `postcard-1943.svg` and `postcard-1943.png`: files downloaded through the actual UI.
- `postcard-1947.png`: real default publication sample; its source SVG and 1200 × 630
  social preview live in `static/images/visualizations/two-calendars/`.

## Boundaries and limits

This is a selective historical edition with civil dates, not an hourly memoir.
No private family records or invented festival dates are included. A future memoir
needs author-approved public content and separately verified time-zone handling.
Postcard deep links are selection-specific; Open Graph artwork is one static default.

References are retained as canonical institutional URLs. Research obtained the
supporting material through successful direct opens or full indexed records. Some
archives restrict automated requests: Library of Congress returned some 403s, the
Ray Society returned 406, India Code timed out and IIT had a transient reset.
No source fetch is required at application runtime. No known 404 references were
found during the research audit.

Local previews return expected 404s for Vercel-hosted analytics scripts and the new
article's not-yet-authored narration manifest; these do not block the atlas or the
existing device-voice fallback. Existing large-chunk/optional native-package build
warnings belong to other features and were not broadened into this change.

The canonical architecture and CONTRIBUTING gate were reviewed. Architecture §6
documents the feature-owned chronology, SSR reading, shallow URL state, observer
lifecycle and local postcard composition. No endpoint, provider, credential,
dependency or global store was introduced. Dedicated npm scripts integrate the
focused tests into the repository's existing aggregate test command.
