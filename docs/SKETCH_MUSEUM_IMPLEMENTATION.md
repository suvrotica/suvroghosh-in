# Sketch Museum implementation

The Sketch Museum lives at `/images/sketches`. Its default collection is ordinary
HTML with search, orientation and ordering controls and pages of 48 drawings. A
reader can follow artwork links and navigate the collection without JavaScript.
Artwork links retain the stable `?art=<slug>` identity. The larger detail dialog
and optional Three.js gallery enhance the HTML experience.

The 3D gallery is loaded only after the visitor enters it. A room overview shows
the works in a compact grid; visitors can select a room, a wall or an artwork,
and can choose to walk freely. A fallback points back to the collection if WebGL
is unavailable. Room ordering uses append-only `galleryOrder` values so adding
new works need not move existing works to different rooms.

## Publication boundary

The repository is the publication boundary. The deployment and routine build do
not scan the owner's external Pictures folder. `static/sketch` contains sanitized
publication masters and editorial JSON sidecars; `_generated` contains the four
display variants. The untouched local files remain outside the repository.

The explicit reconciliation tool compares file hashes, orientation-corrected
decoded pixels and perceptual candidates. `scripts/sketch-import-report.json`
accounts for the input, and `scripts/sketch-duplicate-review.json` records reviewed
similar pairs. Perceptual matching does not prove that two drawings are the same:
review candidates visually and retain genuinely distinct versions. Crop and other
alterations can escape the candidate detector; do not claim a perfect visual
duplicate detector.

The tool makes a fresh, lossless PNG or WebP master with the intended orientation
and colour baked into pixels. It verifies decoded pixels before publishing. This
removes embedded metadata and trailing payloads without modifying the external
original. Existing public masters are sanitized too, including files reached from
the detail view's download link. Titles, descriptions and alt text are editorial
sidecar data, not image-file metadata. New untitled imports use neutral numbered
labels and are flagged as needing editorial metadata; they do not receive invented
descriptions.

The sketch generator validates the public masters, rejects duplicate decoded
pixels and emits content-revision query parameters for masters and variants.
This matters because `/sketch` uses a one-year immutable cache. Historic copies
already stored in a visitor's cache cannot be recalled by a local build; new
catalogue URLs use the revised content hash.

## Adding drawings

Use a local directory of originals, never a directory inside `static/sketch`.
Run the audit before importing. A dry run changes no source or publication images
and writes full input accounting and perceptual candidate details to
`.tmp/sketch-import-audit.json`:

```powershell
npm run sketches:reconcile -- --source "C:\path\to\originals"
```

Use `--report .tmp/my-sketch-audit.json` to choose another audit output. The dry
run reads the committed `scripts/sketch-import-report.json` for cache/history but
does not overwrite it unless `--report` explicitly names that same file. Report
outputs cannot be placed inside the originals or public image directories.

Inspect the audit's `perceptualCandidates` and record reviewed equivalences and
distinct pairs in `scripts/sketch-duplicate-review.json`, using pixel hashes and
a reason. Rerun the dry run to confirm those decisions. Applying the import does
not mark unresolved candidates reviewed: they retain `needs-visual-review` and
the summary reports their count. Once the candidate review is complete, apply:

```powershell
npm run sketches:reconcile -- --source "C:\path\to\originals" --apply
npm run sketches:generate
npm run sketches:audit
npm run sketches:verify
npm run sketches:test
```

The applied accounting report is saved to `scripts/sketch-import-report.json`
(or the explicit `--report` destination). Check its coverage and review counts.
Do not remove existing artwork identities without an explicit link-preserving
migration. Add factual titles, descriptions and alt text to sidecars when
known, without guessing content or dates. Keep `galleryOrder` stable. Generated
files, including `src/lib/generated/sketch-manifest.ts`, are not hand-edited.

`npm run dev` runs sketch generation before starting; the normal build runs image
optimisation and sketch generation in its content pipeline. Feature work follows
the `build:full` verification lane in `CONTRIBUTING.md`. On verification-only
builds the generated files must already be current.

## Asset sizes and runtime

The generator produces aspect-preserving WebP thumbnails, previews, museum
textures and detail images, with maximum long edges of 384, 896, 1280 and 1920
pixels respectively. It does not enlarge small sources. Public master and
variant URLs contain a hash-derived revision. The audit checks the full public
asset set, including metadata, trailing payloads and referenced hashes.

The museum retains the current room in overview and focus modes, and the current
room plus neighbours while walking. A bounded texture queue rejects stale queued
work; inactive resources are disposed. Rendering pauses while idle, offscreen or
hidden, and is cleaned up on exit. Device quality tiers and a pixel-density cap
limit rendering cost. The 2D collection uses lazy responsive images and avoids
mounting every catalogue card at once; the catalogue data itself is still supplied
to support direct museum navigation.

## Source map and verification

- Route and server data: `src/routes/images/sketches`.
- Collection, detail and museum UI: `src/lib/components/sketch-museum`.
- Types and generated catalogue: `src/lib/sketches/types.ts` and
  `src/lib/generated/sketch-manifest.ts`.
- Import and decisions: `scripts/reconcile-sketches.py`,
  `scripts/sketch-import-report.json` and `scripts/sketch-duplicate-review.json`.
- Generator and audit: `scripts/generate-sketch-manifest.mjs`,
  `scripts/lib/sketch-manifest.mjs` and `scripts/audit-sketch-assets.mjs`.
- Browser tests: `playwright.sketch-museum.config.ts` and
  `tests/browser/sketch-museum.spec.ts`.

Run browser tests against a loopback production preview with service workers
blocked. Desktop browser engines and phone-sized emulation do not establish real
iOS Safari or physical-device behaviour; record actual devices separately.
