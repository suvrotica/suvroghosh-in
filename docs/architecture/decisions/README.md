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

| ADR                                    | Status   | Decision                                                                               |
| -------------------------------------- | -------- | -------------------------------------------------------------------------------------- |
| [0001](0001-canonical-architecture.md) | Accepted | Maintain a canonical current-state architecture reference and a proportionate PR gate. |
