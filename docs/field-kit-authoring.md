# The Field Kit: authoring guide

The Field Kit is the file-backed resource library at `/resources`. Its catalogue is discovered from
Markdown at build time; routes and components do not maintain a second list of resources.

## Choose the directory

- Put reusable prompts in `src/lib/prompts/` and set `kind: "prompt"`.
- Put word lists in `src/lib/lists/` and set `kind: "list"`.
- Do not add a `README.md` to either directory. Every `.md` file is treated as a resource source.

The directory and `kind` must agree. A mismatch fails validation.

## Name the file

Use a lowercase kebab-case filename such as:

```text
research-and-verification-prompts.md
medical-verbs.md
```

The filename supplies the slug. Do not add `slug` to frontmatter.

The derived paths are:

```text
prompt → /resources/prompts/[slug]
list   → /resources/lists/[slug]
```

## Frontmatter contract

Published resources accept only these fields:

| Field             | Required | Contract                                            |
| ----------------- | -------- | --------------------------------------------------- |
| `title`           | yes      | Trimmed, 3–120 characters, unique in the collection |
| `description`     | yes      | Trimmed, 50–180 characters                          |
| `date`            | yes      | Real calendar date in `YYYY-MM-DD` format           |
| `dateModified`    | no       | Same format and not earlier than `date`             |
| `kind`            | yes      | Exactly `prompt` or `list`, matching the directory  |
| `tags`            | yes      | One to eight distinct, nonempty strings             |
| `published`       | yes      | Boolean `true` or `false`, without quotes           |
| `featured`        | no       | Boolean                                             |
| `order`           | no       | Finite nonnegative integer                          |
| `thumbnail`       | yes      | `/images/resources/[lowercase-kebab].webp`          |
| `thumbnailAlt`    | yes      | Meaningful visual description, 12–180 characters    |
| `estimatedLength` | yes      | Short useful measure containing a number            |
| `related`         | no       | Canonical `prompts/slug` or `lists/slug` references |
| `language`        | no       | `en`, `bn`, or `mixed`; defaults to `en`            |

Unknown keys fail validation. Use `dateModified ?? date` as the effective modification date.

Good estimated-length labels include `3 prompt templates`, `8-minute read`, and `42 terms`.

## Mark the exact copy payload

Every resource needs exactly one pair of marker lines:

```html
<!-- resource-copy:start -->
```

and:

```html
<!-- resource-copy:end -->
```

The raw Markdown between them is what card and detail-page copy buttons place on the clipboard.
The extractor removes the marker lines and surrounding blank lines only. It preserves Markdown,
indentation, punctuation, internal line breaks, Bengali text, and other Unicode exactly.

Keep the introduction and usage cautions outside the markers. Do not attempt to copy from rendered
HTML or reconstruct text from the browser DOM.

## Heading hierarchy

The route supplies the only visible H1. Begin authored resource headings at H2:

```md
## Master prompt

### Output requirements
```

An authored Markdown H1 fails resource validation.

## Thumbnails

Each published resource needs a 1200 × 675 WebP. The Field Kit collection image is a 1200 × 630
WebP. The repository's deterministic generator creates restrained field-note artwork from resource
metadata:

```sh
npm run resources:images
npm run images:optimize
npm run gallery:generate
```

The final two commands update the shared optimisation manifest and intrinsic-dimension module used
by the existing image helpers. Commit the raster assets and generated metadata together. Alternative
text belongs in frontmatter; do not place it in a filename.

## Related references

Use unambiguous canonical references:

```yaml
related:
  - 'prompts/research-and-verification-prompts'
  - 'lists/mathematics-verbs-and-metaphors'
```

Every published launch resource has at least two explicit references. Authored references appear
first and keep their order. If a detail page requests more items, the loader fills the balance
deterministically:

1. four points per shared normalized tag;
2. one additional point for the same resource kind;
3. ascending `order`;
4. title and path as stable tie-breakers.

Self-references, duplicates, malformed references, missing targets, and published-to-unpublished
references fail validation. Cycles are allowed.

## Sorting

Each catalogue tab sorts resources by:

1. `featured: true`;
2. ascending `order`;
3. newest effective date (`dateModified ?? date`);
4. title, then canonical path, for deterministic ties.

Filesystem order is never a publication rule.

## Complete prompt example

```md
---
title: 'Evidence Review Prompt'
description: 'A reusable prompt for comparing claims against primary sources while preserving uncertainty and conflicting evidence.'
date: '2026-07-30'
kind: 'prompt'
tags:
  - 'Research'
  - 'Verification'
published: true
featured: false
order: 120
thumbnail: '/images/resources/evidence-review-prompt.webp'
thumbnailAlt: 'A field-note evidence map linking claims to dated source cards'
estimatedLength: '1 prompt template'
related:
  - 'prompts/research-and-verification-prompts'
  - 'prompts/editing-prompts'
language: 'en'
---

Use this prompt when a conclusion must remain traceable to the supplied evidence.

<!-- resource-copy:start -->

## Role

Act as a careful evidence reviewer.

## Inputs

- Claim: [CLAIM]
- Source material: [SOURCE MATERIAL]
- Decision date: [DATE]

## Task

Separate supported facts, reasonable inferences, disputed claims and unknowns. Prefer primary
sources, record publication and event dates separately, and do not make certainty stronger than
the evidence permits.

## Output

1. Claim-by-claim finding
2. Source trace
3. Conflicts and uncertainty
4. What evidence would change the conclusion

<!-- resource-copy:end -->

## Usage notes

Supply full sources rather than isolated search snippets.
```

## Complete word-list example

```md
---
title: 'Verbs for Evidence'
description: 'A compact list of verbs that distinguishes observation, association, inference and causation in factual prose.'
date: '2026-07-30'
kind: 'list'
tags:
  - 'Evidence'
  - 'Editing'
published: true
featured: false
order: 130
thumbnail: '/images/resources/verbs-for-evidence.webp'
thumbnailAlt: 'Labelled verb slips arranged from observation to causal claim'
estimatedLength: '8 terms'
related:
  - 'lists/medical-verbs'
  - 'prompts/research-and-verification-prompts'
language: 'en'
---

Choose the verb that matches the evidence rather than the force of the desired conclusion.

<!-- resource-copy:start -->

## Observation

- **records** — states what a source contains without endorsing it.
- **detects** — identifies a signal through a stated method.

## Relationship

- **correlates with** — reports co-variation without a causal claim.
- **is associated with** — marks a statistical or observed relationship.

## Inference

- **suggests** — supports a tentative interpretation.
- **indicates** — points more directly, but still depends on context.

## Causation

- **contributes to** — names one causal factor among several.
- **causes** — reserve for evidence that supports the causal mechanism or design.

<!-- resource-copy:end -->

## Usage notes

Do not upgrade `is associated with` to `causes` during copy editing.
```

## Publication workflow

1. Add the Markdown file with the complete contract and a substantive copy region.
2. Add at least two relationships to already planned or published resources.
3. Generate and inspect the thumbnail.
4. Run the resource validator and focused tests.
5. Run Svelte checking, formatting, linting, browser tests, and the production build.
6. Set `published: true` only when content, relationships, image, and metadata are complete.

The core commands are:

```sh
npm run format
npm run lint
npm run check
npm run validate:resources
npm run resources:test
npm run resources:browser:test
npm run build
```

For a quick local review:

```sh
npm run dev
```

Open `/resources`, search the relevant tab, exercise the copy action, and inspect the detail page at
mobile and desktop widths.

## Why Field Kit is not in global Pagefind yet

The global search result model currently understands blog posts and Topic Headquarters. Adding raw
resource records to the indexer without a third typed result, labels, route parsing, rendering and
tests would produce subtly incorrect results. This release therefore keeps Pagefind unchanged,
provides a direct command-palette destination, and uses a small metadata filter on `/resources`.
Search engines can still discover every published resource through rendered links, canonical
metadata, navigation and the sitemap.

## Adding a future third kind

Do not add an empty tab or merely widen the matcher. A third kind is a small schema and interface
migration:

1. extend `ResourceKind`, `ResourceKindSegment`, labels, kind/segment maps and reference types;
2. add a source directory and literal metadata/raw discovery globs;
3. extend the parameter matcher and lazy compiled-module map;
4. add a populated accessible tab and its stable hash;
5. extend validator directory/kind/reference rules;
6. add navigation, sitemap, schema, image and browser coverage;
7. review payload size and decide whether the catalogue should still ship copy text in one page.

Only publish the new tab after it contains validated resources.
