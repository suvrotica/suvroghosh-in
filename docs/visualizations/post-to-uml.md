# Post to UML: Draw in UML from Any Text or Article

## Routes & Discovery

- **Canonical Visualization & App Route:** `/blog/visualizations/post-to-uml`
- **Short Alias Redirect:** `/viz/uml` (`308` permanent redirect to `/blog/visualizations/post-to-uml`)
- **Collections:** Indexed in `/blog/visualizations` and `/blog/apps` (`collections: ["apps"]`).
- **Server API Endpoint:** `/api/uml` (`GET` for AI configuration status and published post loader; `POST` for bounded local or AI-backed UML generation).

## Architecture & Five-Stage Pipeline

Post to UML separates language-model/prose interpretation from deterministic diagram rendering across five stages:

1. **Interpret the article (`src/lib/visualizations/post-to-uml/extractor.ts`)**:
   - Segments plain text or Markdown into numbered paragraph spans (`UmlParagraphSpan`) with character offsets.
   - Performs section-preserving extraction for long articles (up to 120,000 code points) so the same concept or classifier is named consistently across all views.
   - Classifies the subject domain (`software`, `conceptual`, `process`, `scientific`, `organizational`) and marks non-software articles as a **Conceptual UML Model**.
   - Treats all pasted text strictly as inert source material so quoted imperatives inside an article cannot override system instructions.
2. **Generate structured metadata and PlantUML source (`src/lib/visualizations/post-to-uml/generator.ts`)**:
   - Produces standalone `@startuml ... @enduml` code (without Markdown fences) plus title, reader explanation, caption, `alt` text, paragraph evidence quotes, and explicit assumptions.
3. **Validate and repair PlantUML source (`src/lib/visualizations/post-to-uml/plantuml/security.ts`, `parser.ts`, `repair.ts`)**:
   - Blocks file and network preprocessor directives (`!include`, `!includeurl`, `!import`, `!pragma`, `%getenv`, `%file_exists`, `%load_json`), inline `<script>`/`<foreignObject>` tags, event handlers, and executable URI schemes (`javascript:`, `data:text/html`).
   - Parses the PlantUML AST and runs up to **2 bounded syntax-repair passes** when recoverable syntax errors occur.
4. **Render deterministically (`src/lib/visualizations/post-to-uml/plantuml/renderer.ts`, `queue.ts`)**:
   - Produces accessible, theme-aware SVG (`<svg role="img" aria-labelledby="...">`) through a bounded render queue (`BoundedRenderQueue`) and rasterizes high-DPI PNG downloads via HTML5 Canvas on demand.
   - Never silently sends unpublished article text or PlantUML code to a public third-party rendering server.
5. **Report status & preserve reader-facing order (`src/lib/components/visualizations/post-to-uml/PostToUml.svelte`, `UmlFigure.svelte`)**:
   - In the Article Preview and exported Markdown/mdsvex bundle, the order is strictly:
     **Original article text → rendered UML figure → explanatory caption (with optional `.puml` source disclosure).**

## 14-Type UML 2.5 Coverage & Renderer Capability Matrix

"Structural diagram", "Behavioral diagram", and "Interaction diagram" appear strictly as family filters and group selectors across the **14 concrete UML 2.5 diagram types**:

| #   | Concrete Diagram Type                             | UML Family               | Renderer Support | Notation & Verification Notes                                                                                                                                                                                    |
| --- | ------------------------------------------------- | ------------------------ | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Class** (`class`)                               | Structural               | Native           | 3-compartment classifier boxes, stereotypes, `--\|>`, `*--`, `o--`, `-->`, `..>`, multiplicities.                                                                                                                |
| 2   | **Object** (`object`)                             | Structural               | Native           | Underlined `instanceName : Classifier` headers, `slot = "value"` rows, and instance links. Requires concrete instances/values unless illustrative assumptions are enabled.                                       |
| 3   | **Package** (`package`)                           | Structural               | Native           | Tabbed folder frames (`package`), member classifiers, and dashed `..>` dependency arrows.                                                                                                                        |
| 4   | **Component** (`component`)                       | Structural               | Native           | UML component boxes (`⧉` icon) with provided lollipop (`--()`) and required socket (`..>`) interfaces.                                                                                                           |
| 5   | **Composite structure** (`composite-structure`)   | Structural               | Composed         | Enclosing classifier frame with boundary `portin`/`portout` squares, internal `[part : Role [mult]]` boxes, and `«delegation»` / `«assembly»` connectors.                                                        |
| 6   | **Deployment** (`deployment`)                     | Structural               | Native           | 3D perspective execution nodes (`node`, `device`, `database`, `executionEnvironment`), deployed `artifact` cards, and communication paths. Reports `Not applicable` when no runtime/physical environments exist. |
| 7   | **Profile** (`profile`)                           | Structural               | Composed         | `«profile»` package containing `«metaclass»` and `«stereotype»` classes connected by solid filled-triangle `«extension»` arrows and constraint notes. Never confused with a user profile.                        |
| 8   | **Use case** (`use-case`)                         | Behavioral               | Native           | Stick-figure actors, labeled system boundary rectangle, elliptical use cases, and `«include»`/`«extend»` relationships.                                                                                          |
| 9   | **Activity** (`activity`)                         | Behavioral               | Native           | Initial node, swimlane partitions, rounded actions, decision diamonds (`[yes]`/`[no]`), concurrent fork/join bars, and bullseye final node.                                                                      |
| 10  | **State machine** (`state-machine`)               | Behavioral               | Native           | Initial/final pseudostates (`[*]`), rounded states with internal `entry / do` compartments, and `trigger [guard] / effect` transitions.                                                                          |
| 11  | **Sequence** (`sequence`)                         | Behavioral · Interaction | Native           | Participant headers, vertical dashed lifelines, activation bars, synchronous (`->`) and reply (`-->`) arrows, and combined fragments.                                                                            |
| 12  | **Communication** (`communication`)               | Behavioral · Interaction | Composed         | Spatial participant network without vertical lifelines; links carry hierarchical Dewey-decimal sequence numbers (`1:`, `1.1:`, `2:`) and direction arrows.                                                       |
| 13  | **Interaction overview** (`interaction-overview`) | Behavioral · Interaction | Composed         | Activity control skeleton whose nodes are pentagon-tabbed `ref` and `sd` interaction frames connecting named multi-participant interactions.                                                                     |
| 14  | **Timing** (`timing`)                             | Behavioral · Interaction | Native           | Horizontal time axis (`@0`, `@10`, ...), `robust` step-waveforms and `concise` state ribbons, and `{t1..t2}` duration constraints. Reports `Needs more information` when prose omits durations or time ticks.    |

## Environment Configuration

Local deterministic text-to-UML extraction, manual PlantUML editing, SVG/PNG rendering, and existing blog post loading work out of the box with zero external credentials.

To enable optional server-side AI provider extraction via `/api/uml`, configure in `.env`:

```bash
UML_AI_ENABLED=true
UML_AI_MODEL=nvidia/nemotron-3.5-lightning-free
UML_RATE_LIMIT_SALT=<at least 32 random characters>
AI_GATEWAY_API_KEY=<optional locally; Vercel injects VERCEL_OIDC_TOKEN>
```

## Blog Export Workflow

1. Click **Copy Blog Embed (mdsvex)** to copy `<UmlFigure ... />` markup for a single diagram or the full appended diagram section.
2. Click **Export Asset & Embed Bundle (`.zip`)** to download a ready-to-commit archive containing:
   - `static/images/uml/<slug>/<slug>-<type>.svg`
   - `static/uml/<slug>/<slug>-<type>.puml`
   - `embed-snippet.md`
   - `<slug>-with-uml.md`
   - `manifest.json`
