# ADR 0020: Post to UML uses the official local engine and owner-gated generation

Date: 28 October 2026. Status: accepted; implemented locally. Hosted AI activation and
live-provider verification remain unverified.

## Context

Post to UML already had a public authoring page, a custom TypeScript PlantUML
parser/SVG renderer, local article templates, and an optional AI endpoint. The
custom renderer's passing fixtures did not demonstrate compatibility with genuine
PlantUML. Local extraction populated missing methods, relationships, infrastructure,
messages, and numerical timings, even when illustrative assumptions were disabled.
Source edits could leave a previous image available to export against newer code.
The public provider endpoint also needed a real owner-authorization and shared
usage boundary rather than relying only on consent and process-local throttling.

The feature must preserve unpublished article privacy, the existing SvelteKit CSP,
Vercel runtime compatibility, the saved-asset blog workflow, and useful manual work
when AI is unavailable. Rendering must be deterministic and independently verified;
model output cannot declare itself rendered or factual.

## Decision

Use the MIT-licensed `@plantuml/core@1.2026.9` TeaVM JavaScript distribution with
bundled Smetana graph layout as the authoring renderer. Load it on demand in a
terminable module worker. Adapt its DOM/text-measurement requirements with a
detached `linkedom@0.18.12` document and OffscreenCanvas. Do not add a JVM,
Graphviz server, public renderer, WASM evaluation permission, or site-CSP exception.

The worker has no host filesystem or application credentials. Reject source
preprocessor/functions and external-resource syntax, independently deny network
APIs and file/library loader callbacks, and sanitize resulting SVG. Display SVG
through image contexts with a baked light-paper background so downloaded artwork
and dark-chrome previews preserve label contrast. The assets do not change theme.
Bound source size/lines, queued work, active-job time, SVG
size, PNG rasterization, and ZIP data. Active cancellation/timeout terminates the
worker; the next job starts a clean worker. Time bounds do not claim a precise heap
quota or immunity to every possible browser resource failure.

Keep the legacy parser/renderer only as a helper. It must not erase unknown syntax
or determine compatibility with the official engine. The authoritative browser
render consumes the exact edited/generated source and recognizes engine error
images as failures. No automatic provider-backed repair loop is introduced.

Bundle `sanitize-html` and its resolved dependency closure in the server output
using Vite `ssr.noExternal`. Its CommonJS entry requires ESM-only `htmlparser2`;
the deployed Vercel Node loader rejects that boundary even though ordinary local
Node 24 accepts it. Bundling only the entry package is insufficient: it can leave
incompatible default imports and resolve nested dependencies to different hoisted
versions. The narrow package list preserves the pinned sanitizer and its locked
parser/style dependencies without downgrading security behavior or changing CSP.
The independent `uml:ssr:test` regression builds the actual sanitizer using the
application SSR configuration, requires its external imports to be Node built-ins,
and runs it with `--no-experimental-require-module`.

Replace template-driven local inference with explicitly labeled conservative
heuristics and exact source references. Preserve the original input independently
of generated output. Local views are conceptual; absent evidence produces a
specific missing-information/not-applicable result. Broader prose interpretation
belongs to the separately configured AI path. All fourteen types remain selectable,
with an honest distinction between article suitability and renderer capability.

Use `requireNotesOwner` for provider access, retaining the existing Notes login
and configured owner identity. Keep provider credentials private and require
explicit article-transmission consent. Reuse the service-only atomic
`reserve_prompt_atlas_usage` RPC instead of introducing a second quota store:
UML and Prompt Atlas share the 50-request UTC daily pool, while salted owner/hour
identities enforce five UML requests per owner per UTC hour. Process-local
admission remains an additional burst/concurrency guard, not the global quota.
Unavailable authorization, configuration, or quota fails closed before provider
transmission. Failed provider attempts consume reservations, SDK retries are zero,
and a provider spending cap remains necessary for paid models.

Send the complete bounded article and every numbered raw paragraph to the provider,
including inert fenced code. Validate the response schema, requested-type coverage,
exact evidence quotes, assumptions, and source security per figure. A malformed or
omitted figure does not replace successful siblings with local templates. Only the
official browser render can mark source rendered. The AI input/response/output and
operation deadlines are explicit in the feature contract.

Maintain article/source/render revisions in the browser and ignore stale async
results. After source edits, retain the last successful preview separately and
require caption/alt/evidence review before publication. A publication-ready figure
must have a successful current render and exact source-string equality, not merely
a matching non-cryptographic revision label. Regeneration protects manual work
with an explicit replacement choice.

Export the unchanged original article, an appended-figure article, standalone
PlantUML, validated SVG/PNG assets, repository-compatible `<UmlFigure />` snippets,
and a manifest. Failed/unreviewed source stays under a draft path without stale
publication images. Saved article display remains independent of AI and authoring
scripts. The conditionally imported `UmlFigure` accepts saved/data image URLs, not raw
preview SVG, and has no renderer or sanitizer runtime imports. Authoring performs
sanitization and image-URL conversion so ordinary article bundles do not inherit
those dependencies or exceed their existing route-asset budgets.
Build-time server-only raw Markdown loaders and the canonical published
registry supply existing posts; runtime source-folder availability or curated
sample fallbacks must not masquerade as a published-post index.

## Alternatives and consequences

- Extending the custom renderer alone would retain a second partial language
  implementation and could continue accepting diagrams that genuine PlantUML
  rejects. Its earlier tests are not external compatibility evidence.
- A public PlantUML server would disclose unpublished source and add availability
  and privacy dependencies. A self-hosted JVM/Graphviz service would add another
  runtime and deployment boundary; neither is needed for the verified fixtures.
- Main-thread official rendering would avoid the DOM adapter but make long jobs
  harder to cancel without blocking the editor. A worker provides real termination
  at the cost of an explicit DOM/text-measurement adapter and browser compatibility
  requirements.
- WASM layout could be evaluated separately if needed. The selected bundled
  Smetana path avoids adding evaluation permissions to the site's CSP.
- A separate UML quota table could isolate budgets, but the existing atomic RPC
  supplies cross-instance reservation semantics now. The deliberate consequence is
  that UML usage reduces the Prompt Atlas daily pool. Request counts are not money.
- Automatic local completion of all fourteen views would produce unsupported
  facts. The new local mode may generate fewer diagrams, while preserving useful
  manual source, examples, and optional AI interpretation.
- Composite structure, profile, communication, and interaction overview use
  composed notation. Profile's `-up->>` relation is a verified filled extension
  triangle. Interaction overview's named activity partitions have rectangular
  headers, an approximation of exact UML interaction-use frame tabs. That fidelity
  limitation is exposed in the catalog, UI, captions/embeds, and manifest.
- Generation currently returns one figure per type. Automatic multi-figure
  decomposition, broader local prose interpretation, and provider-backed syntax
  repair remain unimplemented; export supports distinct safe IDs without claiming
  those generation features.

## Verification and regression boundaries

`scripts/verify-uml-renderer.mjs` builds a production Vite harness under
`script-src 'self'; connect-src 'none'` and exercises the real worker with service
workers blocked. The final run rendered fourteen representative fixtures,
rejected six unsafe/invalid/oversized cases, verified active/queued cancellation
and recovery, accepted legitimate error-text labels, observed no external requests,
and loaded every sanitized SVG as an image. The
generated verification JSON and contact sheet live under `.tmp/uml-renderer/`.
This is fixture-level verification, not a proof of every PlantUML feature or exact
notation for the disclosed composed interaction-overview representation.

Final local checks passed 83 unit tests across 10 files and Svelte/TypeScript
analysis with zero errors/warnings. The eight production-preview browser cases
passed after the final dependency-boundary correction; desktop/mobile and figure
visual inspection also passed. Coverage includes grounding, exact source spans,
manual-edit state, export consistency, owner authorization, streamed bounds, quota
failure, and provider schema/evidence rejection using controlled responses.

The full-build run passed feature/notebook/content stages, site compilation, and
discoverability, then caught the saved-figure component's sanitizer dependency in
the Barnum route-asset budget. Moving sanitization back to authoring corrected that
boundary. The affected final site build, 744-post discoverability check, and Barnum
route-asset audit all passed: 296,873 raw JavaScript bytes, 107,389 gzip bytes, and
36 assets. No real AI provider call or hosted owner/quota activation was verified;
these checks establish local implementation behavior, not production deployment.

The first production release exposed the CommonJS/ESM loader mismatch as HTTP 500
from `/api/uml`. The stricter Node-loader regression reproduces that failure with
the external dependency and passes with the bundled closure. The rebuilt server
also passed status, published-post loading, and local-generation requests with
`--no-experimental-require-module`: all returned HTTP 200 and the status response
retained private/no-store headers. Live-site checks are required after deployment;
the isolated probe alone does not establish deployed success.

The integrated security branch supplies executable `security:audit` and
`security:smoke` checks, including an additional strict-loader SVG-policy fixture.
The historical forensic audit records the earlier gap; fresh results are recorded
against the integrated revision in the release handoff.

The [canonical architecture](../ARCHITECTURE.md) describes the current source,
provider, rendering, and publication boundaries. The
[feature contract](../../visualizations/post-to-uml.md) records configuration,
limits, capability distinctions, and verification details.
