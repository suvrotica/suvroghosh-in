# Publishing, export, and release

## Before a build

```bash
npm run comic:compile -- --episode 001
npm run comic:prompts -- --episode 001
npm run comic:provenance -- --episode 001
npm run comic:direct -- --episode 001
npm run comic:cultural-review -- --episode 001
npm run comic:validate -- --episode 001
```

The compiled episode, deterministic lettering manifest, transcript, prompt manifest, director
report, and cultural report must match canonical source hashes. A build should fail rather than
serve stale story data.

## Web

The canonical routes are:

```text
/blog/comic
/blog/comic/the-last-analog-town
/blog/comic/the-last-analog-town/the-efficiency-inspector
```

`/blog/comics` and nested plural paths redirect permanently to the singular route.

The reader provides guided panel, page, spread, zoom, keyboard, swipe, fullscreen, print, saved
progress, contextual missing-art states, and one indexable transcript. Search adds one record for
the series and one for the episode—not one result per panel. Comic discovery is present in
navigation, the home page, writing shelf, archive landing, related reading, sitemap, and RSS
when an episode is published.

`published: false` makes the production episode `noindex` and excludes it from RSS and the
episode sitemap entry. The category and series remain discoverable.

## Print PDF

Install the small Python export dependencies when the bundled workspace runtime is unavailable:

```bash
npm run comic:install
```

Then:

```bash
npm run comic:render-pages -- --episode 001
npm run comic:export:pdf -- --episode 001 --lettered-pages
```

The default file is under `output/pdf/`. It contains a cover, title/credits material, all 62 story
pages in order, and production end matter. In `--lettered-pages` mode the export fails closed unless
the preview manifest contains exactly the current 62-page set, its source and lettering digests
match the compiled album, every preview/source hash and byte size verifies, and the final lettered
cover exists. Use `--include-transcript` to append the complete text edition. Omitting
`--lettered-pages` preserves the legacy production-card export for unfinished artwork.

Never approve a PDF from its source or file size. Render every page with Poppler, inspect cover,
title, dense, quiet, climax, final, and end-matter pages, and verify:

- no clipping or blank pages;
- safe margins and correct order;
- readable lettering at print size;
- honest missing-art labels;
- correct final report and crooked-frame exchange;
- embedded/licensed fonts and expected metadata.

## EPUB

```bash
npm run comic:export:epub -- --episode 001 --lettered-pages
```

The deterministic EPUB 3 output lives under `output/epub/`. It includes fixed-layout story pages,
the real lettered cover, navigation, all verified full-page lettered renders, and a complete
reflowable transcript. It uses the same fail-closed manifest checks as the PDF. Omitting
`--lettered-pages` preserves the legacy panel/placeholder production edition. EPUB is secondary
to the web and PDF editions.

Before release, open it in at least two EPUB readers and verify navigation, page order, images,
orientation, transcript reflow, and screen-reader reading order.

## Publication gate

All must be true:

- exactly 62 validated story pages and complete transcript;
- every panel prompt exists;
- every public panel has final art, provenance, dimensions, alt text, and approval;
- no source, rejected art, print master, secret, generated fake text, or unlicensed font is
  deployed;
- all Bengali publication text has named human review;
- director, continuity, cultural, accessibility, media, link, SEO, search, and site checks pass;
- mobile guided mode, desktop page/spread mode, keyboard navigation, and missing-art fallback have
  been manually tested;
- PDF and EPUB have been rendered/opened and inspected;
- a named human editor approves the release.

Only then change `published` and deploy versioned public derivatives.

## Create Album 002

```bash
npm run comic:new -- --title "The Perfect Candidate" --series the-last-analog-town --id 002 --slug the-perfect-candidate --date 2026-07-26 --story-pages 62
```

The scaffold deliberately contains no invented page scripts, so validation cannot pass at this
point. After writing and internally accepting the locked premise, ending, outline, world
additions, and all 62 page files:

```bash
npm run comic:compile -- --series the-last-analog-town --episode 002
npm run comic:lettering -- --series the-last-analog-town --episode 002 --strict
npm run comic:prompts -- --series the-last-analog-town --episode 002
npm run comic:assemble -- --series the-last-analog-town --episode 002
npm run comic:render-pages -- --series the-last-analog-town --episode 002
npm run comic:render-cover -- --series the-last-analog-town --episode 002
npm run comic:provenance -- --series the-last-analog-town --episode 002
npm run comic:direct -- --series the-last-analog-town --episode 002
npm run comic:cultural-review -- --series the-last-analog-town --episode 002
npm run comic:validate -- --series the-last-analog-town --episode 002
npm run comic:contact-sheet -- --series the-last-analog-town --episode 002
npm run comic:export:web -- --series the-last-analog-town --episode 002
npm run comic:export:pdf -- --series the-last-analog-town --episode 002 --lettered-pages
npm run comic:export:epub -- --series the-last-analog-town --episode 002 --lettered-pages
npm run comic:validate -- --series the-last-analog-town --episode 002
```

The scaffolder refuses to overwrite an existing episode and defaults to category `Comic`,
unpublished metadata, non-static production directories, and the same publication gates.
