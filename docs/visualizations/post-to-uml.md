# Post to UML

Post to UML turns article text into editable PlantUML, renders it locally, and
exports saved figures for the existing Markdown/mdsvex blog workflow. The current
implementation and verification boundaries below were reviewed on 28 October 2026.
See [ADR 0020](../architecture/decisions/0020-post-to-uml-browser-engine.md).

## Routes and modes

- Canonical app: `/blog/visualizations/post-to-uml`, also indexed in `/blog/apps`.
- Alias: `/viz/uml` redirects to the canonical page with HTTP 308.
- API: `GET /api/uml` returns availability, limits, and post choices;
  `GET /api/uml?post=<slug>` loads article prose; `POST /api/uml` accepts a bounded
  local or owner-authorized AI generation request.

The existing-post loader uses server-only build-time raw Markdown imports and the
canonical published-post registry. It does not depend on a deployed `src/` folder
or substitute curated examples for missing posts. Only front matter is removed;
the remaining source, including CRLF and inert mdsvex markup, is preserved.

Paste plain text or Markdown, optionally supply a title, and choose Recommended,
Selected types, or All 14. Recommended mode may return zero to three useful types.
Selected and All-14 modes retain one evaluation per requested type, including
specific missing-information, not-applicable, or failed outcomes. One evaluation
currently holds one figure; automatic splitting into several figures of the same
type is not implemented.

Generation therefore returns at most 14 figure records per run. The export helper
has a separate 28-record safety cap; that larger archive limit does not imply that
multi-figure generation is available in the current interface.

Structural, Behavioral, and Interaction are family filters. Interaction is a
subset of Behavioral, not a third independent family or extra diagram type.
Simple and Detailed change the displayed subset, not the factual assumptions.

The default local mode is **heuristic extraction, not AI**. Its exact supported
patterns and omissions are documented in [Local model limits](post-to-uml-local-model.md).
It does not synthesize missing architecture or timings. Manual editing and labeled
examples remain available without provider credentials. Optional AI mode sends the
full bounded article and all numbered source paragraphs to Vercel AI Gateway only
after explicit consent and owner authorization.

## Authoring and publication workflow

1. Generate from the article or load an example. Inspect the diagram type,
   explanation, assumptions, and exact paragraph evidence.
2. Edit PlantUML in the Source tab. Edits are debounced and rendered locally without
   an AI request. A failed edit preserves its exact text; a retained earlier image
   is labeled as the last successful version.
3. Review the caption, alternative text, assumptions, and evidence after source or
   metadata edits. Edited figures remain excluded from publication until the author
   confirms that review. Regeneration requires an explicit replacement choice for
   manual work.
4. Use the article preview to inspect the saved input revision followed by reviewed
   figures and captions. Changing the editor input does not silently attach old
   diagrams to new article text. Cancel aborts requests, terminates active renderer
   work, removes queued work, and retains completed results. Revision guards reject
   late responses.
5. Copy the repository-compatible `<UmlFigure />` embed or export a ZIP. Move the
   supplied assets into the indicated repository paths and publish through the
   normal content workflow. Export does not write to Git, introduce a CMS, or
   publish an article automatically.

The ZIP contains `<slug>-original.md`, the unchanged article plus appended embeds
in `<slug>-with-uml.md`, `embed-snippet.md`, a revision/status/evidence manifest,
standalone `.puml` sources, sanitized SVGs, and PNGs for publication-ready figures.
Incomplete or unreviewed source is retained separately under `drafts/`; its images
are not silently substituted with an older render. Asset paths use:

```text
static/images/uml/<slug>/<slug>-<type>[-<id-revision>].svg
static/images/uml/<slug>/<slug>-<type>[-<id-revision>].png
static/uml/<slug>/<slug>-<type>[-<id-revision>].puml
```

The manifest records input/source revisions, exact file paths, captions, alt text,
assumptions, limitations, evidence, and publication readiness. Revision labels are
deterministic change identifiers, not cryptographic digests or authorization tokens;
publication readiness also requires exact equality with the successfully rendered
source string.

`UmlFigure.svelte` remains auto-imported by the blog's mdsvex configuration. It
renders a saved image, caption, alt text, notation/assumption notes, and optional
source link. Article reading does not invoke AI or the authoring renderer. Pasted
Markdown is safely previewed as content, never compiled as arbitrary Svelte.

The saved-figure component, imported only by Markdown containing its component tag, has no renderer or sanitizer runtime
imports and accepts image `src` values rather than raw preview SVG. Authoring owns
sanitization and `svgImageUrl` conversion before passing an image URL to that
component. This boundary keeps authoring dependencies out of ordinary article
bundles and protects the existing route-asset budgets.

For server execution, `vite.config.ts` bundles `sanitize-html` and its dependency
closure through `ssr.noExternal`. The sanitizer's CommonJS entry requires an
ESM-only parser, which Vercel's Node loader rejected as `ERR_REQUIRE_ESM` even
though ordinary local Node accepted it. Keeping the resolved dependency closure
inside the server bundle avoids that loader boundary and preserves nested locked
versions. Sanitization rules and the browser CSP remain unchanged.

## Actual renderer and capability matrix

The authoring renderer is the official MIT-licensed **`@plantuml/core@1.2026.9`**
TeaVM JavaScript engine with its bundled **Smetana** layout. It is loaded on demand
in a terminable module worker. A detached `linkedom@0.18.12` DOM supports SVG
construction, and `OffscreenCanvas` supplies text measurements. This path needs no
JVM, Graphviz installation, WASM evaluation, public rendering service, or weakened
site CSP. It requires browser support for module workers and OffscreenCanvas.

A new worker announces readiness after its imports, isolated environment and message handler
are initialized. Download/startup has a 60-second limit; diagram source is withheld until that
handshake, after which the unchanged 20-second rendering limit starts. Ready workers are reused.
Cancellation and either timeout terminate the worker and clear its readiness; late messages
from a terminated worker cannot revive cancelled work. This separates a slow first download
from an expensive diagram without extending the time allowed to render untrusted source.

Rendered assets include an explicit light-paper background (`#fcfbf8`) so dark
labels remain readable both as standalone downloads and inside dark application
chrome. The artwork is stable light-paper SVG, not a theme-mutable asset.

The previous custom TypeScript parser/renderer remains a legacy local helper; its
success is not proof of PlantUML compatibility. Every generated nonempty source in
the authoring flow is rendered by the official engine. Neither provider claims nor
legacy parser validation mark that render successful. Official error images are
recognized as errors. The app retains diagnostic errors and source rather than
rewriting unknown syntax to make the custom parser accept it. Automatic
provider-backed syntax repair is not implemented.

All fourteen representative fixtures rendered with the pinned official engine.
This verifies the listed fixture notation, not arbitrary PlantUML syntax or every
possible UML model. “Native” below means native to that identified engine; composed
notation and approximations are explicit.

| Type                 | Family                   | Support                | Verified notation and limits                                                                                                                                                                                   |
| -------------------- | ------------------------ | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Class                | Structural               | Native                 | The fixture exercises compartments, stereotypes, multiplicities, directed association, and composition. Source evidence must justify their use.                                                                |
| Object               | Structural               | Native                 | Underlined instance/classifier headers, slots, and links.                                                                                                                                                      |
| Package              | Structural               | Native                 | Package containers, members, and dependency arrows. Local article-heading groupings are explicitly conceptual.                                                                                                 |
| Component            | Structural               | Native                 | Components, interface circles, and usage dependencies. A dashed dependency is not a required-interface socket.                                                                                                 |
| Composite structure  | Structural               | Composed               | Nested component/part declarations, boundary ports, and labeled assembly/delegation connectors. Collaboration-use ellipses are not exact.                                                                      |
| Deployment           | Structural               | Native                 | Execution-node containers and deployed artifacts; no infrastructure is inferred merely from a place name.                                                                                                      |
| Profile              | Structural               | Composed               | Stereotyped metaclasses/stereotypes in a profile package; `-up->>` gives the verified filled triangular extension toward the metaclass.                                                                        |
| Use case             | Behavioral               | Native                 | Actors, use-case ovals, boundaries, and labeled relationships.                                                                                                                                                 |
| Activity             | Behavioral               | Native                 | Actions, decisions, fork/join flow, and swimlanes. The first swimlane must precede `start`.                                                                                                                    |
| State machine        | Behavioral               | Native                 | States, transitions, and supported labels. Initial/final states or entry actions are not automatically invented.                                                                                               |
| Sequence             | Behavioral / Interaction | Native                 | The fixture exercises lifelines, ordered messages, and replies. Local extraction requires explicit delivery semantics instead of guessing synchronous/asynchronous arrowheads.                                 |
| Communication        | Behavioral / Interaction | Composed               | Spatial participants with directional links and numbered messages; no vertical sequence lifelines.                                                                                                             |
| Interaction overview | Behavioral / Interaction | Composed approximation | Named activity partitions connect interaction descriptions. Their rectangular headers approximate UML `ref`/`sd` frame tabs; they are not exact pentagonal interaction-use frames or nested sequence diagrams. |
| Timing               | Behavioral / Interaction | Native                 | Robust/concise state tracks and time coordinates. Local observations retain source scale, normalized to seconds; illustrative ticks are explicitly labeled.                                                    |

The interaction-overview frame approximation remains a fidelity limitation. The
catalog, authoring interface, and exported notation notes disclose it. The local
extractor's inability to interpret some prose is separate from renderer support.

## AI configuration and authorization

Manual editing, browser rendering, and local heuristics need no AI credentials.
For owner-only AI generation, configure the existing Notes owner authentication and
the private variables documented in `.env.example`:

```dotenv
UML_AI_ENABLED=true
UML_AI_MODEL=nvidia/nemotron-3.5-lightning-free
UML_RATE_LIMIT_SALT=<at-least-32-random-characters>
AI_GATEWAY_API_KEY=<server-only-key-if-not-using-Vercel-OIDC>
SUPABASE_URL=<existing-project-url>
SUPABASE_PUBLISHABLE_KEY=<existing-publishable-key>
SUPABASE_SERVICE_ROLE_KEY=<server-only-service-role-key>
NOTES_OWNER_USER_ID=<configured-owner-user-id>
```

`PROMPT_ATLAS_RATE_LIMIT_SALT` is the salt fallback. Vercel OIDC may provide the
Gateway credential instead of an API key. Sign in as the configured owner through
`/notes/sign-in`. Anonymous users and other authenticated accounts cannot call the
owner-funded provider. Configuration, authorization, or quota failure sends no
provider request and leaves local/manual work available.

Apply the existing `202610250001_prompt_atlas_usage.sql` migration if it is not
already present. UML reuses its atomic service-only quota RPC: **50 requests per
UTC day shared with Prompt Atlas**, plus **5 UML requests per owner per UTC hour**.
The owner-hour identity is salted/HMAC-derived and independent of client IP or
application instance. Failed provider requests consume reservations. Process-local
admission additionally limits bursts/concurrency; it is not the global quota.
Request allowances are not currency budgets: configure a provider spending cap
before selecting a paid model.

The provider receives the original article and numbered raw paragraphs, including
inert fenced code. Output uses a strict schema, exact evidence-quote checks, and
independent per-type validation. Missing, duplicate, malformed, or unsupported
evaluations do not become fabricated local results. Valid siblings survive.
Source is rendered only in the browser; no model-supplied status is accepted as
proof of rendering success.

## Limits and safety boundaries

| Boundary            | Implemented limit                                                                                                                                    |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local article input | 120,000 Unicode code points; rejected rather than truncated                                                                                          |
| AI article input    | 40,000 Unicode code points; rejected before provider transmission                                                                                    |
| API body            | Streamed 512 KiB cap, 8-second body-read deadline, 60-second operation deadline                                                                      |
| Provider response   | Streamed 2 MiB cap; 55-second response-read deadline within the operation deadline                                                                   |
| Provider output     | 16,000 tokens for All 14, 8,000 otherwise; zero SDK retries; 16,000 source characters per figure in the wire schema                                  |
| Renderer source     | 100,000 UTF-16 code units and 1,500 lines                                                                                                            |
| Renderer queue      | One active job and at most 32 queued jobs; 60-second startup bound, then 20-second rendering bound with worker termination                           |
| SVG output          | Engine configured with `maxSvgSize: 6000`; rejects more than 4,000,000 SVG string characters                                                         |
| PNG                 | 16-megapixel input-dimension bound, at most 4,096 pixels on the output's longest side; sequential rasterization with a 10-second image-load deadline |
| ZIP                 | At most 28 figure records and 64 MiB of uncompressed entry data; safe unique paths                                                                   |

Renderer preprocessor directives, built-in functions, includes, hyperlinks, remote
images, active markup, and executable URI schemes are rejected. Independently, the
worker has no host filesystem, replaces network APIs with rejecting stubs, denies
file/library loader callbacks, and builds SVG in a detached DOM that cannot execute
scripts or load resources. Elapsed-time termination is not a browser heap quota.

SVG is sanitized for both preview and download, then displayed as an image rather
than inserted as arbitrary page markup. API responses are private/no-store/noindex.
POST enforces exact same-origin `Origin`, JSON content type, schema validation,
streamed limits, deadlines, admission, and owner authorization before provider use.
Credentials stay server-only. The implementation adds no article-body logging.

## Verification record and remaining boundaries

The following focused checks are available:

```text
npm run uml:test
npm run uml:renderer:test
npm run uml:ssr:test
npm run check
npm run build:full
npm run uml:browser:test
```

The browser suite targets a loopback production preview with service workers
blocked; build before running it. `uml:renderer:test` builds its own isolated Vite
harness with `script-src 'self'` and `connect-src 'none'`, exercises the actual worker,
and writes proof under `.tmp/uml-renderer/`.

`uml:ssr:test` uses the application's actual SSR configuration to bundle the
sanitizer, checks that only Node built-ins remain external, and executes the result
with `--no-experimental-require-module`. It also verifies that scripts, event
handlers, and remote includes remain rejected. This targets the deployment-loader
failure found on `/api/uml`. After the packaging correction, the rebuilt server
passed status, real published-post loading, and local-generation POST checks with
that same restricted loader (all HTTP 200, with private/no-store status headers).
Live-site checks remain necessary after deployment.

Final local verification on 28 October:

- **83 unit tests across 10 files passed**, covering grounding, authoring/export,
  source loading, API authorization, provider-response validation, quota behavior,
  and security regressions. `npm run check` reported **0 errors and 0 warnings**.
- **All fourteen official-engine fixtures rendered**. Six unsafe/invalid/oversized
  cases were rejected; active and queued cancellation, worker recovery, legitimate
  error-text labels, no external requests, and sanitized SVG image loading passed.
  The generated `verification.json` and `all-fourteen.png` record the renderer run.
- **All eight production-preview browser cases passed** in 40.5 seconds. They cover
  paste-to-render, immutable article revisions, manual-edit review and ZIP parity,
  invalid/unsafe source, All-14 partial results, cancellation with mocked provider
  transport, mobile dark-mode layout, delayed-load races, and unauthenticated AI
  rejection. Desktop/mobile and figure visual inspection also passed.
- The full-build run passed feature assets, notebook preparation, content
  generators/validators, site compilation, and discoverability before its final
  Barnum route-asset check exposed a shared `UmlFigure` sanitizer-import regression.
  After isolating that dependency in authoring, the affected `build:site`,
  `validate:discoverability`, and `barnum-lab:route-assets` commands all passed.
  Discoverability verified **744 posts**. The final Barnum route uses **296,873 raw
  JavaScript bytes, 107,389 gzip bytes, and 36 assets**, within its existing budget.

No real AI provider request or hosted owner/quota activation was verified in this
implementation session. Provider tests use controlled responses. Browser
verification covers Chromium, not every browser's OffscreenCanvas/font-layout
behavior. These are local implementation checks, not a production deployment claim.

The integrated security branch supplies `security:audit` and `security:smoke`.
The latter adds a strict-loader fixture that preserves legitimate SVG features and
rejects active/resource-bearing markup using the same application SSR configuration.
The historical checks above do not substitute for verification of the integrated
revision; final results belong in the PR and release handoff.
