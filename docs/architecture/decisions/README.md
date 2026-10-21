# Architecture decision records

This directory begins with the October 2026 architecture audit. Earlier feature documents and
Git commits are historical evidence; they have not been converted into retroactively accepted ADRs.
See [the architecture reference](../ARCHITECTURE.md#14-existing-decisions-and-debt) for those sources.

Use sequential, stable names: `NNNN-short-decision.md`. Each record should contain:

- Title, decision date and status (`proposed`, `accepted`, `superseded`, or `rejected`).
- Context and the concrete problem/constraints.
- Decision and alternatives considered.
- Consequences, migration/regression risk, and verification.
- Links to the affected canonical architecture sections and any predecessor/successor ADR.

Use an ADR for meaningful trade-offs such as a new persistence service, changed authorization
model, rendering strategy or cross-feature state ownership. Avoid an ADR for every small edit.
The [contribution policy](../../../CONTRIBUTING.md#architecture-change-gate) governs when architecture
documentation must change. Review an ADR in the same change as its implementation; preserve the
reasoning in old records when superseding them.

| ADR                                              | Status                                        | Decision                                                                                                                              |
| ------------------------------------------------ | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| [0001](0001-canonical-architecture.md)           | Accepted                                      | Maintain a canonical current-state architecture reference and a proportionate PR gate.                                                |
| [0002](0002-separate-post-and-feature-builds.md) | Accepted                                      | Separate routine publication from visualization/notebook maintenance, retaining shared build and publication validation.              |
| [0003](0003-pre-generated-article-narration.md)  | Accepted                                      | Generate US English narration explicitly with a confirmed free-tier project; reuse static audio and retain device speech.             |
| [0004](0004-github-actions-article-narration.md) | Accepted for implementation; activation gated | Continue daily narration in GitHub Actions with durable quota reservations, encrypted pending state and verified bounded publication. |
| [0005](0005-demand-driven-offline-caching.md)    | Accepted                                      | Cache requested build resources and opened public notes; bound live verification to avoid whole-site request amplification.           |
