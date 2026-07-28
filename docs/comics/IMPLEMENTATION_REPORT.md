# The Last Analog Town — Album 001 final implementation report

Date: 2026-07-28  
Album: _The Efficiency Inspector_  
Series: _The Last Analog Town_  
Canonical category: `Comic`  
Canonical route: `/blog/comic/the-last-analog-town/the-efficiency-inspector`

## Outcome

Album 001 is complete as a full illustrated production edition:

- 62 finished story pages;
- 338 final illustrated panels;
- 511 dialogue, caption and sound records;
- a final illustrated and deterministically lettered cover;
- title/credits and production end matter outside the 62-page story count;
- a complete accessible transcript;
- approved collision-aware speech-balloon geometry for all 303 dialogue-bearing panels;
- responsive web art for every panel;
- a 65-page lettered PDF;
- a fixed-layout/reflowable EPUB 3 edition;
- reproducible source, validation, prompt, provenance, assembly and export tooling.

This is not a teaser, sample or placeholder edition. Every story panel uses final art, and the
speech balloons remain a separate deterministic lettering layer so dialogue can be edited without
regenerating the illustrations.

The edition remains deliberately unpublished:

```yaml
published: false
productionPreview: true
```

The route is labelled as an unpublished illustrated production edition and uses
`noindex, follow, noarchive`. No deployment was performed. Formal panel-rights records,
Bengali-language review, cultural approval, accessibility approval, named print/EPUB approval
and named final-editor approval remain open.

## Canonical evidence

| Measure                               | Verified result                                                    |
| ------------------------------------- | ------------------------------------------------------------------ |
| Source digest                         | `273c2dd3a25231e9ae185fdcfc98169902810b001a61e6f73dd1f02df712a9be` |
| Lettering-geometry digest             | `922daabca060bce7d5eced3c3c979389e0b97beae1b25131a23fefb95143bc57` |
| Story pages                           | 62                                                                 |
| Panels                                | 338                                                                |
| Final panel art                       | 338 of 338                                                         |
| Dialogue/caption/sound records        | 511                                                                |
| Dialogue-bearing panels               | 303                                                                |
| Missing lettering geometry            | 0                                                                  |
| Awaiting lettering approval           | 0                                                                  |
| Lettering structure faults            | 0                                                                  |
| Balloon collision/tail-routing faults | 0                                                                  |
| Stable panel prompts                  | 338                                                                |
| Provenance panel records              | 338                                                                |
| Responsive web raster derivatives     | 1,234                                                              |
| Promoted runtime panel assets         | 338                                                                |
| Working page assemblies               | 62                                                                 |
| Lettered page previews                | 62                                                                 |
| Validator                             | PASS — 0 errors, 0 warnings                                        |
| Formal publication gates              | 4 of 12 complete                                                   |

The four recorded complete gates are cover approval, final panel inventory, dialogue approval and
lettering approval. The eight still open are `allRightsRecorded`, `bengaliReviewed`,
`culturalReviewApproved`, `accessibilityApproved`, `responsiveReaderApproved`, `printApproved`,
`epubApproved` and `finalEditorApproved`.

The provenance ledger currently records a rights-ready cover and 338 final panel hashes, but zero
panels have the complete formal creator/provider/ownership/approval field set required for public
release. This does not make the illustrated production edition incomplete; it correctly prevents
an unreviewed metadata flip from publishing it.

## Final editions

### PDF

Path:

`output/pdf/001-the-efficiency-inspector-production-edition.pdf`

- 65 A4 pages: cover, title/credits, 62 story pages and production end matter;
- 84,351,240 bytes;
- SHA-256:
  `E27BA84B81D21FECC73814FE4300FE360887EADB07A80A3E9DDDDDA778BDB1DA`.

The downloadable copy at
`static/downloads/comics/the-last-analog-town/001-the-efficiency-inspector-production-edition.pdf`
is byte-identical.

The PDF embeds deterministic high-quality compressed page copies while leaving the canonical PNG
masters unchanged. Cover, title, story pages 1, 34 and 62, a dense climax page, and end matter were
rendered through Poppler and visually checked. Credits, page order, lettering, margins and dynamic
publication-gate markers are correct.

### EPUB

Path:

`output/epub/001-the-efficiency-inspector-production-edition.epub`

- 67,533,795 bytes;
- SHA-256:
  `779CF34436CD7EC9E92F62F34C9C64B784F993AC45AFA184FB4A4159C6600CCC`;
- 134 archive entries;
- 63 JPEG images: cover plus 62 story pages;
- 67 XHTML documents;
- 66 spine items;
- all 69 XML-family documents parse successfully;
- the first archive entry is the required uncompressed `mimetype`;
- `mimetype` is exactly `application/epub+zip`.

The EPUB contains the complete fixed-layout illustrated sequence plus navigation and reflowable
text material. Named human approval in real EPUB readers remains a formal publication gate.

### Web reader

The final staging manifest contains 338 panels and 1,234 responsive WebP/AVIF derivatives. The
verified runtime map points every panel to an existing content-addressed 1280-pixel WebP. The
default episode staging directory and the explicit
`output/comics/001-web-production` directory now share the current source digest and pass a
promotion dry run.

The unpublished route also uses an optimized 1024 × 1448 final cover derivative:

`static/images/comics/the-last-analog-town/the-efficiency-inspector/cover__lettered__r1.webp`

It is 325,832 bytes with SHA-256
`74C467022C7EFE3D3B1BD17AB24F846A5F16B875E2848486F44D1C2DF670F011`.
Canonical `metadata.cover` remains null until the formal public-cover/provenance contract is
completed; the Album 001 production route explicitly uses this reviewed derivative.

Live local browser verification passed at the normal 1280 × 720 viewport and a 390 × 844
responsive viewport:

- the final cover and all current-page panel images decoded successfully;
- Page, Panel and Transcript modes worked;
- forward and reverse controls worked;
- direct navigation to page 62 showed all four final-page images;
- the mobile reader had no horizontal document overflow;
- the browser console contained no warnings or errors.

## Dialogue and comic lettering

The final dialogue pass revised human speakers for contractions, turn-taking, implied context,
subtext and character voice. Direct address is used when someone first gets another person's
attention or applies public pressure; names are not repeated through an already-running
conversation. Cecil retains a deliberately clipped institutional register.

Speech balloons are rendered after the clean artwork. The final renderer:

- transforms authored protected geometry through the actual panel crop;
- keeps balloon bodies away from faces, heads and critical evidence;
- routes each tail towards the authored speaker;
- stops tail tips in visible clear air rather than touching hair or a head;
- treats earlier balloons as obstacles when routing later tails;
- permits a deliberately tailless nearby balloon when a pointer would misidentify the speaker.

The strict lettering audit is ready with zero missing records, zero pending approvals and zero
collision/routing issues across all 303 dialogue panels. A regression test specifically verifies
that a later tail cannot cut through an earlier speech balloon.

## Editing balloon text manually

The complete guide is `docs/comics/EDITING_BALLOON_TEXT.md`.

For a single line:

1. Open the canonical file under
   `script/pages/page-001.yaml` through `script/pages/page-062.yaml`.
2. Find the stable dialogue ID and change its `text`.
3. If `balloon.manualBreaks` exists, update it so joining the lines with spaces reproduces `text`
   exactly.
4. Rebuild only the affected page and inspect it:

   ```powershell
   npm run comic:compile -- --episode 001
   npm run comic:lettering -- --episode 001 --strict
   npm run comic:assemble -- --episode 001
   npm run comic:render-pages -- --episode 001 --pages 1
   npm run comic:validate -- --episode 001
   ```

For several auditable edits, copy
`script/dialogue-revisions/manual-edits.example.yaml`, record exact `before` and `after` values,
then apply it with `npm run comic:dialogue-revise`. The command fails closed on unexpected source
drift and is safe to rerun.

A short replacement normally needs no geometry change. A much longer replacement may require a
wider/taller balloon and a renewed face/tail visual check. Never paint dialogue into
`panels/raw` or `panels/approved`.

## Tests and verification

The final verification set passed:

- `npm run comic:validate -- --episode 001`
  - 62 pages, 338 panels, 0 errors and 0 warnings.
- `npm run comic:lettering -- --episode 001 --strict`
  - 303 dialogue panels; zero missing, pending, structural or routing findings.
- `node --test scripts/comics.test.mjs`
  - 15 of 15 tests passed.
- bundled-Python `scripts/comics/lettered_export_test.py`
  - 8 of 8 tests passed, including real PDF coverage.
- `npm run comic:promote:web:test`
  - 2 promotion security/idempotency tests and 1 runtime-asset test passed.
- `npm run check`
  - 0 Svelte errors and 0 warnings.
- `npm run build`
  - full prebuild, comic validation, media/content/link/SEO checks, SvelteKit build, Vercel adapter
    output and discoverability validation passed.
- a second `build:site` plus discoverability pass after final cover/status corrections
  - passed.
- PDF Poppler rendering and EPUB ZIP/XML checks
  - passed.
- desktop and responsive live-reader interaction checks
  - passed with a clean console.

The production build still prints the project's known non-fatal optional-dependency discovery
warnings for unused `resend`, `sharp` platform variants and `@opentelemetry/api`; these do not
affect the comic build or reader.

## Advisory reports and formal release work

The deterministic director report has no errors and four editorial advisories:

- dialogue density on pages 39, 50 and 56;
- no explicitly tagged visual joke on page 47.

Those pages passed lettering and rendered-page review; the findings remain useful human editorial
prompts rather than production defects.

The cultural report correctly blocks public publication because 34 Bengali signage/interface
records do not have a named reviewer, review date or `publicationAllowed` approval. It also
requires a named cultural review. Reference-sheet registries and panel-level formal rights fields
must likewise be reconciled before publication.

Do not set `published: true` merely because the production edition is complete. Public release
requires the eight open gates to be recorded honestly, a final-release cover/end-matter mode, and
the series/category metadata to be synchronized in the same release change.

## Reproducible final sequence

```bash
npm run comic:compile -- --episode 001
npm run comic:lettering -- --episode 001 --strict
npm run comic:prompts -- --episode 001
npm run comic:assemble -- --episode 001
npm run comic:render-pages -- --episode 001
npm run comic:render-cover -- --episode 001
npm run comic:provenance -- --episode 001
npm run comic:direct -- --episode 001
npm run comic:cultural-review -- --episode 001
npm run comic:contact-sheet -- --episode 001
npm run comic:validate -- --episode 001
npm run comic:export:web -- --episode 001 --output output/comics/001-web-production
npm run comic:promote:web -- --episode 001 --input output/comics/001-web-production
npm run comic:promote:web -- --episode 001 --input output/comics/001-web-production --confirm
npm run comic:export:pdf -- --episode 001 --lettered-pages
npm run comic:export:epub -- --episode 001 --lettered-pages
```

The dry-run promotion command must be reviewed before `--confirm`. PDF and EPUB publication
approval still requires named human review even when deterministic export and visual QA pass.

## Principal evidence files

- `reports/validation.md`
- `reports/lettering.md`
- `reports/director.md`
- `reports/cultural-review.md`
- `provenance.json`
- `generated/episode.json`
- `generated/lettering-manifest.json`
- `generated/web-runtime-map.json`
- `pages/previews/manifest.json`
- `exports/contact-sheet.html`
- `docs/comics/EDITING_BALLOON_TEXT.md`
- `docs/comics/token-use-log.md`
