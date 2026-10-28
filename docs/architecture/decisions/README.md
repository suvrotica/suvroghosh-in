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

| ADR                                                 | Status                                                | Decision                                                                                                                                                                                   |
| --------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [0001](0001-canonical-architecture.md)              | Accepted                                              | Maintain a canonical current-state architecture reference and a proportionate PR gate.                                                                                                     |
| [0002](0002-separate-post-and-feature-builds.md)    | Accepted                                              | Separate routine publication from visualization/notebook maintenance, retaining shared build and publication validation.                                                                   |
| [0003](0003-pre-generated-article-narration.md)     | Accepted                                              | Generate US English narration explicitly with a confirmed free-tier project; reuse static audio and retain device speech.                                                                  |
| [0004](0004-github-actions-article-narration.md)    | Accepted for implementation; activation gated         | Continue daily narration in GitHub Actions with durable quota reservations, encrypted pending state and verified bounded publication.                                                      |
| [0005](0005-demand-driven-offline-caching.md)       | Accepted                                              | Cache requested build resources and opened public notes; bound live verification to avoid whole-site request amplification.                                                                |
| [0006](0006-consented-aggregate-analytics.md)       | Partially superseded by 0007/0008; backend retained   | Retain bounded legacy intake, identifier-free daily geographic rollups and configured-owner reports; browser consent policy is superseded.                                                 |
| [0007](0007-default-vercel-pageviews.md)            | Superseded by 0008                                    | Intermediate restoration of default Vercel pageviews with separate optional measurement.                                                                                                   |
| [0008](0008-media-only-consent.md)                  | Accepted                                              | Default sanitized Vercel pageviews without analytics choices; media-only v2 preferences; retire current-browser optional measurement and retain legacy intake/reports.                     |
| [0009](0009-premoderated-post-comments.md)          | Accepted; hosted schema applied                       | Premoderate shared article comments in existing Supabase, reuse owner login and keep article rendering independent of comment storage.                                                     |
| [0010](0010-durable-comment-email-alerts.md)        | Accepted; email content/actions extended by 0011/0012 | Queue private new-comment email alerts durably in Supabase, reuse the existing Resend contact inbox and retry through a bearer-authenticated production worker.                            |
| [0011](0011-comment-email-review-content.md)        | Accepted; email format/actions extended by 0012       | Include the commenter name and complete plain-text comment in new owner alerts, while preserving legacy retry payloads and idempotency identities.                                         |
| [0012](0012-comment-email-moderation-actions.md)    | Accepted; reply authority extended by 0013            | Add expiring, one-use Approve/Reject capabilities to future version-three emails, with safe link previews, explicit confirmation and permanent board revocation.                           |
| [0013](0013-comment-email-author-replies.md)        | Accepted; hosted activation requires verification     | Add an independent one-author-reply capability to future version-four emails, with explicit pending approval, approved-root placement and durable retry identity.                          |
| [0014](0014-prompt-atlas-local-ontology.md)         | Accepted                                              | Inspect prompts locally through one evidence-backed ontology; derive diagrams and Apps/Viz discovery without duplicating content.                                                          |
| [0015](0015-prompt-atlas-free-semantic-analysis.md) | Accepted; hosted activation requires verification     | Optional free-only semantic analysis, source-grounded compression and knowledge graph views preserve the local ontology boundary.                                                          |
| [0016](0016-synthetic-data-lab-service.md)          | Accepted; deployed and verified                       | Separate Python scientific engine with request-bound hosted generation, shared Redis control and private expiring Blob snapshots; hosted backend and public-domain HTTP acceptance passed. |
| [0017](0017-local-enquiry-demo.md) | Accepted for local operation | Transactional SQLite enquiries, simulated acknowledgements, deadlines and a standalone local worker. |
| [0018](0018-public-enquiry-sandboxes.md) | Accepted | Private expiring visitor snapshots in Supabase, scoped staff grants, revision commits and a protected scheduled fake-message worker. |
| [0019](0019-knowledge-gap-atlas-local-corpus.md) | Accepted | Stream visitor corpora into local IndexedDB, analyse in a worker without AI APIs, and preserve evidence-linked research questions and portable exports. |
| [0020](0020-post-to-uml-browser-engine.md) | Accepted; implemented locally; hosted AI unverified | Render UML through the official local PlantUML worker, gate provider generation with owner authorization and shared quota, and export only current reviewed source/assets. |
| [0021](0021-mindmap-studio-source-model.md) | Accepted; deployed; hosted AI verified | Keep a source-grounded mind-map/graph model, bounded optional free analysis and local editing separate from source-free published reader snapshots. |
| [0020](0020-durable-chatterbox-admission.md) | Accepted; hosted activation requires verification | Fail closed before optional public TTS until a service-only shared resource reservation succeeds; retain failed/uncertain reservations. |
