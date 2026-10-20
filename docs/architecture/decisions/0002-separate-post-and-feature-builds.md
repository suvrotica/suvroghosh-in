# ADR 0002: Separate routine publication from feature maintenance

- Date: 20 October 2026
- Status: Accepted for the focused-publishing workflow change

## Context

Every ordinary text-and-image article previously invoked audits for Barnum Lab, Bias Archipelago,
BZ, Prior Authorization and Strange Attractor, plus preparation of every historical notebook.
Notebook preparation rerendered all HTML whenever renderer dependencies were installed. A post
could therefore expand into unrelated feature repairs or produce notebook churn.

The site is one SvelteKit application. Deployment still compiles its shared route graph, and
publication indexes, links and metadata can reference older content. Avoiding unrelated maintenance
does not make compilation or cross-content integrity optional.

## Decision

Keep `npm run build` as the normal production/publishing command, retaining content generation,
content/resource/contrast/SEO/media/link validation, search indexing, Vite and rendered
discoverability checks. Remove dedicated visualization artifact audits and notebook preparation
from that lane.

Preserve those feature checks in `features:check` and `npm run build:full`. The full lane also
prepares notebooks and checks Barnum's emitted route assets. A path-selected feature workflow
exercises that lane for relevant feature/notebook/shared-build changes, while excluding ordinary
posts and their generated publication metadata. Agent guidance keeps plain posts within their
requested scope.

Notebook preparation first verifies current source/hash/version contracts. It leaves fresh files
untouched and renders only missing/stale outputs when dependencies exist. Failed verification
without rendering dependencies remains a failure. Explicit full notebook rendering remains an
authoring operation.

## Alternatives

- Keep every feature audit on every post: preserves the coupling that prompted the change.
- Skip all checks for posts: would lose publication, link, SEO and shared-build safeguards.
- Infer all changes from a previous deployment Git SHA: introduces shallow-history/hosting-state
  dependencies without a verified deployment baseline.
- Split features into separate applications: much larger architectural/deployment change than
  needed for this publication workflow.

## Consequences and verification

Routine builds can still print older route names or fail on a real shared compilation error.
Stale feature artifacts that do not affect compilation are detected by feature maintenance rather
than every post. Correct CI path coverage and contributor choice of lane therefore matter;
workflow triggers and npm lifecycle reachability have regression tests. Hosted required-status
and event execution are not implied by committing a workflow.

The focused tests verify retained publication checks, absence of feature/notebook work from the
routine command graph, full-lane reachability and CI path selection. Notebook fixtures verify fresh,
stale, missing, version-mismatched and invalid sources with/without renderer dependencies. Review
the real routine build result and unexpected generated diffs before adopting the change.

Current implementation: [architecture section 5](../ARCHITECTURE.md#5-content-build-and-search-data-flow).
Maintenance policy: [CONTRIBUTING](../../../CONTRIBUTING.md#architecture-change-gate).
