# ADR 0014: Prompt Atlas uses a local, evidence-backed ontology

Date: 25 October 2026. Status: accepted.

## Context

Prompt Atlas needs to count and inspect visitor-supplied prompts and present several useful
diagram notations, including for ambiguous language. The site has no authorised public semantic
text-analysis service. Its Gemini credential belongs to a deliberately restricted narration
authoring workflow. Reusing that integration would change its privacy, cost and security boundary.

## Decision

Use a deterministic, explicitly labelled local reader in a cancellable browser worker. Keep
the prompt and state in memory unless a visitor explicitly saves or exports them. Validate
every result and imported session against one strict, versioned ontology contract, including
exact source spans, bounded graph sizes, unique identifiers and valid relationship endpoints.

The ontology distinguishes instructions from subject matter and explicit claims from inferences
and user corrections. A fixed catalog tests model eligibility before ranking supported views.
Separate pure projections produce native SVG layouts. A change of diagram reuses the same
ontology; source changes make the result stale. Preserve unknowns instead of filling missing
database, workflow or UML details. Expose corrections and a structured text equivalent.

Add optional `collections: ['apps']` membership to the existing post registry, retaining one
category and one canonical article. A prerendered Apps collection and the Viz archive both link
to it. This is independent collection discovery, not a second post or new category hierarchy.

## Alternatives and consequences

- A general semantic provider could interpret broader language, but would require an authorised
  provider/model, remote-processing disclosure, strict server request/response validation,
  deadlines and deployment-wide spending controls. That service is not installed by this change.
- A hybrid reader is a useful future direction. `provider.ts` defines an isolated adapter
  contract; it is not evidence of a working remote provider.
- Diagram-specific extraction would risk different interpretations when switching views. One
  intermediate representation keeps evidence and corrections consistent.
- Local rules cannot understand arbitrary prose. The UI and article disclose this limitation,
  preserve source clauses, and surface ambiguities for correction. Unknown structure may make
  specialised views unavailable.
- Native SVG avoids a diagram-markup execution boundary and additional renderer dependencies.
  All exports still contain user-supplied meaning and may be sensitive.

## Verification

Focused unit tests cover Unicode counts, extraction fixtures, forbidden inventions, source
evidence, validation, model eligibility/projection and safe export. Browser tests exercise the
editor/worker/inspection/view/export flow and both collection entries using a local production
preview with service workers blocked. Build and verification outcomes belong in the task handoff.

The canonical [architecture](../ARCHITECTURE.md#app-collections-and-prompt-atlas) describes the
implemented boundaries. Future remote analysis must update this decision and that reference.
