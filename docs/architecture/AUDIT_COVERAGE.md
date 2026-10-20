# Architecture audit coverage

Audit date: **20 October 2026**. Application baseline:
`2a31d9a33bf305354c9e159f45257074f6f8c8f0` (`main`, fetched from GitHub before the audit).
Inventory counts exclude this documentation/enforcement change. The working tree was clean at
baseline; older local staged article work had been saved in a recovery stash before syncing.

This is a repository-wide architectural investigation with whole-tree inventories, static scans,
compiler checks, targeted deep reading, history and local probes. It is **not a manual line-by-line
proof of every algorithm or an exhaustive runtime/security certification**. The distinction matters
for a repository containing several hundred thousand source lines and generated corpora.

## Inventory and method

`git ls-files -z` enumerated **6,188 tracked files**. NUL-delimited UTF-8 enumeration was used for
final asset counts so non-ASCII filenames were not mistaken for Git's quoted output. Installed
versions were read from local package manifests and compared with the lockfile; all 70 direct
dependency versions matched their lock entries.

| Area                                                                           | Baseline inventory                                                                                                            | Examination                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/routes/`                                                                  | 92 files: 37 Svelte, 54 TypeScript, one CSS                                                                                   | All 45 server loads/actions/endpoints read; all nine universal option/load files read; all route component scripts and rendering structure scanned, shared/specialized/interactive routes read deeply. All 37 route components compiled with the installed compiler after TypeScript preprocessing: zero warnings/errors. |
| `src/lib/server/`                                                              | 16 files: 13 production, two tests, one generated registry                                                                    | All hand-authored modules/tests read. Generated dimensions generator/shape examined, not every image record.                                                                                                                                                                                                              |
| `src/lib/components/`                                                          | 427 files, 423 code files                                                                                                     | Whole-area static scan; shared composition/state/lifecycle boundaries and high-risk feature controllers read deeply. Count includes non-Svelte helpers and tests.                                                                                                                                                         |
| `src/lib/visualizations/`                                                      | 916 files, 879 code files                                                                                                     | Every domain inventoried and source scanned for imports, state, browser APIs, network/storage, casts, exposed HTML, lifecycle and size. Representative engine/worker/controller contracts and risky sections read deeply. Generated corpora inspected structurally.                                                       |
| `src/lib/games/`                                                               | 133 files, 131 code files                                                                                                     | All four domains inventoried/scanned; catalog and representative controllers, simulation/persistence/lifecycle/test seams examined.                                                                                                                                                                                       |
| `src/lib/notes/`                                                               | 19 TypeScript files                                                                                                           | Shared schema/model/state/offline/history/geometry/export/read-render boundaries examined; related server/UI flows traced.                                                                                                                                                                                                |
| `src/lib/motion/`, `attachments/`, `utils/`                                    | 12, two, three files respectively                                                                                             | Source scanned; global preference/state ownership and representative attachment/controller cleanup read.                                                                                                                                                                                                                  |
| `src/lib/content/`                                                             | 12 files: ten TS, one JS, one JSON                                                                                            | All contracts/path/taxonomy/publication/series/reading-path definitions read; script consumers compared.                                                                                                                                                                                                                  |
| `src/lib/topics/`                                                              | 14 files: nine Markdown including README, five TS                                                                             | Schema/authoring/registry/test contracts read; all topic content inventoried and import-scanned.                                                                                                                                                                                                                          |
| Active editorial content                                                       | 702 post Markdown files; nine prompts; ten lists; eight headquarters                                                          | All 729 active Markdown documents scanned for script/import boundaries; 31 have script blocks; zero explicit server/private imports found. Metadata/generator validation paths and representative ordinary/notebook/folio/interactive documents examined. Prose was not individually fact-checked.                        |
| `src/lib/generated/`, `data/`, `notebooks/`, `config/`, `sketches/`, `assets/` | Three, ten, two, one, one, two files respectively                                                                             | Producer/consumer and source-vs-generated responsibilities traced; notebook source/HTML and authoring configuration examined structurally. Binary assets were not visually reviewed.                                                                                                                                      |
| `scripts/`                                                                     | 98 files, 92 code files                                                                                                       | All inventoried/function/import-scanned. Deep reading of build orchestration, primary content/media/search/SEO/link/metadata/notebook/wordcloud generators and validators, test orchestration and enforcement gaps. Not every scientific asset renderer was manually proved.                                              |
| Tests/configuration                                                            | 350 baseline test/spec files: 293 source, 23 script, 34 browser; 30 root Playwright configs                                   | Collection/configuration coverage compared with package scripts. Main Vitest selects 283 source files; custom ray-marching/Human+AI ICU configs select the other ten. All root configs inventoried and execution modes compared.                                                                                          |
| `supabase/`                                                                    | Four files; migration has 1,104 lines plus cron SQL                                                                           | Full migration/cron, development config, RLS/grants/RPC/session/publication/storage contracts read. No live database connection or migration execution.                                                                                                                                                                   |
| Root framework/tool files                                                      | package/lock, Svelte/Vite/TS/Vitest/ESLint/Prettier/Vercel, Python requirements, Pixi                                         | Manifests/configuration read, installed versions verified, relevant history traced. No dependency vulnerability/advisory scan claimed.                                                                                                                                                                                    |
| `.github/workflows/`                                                           | Three original workflows                                                                                                      | All read: CT regression, double-pendulum regression, IndexNow deployment automation. New architecture workflow reviewed/tested separately.                                                                                                                                                                                |
| `docs/`                                                                        | 104 files including captures/CSV/JSON                                                                                         | Full documentation inventory; current feature/authoring guidance, Notes design, visualization/motion design, SEO/discoverability and relevant dated security/build evidence examined. Historical traffic tables/captures were not re-collected.                                                                           |
| Agent/contribution entry points                                                | Root local AGENTS, scoped gastropod AGENTS, two tracked authoring skills; no CONTRIBUTING/PR template/ADR directory initially | Read applicable instructions and discovered root AGENTS was excluded by local `.git/info/exclude`. Existing scoped boundaries respected. New policy creates versioned entry points.                                                                                                                                       |
| `static/`                                                                      | 2,449 public files                                                                                                            | Classified asset formats/source families; bootstrap, crawler/offline/image/notebook delivery boundaries examined. No visual/audio/video review of every asset; 60 MP4s and other binaries treated as data.                                                                                                                |
| Retained content/evidence                                                      | 231 `SavedPosts` files, 462 backup Markdown files, 341 `artifacts` files                                                      | Inventory plus references/exclusion scans. Active registry excludes retained editorial directories; some BZ evidence is deliberately consumed by build checks. No blanket dead-code/deletion conclusion.                                                                                                                  |

Inventory areas overlap (for example colocated tests and generated feature data); rows are not
intended to add up to the repository total.

## Every frontend domain was included in inventory/static scans

Component groups: animation, blog/raw-thought, games, home, images, layout, motion, notes,
resources, search, SEO, sketch-museum, topics, TTS, UI adapters, visual and visualizations.

Game domains: Calcutta Footpath, crossword, Kagojer Dana and period board games, plus catalog.

Visualization domains: artificial-life, Barnum Lab, Bias Archipelago, Brownian motion, BZ,
Chitin Engine, City Master Plan, CT reconstruction, domain coloring, double pendulum, shader
experiments (hello-fragment/ray-marching), fertilization-calcium-atlas, Fractal Atlas,
gastropod-shell-lab, gradient descent, homeodynamics, Human+AI ICU, invisible weather,
lightning atlas, living pigment, Meaning & Connection Map, Monte Carlo, neuron zoo,
Observable notebooks, Perlin Bloom, Prior Authorization, random matrix, reaction diffusion,
spacetime laboratory, Strange Attractor Orchestra, Weather Inside the Nucleus, and common
registry/runtime/types.

The frontend-specific scan covered **1,487 TS/JS/Svelte files / 444,561 physical lines**, including
292 test/spec/benchmark files and the large colocated Barnum generated corpus. It excluded
server modules, the top-level generated directory and article content. Every **406 library
Svelte component** compiled with zero errors/warnings. Deep reads concentrated on Notes
integration, theme/motion, shared shells, full Meaning Map source, gastropod's enforced core
boundaries, representative game lifecycle controllers, and Fractal import/persistence sections.
Compiler analysis was non-emitting; it was not a browser interaction or accessibility audit.

## Module graph and semantic duplication

An ad hoc TypeScript-AST graph read **1,307 non-test, non-declaration TS/JS/Svelte modules**,
excluding type-only edges. It extracted 3,056 references and resolved 2,561 local edges, with no
unresolved local code imports in that model. Five strongly connected runtime groups were bounded
UI adapters: badge, button, sheet, tabs and tooltip. Their barrel-defined variants are imported
back into components. No initialization failure was demonstrated, so no cycle defect was counted.

Limits: literal static imports/reexports and literal dynamic imports only; no expansion of
`import.meta.glob`, mdsvex helper injection, nonliteral imports or dependency packages. `?raw`
shader/source imports were treated as data after inspection, not runtime cycles. Therefore this
does not prove the entire effective build graph is acyclic.

Semantic comparisons followed URL/alias/category normalization through runtime and Node scripts;
notes form/schema/SQL constraints; full specimen versus core fractal validation; independent map
view-state mutation paths; and feature test aggregation. Deliberate distinct renderers, metadata
versus full-text search and public versus private notes reads were not counted as duplication.

## Historical evidence examined

| Commit                             | Evidence used                                                              |
| ---------------------------------- | -------------------------------------------------------------------------- |
| `a56d0791`                         | Build/site split introduced to avoid recursive Vercel build.               |
| `b6175ba3`, `61fb0087`             | Meaning Map introduction and fullscreen/SEO wrapper adaptation.            |
| `e358bfb3`, `b3a6a10f`, `2a31d9a3` | Relationship handling fix, revert and reapplication at the audit baseline. |
| `07ac49df`                         | Notes repository/snapshot feature history.                                 |
| `96870910`                         | Intentional recovery/auth referrer-policy correction.                      |
| `3b39f5d5`, `955043b4`, `0c996749` | TTS/contact evolution and existing resource-control context.               |
| `99f818e8`                         | Image-optimizer changes examined against current preservation claims.      |
| `674af9b5`, `06d5ba37`             | Focused CT/pendulum regression workflow growth.                            |

History was targeted by path and relevant changes, not a manual review of every historical commit.
The August security report independently records earlier TTS/contact issues. Root causes not
directly established by code/history are explicitly marked as inferred in the findings.

## Unverified or excluded execution areas

- No live provider speech generation/contact delivery, real owner login, production notes write,
  database migration, credential inspection or destructive fixture against hosted data.
- No production Supabase/RLS role execution, database races, storage grant verification, hosted
  auth settings, Vercel override/branch-protection/Actions-state inspection or deployment claim.
- No full visual/browser matrix, GPU benchmark, numerical/scientific proof or per-asset content QA.
  The source-level notebook iframe versus blanket deployment framing-header tension needs a
  deployed-header/browser check before concluding compatibility.
- No full production build: it runs generators that can rewrite source media and tracked output.
  Documentation/enforcement does not require those unrelated transformations.
- No complete aggregate `npm test` or every browser suite. The default unit collection, focused
  reproductions, compiler/type checks and new gate fixtures were used; the report records failures
  and omitted custom/browser execution explicitly.

Read [the validation record](FORENSIC_AUDIT.md#validation-record) for actual command outcomes.
