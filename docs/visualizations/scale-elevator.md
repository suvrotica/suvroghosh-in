# The Scale Elevator — From Ion to City

An eleven-stop oxygen exhibit at `/blog/visualizations/the-scale-elevator-from-ion-to-city`, embedded in ordinary Markdown through the existing generic article route. This feature reuses Three.js with feature-owned model and interface state. It adds no route wrapper, server endpoint, API integration, shared simulation engine or medical dataset.

## Scientific and editorial contract

The order is ion → molecule → membrane → cell → tissue → organ → person → hospital bed → ward → hospital → city. The ion is haem iron; O₂ is the reversibly binding molecule. The persistent thread follows oxygen's role, never one molecule surviving cellular respiration. The haemoglobin-to-membrane transition explicitly changes anatomical context from red-cell carriage to an adjacent tissue cell. The mitochondria belong to that tissue cell, not a healthy mature red blood cell.

Every floor defines its question, quantity, unit, denominator, interval, support, evidence status, viewing extent, control and outgoing transition in `FLOORS`. Physical dimensions and viewing extents are separate. The extent metadata labels all scene widths illustrative. Organisational transitions are not claims of geometric nesting or fixed orders of magnitude. The measurement passport and accessible ledger draw from the same registry.

All patient observations, signal-quality examples, demand profiles, facilities and map locations are synthetic. Molecular geometry and movement are authored. The small-scale normalised relationships are educational illustrations; the model contains no molecular dynamics, diffusion PDE, calibrated respiration kinetics, clinical decision rule, pipeline pressure solver or logistics optimisation.

## Files and ownership

| Path                                                                    | Responsibility                                                                                                       |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `src/lib/visualizations/scale-elevator/types.ts`                        | Typed state, floor definitions, calculated results, readings and renderer interface.                                 |
| `src/lib/visualizations/scale-elevator/core.ts`                         | Canonical floor/scenario registry, bounded state, URL encoding, tour schedule, pure models and measurement readings. |
| `src/lib/visualizations/scale-elevator/renderer.ts`                     | Browser-only Three.js scenes, local transforms, semantic transitions and GPU resource lifetime.                      |
| `src/lib/components/visualizations/scale-elevator/ScaleElevator.svelte` | Per-mount navigation, scenario and local controls, tour state, measurement passport and accessible ledger.           |
| `src/lib/components/visualizations/scale-elevator/ScaleStage.svelte`    | Lazy viewport integration and still fallback.                                                                        |
| `src/lib/components/visualizations/scale-elevator/ScaleChart.svelte`    | Sharp SVG explanations drawn from the declared model values.                                                         |
| `src/lib/posts/the-scale-elevator-from-ion-to-city.md`                  | Article, sources, scientific limits and publication metadata.                                                        |
| `scripts/render-scale-elevator-assets.mjs`                              | Repeatable real-page still and continuous-tour capture, with provenance manifest.                                    |

The gallery imports only the feature summary, poster path and subject labels through the lightweight registry. The renderer is a dynamic browser import; it is not a module dependency of gallery metadata.

## State, navigation and clocks

`ElevatorState` contains semantic `progress` in `[0,10]`, a checked scenario enum, normalised local `control` in `[0,1]`, selected item in `[0,35]` and an integer seed in `[1,2147483646]`. Ward selection uses the bed's index across three twelve-bed wards; organ selection uses the index modulo four. Invalid or non-finite numeric inputs fall back or clamp. Unknown scenario values use baseline. `parseState` and `encodeState` round-trip the `se-scale`, `se-scenario`, `se-control`, `se-selected` and `se-seed` query parameters. They carry public synthetic state only.

`floorAt` retains the previous floor within 0.54 of its index, creating a 0.08-wide overlap around adjacent midpoints. This stabilises editorial labels during scrubbing. The shell evaluates the model with that interpreted integer floor, so local controls and measurement labels share one context while the renderer receives continuous progress separately. Local controls affect the current floor's declared parameter; other local parameters use their defaults when the visitor moves on. Scenario and seed persist across the journey.

Tour presentation time is separate from the model's scientific intervals. The 52-second canonical tour has eleven two-second holds and ten three-second smooth transitions. `tourProgress` maps tour seconds to semantic progress. Molecular trajectories have no calibrated time, cell uptake uses a model interval, physiological transport uses minutes and city planning uses a 24-hour horizon. A camera coordinate never becomes a physiological variable.

The renderer uses manageable local coordinates per scene. Semantic transitions transform the representation without placing a nanometre binding site and a city in a single literal world-coordinate range. Changes of anatomy and organisational scope are labelled. Incompatible measurements are never numerically blended into one intermediate quantity.

## Declared calculations

### Binding and early floors

- Ion: local control selects an unbound or bound schematic site; the threshold is 0.5.
- Molecule: illustrative Hill occupancy `p^2.7 / (26^2.7 + p^2.7)`, with local pressure `p = 10 + 90c` mmHg. It describes an ensemble mean. Each real site is discrete. The model omits pH, temperature, carbon dioxide, competing ligands and kinetics.
- Membrane: normalised flux density equals the driving difference `0.15 + 1.7c` at fixed normalised permeability 1. This is a linear teaching relationship in relative units, without calibrated membrane area or physical time.
- Cell: authored normalised uptake `0.4 + 1.2c`, per schematic cell per model interval. No ATP yield is calculated.
- Tissue: relative perfusion `0.35 + 1.3c` scales the authored distance-decay field `tissueSupply(d,p) = p × exp(-0.7d)`. The shared pure function supplies the renderer, SVG curve and primary reading. Four inspectable distances are 0, 0.8, 1.6 and 2.4 relative spatial units. The passport's selected local supply index is distinct from the secondary perfusion input. The colour field is a supply illustration, not measured tissue partial pressure; its relative distances are not calibrated micrometres.
- Organ: four authored weights `[0.30, 0.26, 0.24, 0.20]` share a reference 5% of systemic flow. The selected region's flow multiplier is `0.3 + 1.4c`. Fixed synthetic demand references `[12,10,9,8]` mL O₂/min remain constant across the blood-transport comparisons. The primary delivery, selected demand and delivery-minus-demand balance are explicit; the chart uses a fixed 0–30 mL O₂/min scale and demand marks. Region colour is an illustrative delivery/demand comparison. There is no compensating-flow model or clinical failure threshold.

Here `c` is the bounded local control. The visual extents are illustrative widths: 2 nm, 10 nm, 200 nm, 30 µm, 1 mm, 20 cm, 2 m, 4 m, 40 m, 400 m and 20 km. The membrane label separately identifies an approximate 5 nm thickness. These are teaching contexts rather than calibrated geometry.

### Blood content and delivery

```text
CaO₂ [mL O₂/dL blood] = 1.34 × Hb [g/dL] × SaO₂ [%] / 100
                       + 0.003 × PaO₂ [mmHg]
DO₂ [mL O₂/min]       = CO [L blood/min] × CaO₂ × 10 [dL/L]
```

The empirical haemoglobin coefficient is 1.34 mL O₂/g Hb and the dissolved coefficient is 0.003 mL O₂/(dL blood·mmHg). Saturation is explicitly converted from percentage to fraction. These are conventional educational approximations; they do not model dyshemoglobins, altered affinity or compensatory circulation.

Baseline holds SaO₂ at 98%, PaO₂ at 100 mmHg, Hb at 15 g/dL and cardiac output at 5 L/min at the middle person-floor control. It yields content 19.998 mL O₂/dL and delivery 999.9 mL O₂/min. The haemoglobin comparison changes Hb to 8 g/dL, yielding 10.8056 mL O₂/dL and 540.28 mL O₂/min at the same baseline flow. The flow comparison multiplies cardiac output by 0.6, yielding 3 L/min and 599.94 mL O₂/min while preserving content. On the person floor, the local output dial spans 3–7 L/min before applying the scenario multiplier.

The twelve-point bedside trace is deterministic given seed. Its synthetic SpO₂ values and arbitrary signal-quality index are independent of the physiological and service-demand scenarios. Minute selection reveals a point; the quality index is not a confidence interval. Contextual Hb and delivery come from separate model inputs. No synthetic SpO₂ percentage is converted to a device prescription or gas-service demand.

### Compatible service-gas aggregation

Every infrastructure rate uses gas-equivalent litres of fixed 99% oxygen source gas at 20 °C and 101.3 kPa. Inventory uses gas-equivalent litres under the same convention, not vessel geometric volume. Source-gas demand is explicitly authored and distinct from inspired oxygen concentration, arterial content, physiological delivery and consumption.

There are three twelve-bed wards with these source draws in L/min:

```text
A: 0, 2, 2, 3, 3, 4, 4, 5, 5, 6, 8, 10     total 52
B: 2, 2, 3, 4, 4, 5, 6, 6, 8, 10, 12, 15   total 77
C: 3, 4, 4, 5, 6, 8, 8, 10, 12, 15, 18, 20 total 113
```

All wards have twelve occupied beds. The demand scenario multiplies all 36 draws by 1.8 while retaining bed counts, clinical traces and capacities. On the ward floor a local demand multiplier spans 0.6–1.4. It applies consistently to the declared profiles; it is not a simulated prescription adjustment.

The reference hospital has 300 L/min nominal source capacity and branch capacities `[100,110,90]` L/min. The hospital dial changes the third branch to 30–150 L/min. The model caps each ward draw by its branch, then proportionally scales capped draws if their sum exceeds source capacity. Allocation cannot exceed demand, branch capacity or the shared source. Reference demand is 242 L/min; allocated flow is 219 L/min, leaving 23 L/min unmet despite spare nominal source capacity.

The city has three fictional hospitals using 1.0, 0.8 and 1.2 times reference hospital demand. Its baseline demand is therefore 726 L/min. Baseline replenishment is 650 L/min, with a 240,000 L gas-equivalent shared reserve. The city dial spans 0–1,300 L/min replenishment. For a positive constant deficit, reserve endurance in hours is `stock / (demand - replenishment) / 60`; otherwise the result is `null`, rendered as no net depletion. Baseline endurance is approximately 52.63 hours. The demand scenario produces 1,306.8 L/min demand and approximately 6.09 hours at baseline replenishment.

This city balance assumes ideal shared access and constant rates. It does not route deliveries, simulate local inventories, vary purity or solve transport delays. Reduced replenishment can illustrate a delay's supply consequence without claiming a transport model. Hospital branch constraints remain a separate view; aggregate city stock is not a guarantee of bedside availability.

## Accessibility, lifecycle and fallbacks

The article and ordered floor ledger remain server-rendered and readable without JavaScript. Native labelled controls provide keyboard floor selection, scrubbing, previous/next navigation, scenario choice and local inspection. The responsive stage, passport and charts recompose for portrait viewports. The feature honours reduced motion; manual state selection preserves the explanation without requiring animated travel.

`?webgl=off` exercises the still path. The clean scene captures correspond to the current floor rather than showing an unrelated poster. The full annotated captures include interface context. The renderer is created after mount and viewport activation. Both the stage's activation observer and the shell's animation observer consume the latest entry in an IntersectionObserver delivery batch, so an earlier offscreen entry cannot override a later visible state. Late loading must be disposed if ownership has ended. The feature pauses owned frame work offscreen or while the document is hidden, bounds device pixel density and disposes renderer resources on teardown. Actual checks and host-specific performance observations belong in a dated verification receipt; this description is not itself a test result.

## Publication captures

`npm run scale-elevator:assets` creates the assets from the implemented page. Start a development server or a production preview first, then set `BASE_URL` to its origin; the capture script defaults to `http://127.0.0.1:4251`. Generation requires installed Chrome for Playwright and a native FFmpeg executable with H.264 encoding. Set `FFMPEG_PATH` to that executable's absolute path when `ffmpeg` is not on the command path. The script starts the encoder directly, without a shell or automatic download. The check command needs neither a running site nor FFmpeg.

For example, run `npm run preview -- --host 127.0.0.1 --port 4251` in one terminal after a completed production build. In another PowerShell terminal:

```powershell
$env:BASE_URL = 'http://127.0.0.1:4251'
$env:FFMPEG_PATH = 'C:\path\to\ffmpeg.exe'
npm run scale-elevator:assets
```

Page capture includes HTML/SVG labels and the measurement passport alongside the real Three.js scene. Published assets use seed **20261021**, baseline scenario, local control 0.5 and selected item 0; the interactive default seed is separately **271828**. Stills use each exact floor index at presentation time 1.25 seconds. The continuous recording uses the canonical 52-second tour schedule at 24 frames per second. The capture viewport is 1440 × 1200 at device scale factor 1; the script fixes the card crop to the maximum workbench/passport heights across all eleven stops.

The script opens the article with `se-capture=1&motion=reduce` and dispatches a `scale-capture` custom event to `[data-testid="scale-elevator"]`. The feature accepts that event only while the explicit capture flag is active. Each frame carries bounded model state plus a separate presentation time, waits for rendering, then captures `[data-testid="scale-capture"]`. Clean fallback views capture the stage canvas alone. This controlled path permits deterministic frames even though ordinary reduced-motion navigation is still and manual.

Published files:

- `static/images/visualizations/scale-elevator/01-ion.jpg` through `11-city.jpg`: eleven annotated floor stills.
- `static/images/visualizations/scale-elevator/scene-01-ion.jpg` through `scene-11-city.jpg`: clean matching scene fallbacks.
- `static/images/visualizations/scale-elevator/scale-elevator-overview.jpg`: journey contact sheet.
- `static/images/visualizations/scale-elevator/scale-elevator-social.jpg`: publication/social image.
- `static/videos/visualizations/scale-elevator/scale-elevator-tour.mp4`: playable continuous tour with pauses.
- `static/images/visualizations/scale-elevator/assets.json`: source/capture version, source-file hash, seed, scenario, floor/tour state, dimensions, budgets, source references and video format/duration/hash.

Use `npm run scale-elevator:assets:check` for the source-provenance, expected-file, dimensions, media-budget and recording checks. The checker requires all 24 JPEGs and a complete H.264/MP4 recording. It verifies the source hash, required manifest versions, JPEG dimensions and budgets, video track dimensions and duration, and the recording's SHA-256. The two montage targets are 1800 × 1140 for the overview and 1200 × 630 for the social image; the recording is encoded at width 1280 with an even height preserving the card aspect ratio. Exact card dimensions are recorded in the manifest. File existence alone is not visual verification. The recording is silent and the article plus floor ledger supply its textual explanation.

## Verification commands

```sh
npm run scale-elevator:test
npm run scale-elevator:browser:test
npm run scale-elevator:assets:check
npm run check
npm run build:full
git diff --check
```

Use scoped formatting and lint checks for the feature, article, scripts and edited documentation. The feature build is required because renderer code, publication captures and feature-artifact inputs change together. Its presteps own the ordinary content generators. Report pre-existing unrelated failures separately; the architecture forensic audit's missing security commands are not implemented checks.

`features:check` includes `scale-elevator:assets:check`, so `build:full` verifies the committed capture set before the ordinary publication build. The feature-artifact workflow explicitly includes this article path and `static/videos/visualizations/scale-elevator/**` in both pull-request and main-push filters alongside the feature source and visualization-image paths. A recording-only edit therefore selects the artifact check as well. This is workflow configuration, not a claim that a hosted CI run has completed.

### Verification receipt — 21 October 2026

The final `npm run build:full` passed. It verified the current feature artifacts and notebook preparation, ran the ordinary content generators and content, SEO, media and link validators, compiled the production site through the Vercel adapter, and passed rendered discoverability across 707 published posts. The final Barnum route-asset audit reported no failures. The compiled Scale Elevator article includes its visible Published/Updated dateline and ten matching meaningful tags and pinned tags.

The feature's 22 unit tests passed, as did 29 Node integration fixtures. All 15 browser cases passed together in 55.4 seconds against the local production build in installed Chrome using SwiftShader. Coverage includes all eleven floors and measurement passports, the three comparisons, local scientific controls, all 36 selectable beds, URL state, keyboard and touch interaction, reduced motion, controlled tour playback, WebGL-off and JavaScript-free paths, portrait and colour preferences, real context loss and fresh-canvas retry, client-navigation cleanup, lightweight gallery discovery, and the regression for batched visibility entries. The final `npm run check` reported zero Svelte/TypeScript errors and warnings. Scoped formatting and lint checks and `git diff --check` also passed.

All 24 publication JPEGs and the continuous recording were regenerated from the final rendering inputs, and their source manifest passed the asset checker. The recording is a silent 52-second H.264/MP4, 1280 × 994 pixels at 24 fps, containing 1,248 frames and occupying 3,732,833 bytes. A complete FFmpeg decode processed all 1,248 frames successfully. The annotated stills, clean fallbacks, overview and social montage were inspected for framing, labels and scientific context; the recording preserves the explanatory overlays alongside the continuous scene transitions.

A final 2.6-second smoke check on the normal production preview confirmed the City view at progress 10, the visible 21 October Published/Updated dateline, native Chrome playback and seeking to 25.15 seconds in the 52-second 1280 × 994 recording, and no media or page errors; the post-build asset check also passed.

Exploratory performance sampling used headless Chrome 155.0.8059.85 on Windows with ANGLE/SwiftShader, a 1440 × 1100 viewport and device scale factor 1. Two six-second tour samples counted 11 and 14.3 WebGL colour-buffer clear submissions per second; a 1.5-second paused sample counted none. These are short software-renderer observations, not display frame rates, GPU-completion measurements or hardware/mobile benchmarks. The short sampling windows and approximate Chromium heap observations cannot establish the absence of memory leaks. This receipt records local build, browser and media verification; it does not establish a hosted CI run or deployment.

## Source record

- [RCSB PDB-101: Haemoglobin](https://pdb101.rcsb.org/motm/41): haem, iron, four-site oxygen carriage and reversible binding. The exhibit's geometry is authored, not a coordinate import.
- [RCSB PDB-101: Cytochrome c oxidase](https://pdb101.rcsb.org/motm/5): oxygen reduction and its role in respiration. It does not calibrate the uptake illustration.
- [Physiology, Oxygen Transport, NCBI Bookshelf](https://www.ncbi.nlm.nih.gov/books/NBK538336/): content equation and physiological quantity definitions. Empirical coefficients remain approximations.
- [Esperti et al., Haematologica, 2023](https://haematologica.org/article/view/11102): abnormal mitochondrial retention and detectable respiration in mature sickle cells, contrasted with healthy cells. The feature depicts the ordinary healthy mature-cell handoff.
- [FDA: Pulse oximeters](https://www.fda.gov/medical-devices/products-and-medical-procedures/pulse-oximeters): estimated saturation and limitations, including skin pigmentation and perfusion. It is not a validation source for the synthetic trace.
- [WHO: Technical specifications for health facility based medical oxygen systems, 2024](https://www.who.int/publications/i/item/9789240101616): sources, storage and distribution as distinct system components. The toy network is not a compliant engineering design.

The editorial references are _Information Graphics_, _Knowledge Is Beautiful_ and _The Functional Art_. They inform the original hierarchy, changing visual vocabulary and explicit measurement framing; no book artwork is reproduced.
