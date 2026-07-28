# Comic production handbook

This directory documents the reusable, filesystem-first production system for the site’s
first-class `Comic` content type. The canonical public category is `/blog/comic`; the plural
`/blog/comics` route exists only as a permanent redirect.

The first series is _The Last Analog Town_. Album 001, _The Efficiency Inspector_, contains
exactly 62 numbered story pages. Cover, title material, credits, transcript, and production end
matter sit outside that count.

## Source of truth

Canonical material lives under:

```text
src/lib/comics/the-last-analog-town/
├── series.md
├── data/
│   ├── series.json
│   ├── characters.json
│   ├── locations.json
│   ├── props.json
│   ├── visual-language.json
│   ├── continuity.json
│   └── signage.yaml
└── episodes/001-the-efficiency-inspector/
    ├── episode.yaml
    ├── premise.md
    ├── outline.md
    └── script/pages/page-001.yaml … page-062.yaml
```

YAML, JSON, and Markdown are human-owned source. Compiled JSON, deterministic lettering
manifests, transcripts, prompts, reports, contact sheets, assembled SVGs, web derivatives, PDFs,
and EPUBs are reproducible outputs.
Nothing on the deployed site calls an image model or language model.

## Everyday command sequence

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

`comic:validate` writes an evidence report and fails on invalid IDs, sequencing, geometry,
dialogue order, missing accessibility text, stale derivatives, and the locked Album 001
invariants. When `published: true`, it additionally enforces public paths and every formal
publication gate; an unpublished production edition may validate while honestly retaining
pending human approvals.

## Publication truth

Album 001 has final artwork for all 338 story panels and its cover. It remains `published: false`
until panel-level formal rights records are complete, Bengali text has a named human reviewer,
cultural and accessibility checks pass, the responsive reader and print/EPUB editions receive
named human approval, and a named human editor approves publication. The current route is an
explicitly labelled illustrated production edition and is `noindex`.

Never change the publication flag merely to make a validator green.

## Guides

- [Authoring](./AUTHORING.md) — premise, outline, page YAML, dialogue, continuity, and revision.
- [Editing balloon text](./EDITING_BALLOON_TEXT.md) — change selected lines and rebuild only the
  page previews that need checking.
- [Art and prompts](./ART_AND_PROMPTS.md) — references, safe generation, import, provenance,
  lettering, and rejection handling.
- [Publishing](./PUBLISHING.md) — web, search, feeds, PDF, EPUB, QA, and release gates.
- [Cultural review](./CULTURAL_REVIEW.md) — local accuracy, satire target, and Bengali text.
- [Production invariants](./PRODUCTION_INVARIANTS.md) — compact long-horizon editorial contract.
- [Model-use log](./token-use-log.md) — why model judgment was used and whether it was accepted.
- [Album 001 implementation report](./IMPLEMENTATION_REPORT.md) — delivered files, evidence,
  deferred human/art gates, amendment compliance, and the exact Album 002 sequence.
