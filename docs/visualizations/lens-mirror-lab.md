# Lens and Mirror Lab

The feature is an ordinary Visualizations article at
`/blog/visualizations/through-a-different-glass`. Its Markdown imports a dedicated
Svelte shell. The existing article route supplies metadata, search, RSS,
sitemap and category discovery. It requires no image-processing endpoint,
account or provider.

## Optical scope

The original pane means no distortion added by the lab. Uploaded photographs
may already contain lens distortion, perspective or editing; the feature does
not infer camera calibration.

The simple radial presets use bounded reverse-coordinate warps. The Advanced
panel uses an iterative inverse of the forward Brown–Conrady radial/tangential
model, replacing the simple strength when enabled. The fisheye preset blends
the reverse equidistant angular projection with identity. Model comments
document sampling direction; the calibration chart makes preset labels
inspectable. Aspect-correct coordinates prevent a non-square source from
changing circular symmetry.

Curved-mirror modes are explicitly labelled two-dimensional approximations.
Their compressive, magnifying, cylindrical and wave-like warps cannot infer
scene depth, object distance, true mirror curvature or an observer position.
The flat-mirror appearance is an explicit horizontal image flip.

## Local image boundary

JPEG, PNG and static WebP are accepted within a 10,000,000-byte file limit,
20,000,000-pixel decoded-area limit and 8192-pixel maximum source dimension.
The feature validates file signatures, animation state and dimensions before
decoding, preserves the working image when replacement fails, and prepares a
preview with a maximum 2048-pixel long edge subject to device/GPU limits.
Replacement and teardown dispose obsolete decoded images, object URLs and GPU
resources.

Uploads remain in browser memory. Image contents, filenames and embedded
metadata must not enter analytics, logs, persistent storage or shared URLs.
Shared links carry validated settings and an optional built-in sample identity.

## Samples and publication art

`scripts/render-lens-mirror-samples.mjs` generates five original 1400 × 1000 PNG
illustrations: calibration chart, façade, face, corridor and typography chart.
Their credits and source/pixel manifest live beside the assets in
`static/images/visualizations/through-a-different-glass/`. No external image
licence is required. The corridor intentionally contains ordinary perspective;
the article distinguishes it from added image distortion.

The article thumbnail is `poster.png` in the same directory. The capture script
uses the actual running default application and includes the masthead,
comparison, effect selector, controls and “What to notice” explanation. The
sample generator deliberately does not fabricate a poster. `poster.json`
records source hashes, sample-pixel hashes, capture geometry and decoded-pixel
provenance; article prose is excluded so metadata corrections do not invalidate
unchanged application artwork.

## Focused verification

`npm run lens-mirror:dev` opens an authoring-only preview at
`http://127.0.0.1:4318/blog/visualizations/through-a-different-glass`. It renders
the same Markdown article and Svelte lab without loading the site's complete
eager metadata registry. It omits the shared site shell and read-aloud control;
the production article continues to use the ordinary blog route. The generated
preview files live in ignored `node_modules/.cache/lens-mirror-preview`.

`npm run lens-mirror:test` runs geometry, image-header/admission and shared-state
tests. `npm run lens-mirror:browser:test` starts and tears down a focused preview
on port 4318 by default. `PLAYWRIGHT_PORT` selects another port. To exercise an
already running focused preview in PowerShell:

```powershell
$env:LENS_MIRROR_BASE_URL = 'http://127.0.0.1:4318'
$env:PLAYWRIGHT_REUSE_SERVER = '1'
npm run lens-mirror:browser:test
```

Regenerate samples:

```sh
node scripts/render-lens-mirror-samples.mjs
```

Check their decoded pixels after lossless build optimisation:

```sh
node scripts/render-lens-mirror-samples.mjs --check
```

Capture publication artwork against an already running loopback preview:

```sh
node scripts/capture-lens-mirror-poster.mjs --base http://127.0.0.1:4318
```

Verify its source and decoded-pixel provenance without starting a browser:

```sh
node scripts/capture-lens-mirror-poster.mjs --check
```

Feature verification should cover identity and inverse-coordinate conventions,
aspect correction, finite bounds, flat reflection, file header/dimension
validation, URL-state validation, controls, uploads, downloads, keyboard/touch
operation and no-WebGL fallback. Browser checks must inspect that upload data
and filenames do not leave the browser. Record actual commands and results in
the task handoff; this document does not claim those checks have run.
