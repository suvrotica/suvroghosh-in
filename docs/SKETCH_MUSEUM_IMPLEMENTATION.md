# Sketch Museum implementation

## Status and scope

The Sketch Museum is integrated into the existing Images section at
`/images/sketches`. It has two complementary presentations:

- **Museum View** is an explicitly entered, lazily loaded Three.js scene.
- **Accessible Collection View** is ordinary server-rendered HTML containing every
  approved sketch and its metadata.

The initial collection contains 22 conservatively curated sketches. The source
drawings live in `static/sketch`; 88 generated WebP variants live under
`static/sketch/_generated`.

The repository, rather than the external sketchbook folder, is the publishing
boundary. Nothing under `C:\Users\suvro\Pictures\Sketchbook Previews` is scanned by
the development server, build, or deployment.

## Repository audit

The implementation extends the repository's existing conventions rather than
replacing them:

- The Images interface is server-rendered from `src/routes/images`. Its shared
  `ImageCollectionNav.svelte` component exposes Images, Photos, Thumbnails, and
  Sketches while retaining the existing segmented navigation style.
- General media lives in `static/images`, `static/photos`, and `static/thumbnail`.
  Approved sketch sources now live in `static/sketch`.
- `scripts/optimize_images.py` remains the general incremental image optimiser. It
  records dimensions and hashes in
  `scripts/image-optimization-manifest.json`.
- `scripts/generate-media-gallery.mjs` still produces the general media-gallery
  manifest. Sketches use the metadata-aware
  `scripts/generate-sketch-manifest.mjs` because the general gallery asset shape
  does not contain titles, descriptions, room assignments, render modes, or
  multiple texture variants.
- The general optimiser and sketch generator accept JPEG, PNG, SVG, and WebP
  sources. There is no committed AVIF generation pipeline.
- The Vercel adapter's responsive WebP support remains available to existing site
  images. The museum does not depend on that deployment-only service; it uses
  committed WebP textures with known dimensions.
- Styling continues to use Tailwind 4, the neutral/paper CSS variables in
  `src/app.css`, Source Serif display typography, Roboto interface typography,
  global focus rules, and the existing reduced-motion rules.
- The implementation uses plain Three.js. Threlte and a game engine were not
  added. Existing helpers in `src/lib/visualizations/webgl.ts` provide WebGL
  capability detection and a capped render pixel density.
- SEO uses the existing `SEO.svelte`, `collectionPageSchema`,
  `breadcrumbSchema`, and `withSiteGraph` utilities. The route emits an
  `ImageGallery` with one `ImageObject` per sketch, visible breadcrumbs, an Open
  Graph image, and a canonical URL. `/images/sketches` is also in the sitemap.
- Browser-only work is isolated behind `onMount` and an explicit dynamic import.
  The server never constructs a Three.js renderer, reads `window`, or requests a
  WebGL context.

## File map

```text
static/
  sketch/
    descriptive-sketch-name.png
    descriptive-sketch-name.json
    _generated/
      descriptive-sketch-name/
        thumbnail.webp
        preview.webp
        museum.webp
        detail.webp

scripts/
  optimize_images.py
  generate-sketch-manifest.mjs
  sketch-generation-manifest.json
  sketch-manifest.test.mjs
  lib/
    sketch-manifest.mjs

src/lib/
  generated/
    sketch-manifest.ts
  sketches/
    types.ts
  components/
    images/
      ImageCollectionNav.svelte
    sketch-museum/
      ArtworkDetail.svelte
      MuseumControls.svelte
      MuseumFallback.svelte
      MuseumScene.svelte
      SketchCollection.svelte
      SketchMuseum.svelte
      museum-layout.ts
      museum-layout.test.ts
      museum-materials.ts
      museum-types.ts

src/routes/images/sketches/
  +page.server.ts
  +page.svelte
```

`src/lib/generated/sketch-manifest.ts`,
`scripts/sketch-generation-manifest.json`, and everything under
`static/sketch/_generated` are generated files. Do not edit them by hand.

## Conservative external-gallery curation

The build has no automatic erotic, sexual, obscene, violent, or text-content
classifier. Curation is an explicit human review step before a file enters
`static/sketch`.

Use this workflow for the external sketchbook gallery:

1. Review the candidate at a readable size, not only as a filename or tiny
   thumbnail.
2. Approve only work that is obviously non-erotic and has no sexual, obscene, or
   violent connotation.
3. Exclude ambiguous anatomy, nudity, sexualised posing, weapons, injury, blood,
   threatening action, horror imagery, or suffering/death symbolism.
4. Exclude any visible words, captions, signs, watermarks, signatures, or
   handwriting. OCR may assist, but it is not a substitute for visual review.
5. Copy only approved files into `static/sketch`. Do not bulk-sync the external
   folder and do not make the generator scan it.
6. Preserve the selected source bytes. Renaming the file is allowed; cropping,
   sharpening, recolouring, thresholding, texture baking, and destructive
   filtering are not.

When content is uncertain, leave it out of the first-pass collection. The
whitelist is represented by the deliberately curated contents of
`static/sketch`.

## Source files and filename convention

The generator discovers these static source extensions recursively under
`static/sketch`, excluding `_generated`:

- `.jpg`
- `.jpeg`
- `.png`
- `.svg`
- `.webp`

Use static, single-image sources. PNG is preferred for the current white-background
digital sketches because it preserves faint linework and near-white variation.

Use a descriptive lower-case kebab-case filename:

```text
bird-on-branch.png
bird-on-branch.json
```

The filename stem becomes the fallback slug, generated-asset directory, and deep
link. Avoid UUIDs, spaces, underscores, dates that are not part of the work's
known title, and generic names such as `image-1`. Do not rename a published slug
without accepting that existing `?art=<slug>` links will change.

Two different source files may not resolve to the same slug. The generator stops
with an error rather than silently overwriting variants.

## Sketch metadata

Metadata is an optional JSON sidecar beside the source image. The sidecar basename
must match the image basename.

```json
{
	"slug": "bird-on-branch",
	"title": "Bird on a Branch",
	"description": "A monochrome drawing of a bird perched on a short branch.",
	"alt": "Dark line drawing of a bird perched on a branch.",
	"date": null,
	"medium": "Digital sketch",
	"orientation": "landscape",
	"room": null,
	"featured": false,
	"canvasMode": "ink"
}
```

The accepted fields are:

| Field         | Type                                 | Behaviour                                                              |
| ------------- | ------------------------------------ | ---------------------------------------------------------------------- |
| `slug`        | kebab-case string                    | Optional; defaults to the filename stem.                               |
| `title`       | non-empty string                     | Optional; falls back to a readable filename title and triggers review. |
| `description` | string                               | Optional; defaults to an empty string. Do not invent interpretation.   |
| `alt`         | string                               | Optional technically, but an empty/missing value triggers review.      |
| `date`        | `YYYY-MM-DD` or `null`               | Use `null` when unknown. Filesystem timestamps are not artwork dates.  |
| `medium`      | non-empty string or `null`           | Use only a factually justified medium such as `Digital sketch`.        |
| `orientation` | `portrait`, `landscape`, or `square` | Optional. If supplied, it must match the image's derived dimensions.   |
| `room`        | non-empty string or `null`           | Optional manual grouping and room label.                               |
| `featured`    | boolean                              | Featured works sort first and may provide the page's social image.     |
| `canvasMode`  | `ink` or `original`                  | Selects the non-destructive museum surface treatment.                  |

Unknown fields, invalid types, impossible dates, non-kebab slugs, orientation
mismatches, and duplicate slugs fail generation.

When a sidecar is absent, the generator:

- derives the slug from the filename;
- derives a readable temporary title from that slug;
- leaves description and alt text empty;
- sets date, medium, and room to `null`;
- derives orientation from intrinsic dimensions;
- sets `featured` to `false`;
- sets `canvasMode` to `ink`; and
- emits `needsMetadata: true`.

A sidecar that omits a title or has empty alt text also produces
`needsMetadata: true`. The generated `needsMetadata` flag is not an authored
sidecar field.

### Choosing `canvasMode`

`canvasMode` is an explicit curatorial decision; the generator does not currently
classify colour automatically.

- Use `"ink"` for monochrome or mostly white sketches where near-white pixels can
  become canvas substrate and darker pixels remain the drawn marks.
- Use `"original"` for colour work or any image where white is part of the
  composition. This displays the original colour texture without the luminance
  replacement shader.

The initial collection explicitly assigns 14 works to `ink` and eight to
`original`.

## Optimisation and manifest generation

### Preserving sources

`npm run images:optimize` scans `static/sketch`, but sketch sources are a special
case: it records their original hashes, byte counts, format, and orientation-aware
dimensions without rewriting them. `static/sketch/_generated` is excluded from
that optimiser.

This differs deliberately from general site images, which the same Python script
may compress or downsize. A sketch source remains the archival source used to
regenerate every derived variant.

If Pillow is unavailable locally, install the existing image requirements:

```powershell
npm run images:install
```

### Generated variants

`npm run sketches:generate` uses Sharp's drawing preset, near-lossless WebP,
alpha quality 100, effort 6, Lanczos resizing, and `withoutEnlargement: true`.
The maximum dimension applies to the longer edge while preserving aspect ratio.

| Variant     | Maximum dimension | WebP quality | Current consumer                                |
| ----------- | ----------------: | -----------: | ----------------------------------------------- |
| `thumbnail` |            480 px |           88 | Accessible collection cards                     |
| `preview`   |            960 px |           91 | Collection `srcset` and low-quality Museum View |
| `museum`    |           1600 px |           93 | Medium/high-quality Museum View                 |
| `detail`    |           1920 px |           95 | Artwork detail dialog                           |

Smaller originals are not enlarged, so two larger variants may have identical
dimensions. The original file is loaded only when a visitor explicitly chooses
“Load original drawing” in the detail dialog.

Generated paths follow this stable form:

```text
static/sketch/_generated/<slug>/thumbnail.webp
static/sketch/_generated/<slug>/preview.webp
static/sketch/_generated/<slug>/museum.webp
static/sketch/_generated/<slug>/detail.webp
```

### Typed manifest and incremental cache

The generator writes:

- `src/lib/generated/sketch-manifest.ts`, typed as a readonly
  `SketchArtwork[]`; and
- `scripts/sketch-generation-manifest.json`, containing source, sidecar, and
  variant hashes used for incremental checks.

The cache signature includes the generator version, public base path, Sharp
version, and variant settings. An unchanged no-op run hashes existing files and
reuses their manifest entries instead of re-encoding every WebP.

Use:

```powershell
npm run sketches:generate
npm run sketches:verify
```

`sketches:verify` fails if committed variants, cache, or the typed manifest are
missing or stale.

### Development and build hooks

- `npm run dev` runs `predev`, which calls `sketches:generate`, before Vite starts.
- `npm run build` runs the existing `prebuild` chain. Its `content:generate` step
  runs `images:optimize`, `sketches:generate`, and the existing media generator.
- On Vercel, or when the repository's verification-only environment variables
  are set, sketch generation verifies committed output instead of rewriting it.

Consequently, the generated WebPs, cache, typed manifest, source records in
`image-optimization-manifest.json`, sources, and sidecars must all be committed
after review before deployment.

## Route, navigation, deep links, and SEO

`/images/sketches` is a direct server route. Its server load imports the typed
manifest, validates the optional `art` query parameter against known slugs, and
provides the shared Images navigation counts.

Artwork links use:

```text
/images/sketches?art=<slug>#sketch-collection
```

With JavaScript, selection is reflected through `history.replaceState`, back/forward
navigation is observed through `popstate`, and the detail dialog opens for a
valid deep link. Without JavaScript, the route still returns the complete
catalogue and linkable metadata.

The page emits:

- a unique title, description, canonical URL, and Open Graph image;
- visible and structured breadcrumbs;
- `CollectionPage`, `ImageGallery`, and per-artwork `ImageObject` JSON-LD;
- detail and thumbnail URLs with intrinsic dimensions; and
- conventional HTML containing every title, description, image, date, medium,
  dimensions, and detail link.

## Automatic museum layout

`museum-layout.ts` is a pure deterministic layout module. It does not read the DOM
or create Three.js objects.

Current constants are:

- room width: 15 world units;
- room depth: 10.5;
- room height: 6.4;
- eye height: 1.68;
- artwork eye line: 2.55;
- doorway width: 2.6;
- doorway height: 3.35;
- doorway wayfinding sign: 2.35 × 0.72, centred above the opening; and
- works per room: 10.

The layout process is:

1. Sort featured work first, then by stable slug.
2. Group artworks with a non-empty `room` value by room label.
3. Sort manual room labels alphabetically.
4. Split every manual group into batches of ten.
5. Split remaining automatic work into batches of ten.
6. Place room centres along a deterministic turning path.
7. Connect each room to the previous one through paired door openings.
8. Generate wall slots that keep frames away from connected doorways.
9. Size each frame from its source aspect ratio and place it at a clamped,
   believable height.
10. Generate deterministic previous-then-next wayfinding placements above each
    connected doorway.

Portrait, landscape, and square work use the same frame algorithm without
stretching. Wall offsets are fixed and tested for non-overlap.

### Room wayfinding

Every real inter-room doorway has a high-contrast sign centred immediately above
its opening. The sign identifies the destination and whether it is the previous
or next room in the generated tour. Selecting or tapping it moves to an artwork
in that room. First and final rooms show only their real connection rather than
inventing a doorway.

`roomWayfindingFor` derives these placements entirely from the room graph. It
returns previous before next, uses the same inward-facing wall rotations as
artworks, and supplies local coordinates so streamed room geometry can create
and dispose signs with the rest of that room.

### Manual room assignment

Set a shared, non-empty room label in sidecars:

```json
{
	"room": "Bird Studies"
}
```

Works with that value are grouped together and the generated room is named
“Bird Studies”. More than ten works with the same label are split across
multiple rooms that retain that label. Manual metadata currently controls
grouping and naming, not an exact physical coordinate or wall.

Do not edit `museum-layout.ts` when adding an ordinary sketch.

## Museum rendering and visual treatment

### Canvas and ink shader

Source drawings are never texture-baked. For `canvasMode: "ink"`,
`createMountedSketchMaterial` extends a standard Three.js material through
`onBeforeCompile`.

The shader computes luminance using Rec. 709 weights, derives a soft ink mask,
adds a subtle procedural weave to the canvas substrate, and blends the sampled
sketch back over it:

```text
inkMask = 1 - smoothstep(whiteLow, whiteHigh, luminance)
mountedSketch = mix(canvasSurface, sampledSketch, inkMask)
```

The current conservative constants in `museum-materials.ts` are:

| Setting                   | Value |
| ------------------------- | ----: |
| Near-white threshold low  |  0.72 |
| Near-white threshold high |  0.97 |
| Canvas texture strength   | 0.055 |
| Roughness                 |  0.88 |
| Normal-map intensity      |  0.12 |
| Ink contrast              |  1.04 |

Low quality reduces canvas texture strength to `0.025` and disables the canvas
normal map. Medium uses normal scale `0.07`; high uses `0.12`.

`canvasMode: "original"` uses the original colour texture with standard surface
lighting and does not replace near-white pixels. Change a sidecar mode rather
than altering the source if an image loses important colour or white detail.

### Procedural materials, frames, and lighting

- The woven normal map is a generated 64×64 `DataTexture`.
- Warm artwork light pools are generated in a local canvas and remain visible
  around the frame edges.
- Frames use reusable dark-walnut, carved-walnut, restrained-gilt, and bronze
  materials with aspect-aware extruded rings and lightweight corner ornaments.
- Each physical bronze plaque is centred below its frame and carries a
  high-contrast artwork title on a light inset face. The semantic DOM HUD remains
  the authoritative accessible source for the full title, description, known
  date, and medium.
- The scene uses brighter hemisphere, ambient, and directional fill, one warm
  ceiling fixture per instantiated room, and a bounded pool of nearby artwork
  spotlights.
- Each active artwork spotlight has a restrained additive cone as well as a
  light pool, so its direction remains visible without requiring volumetric
  rendering.
- Low quality creates one real spotlight and no dynamic shadows.
- Medium/high create three real spotlights; only the first high-quality
  spotlight casts a shadow.
- Failed artwork textures receive a local placeholder and a development warning
  rather than crashing the scene.

No external textures, 3D models, HDR environments, shaders, or particle assets
are downloaded.

## Controls and responsive behaviour

Desktop controls:

- `W`, `A`, `S`, `D`, or arrow keys move.
- Movement keys are accepted only while focus is inside Museum View or the
  canvas has pointer lock; links and controls elsewhere on the page retain their
  normal keyboard behaviour.
- Dragging the canvas looks around.
- `Shift` changes walking speed from 2.15 to 3.15 world units per second.
- “Mouse look” requests pointer lock only after an explicit button action.
  Browser `Escape` behaviour releases pointer lock.
- Previous artwork, Next artwork, Details, Reset, and Return to collection
  remain ordinary focusable buttons.
- The location card reports “Room N of M” and provides separate Previous room
  and Next room buttons. Each button names its destination; the unavailable
  direction is visibly disabled at the start or end of the tour.
- Doorway signs can be selected directly and have equivalent semantic room
  buttons for keyboard and assistive-technology users.
- Selecting a canvas artwork focuses it; walking interrupts a guided focus
  animation. Same-room movement animates only when the sampled path is
  collision-safe. Cross-room or bench-blocked focus uses a short fade and
  teleport after the destination room is ready; reduced-motion mode teleports
  immediately.

Touch/coarse-pointer controls:

- A 6.25rem movement pad supplies forward/back and strafe input.
- Dragging the scene looks around.
- A short tap on an artwork selects it; a drag is not mistaken for selection.
- A short tap on a doorway sign moves to its named room.
- HUD actions become a compact grid and retain large touch targets.
- Phone layouts remain supported; Museum View is never the only way to reach a
  sketch.

Movement stays at fixed eye height and is limited to room and doorway walkable
areas. Walls, voids, and central benches are collision boundaries.

## Accessibility and non-WebGL fallback

The accessible collection is not conditional on WebGL or JavaScript. It contains
semantic headings, a list of linked figures, descriptive alt text, visible
metadata, intrinsic image dimensions, and responsive thumbnail/preview sources.
The first four collection images are eager; later images are lazy.

Additional accessibility behaviour includes:

- a route-level skip link directly to Accessible Collection View;
- a second Skip Museum View link beside the museum heading;
- an explicitly labelled, keyboard-focusable canvas;
- `aria-live` loading, room, and current-artwork status;
- named HUD controls with visible focus treatment, including a semantic Room
  navigation region with explicit destination labels;
- an ordinary fallback message and collection link when WebGL, dynamic import,
  renderer initialisation, or the context fails;
- a native modal `<dialog>` for larger inspection, previous/next navigation,
  zoom, close, and original-source access;
- reduced-motion focus changes that move immediately instead of using the
  760ms camera transition;
- reduced-motion page scrolling that uses `auto`;
- no automatic pointer lock, camera movement, audio, or autoplaying media; and
- focus restoration to the Enter Museum button after leaving Museum View.

## Performance, quality tiers, and lifecycle

Three.js is absent from the initial server-rendered route bundle. `SketchMuseum`
checks WebGL in `onMount`; only an explicit Enter Museum action dynamically
imports `MuseumScene.svelte`.

Quality selection uses viewport width, `navigator.hardwareConcurrency`, and
`navigator.deviceMemory` when available:

| Tier   | Current selection and behaviour                                                                                                                                                |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Low    | Compact viewport, at most four logical cores, or at most 4 GB reported memory; preview textures, one light, no dynamic shadows, no antialiasing, low-power context preference. |
| Medium | Default tier; museum textures, three bounded spotlights, simplified shadows.                                                                                                   |
| High   | At least eight logical cores, at least 8 GB reported memory, and width at least 1100px; richer shadows and canvas normal strength.                                             |

Pixel density is capped by the existing helper to 1 on compact/low-power
conditions and 1.5 otherwise.

At runtime:

- only the current room and directly connected rooms are instantiated and
  visible;
- only those rooms' preview/museum textures are retained;
- leaving that neighbourhood invalidates in-flight loads and disposes its room
  geometries, textures, and artwork materials while retaining shared materials;
- nearby lights are reassigned to the closest works rather than creating one
  real light per artwork;
- room, nearest-artwork, and spotlight checks run every 20 frames;
- rendering pauses while the document is hidden;
- resize handling uses one `ResizeObserver`; and
- unmounting cancels animation, disconnects observers, removes event listeners,
  exits pointer lock, disposes textures/materials/geometries, disposes the
  renderer, and forces context loss.

Room definitions and placements are deterministic manifest data, but Three.js
geometry is streamed per current/adjacent room. This keeps entry cost and
resident scene geometry bounded as the collection grows. Before moving from
hundreds to thousands of works, profile traversal churn and GPU memory and
consider geometry instancing and distance LOD.

## Testing and preview

Pipeline and layout tests:

```powershell
npm run sketches:test
```

This runs Node tests for discovery, metadata fallbacks and validation,
deterministic cached variants, source preservation, and `_generated` exclusion,
followed by Vitest coverage of portrait/landscape/square frames, connected-room
determinism, first/middle/final-room wayfinding and door clearance, complete
frame-and-plaque non-overlap, manual room caps, room neighbourhood selection,
collision-safe guided paths, bench boundaries, and keyboard-input scoping.

Focused verification:

```powershell
npm run images:verify
npm run sketches:verify
npm run check
```

Repository-wide checks before handoff:

```powershell
npm run lint
npm test
npm run build
```

Local browser preview:

```powershell
npm run dev
```

Then inspect:

```text
http://localhost:5173/images/sketches
http://localhost:5173/images/sketches?art=<slug>
http://localhost:5173/images/sketches?webgl=off
```

The `webgl=off` URL exercises the existing feature-detection fallback. Test at
phone, tablet portrait/landscape, and desktop widths; use keyboard-only and touch
input; enter and exit pointer lock; switch tabs while the scene is running; and
check the console and network panel for hydration errors, repeat texture loads,
missing assets, or WebGL warnings.

For a production-style local preview:

```powershell
npm run build
npm run preview
```

There is currently no Playwright configuration for this route. Browser controls,
modal focus, WebGL fallback, and responsive layouts therefore still require
manual smoke testing; the WebGL scene should not use whole-scene pixel snapshots
as its primary test.

## Dependencies and licences

| Dependency     | Use                                                                                   | Licence    |
| -------------- | ------------------------------------------------------------------------------------- | ---------- |
| `three`        | Scene graph, renderer, camera, geometry, lights, textures, materials, and ray casting | MIT        |
| `@types/three` | TypeScript declarations for Three.js                                                  | MIT        |
| `sharp`        | Deterministic WebP variant generation                                                 | Apache-2.0 |

Pillow remains part of the repository's existing Python image-optimisation
workflow.

The museum uses no third-party textures, models, HDRIs, normal maps, or decorative
assets. Wall, wood, gilt, bronze, weave, fallback, and light-pool visuals are
implemented with local colours, generated geometry, shaders, `DataTexture`, or
`CanvasTexture`. There are therefore no additional texture/model attribution
files to maintain. The licences above apply to the software dependencies, not to
the source drawings.

## Exact three-step instructions for the next sketch

1. **Curate and copy the source.** Visually approve one obviously safe,
   text-free image from the external gallery, preserve its bytes, and copy it to
   `static/sketch/<descriptive-kebab-slug>.<supported-extension>`.
2. **Add the sidecar.** Create
   `static/sketch/<descriptive-kebab-slug>.json` with factual title,
   description, alt text, known date or `null`, justified medium, optional room,
   `featured`, and the correct `canvasMode`.
3. **Generate, preview, and verify.** Run `npm run dev`; its `predev` hook creates
   or updates variants and the typed manifest, then inspect
   `/images/sketches`. Before committing or deploying, run `npm run build`, which
   also updates the source optimisation record and executes the normal
   validation chain.
