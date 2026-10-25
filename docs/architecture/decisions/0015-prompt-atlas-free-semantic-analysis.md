# ADR 0015: Free semantic analysis with source-grounded compression and graph views

Date: 25 October 2026. Status: accepted; hosted activation requires verification.

## Context

Prompt Atlas's deterministic reader cannot reliably interpret unusual English. The owner asks
for an optional semantic reader while preserving local analysis, permits free credits only,
and asks to replace the restrictive 20,000-code-point ceiling with semantic compression and
a knowledge graph representation. Arbitrary provider calls would create a new public cost,
privacy and resource boundary. A model-generated summary alone would lose traceable evidence.

## Decision

Extend the existing ontology rather than introduce a second graph state owner. Preserve the
local worker as the default. An explicit AI-mode selection and fresh per-request consent send
the original text to a bounded, same-origin server endpoint. The UI identifies the provider,
model and NVIDIA's prompt-retention/model-improvement policy. No typing, view changes or example
selection may trigger a remote submission. Cancellation and edits invalidate pending responses.

Pin Vercel AI Gateway to `nvidia/nemotron-3.5-lightning-free`, NVIDIA only, with zero SDK retries
and no model fallback. Verify all reported endpoint prices are zero immediately before every
generation. Fail closed on unavailable/unknown/nonzero pricing. Do not buy credits, enable
top-ups or repurpose the narration credential. The external free-route pricing contract may
change; a different model is a future reviewed decision.

Detect credential availability on each server invocation with the same pinned `@vercel/oidc`
helper used by Gateway. Vercel Functions provide tokens through trusted runtime request context,
while build/local execution can supply an environment token or private Gateway API key. An
environment-only check would incorrectly disable deployed Functions. Keep only the availability
boolean; do not persist or log runtime tokens, inspect browser request headers for credentials,
or cache one request's authentication state for another. Missing context fails closed.

Use the existing Supabase service boundary for one atomic global/per-client quota reservation
before a provider attempt. An additive migration stores short-lived hourly HMAC keys and counts,
with RLS, service-only RPC access and no raw prompt/address storage. Failed attempts consume
their reservation. Process-local concurrency/admission is supplementary, never advertised as
distributed enforcement. Missing shared controls disable AI without disabling local mode.

Accept up to 200,000 Unicode code points with a streamed 2 MiB request cap. A deterministic
extractive compressor deduplicates exact sentence/line units and selects exact bounded fragments with original
UTF-16 offsets. It preserves source order and distributes coverage while prioritising rules,
negation and conditions. Report retained, omitted and duplicated material explicitly. This is
lossy compression, not a promise that all dependencies survive. Both readers return the full
original source plus exact original evidence. A thin provider-only knowledge graph references trusted source unit IDs. The server derives
layers, source evidence, offsets and provider identity and validates identifiers and claim
provenance before returning the canonical ontology. Source context is auditable, but does not
prove a semantic inference. A deterministic local pass preserves explicit instructions and
storage facts using unique exact label matches; missing physical details remain unknown.
The model does not reproduce the full canonical schema or invent physical defaults. Native
NVIDIA JSON Schema and disabled reasoning bound generation. Optional reporting attribution is
omitted because its surcharge would defeat an otherwise zero-priced request.

Add a knowledge graph projection and JSON-LD export to the same ontology. Reify relationships
with their labels/kinds/provenance rather than invent a domain vocabulary. Include source and
evidence only through the existing explicit source-export choice. Preserve actual analysis
mode, provider/model and compression coverage through imports/exports.

## Alternatives and consequences

- A paid model funded by free credit balance was rejected: a balance check and soft budget
  cannot establish that a concurrent request will never consume paid funds.
- Unbounded input or generation would make this public endpoint vulnerable to resource abuse.
  A larger document ceiling plus visible, source-grounded compression is a bounded compromise.
- An abstractive summary before extraction could omit a negation or fabricate a fact while
  breaking source spans. Exact fragments give narrower but auditable coverage.
- Client-side provider keys would expose credentials; the SDK and private configuration remain
  in server-only modules. No new CSP source or browser provider connection is needed.
- The free model may be unavailable, return invalid evidence or retain prompts. These are
  disclosed limitations; automatic provider/local fallback would hide a changed privacy or
  interpretation contract, so local fallback remains an explicit action.

## Verification and rollout

Unit fixtures cover unusual/ambiguous prompts, Unicode/repeated quotes, source-fragment mapping,
compression coverage, graph exports, mode persistence and endpoint rejection paths. Isolated
PostgreSQL execution verifies grants, RLS, atomic quotas, expiry and rollback. Mocked browser tests
exercise consent, cancellation, stale results, long prompts and diagram reuse without provider
spend. Build, focused route asset checks and browser tests verify the application boundary.

Apply only the exact tested migration, verify its hosted grants/ledger, configure server-only
enable/salt values, deploy, then run bounded public smoke checks. A live structured response and
its reported zero cost establish provider activation separately from mocks. Record failures
honestly and keep local mode usable. Follow [the setup guide](../../prompt-atlas.md).

This extends the optional-provider boundary in [ADR 0014](0014-prompt-atlas-local-ontology.md).
The canonical [Prompt Atlas section](../ARCHITECTURE.md#app-collections-and-prompt-atlas) and
[architecture change gate](../../../CONTRIBUTING.md#architecture-change-gate) apply.
