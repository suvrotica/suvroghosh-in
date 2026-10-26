# Essay anatomy verification — 26 October 2026

The feature was exercised on Windows in installed Chrome, both as a production
bundle of the source article and inside the complete SvelteKit production site.
Browser sessions blocked service workers. No live site was crawled and no pasted
text was sent to an analysis service.

## Model and generated artifacts

- Fifteen parser tests cover source positions, sentence boundaries, literal
  Markdown, explicit citations, Unicode, deterministic identity and admission
  limits. Five geometry/export tests cover source targets, deterministic shape,
  common scales, density bounds and escaped SVG labels.
- The public sample models and vector portraits are independently reconstructed
  by `essay-anatomy:assets:check`. Raster checks verify the expected SVG hash,
  dimensions and decoded pixel provenance.
- An isolated generator fixture verified LF/CRLF equivalence, cached no-op
  generation, model tampering rejection, lossless PNG container changes, changed
  pixel rejection, explicit stale-file pruning and malformed-cache recovery.
- The standard publishing-workflow fixtures passed all fifteen tests.

## Browser behaviour

All eight browser scenarios passed against the full production site:

1. Server-rendered fallback, exact sentence/rib mapping, pinned inspection and
   resumed paragraph tracking.
2. Different measured specimens, equal physical drawing scales, independent
   selection and explicitly labelled normalization.
3. Layer visibility, reversible dissection and keyboard sentence navigation.
4. Local worker analysis without private text in requests, safe SVG XML, and
   actual 1600 × 2000 PNG and 1200 × 630 social downloads.
5. Reading and comparison at 390 pixels with reduced motion and no horizontal
   overflow.
6. Failed model admission removes the previous specimen and permits retry.
7. Punctuation-trace motion during playback and a stable canvas after pause.
8. Keyboard inspection of recurring words and their actual occurrences in both
   reading and comparison views.

The browser runs reported no unexpected console or page errors. Nine screenshots
cover the opening, reading, selected coil, dissection, comparison, close specimen,
dark comparison and two mobile states. These were visually inspected. Axe found
no violations in the captured light reading and dark comparison states after
contrast and keyboard-scroll corrections. This is bounded evidence for those
states, rather than a claim of complete assistive-technology coverage.

## Review boundaries

The final source check completed with zero errors and warnings. The full feature
artifact checks and notebook preparation passed. After correcting the new
article's description length and adding its visible modification date, the
complete production build and discoverability validation passed. The remaining
Barnum route-asset verification from the full build lane also passed. Formatting
and `git diff --check` were clean. The build reported existing large-chunk and
optional-platform-dependency warnings.

The three published specimens have no recognized explicit citations, so their
citation layers are empty. Parser fixtures exercise reference-bearing inputs.
Nesting is an English heuristic; recurrence is token identity after filtering.
Dense drawings cap visible structures and expose omitted counts; the reading
index retains admitted passages. PNG appearance depends on the recorded creation
environment, while model and SVG checks use canonical LF source inputs.

The existing article prose was compared with a prebuild snapshot. Only the new
anatomy article changed. Generated tag, wordcloud and image-manifest changes were
confined to this publication and its assets. Existing work in the checkout was
preserved.

Architecture impact: yes

Architecture rationale: a dedicated deterministic source model, lazy reading and
comparison UI, disposable local analysis worker and opt-in portrait generator add
new feature data flow. The canonical architecture and visualization authoring
reference were reviewed and updated in the same change. The feature follows the
existing dedicated-domain pattern and introduces no runtime endpoint or external
integration.

## Clean release verification

Publication was assembled independently from `origin/main` at `fbe97e95`, keeping
the original checkout's unrelated work in progress out of the release. Only the
anatomy additions were applied to shared integration files, and the generated
models and publication catalogs were regenerated against the newer main helpers.
Both tag arrays contain the same ten curated values.

The release checkout passed `npm run check` with zero errors and warnings, all
twenty model/geometry tests, sixteen publishing-workflow tests, all eight browser
scenarios, and `npm run build:full`, including discoverability and the final
route-asset check. The lockfile and existing feature implementations were retained.

The first live check additionally exposed narrow-screen overflow from an
unbroken pasted identifier. Reader, title, inspector and recurrence text now
wrap within the viewport. A ninth browser scenario exercises a 110-character
title and repeated long words. Loopback tests stub Vercel-only analytics script
routes and dismiss the site's privacy notice without choosing a video preference;
production analytics and privacy behaviour are unchanged. All nine scenarios
passed against the rebuilt complete production site, as did discoverability.
