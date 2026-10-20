# Mrinmoyee — The Durga Atelier

An original Bengali-inspired ten-arm sculpture atelier, published through the normal Visualizations article path at `/blog/visualizations/mrinmoyee-the-durga-atelier`. This is a stylised digital artwork rather than a historical reconstruction, ritual guide or fabrication-ready statue model.

## Structure

| File                                           | Responsibility                                                                                                                          |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/visualizations/mrinmoyee/types.ts`    | Versioned design, camera, gallery and export contracts.                                                                                 |
| `config.ts`                                    | Six complete presets, camera bookmarks, ranges and normalization.                                                                       |
| `state.ts`                                     | Complete JSON import/export, URL fragments, locked deterministic variation and bounded device-gallery storage.                          |
| `sculpture.ts`                                 | Authored three-dimensional face, ten connected arms and attributes, cloth, crown, ornament, flowers, lion and structural making stages. |
| `renderer.ts`                                  | Scene, materials, lighting, backdrop, lamps, bells, atmosphere, orbit interaction, capture and resource lifetime.                       |
| `audio.ts`                                     | Original synthesized bell tones and a dhak-inspired rhythm, created only after an explicit sound action.                                |
| `src/lib/components/visualizations/mrinmoyee/` | Svelte viewport and responsive tools, history, gallery, comparisons, export dialog and presentation.                                    |
| `src/lib/posts/mrinmoyee-the-durga-atelier.md` | Publication metadata, explanation, model boundaries and cultural sources.                                                               |
| `scripts/render-mrinmoyee-assets.mjs`          | Real renderer captures, social composition and source-provenance check.                                                                 |

The existing Three.js dependency is reused. No server endpoint, external asset fetch, account, API credential or cloud persistence is added. The canonical architecture describes the new feature's state and rendering boundary.

## Design and rendering limits

The ten attributes form an original studio arrangement. The Met reference in the article is a distinct historical sixteen-arm sculpture; it is not evidence that the atelier's arrangement is a universal iconographic prescription. The making slider reveals the digital layers and does not reproduce a workshop or consecration practice.

The face, drapery, ornaments and lion are authored procedural surfaces. Material responses are real-time graphics approximations. Stone and metal finishes treat the figure as a unified sculpture, while painted clay preserves separate skin, dress and ornament colours. Stage changes use actual geometry layers. The artwork has a back and can be orbited, but its visual meshes are not offered as watertight printable solids.

Stillness is the default. Motion is explicit and respects reduced motion; sound is separate and starts muted. Quality selection reduces tessellation, render density and shadow cost. The renderer suspends animation offscreen or when the document is hidden. A lost context uses a fresh-canvas retry. A poster and the explanatory article remain readable without working WebGL.

Design JSON must be a complete version-1 object, at most 24 KiB in UTF-8. Normalization bounds numeric values, checks enums and colours, and rejects inherited fields. A URL fragment carries the complete intended design and camera, with no private information or server record. Reproduction means the same intended composition; exact pixels can vary by viewport, browser and GPU.

Local storage holds at most twelve designs under `mrinmoyee.designs.v1`. Thumbnails have their own size bound; quota failures retry with design data alone. Portable JSON or share links are useful independent copies. Clearing browser data can remove the gallery. Imported labels are rendered as text.

PNG export is bounded to 4096 pixels per side and the device's texture-size limit. Portrait, square and landscape output expands the camera's shorter dimension to preserve the selected view. Transparent images omit the background and atmosphere. Optional title and signature are composited as text after the 3D capture.

## Publication artwork and verification

Run `npm run mrinmoyee:assets` to bundle the actual feature renderer with the existing esbuild toolchain and capture it in headless Chrome into the feature's static image directory. This needs no development server and uses the production geometry, materials, lighting and camera code. The poster and six preset thumbnails contain actual scene captures. The social preview adds typography over a renderer capture. `npm run mrinmoyee:assets:check` checks source provenance, dimensions and media budgets without launching a browser.

Use `npm run mrinmoyee:test` for model, serialization, lock and geometry regressions, and `npm run mrinmoyee:browser:test` for actual-browser interaction, export and lifecycle checks. `npm run check` covers Svelte/TypeScript. The repository's required feature build is `npm run build:full`; its global artifact/notebook checks can expose existing unrelated failures, which must be reported separately rather than represented as successful verification.

### Verification receipt — 20 October 2026

The full feature build passed, including the generated-artifact checks, notebook preparation, content and media validation, production compilation, discoverability and route-asset checks. All eight publication captures passed the current-source provenance and dimensions check. The feature's four unit-test files passed all twenty-four tests; the publishing-workflow fixtures passed all six tests.

All nine Playwright cases passed against the completed production preview in local Chrome with SwiftShader. They cover the JavaScript-free article and poster; all six presets and desktop bounds; controls, undo/redo, locks and complete share links; gallery reload, comparison and saving; validated JSON import/export; PNG dimensions and actual transparent corner pixels; phone overflow, keyboard tabs, reduced motion and presentation focus; real WebGL context loss, fresh-canvas recovery and navigation disposal; and cancellation of sound when visibility changes during pending audio startup.

The final `npm run check` passed with zero Svelte/TypeScript errors and warnings. Scoped ESLint and Prettier checks passed. These results verify the intended composition and interactions in that browser environment; they do not establish identical rendering or performance across all graphics hardware.
