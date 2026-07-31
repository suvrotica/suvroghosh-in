# The City That Refuses a Master Plan — implementation report

Route: `/blog/visualizations/the-city-that-refuses-a-master-plan`

This report describes the implementation of the interactive article **The City That Refuses a
Master Plan**. It records what the software actually does, how reproducibility works, what was
tested, and where the model deliberately stops short of claiming to be a real city-planning
system.

## 1. User experience

The interactive appears before the long-form article and has two complementary presentations:

- **Play** is the default, outcome-first view. A visitor can place one of ten anchors, rotate it,
  choose a cell, generate a city, pan or zoom the map, fit it to the viewport, inspect a cell,
  compare the two scores, read the municipal report, and try another deterministic seed.
- **How it decides** is the Lab view. It exposes the event replay, entropy/candidate-count
  hatching, edge sockets, observation evidence, propagation-forced cells, contradictions,
  backtracks, and municipal patches. The replay can be paused, advanced by one observation plus the
  propagation it caused, resumed, or completed immediately.

The main flow is:

1. Choose **Make your own city**.
2. Select and place an anchor by pointer or keyboard.
3. Optionally change topology settings.
4. Choose **Let the city happen**.
5. Watch or skip the deterministic event replay.
6. inspect the resulting network, score breakdown, report, or individual cell.

Five guided experiments provide fixed, teachable configurations:

- the sweet-shop attractor;
- tram versus garage;
- pond in the middle;
- flyover precedent;
- the immortal sand pile.

Advanced settings expose the seed, three grid sizes, four backtracking budgets, density, landmark
frequency, anomaly appetite, a minimum-guarantees hybrid, and tram preference. Reveal speed,
entropy, sockets, and ambient motion are display-only settings and therefore do not alter the city
fingerprint.

The outcome panel includes:

- functional and municipal-calamity scores with component explanations;
- connected-network, frontage, drainage, tram, open-space, and exception facts;
- a prose municipal report;
- a complete, expandable text alternative to the Canvas;
- deterministic JSON, metadata-complete 3200 × 2400 map PNG, and 1600 × 1200 social-card PNG
  downloads;
- copy-link and Web Share support with a clipboard fallback;
- local “friendly challenge” comparisons that recompute a distinct opponent rather than accepting
  supplied scores.

## 2. Repository conventions and installed versions

The work follows the repository’s existing application rather than introducing a separate app:

- The article is an mdsvex Markdown post with the repository’s established front matter,
  visualisation metadata, prose pipeline, generated tags, word-cloud entry, media validation, and
  discoverability conventions.
- The interactive is a Svelte 5 component embedded in the article. It uses Svelte runes and the
  project’s TypeScript and Svelte-check configuration.
- The full-bleed laboratory uses the existing `article-breakout not-prose` convention, while the
  surrounding explanation remains ordinary article content.
- Controls and renderer colours use the site’s CSS variables. Paper, light, night, and
  high-contrast appearances are supported; the renderer observes the site theme rather than
  maintaining an unrelated theme system.
- Both `prefers-reduced-motion` and the site-level `data-motion="still"` setting suppress reveal
  transitions and ambient animation.
- The production adapter remains `@sveltejs/adapter-vercel`; no new hosting architecture or
  deployment target was added.
- Seeded pseudo-randomness is shared through `src/lib/utils/seeded-random.ts`; the pre-existing
  Calcutta footpath code re-exports that common implementation.

Installed versions used for the final implementation:

| Package         | Installed version |
| --------------- | ----------------: |
| SvelteKit       |            2.69.2 |
| Svelte          |            5.56.4 |
| TypeScript      |             5.9.x |
| Vite            |             7.3.x |
| Vitest          |            4.1.10 |
| Playwright Test |            1.62.0 |

## 3. Files and responsibilities

The implementation is intentionally split by responsibility.

| Area                       | Principal files                                                                                                                                                                                                                                                                                                                                                                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Article and metadata       | [`src/lib/posts/the-city-that-refuses-a-master-plan.md`](../src/lib/posts/the-city-that-refuses-a-master-plan.md)                                                                                                                                                                                                                                                                                                                           |
| Interactive shell          | [`src/lib/components/visualizations/city-master-plan/CityMasterPlanLab.svelte`](../src/lib/components/visualizations/city-master-plan/CityMasterPlanLab.svelte)                                                                                                                                                                                                                                                                             |
| Map and input              | [`CityCanvas.svelte`](../src/lib/components/visualizations/city-master-plan/CityCanvas.svelte), [`CityToolbar.svelte`](../src/lib/components/visualizations/city-master-plan/CityToolbar.svelte), [`AnchorPalette.svelte`](../src/lib/components/visualizations/city-master-plan/AnchorPalette.svelte)                                                                                                                                      |
| Explanation and reports    | [`CityInspector.svelte`](../src/lib/components/visualizations/city-master-plan/CityInspector.svelte), [`ScorePanel.svelte`](../src/lib/components/visualizations/city-master-plan/ScorePanel.svelte), [`MunicipalReport.svelte`](../src/lib/components/visualizations/city-master-plan/MunicipalReport.svelte), [`AccessibleCityReport.svelte`](../src/lib/components/visualizations/city-master-plan/AccessibleCityReport.svelte)          |
| Experiments and sharing    | [`GuidedTrials.svelte`](../src/lib/components/visualizations/city-master-plan/GuidedTrials.svelte), [`ChallengePanel.svelte`](../src/lib/components/visualizations/city-master-plan/ChallengePanel.svelte), [`AdvancedSettings.svelte`](../src/lib/components/visualizations/city-master-plan/AdvancedSettings.svelte)                                                                                                                      |
| Core model                 | [`engine/types.ts`](../src/lib/visualizations/city-master-plan/engine/types.ts), [`engine/constants.ts`](../src/lib/visualizations/city-master-plan/engine/constants.ts), [`engine/generator.ts`](../src/lib/visualizations/city-master-plan/engine/generator.ts)                                                                                                                                                                           |
| WFC                        | [`engine/bitset.ts`](../src/lib/visualizations/city-master-plan/engine/bitset.ts), [`engine/catalog.ts`](../src/lib/visualizations/city-master-plan/engine/catalog.ts), [`engine/compatibility.ts`](../src/lib/visualizations/city-master-plan/engine/compatibility.ts), [`engine/entropy.ts`](../src/lib/visualizations/city-master-plan/engine/entropy.ts), [`engine/wave.ts`](../src/lib/visualizations/city-master-plan/engine/wave.ts) |
| Conditions and repair      | [`engine/anchors.ts`](../src/lib/visualizations/city-master-plan/engine/anchors.ts), [`engine/anchorInfluence.ts`](../src/lib/visualizations/city-master-plan/engine/anchorInfluence.ts), [`engine/municipalPatch.ts`](../src/lib/visualizations/city-master-plan/engine/municipalPatch.ts)                                                                                                                                                 |
| Survey and scoring         | [`engine/elevation.ts`](../src/lib/visualizations/city-master-plan/engine/elevation.ts), [`engine/infrastructure.ts`](../src/lib/visualizations/city-master-plan/engine/infrastructure.ts), [`engine/analysis.ts`](../src/lib/visualizations/city-master-plan/engine/analysis.ts), [`engine/scoring.ts`](../src/lib/visualizations/city-master-plan/engine/scoring.ts)                                                                      |
| Identity and persistence   | [`engine/identity.ts`](../src/lib/visualizations/city-master-plan/engine/identity.ts), [`engine/serialize.ts`](../src/lib/visualizations/city-master-plan/engine/serialize.ts), [`engine/export.ts`](../src/lib/visualizations/city-master-plan/engine/export.ts), [`engine/canonicalReport.ts`](../src/lib/visualizations/city-master-plan/engine/canonicalReport.ts)                                                                      |
| Canvas renderer            | [`render/renderCity.ts`](../src/lib/visualizations/city-master-plan/render/renderCity.ts), [`render/camera.ts`](../src/lib/visualizations/city-master-plan/render/camera.ts), [`render/palette.ts`](../src/lib/visualizations/city-master-plan/render/palette.ts), [`render/microDetails.ts`](../src/lib/visualizations/city-master-plan/render/microDetails.ts)                                                                            |
| Worker boundary            | [`worker/city.worker.ts`](../src/lib/visualizations/city-master-plan/worker/city.worker.ts), [`worker/client.ts`](../src/lib/visualizations/city-master-plan/worker/client.ts), [`worker/protocol.ts`](../src/lib/visualizations/city-master-plan/worker/protocol.ts)                                                                                                                                                                       |
| Presets and browser export | [`presets.ts`](../src/lib/visualizations/city-master-plan/presets.ts), [`export/browser.ts`](../src/lib/visualizations/city-master-plan/export/browser.ts)                                                                                                                                                                                                                                                                                  |
| Automated verification     | [`tests/browser/city-master-plan.spec.ts`](../tests/browser/city-master-plan.spec.ts), [`playwright.city-master-plan.config.ts`](../playwright.city-master-plan.config.ts), engine `*.test.ts` files, [`generator.stress.ts`](../src/lib/visualizations/city-master-plan/engine/generator.stress.ts), [`vitest.city-master-plan-stress.config.ts`](../vitest.city-master-plan-stress.config.ts)                                             |
| Poster pipeline            | [`scripts/render-city-master-plan-poster.mjs`](../scripts/render-city-master-plan-poster.mjs), invoked by `npm run city-master-plan:poster`                                                                                                                                                                                                                                                                                                 |
| Static media               | [`static/images/the-city-that-refuses-a-master-plan.webp`](../static/images/the-city-that-refuses-a-master-plan.webp), `static/wordcloud/the-city-that-refuses-a-master-plan.svg`, `static/wordcloud/manifest.json`                                                                                                                                                                                                                         |

## 4. Engine architecture

The generator is deterministic and hierarchical:

```text
versioned config + seed
        │
        ├─ named random streams (boundary, fabric, occupation, infrastructure,
        │                        repair, details, name)
        │
        ├─ boundary portals + exact anchor footprint/frontage constraints
        │
        ├─ fabric simple-tiled WFC
        │    lanes, roads, tram track, parcels, open ground, ponds
        │
        ├─ occupation simple-tiled WFC
        │    houses, shops, services, landmarks, obstructions
        │    constrained by the collapsed fabric beneath and frontage beside it
        │
        ├─ deterministic elevation and infrastructure survey
        │    drains, culverts, wires, poles, ghats, bridges
        │
        ├─ graph/parcel/drain/tram analysis
        │
        └─ scores, report, name, fingerprint, event log and exports
```

The first two layers are genuine simple-tiled WFC passes. Every cell contains a compact bitset of
legal rotated variants. Compatibility masks are precomputed for each direction. A socket is a
structured value—passage, water, drain, boundary face, and clearance—not a decorative string.
Propagation repeatedly intersects a neighbour’s possibilities with the union of candidates allowed
by the current cell until it reaches a fixed point.

Observation uses weighted Shannon entropy. A deterministic hash breaks otherwise equal-entropy
ties; a seeded stream performs the weighted candidate choice. Event records retain the chosen
effective weight, candidate families, concrete direction-based exclusion reasons, and cells reduced
to one candidate by propagation.

The anchor is not painted onto a finished result. Its footprint constrains the relevant wave,
required substrate is checked, required frontage constrains an adjacent fabric cell, and a
distance-decaying weight field makes the authored local influence visible without turning the
anchor into a hidden master plan.

Backtracking is bounded by the selected civic-patience budget: 24, 8, 1, or 0 returns per pass.
Each pass also has a hard limit of `24 × cell count` observations/backtracks; the combined reported
budget is twice that because fabric and occupation collapse separately. A final seam audit ensures
that an abandoned propagation queue cannot leave an unrecorded incompatible adjacency.

The third layer is **not** represented as another WFC catalogue. After the fabric and occupation
passes have collapsed, deterministic survey code creates an elevation field and infrastructure
details from the real result. Drainage uses a small Dijkstra traversal rooted at a real boundary
outlet and pond banks, then selects source-to-root paths. Wires, poles, ghats, bridges, and collision
exceptions are derived from seeded local rules. This distinction matters: WFC decides substrate and
occupation; the infrastructure survey measures and annotates the collapsed city.

Generation runs in a module Web Worker. Versioned protocol envelopes carry monotonically increasing
request and job IDs, progress batches, completion, cancellation, disposal, and errors. The client
discards stale responses. Starting a replacement synchronous CPU-bound job terminates and replaces
the active Worker so a queued cancellation message cannot allow an obsolete result to win the race.

## 5. Tile catalogue

The authored catalogue is compact enough to inspect and large enough to produce varied local
geometry:

| Pass       | Prototypes | Rotated variants | Families                                                                                                                                       |
| ---------- | ---------: | ---------------: | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Fabric     |         19 |               50 | buildable parcel, open/tree ground, lane/road/footpath straights and turns, tees/crossings/transitions, tram road, pond interior/bank/corner   |
| Occupation |         17 |               53 | empty/partial parcel, five house forms, sweet shop, tea stall, garage, workshop, temple, tree, sand pile, flyover pillar, tram stop, pond ghat |

Variant weights are transformed by user settings:

- density changes occupied versus empty/open occupation weight;
- landmark frequency changes landmark weight;
- anomaly appetite changes obstruction weight and later survey probabilities;
- high tram preference multiplies tram-fabric weight;
- anchor influence applies an additional distance-decaying local multiplier.

Occupation candidates must be admitted by the actual fabric substrate. Oriented entrances,
shopfronts, and garage doors also require compatible pedestrian or vehicle frontage in the adjacent
fabric cell.

## 6. Municipal patch algorithm

A municipal patch is a compatible local adapter with an explicit reason, not a silent relaxation.
It is used in two situations:

1. a fabric or occupation contradiction remains after the permitted backtracks, or the hard budget
   is exhausted; or
2. the post-collapse infrastructure survey finds a concrete local collision such as an uphill
   drain, tram beside a garage, pole beside a verandah, pond crossing, sand obstruction, or building
   around a pillar.

For a WFC contradiction, the engine:

1. derives the four demanded exterior socket signatures from the neighbouring wave;
2. combines those demands with local conflict tags;
3. selects the most specific applicable anomaly family;
4. downweights an already repeated family when several specific choices apply;
5. uses a repair-specific seeded random stream to choose deterministically;
6. copies every demanded edge into `selectedEdges`, assigns severity, rule text, narrative key, and
   renderer variant;
7. records a patch event and exempts that cell from ordinary propagation while retaining a fallback
   catalogue tile for the base drawing.

`construction-tarpaulin` is the universal last adapter only when no specific authored anomaly
applies. Patch IDs include pass, coordinate, and a deterministic hash suffix. Analysis applies a
patch’s selected edges before building network and frontage graphs, so a report never pretends the
unrepaired base socket is the effective city.

The nine recorded anomaly families are balcony over lane, lane through bedroom, pole through
verandah, uphill drain, tram through garage, pond-lane bridge, permanent sand occupation, building
around pillar, and construction tarpaulin. Severity is family-specific and ranges from 2 to 8.

## 7. Permanent URL and version schema

Topology is serialized entirely in the query string:

| Parameter    | Meaning                   | Serialized values                                           |
| ------------ | ------------------------- | ----------------------------------------------------------- |
| `v`          | generator version         | `1`                                                         |
| `seed`       | deterministic seed        | printable text, trimmed, at most 80 characters when parsing |
| `anchor`     | anchor family             | one of the ten public anchor IDs                            |
| `ax`, `ay`   | zero-based anchor cell    | integers, clamped to the chosen grid and footprint          |
| `r`          | clockwise quarter-turn    | `0`–`3`, restricted to the anchor’s authored rotations      |
| `size`       | grid dimensions           | `18x14`, `24x18`, `32x24`                                   |
| `patience`   | backtrack budget          | `24`, `8`, `1`, `0`                                         |
| `guarantees` | minimum-guarantees hybrid | `1` or `0`                                                  |
| `density`    | building density          | `open`, `balanced`, `dense`                                 |
| `landmarks`  | landmark frequency        | `scarce`, `balanced`, `frequent`                            |
| `appetite`   | anomaly appetite          | `restrained`, `balanced`, `enthusiastic`                    |
| `tram`       | tram preference           | `ordinary`, `high`                                          |

The parser accepts named aliases for sizes and patience, reports malformed fields visibly, clamps
coordinates, and explicitly rejects unsupported generator versions before offering recovery to v1.
The canonical article URL intentionally has no query string. A shared city has all fields above.

`CityResult` uses `schema: "suvro-city-result-v1"` internally; the portable JSON download uses
`schema: "suvro-city-v1"`. The fingerprint covers topology-affecting config and the generated
fabric, occupation, infrastructure, and patch data. Theme, pan/zoom, mode, reveal speed, and other
display state are excluded.

## 8. Scores

Both published scores are independently computed on a 0–100 scale. A high functional score is good;
a high calamity score means more conspicuous retrospective permission.

### Functional score

| Component                 | Maximum | Definition                                                                               |
| ------------------------- | ------: | ---------------------------------------------------------------------------------------- |
| Walkable network          |      30 | largest connected walkable component ratio                                               |
| Occupied frontage         |      20 | fraction of occupied parcels with actual frontage                                        |
| Drainage                  |      15 | outlet-connected fraction less uphill and broken fractions                               |
| Border and tram coherence |      15 | 65% reached-exit ratio plus 35% tram continuity                                          |
| Reachable service variety |      10 | 70% reachable-service fraction plus 30% reachable-family fraction                        |
| Open-space balance        |      10 | open/occupied balance around a 22% target, pond access, and a bounded tree-presence term |

Visible deductions are capped at 28 points and include isolated occupations, route obstructions,
severe exceptions, and an additional penalty if no boundary exit joins the main network.

### Municipal-calamity score

| Component                           | Maximum | Definition                                                                            |
| ----------------------------------- | ------: | ------------------------------------------------------------------------------------- |
| Exception severity                  |      35 | saturating severity sum with diminishing returns inside a repeated family             |
| Exception diversity                 |      20 | saturating count of distinct exception families                                       |
| Obstructed access                   |      15 | route obstructions and half-weighted isolated occupations, normalized by network size |
| Drainage trouble                    |      15 | uphill, broken, and partially weighted trapped drain segments                         |
| Transit discontinuity               |      10 | stranded tram segments relative to tram-network size                                  |
| Utility and indoor-route collisions |       5 | utility collisions plus extra weight for a lane ending indoors                        |

The UI shows each rounded component and its evidence sentence. Labels are bands, not separate
calculations. For example, functional 50–69 is “Usable with local knowledge”; calamity 16–35 is
“Ordinary civic improvisation”.

## 9. Accessibility and responsive behaviour

- The interactive Canvas has a keyboard-focusable interaction layer with an accessible name that
  includes the city and selected coordinate.
- Arrow keys move the placement cursor, `R` rotates an anchor, Space commits placement, and Enter
  selects a cell and opens/focuses its inspector. Focus-visible styles are retained.
- Pointer placement, panning, pinch/zoom, wheel zoom, and explicit Fit controls coexist with the
  keyboard path.
- Status changes use a concise live region. Progress and mode controls expose semantic button,
  toolbar, group, pressed, busy, and disabled states rather than relying on colour.
- The expandable accessible report restates city size, anchor, network access, frontage, drainage,
  both scores, feature counts, every municipal exception with one-based coordinates, and the
  selected-cell description.
- With JavaScript disabled, the workbench is hidden through `@media (scripting: none)` while the
  article, dedicated poster, premise, and regression-checked canonical report remain.
- A Canvas-initialisation error leaves the static poster and text report available.
- Reduced-motion and the site Still preference skip the animated reveal. Ambient steam, water, and
  wires can also be disabled independently.
- Night and high-contrast themes change both HTML controls and the Canvas palette. Information is
  not encoded only in animation or colour.
- At 360 CSS pixels the anchor palette scrolls horizontally and the inspector becomes a sticky,
  collapsible bottom sheet. Escape closes it and returns focus. The tablet layout keeps the map at
  full width with outcomes below in two columns.
- Touch controls have at least 44 CSS-pixel targets, and the browser suite checks document,
  laboratory, workbench, map, and report-rail overflow.

## 10. Performance

The generator remains off the main thread in normal browser use. The following warm timing-only
run used the final engine on the implementation machine. Each row reports seven deterministic sample
runs and is therefore an engineering check, not a universal device guarantee.

| Grid              | Cells |     Minimum |      Median | p95 / maximum |        Mean |
| ----------------- | ----: | ----------: | ----------: | ------------: | ----------: |
| Small, 18 × 14    |   252 |   101.04 ms |   111.66 ms |     116.49 ms |   110.26 ms |
| Standard, 24 × 18 |   432 |   260.92 ms |   294.08 ms |     474.55 ms |   341.45 ms |
| Large, 32 × 24    |   768 | 1,206.12 ms | 1,263.48 ms |   1,377.89 ms | 1,274.49 ms |

The opt-in stress suite generated 320 varied Standard cities in 153.90 seconds and checked
termination, exact size, finite bounded scores, resolved tile arrays, valid fingerprints, and final
seam compatibility. The canonical warm run was approximately 484 ms in a separate measurement.

Renderer work is split into a largely static base Canvas and a lighter interaction/overlay Canvas.
Device pixel ratio is bounded for live rendering. Export uses a separate deterministic renderer:
the metadata-complete map is 3200 × 2400, while the metadata social card is a 1600 × 1200
composition. Both are 4:3 and carry city identity and score context.

## 11. Automated tests and results

### Unit and property tests

`npm run city-master-plan:test`

- **48 tests passed across 9 files.**
- Coverage includes bitset boundaries and cloning; rotations and structured socket compatibility;
  precomputed masks; entropy propagation; exact contradiction cells; bounded backtracking; patch
  fallback; all nine repair families; repetition penalties; every public anchor; real substrate
  and frontage constraints; anchor weight influence; URL round trips and malformed values;
  deterministic topology/fingerprint/report/export; scoring behaviour; pond seam regression;
  Worker envelope validation and stale response rejection; and varied seed/mode termination.

`npm run city-master-plan:stress`

- **2 opt-in stress tests passed.**
- The principal matrix covered **320 Standard cities**.

`npm run check`

- **0 errors and 0 warnings.**

### Browser tests

`npm run city-master-plan:browser:test`

The Playwright specification contains **13 scenarios**:

1. SSR poster, canonical no-JS facts, hydration, canonical seed, Canvas colour output, and canonical
   link;
2. real pointer placement and generation;
3. keyboard move, rotate, commit, and generation;
4. Lab pause, single-step, finish, and Enter-to-inspector;
5. full-city snapshot reproduction after a hard reload;
6. malformed query recovery and unsupported-version handling;
7. copy/share fallback with the exact permanent URL;
8. valid JSON, social PNG, and high-resolution PNG downloads;
9. distinct locally recomputed challenge, score deltas, and rematch;
10. 360-pixel mobile layout and touch/overflow contract;
11. tablet map/outcome layout;
12. OS reduced motion and site Still behaviour;
13. JavaScript-disabled article, poster, premise, and canonical report.

The final consolidated production-preview run passed **13 of 13 scenarios in 51.3 seconds**.

Runtime tests collect uncaught page errors plus console warnings/errors and fail on unexpected
diagnostics. Local Vercel analytics URLs are the only intentionally ignored preview noise.

## 12. Build and content validation

`npm run build:site` completed successfully after the final poster and regenerated word cloud were
included. The production bundle includes the article route and Worker. Build output contained only
known non-blocking warnings:

- local preview cannot serve Vercel’s `/_vercel/image` endpoint;
- optional platform packages are unavailable on this Windows development host;
- the existing general chunk-size advisory.

The feature-specific unit suite, stress suite, Svelte/type check, production build, and browser
matrix all have passing evidence as described above. The final repository content, resources,
contrast, SEO, media, link, and discoverability validators all pass. The word cloud and its manifest
were regenerated after the final article text and media were in place.

`npm run city-master-plan:poster` makes the lead image reproducible from the feature itself. The
script loads the canonical city from the production preview, waits for local generation to complete,
and downloads the renderer’s metadata-complete 1600 × 1200 PNG to
`artifacts/city-master-plan/canonical-poster.png`. Sharp then derives the checked-in 1200 × 900 WebP
at `static/images/the-city-that-refuses-a-master-plan.webp`; the final WebP is 114,336 bytes. Media
and content validation were run after this derivation.

Feature-scoped Prettier and ESLint checks pass. The repository-wide `npm run lint` cannot be claimed
as passing: after the generated `test-results` artifact was removed, it stopped during its Prettier
stage on 21 unrelated, pre-existing off-format files elsewhere in the repository. This feature does
not suppress or reformat those unrelated files.

No production deployment was performed as part of this implementation report. The repository
retains its existing Vercel deployment path.

## 13. Honest limitations

- This is an explanatory toy model, not a cadastral, transport, socioeconomic, accessibility, or
  hydrological planning tool. A 24 × 18 tile grid cannot substantiate claims about real Calcutta.
- Fabric and occupation are simple-tiled WFC. Utilities are a deterministic post-collapse survey
  and rule system, not a third large WFC catalogue. Describing all three as WFC would be inaccurate.
- Drainage uses a seeded scalar elevation field and local graph costs. “Connected to outlet” means
  connected in this toy graph, not sized, graded, or flood-safe engineering infrastructure.
- Route connectivity is an edge-compatible cell graph. It does not model distance, travel time,
  capacity, kerbs, slopes, rights-of-way, or individual mobility needs.
- The occupation pass uses parcel and adjacent-frontage rules, not multi-cell building plans.
  Municipal patches explain incompatible local edges; they do not solve land tenure or legality.
- Worker generation is CPU-bound and synchronous inside one Worker job. A queued `CANCEL` message
  cannot interrupt that call mid-stack, so hard cancellation terminates and replaces the Worker.
  Job IDs and stale-result filtering provide correctness rather than cooperative pre-emption.
- The friendly challenge is local and deterministic. There is no server, account, leaderboard,
  global rank, or anti-cheat claim.
- The Canvas is not represented as hundreds of focusable screen-reader cells. The supported
  nonvisual interface is the complete text report plus selected-cell inspector, which is far less
  noisy but not spatially equivalent to tactile exploration.
- The Lab replay preserves the genuine event order, decision-time entropy, chosen candidate
  evidence, and propagation results. To keep the result and event log bounded, it does not retain
  every historical candidate set or reconstruct every reverted variant visually after a backtrack;
  the replay is therefore an honest decision trace, not a frame-perfect recording of all transient
  wave states.
- Standard generation met the intended interactive budget on the implementation machine. Large
  generation had a median of 1.26 seconds there and will be slower on low-power devices.
- A shared v1 URL is permanent only while the repository preserves the v1 generator. The explicit
  version is the compatibility boundary; future algorithms must use a new version rather than
  silently changing v1 fingerprints.

## 14. Screenshots and fixed references

Screenshots are browser-level evidence captured from the production preview. The links remain stable
under `artifacts/city-master-plan/`:

- [Canonical sweet-shop city](../artifacts/city-master-plan/canonical-sweet-shop.png)
- [Pond-in-the-middle trial](../artifacts/city-master-plan/pond-in-the-middle.png)
- [Tram-through-garage exception](../artifacts/city-master-plan/tram-through-garage.png)
- [Uphill-drain exception](../artifacts/city-master-plan/uphill-drain.png)
- [360-pixel mobile layout](../artifacts/city-master-plan/mobile-360.png)
- [Lab entropy and socket view](../artifacts/city-master-plan/lab-entropy.png)

The canonical v1 city is the query-free article default:

| Fact                | Value                                                                                          |
| ------------------- | ---------------------------------------------------------------------------------------------- |
| Seed                | `monsoon-tram-184`                                                                             |
| Name                | Jute Sand Para 274                                                                             |
| Fingerprint         | `9F16-B94E`                                                                                    |
| Scores              | functional 66; calamity 34                                                                     |
| Walkable network    | 296 cells; 3 components; largest 288; all 3 boundary exits reached; 2 dead ends                |
| Occupation/frontage | 204 occupied; 196 accessible; 123 of 148 services reachable; 3 of 3 service families reachable |
| Drainage            | 121 of 121 segments outlet-connected; 0 trapped; 0 broken; 3 uphill                            |
| Other               | 29 trees; 61 open-space cells; 13 route obstructions                                           |
| Exceptions          | two severity-7 lane-through-bedroom patches, at column 1 row 2 and column 6 row 5              |

Fixed guided references:

| Trial                | Permanent reference                                                                                                                                                                                                                                                                                                                                                                                                    | Fingerprint | Function / calamity |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------: |
| Sweet-shop attractor | [`?v=1&seed=sweet-shop-attractor-184&anchor=sweet-shop&ax=12&ay=9&r=0&size=24x18&patience=8&guarantees=0&density=balanced&landmarks=balanced&appetite=balanced&tram=ordinary`](../blog/visualizations/the-city-that-refuses-a-master-plan?v=1&seed=sweet-shop-attractor-184&anchor=sweet-shop&ax=12&ay=9&r=0&size=24x18&patience=8&guarantees=0&density=balanced&landmarks=balanced&appetite=balanced&tram=ordinary)   | `34B7-7762` |             50 / 63 |
| Tram versus garage   | [`?v=1&seed=tram-versus-garage-62&anchor=tram-stop&ax=7&ay=1&r=0&size=24x18&patience=1&guarantees=0&density=balanced&landmarks=balanced&appetite=enthusiastic&tram=high`](../blog/visualizations/the-city-that-refuses-a-master-plan?v=1&seed=tram-versus-garage-62&anchor=tram-stop&ax=7&ay=1&r=0&size=24x18&patience=1&guarantees=0&density=balanced&landmarks=balanced&appetite=enthusiastic&tram=high)             | `A76E-A8CE` |             35 / 75 |
| Pond in the middle   | [`?v=1&seed=pond-in-the-middle-417&anchor=pond&ax=11&ay=7&r=0&size=24x18&patience=8&guarantees=0&density=dense&landmarks=balanced&appetite=balanced&tram=ordinary`](../blog/visualizations/the-city-that-refuses-a-master-plan?v=1&seed=pond-in-the-middle-417&anchor=pond&ax=11&ay=7&r=0&size=24x18&patience=8&guarantees=0&density=dense&landmarks=balanced&appetite=balanced&tram=ordinary)                         | `64CC-3AFB` |             47 / 59 |
| Flyover precedent    | [`?v=1&seed=flyover-precedent-91&anchor=flyover-pillar&ax=12&ay=9&r=0&size=24x18&patience=1&guarantees=0&density=dense&landmarks=balanced&appetite=enthusiastic&tram=ordinary`](../blog/visualizations/the-city-that-refuses-a-master-plan?v=1&seed=flyover-precedent-91&anchor=flyover-pillar&ax=12&ay=9&r=0&size=24x18&patience=1&guarantees=0&density=dense&landmarks=balanced&appetite=enthusiastic&tram=ordinary) | `C423-43CA` |             62 / 69 |
| Immortal sand pile   | [`?v=1&seed=immortal-sand-pile-37&anchor=sand-pile&ax=12&ay=9&r=0&size=24x18&patience=8&guarantees=1&density=balanced&landmarks=balanced&appetite=enthusiastic&tram=ordinary`](../blog/visualizations/the-city-that-refuses-a-master-plan?v=1&seed=immortal-sand-pile-37&anchor=sand-pile&ax=12&ay=9&r=0&size=24x18&patience=8&guarantees=1&density=balanced&landmarks=balanced&appetite=enthusiastic&tram=ordinary)   | `8F89-F711` |             63 / 67 |

The article’s WFC background links to primary implementations and research:

- [mxgmn/WaveFunctionCollapse](https://github.com/mxgmn/WaveFunctionCollapse)
- [Paul Merrell, _Model Synthesis_](https://graphics.stanford.edu/~pmerrell/thesis.pdf)
- [Isaac Karth and Adam M. Smith, “WaveFunctionCollapse is Constraint Solving in the Wild”](https://escholarship.org/uc/item/1f29235t)
