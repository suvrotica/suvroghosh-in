# ADR 0021: Mindmap Studio keeps a source-grounded model separate from its views

Date: 29 October 2026. Status: accepted; implemented locally. Browser acceptance,
deployment and live-provider verification require separate completion evidence.

## Context

The requested blog app combines an editable, visually composed mind map with a
research-oriented reading workflow: source scope, concepts, arguments, evidence,
assumptions, relationships and open questions. A tree alone cannot represent
cross-branch relationships, and attractive labels do not establish what a source
actually said. The site already has Svelte feature-local models, ordinary Markdown
Apps/Viz publication, browser persistence and a bounded free-only Prompt Atlas AI
route. Replacing the site's framework or making a provider indispensable would
add unnecessary coupling.

## Decision

Keep one versioned `StudioProject` with selected source text, exact UTF-16 evidence
anchors, a parent hierarchy, typed cross-links, epistemic status, notes, analysis
and coverage. Validate imports and generated projects before replacing a working
map. Require exact evidence for explicit claims; keep interpretation and speculation
visible. Evidence validation establishes exact source correspondence, not truth.

Use the MIT Mind Elixir browser engine for hierarchy editing, wrapped through a
feature-local adapter. Use an independent native SVG/D3 view over the same IDs for
knowledge-graph connections. The app owns history and persistence rather than
adopting renderer data as the domain contract. Local extraction, the curated
example, manual editing, imports and provider analysis all produce the same
editable contract.

Local analysis groups exact passages and states its limitations. Optional AI
reuses Prompt Atlas's existing configuration, free-route verification and shared
atomic quota. The new endpoint has its own strict request/wire contracts and local
admission boundary. Send at most 48 trusted source units/32,000 UTF-16 characters
to one provider generation; disclose partial coverage. The provider returns unit
IDs, not authoritative quotes or source offsets. This bounds work without claiming
exhaustive chapter-by-chapter research.

Keep user edits in a feature-owned IndexedDB database and provide portable JSON.
Do not introduce cloud map storage, URL fetching, automatic video access or a new
authorisation service. PDF text extraction runs in the browser with selected
physical pages and an explicit no-OCR limitation. Provider use remains an explicit
consented action; private configuration never enters universal/browser modules.

Publish through a separate source-free snapshot format. `MindmapFigure` validates
that format, gives readers an SSR outline and activates read-only interactive views
on demand. It does not fabricate omitted evidence. Its display-only projection is
marked so it cannot pass editable-project validation. Source-free does not mean
content-free: labels and explanations can still reveal supplied text, so export
copy and documentation call for review before publication.

## Alternatives considered

- A static Mermaid-only output would be useful for export but would not provide
  the required editing, evidence inspection and controlled visual composition.
- A hierarchy-only Mind Elixir state would conflate grouping with other semantic
  relationships and couple editable content to the renderer's representation.
- Adding React Flow would introduce another UI framework to the Svelte site; the
  existing D3/native SVG capabilities are sufficient for the bounded graph view.
- A new cloud database, URL fetcher or unrestricted AI model would expand privacy,
  cost and request boundaries beyond this first implementation.
- Unbounded multi-call research could cover more source material, but would need
  durable jobs, resumability, broader quota controls and a different publication
  contract. The current implementation reports its bounded excerpt coverage.

## Consequences and regression risks

The editor remains usable without provider credentials. A failed analysis leaves
the current model intact. A renderer upgrade needs adapter/export and browser
checks, especially text wrapping, read-only behaviour and node identity. Graph
structure validation cannot determine whether an inferred edge is intellectually
sound. Quota reservations limit requests, not currency; live zero-price checks
and the fixed route remain necessary, and the free service may cease to exist.

New dependencies are Mind Elixir, its image-export adapter and PDF.js; their
browser lifecycles and image limits are part of this feature. Reader figures defer
map/graph runtime until activation and have no global mdsvex import; PDF extraction
and image export remain separate authoring capabilities. Source-free snapshots
cannot be used to restore original evidence or private working notes. They are
publication artefacts; editable project JSON is the revision source.

The architecture impact is **yes**: a feature-owned persisted source model,
optional public inference endpoint, renderer adapter and explicit published-display
boundary are introduced. The [canonical architecture](../ARCHITECTURE.md#mindmap-studio)
and [feature contract](../../visualizations/mindmap-studio.md) record the implemented
data flow, bounds, configuration and verification limits. The source-grounded
generation principles extend [ADR 0015](0015-prompt-atlas-free-semantic-analysis.md)
without changing its existing provider or quota policies.

## Verification

The 30 October implementation checkpoint passed 23 domain/public-format tests,
27 mocked server tests and four renderer tests. The application Svelte/TypeScript
check reported zero errors and warnings; the published figure also compiled for
SSR without warnings. These cover exact evidence, malformed references and hierarchy,
bounded excerpts, privacy separation and deterministic rendering helpers.
Browser/production checks and a real provider call were not established by those
tests. Record subsequent acceptance results in the feature contract rather than
converting provisional checks into claims of hosted deployment.
