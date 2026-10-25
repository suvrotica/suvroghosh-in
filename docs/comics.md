# Publishing comic editions

The public shelf is `/comics`; each complete edition has a catalogue-backed
`/comics/<slug>` page. The first entry in `src/lib/content/comics.ts` is featured
on the homepage. Both homepage cover links open its detail page.

To add an edition:

1. Put its complete, final PDF and front/back WebP cover derivatives in
   `static/comics/<slug>/`. Keep PDF bytes unchanged from the approved edition.
2. Add its public metadata to `comicCatalog` in `src/lib/content/comics.ts`:
   unique lowercase slug, title, description, publication date, genres, total
   pages, story pages, cover paths/dimensions/alt text, PDF filename/byte count,
   and the original story's canonical relative path and title.
3. Include only published editions. This catalogue and every asset in `static/`
   are public; it is not a place to retain private drafts or production notes.

The catalogue supplies the gallery, detail prerender entries, homepage feature,
sitemap and finite analytics paths. Standard article pages automatically show
a reciprocal comic/download notice when their canonical path matches an edition's
source. The original Markdown prose and its dates/tags are not rewritten.

The download uses the static file directly. There is no PDF proxy, automatic
download, iframe viewer, extra provider or client secret. The download's size is
displayed to readers. Covers are fitted at their complete 2:3 aspect ratio.

Verification commands:

```sh
npm run check
npx vitest run src/lib/content/comics.test.ts src/lib/server/analytics/paths.test.ts --maxWorkers=2
node --test scripts/validate-links.test.mjs
npm run build:full
npx playwright test --config=playwright.comics.config.ts
```

The browser suite uses a built loopback production preview with service workers
blocked, checks both homepage cover links and header/footer discovery, follows
the story links in both directions, and saves/compares the PDF bytes through the
download control. It also checks mobile layout and no automatic PDF fetch.

Architecture impact and data flow are documented in
[`architecture/ARCHITECTURE.md`](architecture/ARCHITECTURE.md), sections 4, 5 and 11.
