# Prompt Atlas semantic mode

Local analysis needs no backend. Semantic mode uses server-only Vercel AI Gateway access and
the existing Supabase project. Both use one source-grounded ontology and the existing canonical
article at `/blog/visualizations/prompt-atlas`, discovered through Apps and Viz.

## Free-only policy

The model ID is fixed in code to `nvidia/nemotron-3.5-lightning-free`; the only permitted provider
is NVIDIA. `verifyFreeRoute` checks the fixed public endpoint's metadata before each generation.
Every reported monetary price must be zero, required pricing fields must exist, and structured
output must be supported. Native JSON Schema is passed explicitly to NVIDIA; reasoning is
disabled. Reporting tags, user attribution and quota reporting fields are absent: these can
carry Gateway surcharges despite a free model. Unknown/nonzero prices fail closed. No SDK retries, tools, arbitrary
model/URL parameters, fallback model, credit purchase or billing change is supported.

NVIDIA may retain prompts/responses for model improvement. The UI requires fresh consent for
each submission, names that provider/model and states the retention policy. Do not represent
remote mode as local/private processing. A free route can end or be unavailable; the explicit
local-mode action remains available. Free-only concerns inference pricing; normal existing
hosting/database resource use remains subject to the site's platform plans.

Primary references checked on 25 October 2026:

- [Free model announcement and retention policy](https://vercel.com/changelog/nemotron-3-5-lightning-now-available-on-ai-gateway-for-free)
- [Fixed live endpoint metadata](https://ai-gateway.vercel.sh/v1/models/nvidia/nemotron-3.5-lightning-free/endpoints)
- [Provider filtering and ordering](https://vercel.com/docs/ai-gateway/models-and-providers/provider-options)

## Configuration and rollout

1. Run `npm run prompt-atlas:test`, `npm run check` and the focused browser suite. SQL tests use
   an isolated pinned `@electric-sql/pglite@0.5.11` runtime: set `PROMPT_ATLAS_SQL_RUNTIME` to its
   package directory, then run `npm run prompt-atlas:sql:test`. No hosted database is used by tests.
2. Apply only `supabase/migrations/202610250001_prompt_atlas_usage.sql` to the existing project.
   Record its version/name in the migration ledger transaction and refresh PostgREST's schema.
   Do not run an indiscriminate push of unrelated migrations. Verify service-role execution,
   denied anon/authenticated execution, RLS and revoked direct table grants.
3. Configure `PROMPT_ATLAS_RATE_LIMIT_SALT` (at least 32 random bytes),
   `PROMPT_ATLAS_AI_ENABLED=true`, existing `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
   Vercel supplies OIDC authentication through trusted Function request context. The server checks
   availability on each invocation with the same `@vercel/oidc` helper used by Gateway; build/local
   environment tokens and a private `AI_GATEWAY_API_KEY` are also supported. It retains only the
   availability boolean, never a runtime token, and does not read browser request headers for
   credentials. Never prefix these values with `PUBLIC_` or commit real values.
4. Build/deploy. `GET /api/prompt-atlas` must return the fixed provider/model and `freeOnly:true`.
   GET checks configuration and public zero-price metadata; a successful GET alone does not
   prove quota RPC access or provider authorization. The POST checks both before generation.
5. Make a bounded test request containing a synthetic prompt and `consent:true`, with exact
   same-origin headers. Verify semantic mode, exact source evidence, fixed provider/model,
   private/no-store headers and the Gateway's reported zero cost. Test quota/origin failures
   without repeated live generations. Do not purchase credits if authorization fails.

The durable quota reserves at most 50 requests globally per UTC day and 5 per hourly client
HMAC, with hard SQL parameter ceilings. It stores only count buckets/HMACs and reserves once
before generation. Failures are not refunded. The process guard adds bounded concurrency but
does not coordinate instances. Existing comments/Notes credentials remain server-only.

## Long documents and graph evidence

The editor retains up to 200,000 code points. Exact-fragment compression bounds the analysed
material and removes exact repeated sentence/line units before packing source excerpts. It prioritises rules/conditions while retaining
distributed context; it cannot promise that an omitted passage has no relevant relationship.
Coverage metadata and a limit issue travel with the graph, sessions and reports. The semantic
model selects trusted source unit IDs. The server derives modelling layers, exact source text
and offsets, and provider identity; it rejects unknown IDs and invalid graphs. Source passages
provide context for review rather than proof of semantic correctness. A local pass preserves
explicit instructions and source-backed storage facts through unambiguous exact label matches.
The model cannot invent physical type defaults, identifiers or multiplicities through the wire contract.

The knowledge graph, mind map and other diagram views are projections of the same editable
ontology. Changing views does not call the provider. JSON-LD exports preserve nodes and labelled
relationships, provenance, analysis identity and coverage. Source/evidence are excluded by
default; extracted labels may still contain sensitive user content. Sessions including source
are bounded to 2 MiB and can restore the current graph without another provider request.

## Verification record

The quota migration was applied and its ledger, forced RLS, revoked table access and service-only
RPC permissions were verified on 25 October 2026. One dummy reservation remained counted.
Synthetic provider tests established OIDC access to the pinned free model; optional reporting
tags were removed after observing their surcharge. Final build, browser and live API verification
results are recorded in the task handoff.
Mocked provider tests do not establish a real free-model response. The repository's named
`security:audit` and `security:smoke` commands are absent; do not describe them as passing checks.
