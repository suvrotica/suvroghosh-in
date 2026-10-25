# Lens and Mirror Lab sample images

The five PNG samples are original procedural illustrations created for this
feature. No third-party photograph, stock image, font file or external image
source is embedded. Text is rasterised using the local renderer's system font.

| File | Purpose |
| --- | --- |
| `calibration.png` | Straight lines, circular symmetry, numbered points and asymmetric marks. |
| `facade.png` | Repeated windows, architectural verticals and horizontals. |
| `portrait.png` | An illustrated face whose proportions make local stretching recognisable. |
| `corridor.png` | A perspective drawing with straight converging architectural lines. |
| `typography.png` | Asymmetric lettering, arrow direction and labelled colour patches. |

All five images are 1400 × 1000 pixels. Reproduce them with
`node scripts/render-lens-mirror-samples.mjs`; check their decoded pixels with
`node scripts/render-lens-mirror-samples.mjs --check`. The check permits lossless
PNG recompression while detecting changes to the artwork.

`samples.json` records the SVG-source and decoded-pixel hashes. It concerns the
procedural samples only. The article poster is captured separately from the
working application, rather than illustrated as if it were a screenshot.
