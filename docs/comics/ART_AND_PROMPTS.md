# Art, prompts, lettering, and provenance

## Visual contract

The series uses an original, stylised, non-photorealistic visual language: confident ink
contours, clean silhouettes, flat nuanced colour, restrained texture, readable staging,
expressive faces and hands, dense but legible eastern Indian environments, and controlled
hand-drawn irregularity.

Never request imitation of a named artist, studio, comic, film, franchise, character, costume,
panel composition, or living person.

## Reference gate

Character and location data specify proportions, silhouette, face, hair, wardrobe, palette,
fixed architecture, recurring props, never-rules, and required reference views. A reference
sheet remains `pending` until a named human approves it. Production panels must not silently
promote an unapproved reference.

Useful reference-sheet order:

1. neutral front, three-quarter, side, and back;
2. expression range;
3. hands with recurring props;
4. default wardrobe and documented weather variants;
5. location establishing, dialogue, crowd, weather, and power-cut states.

## Prompt generation

`npm run comic:prompts -- --episode 001` combines canonical panel facts with world and
visual-language records. It creates one stable prompt per panel plus a SHA-256 manifest. The
prompt must preserve:

- exact visible cast and continuity;
- location, time, weather, and established architecture;
- foreground, middle-ground, and background action;
- left-to-right reading path;
- empty, calm balloon-safe areas;
- blank sign and interface regions for later composition;
- required negative guidance.

Every generated-art prompt forbids embedded dialogue, captions, balloons, final signage,
signatures, watermarks, copyrighted logos, artist imitation, and malformed anatomy.

After prompt generation, refresh the rights ledger:

```bash
npm run comic:provenance -- --episode 001
```

This records every cover and panel even while its art state is `missing`. It preserves
human-authored creator, method, reference, rights, edit, third-party-asset, and approval fields
when refreshed, and it never treats a present image as evidence of publication rights.

## Import and art states

Canonical panel art moves through:

```text
missing → draft → needs-review → approved → final
```

`rejected` is a terminal record for an unusable revision, not a file to delete from production
history. Raw, rejected, and print-master assets stay outside `static`. Only content-hashed,
optimized public derivatives may eventually enter the deployed asset tree.

For every imported image record:

- source path and immutable source hash;
- provider or human artist;
- prompt and prompt revision;
- generation/import date;
- rights basis and restrictions;
- character/location reference revisions;
- reviewer, decision, and notes;
- final derivative hashes and dimensions.

Never infer rights from the presence of a file.

## Rejected or moderated prompts

Preserve the original prompt and returned reason. Then run the bounded revision workflow:

```bash
npm run comic:prompt-revise -- --episode 001 --panel pNN-NN --note "specific reason"
```

A revision may clarify fictional context, reduce unnecessary explicit detail, or move action to
reaction and aftermath while retaining the story purpose. It may not erase political meaning,
retry indefinitely, or overwrite the canonical prompt. Human review is required after the
bounded revision limit.

## Lettering and signs

Image models never provide final words. Dialogue, captions, sound effects, notices, interfaces,
and English/Bengali signs are composed from source text in deterministic HTML/SVG.

Publication-bound Bengali requires:

- real Unicode Bengali;
- a named human reviewer;
- review date;
- decision recorded in `data/signage.yaml`.

Until that record exists, its state remains `needs-human-review`.

### Deterministic panel overlays

Signage records may place authored text into one or more panels without asking an image model to
draw words and without duplicating the wording in page YAML:

```yaml
placements:
  - panelId: p60-01
    x: 0.08
    y: 0.12
    width: 0.36
    height: 0.08
    kind: rule-strip
    textVariant: english
```

Coordinates and dimensions are normalized from `0` to `1`. `textVariant` resolves an authored
field on the signage record: `english`, `bengali`, `bilingual`, or `variant:SOURCE` for an entry
in a structured `variants` list. Do not duplicate the actual lettering inside `placements`.
Bengali and bilingual variants remain publication-blocking until the signage record has a named,
dated approval and `publicationAllowed: true`.

Compilation resolves these keys into per-panel overlays and writes
`generated/lettering-manifest.json`. The web reader, transcript, working SVG assembly, PDF, EPUB,
contact sheet, web-export manifest, and search record consume the same resolved text. Image prompts
receive only the blank substrate and normalized reserve—not the final words.

## Assembly and web export

```bash
npm run comic:assemble -- --episode 001
npm run comic:contact-sheet -- --episode 001
npm run comic:export:web -- --episode 001
```

Assembly creates contextual SVG pages with programmatic lettering and meaningful missing-art
cards. The web exporter uses Sharp for raster inputs, produces content-hashed WebP/AVIF staging
assets, preserves sources, and refuses to write directly into `static`. Promotion into public
assets is a separate human-approved publishing act.
