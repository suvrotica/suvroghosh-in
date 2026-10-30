# Architectural forensic audit

Date: **20 October 2026**. Application baseline: `2a31d9a33bf305354c9e159f45257074f6f8c8f0`,
fetched from GitHub and checked out cleanly before investigation. The initial audit added
documentation/enforcement and corrected two configuration-documentation omissions without
refactoring production source. Authorized production fixes followed and are recorded separately
below. Findings refer to baseline application line numbers unless explicitly marked otherwise.
The root `AGENTS.md` was initially a locally excluded file, so its original instructions are
workstation evidence rather than historical content at that commit.

## Executive verdict

The application has a coherent core architecture: repository-backed content, server metadata
registries, lazy universal Markdown component imports, feature-local simulation engines and
Svelte UI, and a separate single-owner notes persistence model with RLS and immutable publication
snapshots. It already uses Svelte 5 extensively. There is no evidence supporting a wholesale
framework migration, replacement of every store/effect, or consolidation of every visualization
into one generic engine.

Drift is concentrated in cross-cutting contracts and newer feature integration: lifecycle ownership
in Meaning Map, parsed-versus-streamed request limits, persistence action preconditions,
import-envelope validation, media preservation/cache assumptions, duplicated URL rules and
verification/documentation orchestration. Strong database design is not matched by executable
integration evidence. No verified P0 issue, anonymous draft disclosure or browser secret import
was established. This is not a security certification; hosted configuration and most browser/live
integration behavior were not exercised.

| Severity      |  Total |  Open | In progress | Resolved |
| ------------- | -----: | ----: | ----------: | -------: |
| P0 — Critical |      0 |     0 |           0 |        0 |
| P1 — High     |      1 |     0 |           0 |        1 |
| P2 — Medium   |     11 |     8 |           1 |        2 |
| P3 — Low      |      1 |     1 |           0 |        0 |
| **Total**     | **13** | **9** |       **1** |    **3** |

Severity records the original demonstrated scope and practical impact, not the number of source lines. Status columns include the subsequent urgent fixes below; no P0/P1 finding remains open.
Provider-enabled/public-compute risks are explicitly conditional. Proposed causes are labeled
inferred. A source or isolated-handler reproduction is distinguished from a complete browser or
deployed-stack test.

## Ground truth and coverage

- **6,188 tracked files** inventoried. All source areas, feature domains, route families,
  configuration, generators, tests, retained-content areas and documentation were accounted for.
- All **45 server route files**, all hand-authored server modules, hooks and the complete notes SQL
  migration/cron were read. All nine universal route option/load files were examined.
- Whole-area frontend scans covered **1,487 TS/JS/Svelte files / 444,561 lines**, including generated
  feature corpus data. Deep reads targeted shared boundaries and high-risk feature orchestration;
  this is not a claim of manual line-by-line review of all those lines.
- All **443 Svelte components** (406 library, 37 route) compiled without warnings/errors in the
  installed-compiler sweeps. Full `npm run check` also passed.
- The installed/locked stack is **Svelte 5.56.4, Kit 2.69.2, TypeScript 5.9.3, Vite 7.3.6**;
  the [canonical reference](ARCHITECTURE.md#3-toolchain-ground-truth) lists related tooling.
- Module-graph analysis covered 1,307 non-test explicit-import modules. It found five bounded UI
  adapter cycles, not a systemic domain cycle. Glob/Markdown-injection/nonliteral edges were not
  expanded.

The [coverage inventory](AUDIT_COVERAGE.md) lists counts, every feature family, methods, historical
commits and unverified execution areas. It is part of this report. Claims of coverage are limited
to the stated inventory/scans/reads/checks; scientific correctness, complete accessibility and
production security were not exhaustively established.

## Follow-up: focused publication builds

After the baseline audit, routine text-and-image publication was separated from feature maintenance
on 20 October 2026. `npm run build` retains publication generation/validation, Vite and rendered
SEO checks, but no longer runs visualization artifact audits or notebook preparation. Those
checks remain in `build:full` and a path-selected feature workflow. Notebook preparation also
skips current outputs and renders only stale/missing files. See
[ADR 0002](decisions/0002-separate-post-and-feature-builds.md) and the current
[build architecture](ARCHITECTURE.md#5-content-build-and-search-data-flow).

This partially addresses the build-scope portion of `AF-010`. That finding stays open for repeated
unit aggregation, lint debt and broader security/integration coverage. Baseline command descriptions,
source locations, counts and verification outcomes below remain historical evidence; they are not
claims that the old all-feature default pipeline still exists. Subsequent application-finding status
is recorded in the next follow-up and each finding.

## Follow-up: urgent correctness and request containment

The subsequent authorized urgent-fix change resolves `AF-006` at the owned-resource boundary and
`AF-002` for stale-session/no-op metadata saves. `AF-001` is **in progress**: public TTS/contact
streaming limits, input validation, origin checks, process-local admission and deadlines are
implemented. At that follow-up, distributed controls, Notes mutation readers, shared Supabase
deadlines and the named security commands remained open. The 28 October update below records
subsequent fixes; process-local limits alone still do not coordinate instances.
Provider work is bounded but does not yet stop immediately on every client disconnect.

A focused `test:critical` command and path-selected critical-boundaries workflow exercise the
server/request/persistence/map regressions without triggering on ordinary post-generated metadata.
The baseline validation record at the end remains the audit's original evidence; the follow-up
verification record distinguishes tests/builds performed for the corrections.

## Intended versus existing architecture

| Evidence/convention                                                   | Actual implementation                                                                                | Classification                                                                           |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Metadata server boundary and lazy article bodies                      | Server registries + universal Markdown imports; no explicit private imports found in active Markdown | Coherent, deliberate.                                                                    |
| Generic shader shell plus feature engines in `docs/visualizations.md` | Dedicated labs/renderers/workers and small generic experiments coexist                               | Deliberate specialization, not automatically duplication.                                |
| Canonical content static, redirect/filter paths dynamic               | `auto` article entries; dynamic archive and concrete visualization exceptions                        | Deliberate; history `a56d0791`/`61fb0087` explains key build/wrapper decisions.          |
| Single-owner notes with frozen editions                               | Owner UUID + RLS, private mutable documents, immutable snapshots, cron activation                    | Deliberate, but action/RPC preconditions and test assurance drift (`AF-002`, `AF-003`).  |
| Modern Svelte conventions                                             | Runes/snippets/event attributes dominate; compiler clean                                             | No wholesale legacy migration finding. Real UI ownership defects are `AF-006`, `AF-013`. |
| Endpoint/body/deadline invariants in local instructions               | Endpoint-specific partial guards; named security scripts absent                                      | Verified gap (`AF-001`), not evidence that checked-in checks were deleted.               |
| As-is image/lossless guidance                                         | Normal prebuild can resize/recompress source files                                                   | Verified conflict (`AF-007`).                                                            |
| Long immutable caching                                                | Semantic image URLs can be overwritten without revisioned URLs                                       | Policy mismatch under asset replacement (`AF-008`).                                      |
| Feature architecture documents and starter README                     | No canonical reference/contribution gate initially; stale referrer/version guidance                  | Documentation governance gap addressed here (`AF-011`).                                  |

## Findings

### AF-001 — Endpoint admission controls implement different resource contracts

| Field          | Evidence and assessment                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ID             | AF-001                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Severity       | **P2 — Medium**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Category       | Security, availability, integration boundaries                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Location       | `src/routes/api/tts/chatterbox/+server.ts:45–78,104,123–151,262–291,361–367`; `src/routes/contact/+page.server.ts:29–30,75–100,111–118,144–181`; `src/routes/api/notes/[id]/document/+server.ts:31–38`; `src/routes/api/notes/[id]/assets/+server.ts:10–13,32–38`; `src/lib/server/notes/supabase.ts:14–58`; `package.json:10–167`.                                                                                                                                                                                                                                              |
| Evidence       | TTS buffers JSON before clipping text, asserts its shape, and lacks a handler-level byte cap, same-origin rule and rate/concurrency limit. It does have a 120-second upstream deadline. Contact trusts declared Content-Length before form parsing, limits through a process-local map and has no explicit mail deadline. Notes checks document byte size after `request.text()` and upload size after `formData()`. Supabase clients have no shared explicit application fetch deadline. `security:audit` and `security:smoke` required by the local instructions do not exist. |
| Problem        | Parsed-field/file limits are not streamed admission limits. Adjacent expensive/state-changing integrations implement different subsets of the stated invariant.                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Impact         | Avoidable allocation/work, enabled-TTS/provider cost exposure and inconsistent overload/slow-upstream handling. Actual platform limits, provider quotas and external protections were not inspected; no production exploit or abuse was demonstrated.                                                                                                                                                                                                                                                                                                                            |
| Root cause     | **Inferred:** per-feature guard code accumulated without a shared admission contract or executable invariant checks. Earlier TTS/contact symptoms were already reported as `SEC-P2-003/004` in `docs/audits/traffic-2026-08-06/SECURITY_FINDINGS.md:71–100`.                                                                                                                                                                                                                                                                                                                     |
| Recommendation | Validate object shape before property access; enforce a cancellable streamed byte limit before JSON/form allocation; add appropriate durable throttling/concurrency and bounded provider request/response lifetimes. Restore meaningful security audit/smoke entry points instead of merely asserting they exist.                                                                                                                                                                                                                                                                |
| Scope          | TTS/contact handlers, notes mutation readers, integration clients and security tests.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Risk           | Medium: preserve supported forms/multipart/JSON, legitimate public traffic, private headers and sanitized-image behavior.                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Validation     | Missing/false Content-Length, streamed overflow/cancellation, null/malformed JSON, allowed/disallowed origins, multi-instance throttles, upstream deadline/size cases, and ordinary article/RSS/sitemap/static access. Use mocked providers/staging.                                                                                                                                                                                                                                                                                                                             |
| Status         | **In progress**: local containment, shared TTS admission, Notes transports/readers and executable checks implemented; hosted verification and broader distributed controls remain open.                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

**Implemented follow-up:** `src/lib/server/http/body.ts` now counts arriving bytes and cancels
oversized/stalled streams. TTS/contact input is limited to 64 KiB with a ten-second read deadline;
both require exact same-origin submissions. TTS rejects non-object JSON, bounds audio to 32 MiB,
limits error reads and retains its 120-second provider deadline. Contact uses an abortable
15-second mail deadline. Both use bounded process-local admission, including conservative
missing-address fallback. Twenty-eight focused tests cover normal forms/audio and rejection,
timeout, cancellation, limiter-capacity and installed-SDK signal behavior. Notes readers and
distributed controls were deliberately not claimed fixed by that earlier follow-up.

**28 October security follow-up:** Notes JSON/multipart readers now enforce actual streamed
byte limits before parsing and shared Notes Supabase fetches bound response bytes and elapsed
time. TTS now requires service-only atomic Supabase resource admission and explicit private
enablement, fails closed when unavailable, propagates cancellation and omits upstream error
bodies from responses. `security:audit`, `security:smoke` and `security:sql` now execute real
checks; advisory findings still fail the audit. Hosted TTS activation, real concurrent database
sessions, provider enforcement, contact's distributed-abuse policy and hosted account controls
remain unverified or outside this patch. AF-001 remains **in progress**. See
[the remediation record](../security/2026-10-28-hardening.md) for evidence and residual risks.

An isolated transpiled-handler probe with a mocked upstream accepted an **8,388,619-byte** JSON
request and returned 200 while forwarding only 3,000 characters; JSON `null` threw a TypeError.
The handler also accepted a foreign Origin. This did **not** invoke the full SvelteKit/Vercel
stack or establish a browser/CORS exploit or platform-body-limit bypass. Installed Kit supplies
form-content CSRF protection; contact must not be described as lacking all origin protection.

### AF-002 — Draft metadata can persist and then return an error after freshness expires

| Field          | Evidence and assessment                                                                                                                                                                                                                                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ID             | AF-002                                                                                                                                                                                                                                                                                                                                                        |
| Severity       | **P2 — Medium**                                                                                                                                                                                                                                                                                                                                               |
| Category       | Correctness, actions, persistence atomicity                                                                                                                                                                                                                                                                                                                   |
| Location       | `src/routes/notes/studio/[id]/+page.server.ts:35–43`; `src/lib/server/notes/repository.ts:403–417,453–460`; `supabase/migrations/202607230001_handwritten_notes.sql:201–228,633–642`.                                                                                                                                                                         |
| Evidence       | The action requires freshness for requested/existing published or scheduled state. Repository metadata update commits first; every other draft/private/archived save then calls `unpublish_note`, whose SQL always requires a recent session. A mock returning SQL's `42501 reauthentication_required` confirmed the update occurs before the final HTTP 500. |
| Problem        | Ordinary metadata persistence and private-state transition have different preconditions but share a non-atomic path.                                                                                                                                                                                                                                          |
| Impact         | A valid owner session older than 12 hours can receive a generic failure despite persisted title/slug/transcript changes. Response and stored state disagree.                                                                                                                                                                                                  |
| Root cause     | **Verified:** cross-layer precondition mismatch. **Inferred:** fresh-session protection was added without modeling an unchanged-private-state save separately.                                                                                                                                                                                                |
| Recommendation | Agree on whether unchanged private metadata requires freshness. Avoid an unnecessary transition, or check freshness before writing. Consider an atomic metadata/transition RPC where a real transition is needed; preserve publication revocation semantics.                                                                                                  |
| Scope          | Editor metadata action, repository, focused tests and possibly a new migration.                                                                                                                                                                                                                                                                               |
| Risk           | Medium: do not weaken publish/unpublish/archive/delete protection or retain a stale active/pending snapshot.                                                                                                                                                                                                                                                  |
| Validation     | Fresh/stale sessions for unchanged draft/private metadata, draft-to-private, archive, published-to-draft and scheduled-to-draft. Assert response and final document/publication state together.                                                                                                                                                               |
| Status         | **Resolved** for the reported stale-session/no-op workflow; broader atomicity remains a documented limitation.                                                                                                                                                                                                                                                |

**Implemented follow-up:** the action uses server-observed status and validates freshness before
writing every actual transition or published/scheduled operation. Unchanged draft/private/archived
metadata bypasses the unnecessary transition RPC. A conditional status/nondeleted-row update
returns 409 for an intervening status/deletion change. Twenty-seven new regression cases (48
server-notes tests total) exercise the real action/auth/repository with mocked Supabase transport.
This is not a transactional metadata/publication rewrite: a later RPC/network failure can still
follow a metadata write, and same-status concurrent edits/ABA transitions are not prevented.

The reproduction mocked repository/database responses locally. Actual hosted RPC execution was
not performed. The present code explicitly reports that details saved but transition failed;
this is not a claim of silent draft loss.

### AF-003 — Notes security/transaction contracts lack executable database integration evidence

| Field          | Evidence and assessment                                                                                                                                                                                                                                                                                                                |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ID             | AF-003                                                                                                                                                                                                                                                                                                                                 |
| Severity       | **P2 — Medium**                                                                                                                                                                                                                                                                                                                        |
| Category       | Testing, authorization and data-integrity assurance                                                                                                                                                                                                                                                                                    |
| Location       | `scripts/handwritten-notes-migration.test.mjs:7–42,75–95`; `supabase/migrations/202607230001_handwritten_notes.sql:201–823,902–1101`; `docs/handwritten-notes-architecture.md` testing/acceptance sections (baseline `771–780,994–1011`).                                                                                              |
| Evidence       | SQL tests read function text and match RLS/grant/revision tokens. They do not execute the migration under roles or concurrent sessions. The feature design already lists database/API/browser coverage as deferred environment acceptance work. Server unit tests cover recovery/referrer helpers, not the complete save/publish flow. |
| Problem        | Text-presence tests cannot establish executable RLS, grant, freshness, race/idempotency or action-to-RPC behavior.                                                                                                                                                                                                                     |
| Impact         | A strong design can regress while source-pattern tests stay green; `AF-002` demonstrates a cross-layer contract they do not catch. No authorization exploit was established.                                                                                                                                                           |
| Root cause     | **Verified:** feature acceptance explicitly deferred these integration suites; this is acknowledged debt.                                                                                                                                                                                                                              |
| Recommendation | Add disposable local/staging Supabase fixtures with anon, owner, other-user and service-role cases, plus API/provider mocks and a focused owner browser journey. Keep useful static checks as a complementary layer.                                                                                                                   |
| Scope          | Database fixture lifecycle, notes API/action tests, focused browser tests, CI.                                                                                                                                                                                                                                                         |
| Risk           | Low application risk, medium fixture/CI effort; destructive fixtures must never target production.                                                                                                                                                                                                                                     |
| Validation     | Apply migrations; test allowed/denied roles, conflicting/idempotent revisions, schedule activation races, snapshot immutability, revocation and publication asset manifests.                                                                                                                                                           |
| Status         | **In progress**: executable local role/RPC tests added on 28 October; hosted integration, browser acceptance and multi-session contention remain open.                                                                                                                                                                                                                                                                                         |

**28 October security follow-up (AF-003, in progress):**
`supabase/tests/handwritten-notes.integration.test.mjs` now executes the original migration in
disposable PostgreSQL WASM with owner, other-user, anonymous and service roles. It covers RLS,
sensitive direct-write denial, idempotent saves/revision conflicts, freshness, cross-note asset
manifests, immutable snapshots, revocation, scheduled activation and storage policies. The new
TTS quota suite executes its grants and resource caps. This narrows the evidence gap; it does
not verify real concurrent connections, hosted Supabase Auth/Storage, PostgREST transport or
the complete owner browser journey. Those parts remain open.

### AF-004 — Browser save operations can outlive their usable UI lifetime

| Field          | Evidence and assessment                                                                                                                                                                                                                                                                                                     |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ID             | AF-004                                                                                                                                                                                                                                                                                                                      |
| Severity       | **P2 — Medium**                                                                                                                                                                                                                                                                                                             |
| Category       | Client resilience, resource lifecycle                                                                                                                                                                                                                                                                                       |
| Location       | `src/lib/components/notes/NoteEditor.svelte:144–170,216–246,476–484,604–610`; `src/lib/components/tts/ChatterboxTTS.svelte:124–160`.                                                                                                                                                                                        |
| Evidence       | Notes drain returns the existing in-flight promise, awaits fetch without an abort signal/deadline, and `flush()` waits for that promise before publishing. Backoff runs only after a failure returns. Cleanup clears timers/listeners but does not bound the request. TTS loading also awaits an unbounded browser request. |
| Problem        | A stalled connection that neither resolves nor rejects prevents retry and can indefinitely hold sync/publish preparation.                                                                                                                                                                                                   |
| Impact         | Stuck syncing/loading and work completing after teardown. IndexedDB recovery mitigates durability risk; no data loss or browser-stall reproduction was demonstrated.                                                                                                                                                        |
| Root cause     | **Inferred:** browser operation ownership was modeled separately from server deadlines and outbox semantics.                                                                                                                                                                                                                |
| Recommendation | Give operations a bounded lifetime and explicit abort/teardown owner. Preserve the same idempotency identity across unknown-outcome retries and make any final navigation save intentional.                                                                                                                                 |
| Scope          | Notes save controller/component and tests; optionally TTS browser request handling.                                                                                                                                                                                                                                         |
| Risk           | Medium: careless cancellation can hide a successful server commit or break the recovery/outbox path.                                                                                                                                                                                                                        |
| Validation     | Never-resolving mocked fetch, bounded retry/UI recovery, unmount, abort after server commit, idempotent retry and finite publish `flush`.                                                                                                                                                                                   |
| Status         | **Open**, source-verified; browser network-stall test pending.                                                                                                                                                                                                                                                              |

### AF-005 — Fractal Atlas trusts a partial laboratory envelope after validating core state

Follow-up, 20 October 2026: the feature-local `specimen-state.ts` normalizer now validates
both imported laboratory settings and stored specimen envelopes before restore. It preserves
valid partial/older settings using finite defaults, bounds divider/path controls, checks actual
booleans and enums, validates the comparison recipe through the existing parser, and checks
decimal-string coordinates against the same numeric point. The selected-point assignment
also uses that decimal boundary. Focused malformed-envelope, deep-coordinate preservation
and round-trip regressions were added; the combined visualization review records production
and browser validation. The original evidence below is retained as the baseline finding.

| Field          | Evidence and assessment                                                                                                                                                                                                                                                                                                                                    |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ID             | AF-005                                                                                                                                                                                                                                                                                                                                                     |
| Severity       | **P2 — Medium**                                                                                                                                                                                                                                                                                                                                            |
| Category       | Validation duplication, component responsibility, persistence                                                                                                                                                                                                                                                                                              |
| Location       | `src/lib/components/visualizations/fractal-atlas/FractalAtlas.svelte:2268–2281,2321–2371,2765–2769,3175,3579–3585`.                                                                                                                                                                                                                                        |
| Evidence       | Import checks that `comparisonState` is a string, then casts a partial lab object to the complete saved lab type. Restore clamps `Math.round(lab.compareSplit)` without a finite/default check. Extracting/transpiling that exact function and passing a partial envelope changed the divider from 50 to NaN. The value feeds CSS, text and a range input. |
| Problem        | The complete persisted/imported UI envelope bypasses the runtime boundary already present for bounded numerical core state.                                                                                                                                                                                                                                |
| Impact         | Partial/older/malformed settings can corrupt the comparison pane and controls. The core fractal parser itself was not shown defective.                                                                                                                                                                                                                     |
| Root cause     | **Inferred:** laboratory persistence/UI state accumulated inside the 7,393-line component independently of the domain state parser. Size alone is not the finding.                                                                                                                                                                                         |
| Recommendation | Extract a versioned lab/specimen envelope normalizer with finite defaults and decimal-field validation; reuse it for JSON import and local specimens before any state commit.                                                                                                                                                                              |
| Scope          | Fractal Atlas component, focused laboratory-state module and tests.                                                                                                                                                                                                                                                                                        |
| Risk           | Medium: preserve valid old specimens and high-precision decimal state.                                                                                                                                                                                                                                                                                     |
| Validation     | Valid import/export round trips, absent divider, malformed numbers, partial/old local specimens and invalid decimal fields; assert finite bounds and unchanged valid rendering.                                                                                                                                                                            |
| Status         | **Corrected in source on 20 October 2026**; bounded-envelope regressions pass. See the visualization review for production/browser verification.                                                                                                                                                                                                           |

The probe used a supplied valid core-parser result to isolate the envelope failure. It was not a
full browser import test and does not establish every malformed-value consequence.

### AF-006 — Meaning Map leaks document-level scroll state across route lifetime

| Field          | Evidence and assessment                                                                                                                                                                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ID             | AF-006                                                                                                                                                                                                                                                                   |
| Severity       | **P1 — High**                                                                                                                                                                                                                                                            |
| Category       | Svelte/SvelteKit lifecycle and cross-feature correctness                                                                                                                                                                                                                 |
| Location       | `src/routes/blog/visualizations/the-meaning-connection-map/+page.svelte:10–17`; `src/lib/visualizations/meaning-connection-map/MeaningConnectionMap.svelte:81–88,130–138,231–235`.                                                                                       |
| Evidence       | Route mount writes `overflow = 'hidden'` on body and documentElement and returns no cleanup. Map initialization creates a D3 simulation and eight-second timeout with no unmount cleanup. Existing game/motion/render controllers elsewhere have explicit destroy paths. |
| Problem        | Page-scoped resources mutate shared document state without restoring it. SvelteKit client navigation does not recreate the document to clear inline styles.                                                                                                              |
| Impact         | After client/history exit, subsequent long pages can remain scroll-locked; early exit also retains simulation/timer work and detached selections until settling/timeout. Cross-route impact justifies P1 despite the small correction.                                   |
| Root cause     | **Inferred:** the dedicated fullscreen/SEO wrapper adopted in `61fb0087` did not preserve the resource-ownership conventions of other feature controllers. The fullscreen overlay itself is intentional.                                                                 |
| Recommendation | Capture/restore both prior overflow values in synchronous mount cleanup; stop the simulation, clear the timeout, interrupt transitions and release selections on map teardown.                                                                                           |
| Scope          | Dedicated Meaning Map route, map component and navigation/lifecycle test.                                                                                                                                                                                                |
| Risk           | Low to medium: restore pre-existing state and do not stop a newer mounted instance.                                                                                                                                                                                      |
| Validation     | Enter map, exit through history and client navigation to a long article, assert scrolling/styles restored; repeat navigation; unmount before eight seconds and assert no remaining simulation/timer work.                                                                |
| Status         | **Resolved** at the owned-resource boundary; full browser navigation/active-gesture testing remains unverified.                                                                                                                                                          |

**Implemented follow-up:** mount-returned cleanup restores prior body/root overflow values,
axes and priorities. `meaning-connection-map/lifecycle.ts` owns the settle timer, simulation tick
callback/stop, zoom dispatch, SVG/descendant transition interruption and element removal. Cleanup
is instance-owned and idempotent. Four lifecycle fixtures plus three existing graph-integrity tests
pass. The fix avoids removing global D3 window namespaces; transient gesture completion remains
D3-owned. The separate search/filter/accessibility finding `AF-013` is now remediated in source
with focused browser verification; comprehensive accessibility review remains open as described below.

The introduction (`b6175ba3`) and wrapper change (`61fb0087`) explain the specialization. The
baseline relationship fix/revert/reapply (`e358bfb3`, `b3a6a10f`, `2a31d9a3`) addresses D3 edge
mutation, not this lifecycle problem. Svelte's existing [mount cleanup contract](https://svelte.dev/docs/svelte/lifecycle-hooks#onMount)
already supports the correction; no framework migration is necessary.

### AF-007 — Normal publishing can alter artwork promised to be preserved as-is

| Field          | Evidence and assessment                                                                                                                                                                                                                                                                                                                                                                  |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ID             | AF-007                                                                                                                                                                                                                                                                                                                                                                                   |
| Severity       | **P2 — Medium**                                                                                                                                                                                                                                                                                                                                                                          |
| Category       | Build drift, source provenance, preservation contract                                                                                                                                                                                                                                                                                                                                    |
| Location       | `scripts/optimize_images.py:150–187,242–256,332–361,469–480`; `package.json:149–150`; `AGENTS.md` standard post publishing instructions.                                                                                                                                                                                                                                                 |
| Evidence       | Local publishing guidance permits existing lossless, same-dimension optimization of an as-is image. The optimizer resizes large rasters, encodes JPEG quality/subsampling and lossy opaque WebP, then replaces source bytes at the same path. Normal content generation invokes it. AVIF/SVG/animation/original-sketch exceptions are deliberate and narrower than the general guidance. |
| Problem        | The build can transform a supplied source image under an instruction that promises preservation. A successful build does not prove an image remained as-is.                                                                                                                                                                                                                              |
| Impact         | Artwork/dimensions/provenance can change and become hard to recover from the working checkout; hashes and downstream generated metadata change with it. No source image was transformed during this audit.                                                                                                                                                                               |
| Root cause     | **Inferred:** optimizer evolution and publication instructions diverged; no explicit per-asset preservation contract enforces the promise.                                                                                                                                                                                                                                               |
| Recommendation | Define a tested preservation/provenance mode or source-versus-derived asset design that honors as-is requests. Do not simply rename lossy processing as lossless or weaken the user's instruction.                                                                                                                                                                                       |
| Scope          | Image pipeline, manifest, standard publishing instructions and preservation fixtures.                                                                                                                                                                                                                                                                                                    |
| Risk           | Medium: avoid breaking existing generated dimensions/gallery links, file formats, reproducibility and deployment size budgets.                                                                                                                                                                                                                                                           |
| Validation     | Hashes/dimensions before and after an as-is build; JPEG/WebP/large-image/animation/SVG/original-sketch cases; deterministic manifests and generated consumers.                                                                                                                                                                                                                           |
| Status         | **Open**; the conflict is documented, production behavior unchanged.                                                                                                                                                                                                                                                                                                                     |

### AF-008 — Immutable caching assumes revisioned media URLs that are not enforced

| Field          | Evidence and assessment                                                                                                                                                                                                             |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ID             | AF-008                                                                                                                                                                                                                              |
| Severity       | **P2 — Medium**                                                                                                                                                                                                                     |
| Category       | Caching, deployment/media boundary                                                                                                                                                                                                  |
| Location       | `vercel.json:25–28`; `src/lib/components/blog/PostImage.svelte:33–35,56–59,104–105`; `scripts/optimize_images.py:479–480`.                                                                                                          |
| Evidence       | Semantic `/images`, `/photos`, `/sketch`, `/videos`, `/fonts` paths receive `max-age=31536000, immutable`. Tools can replace image bytes at that same path. PostImage's original URL and optimizer URL contain no content revision. |
| Problem        | The immutable policy assumes a URL's bytes never change, but the source pipeline does not enforce that assumption.                                                                                                                  |
| Impact         | A browser/CDN can retain an older image after replacement. This is a conditional source-level policy mismatch, not a measured production stale-cache incident.                                                                      |
| Root cause     | **Inferred:** broad delivery caching and image-generation lifecycle were designed independently.                                                                                                                                    |
| Recommendation | Choose a coherent policy: revisioned/content-addressed public assets, or revalidatable caching for replaceable semantic paths. Update all relevant card/post/social consumers and preservation metadata together.                   |
| Scope          | Deployment headers, asset generation/URLs and image consumers.                                                                                                                                                                      |
| Risk           | Medium: performance, URL stability, social caches and old content links.                                                                                                                                                            |
| Validation     | Replace a fixture image across builds; verify response/cache behavior with a retained browser cache and responsive/original URLs; verify old links and intended immutable assets.                                                   |
| Status         | **Open**.                                                                                                                                                                                                                           |

### AF-009 — URL and redirect contracts are duplicated across runtime and build tools

| Field          | Evidence and assessment                                                                                                                                                                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ID             | AF-009                                                                                                                                                                                                                                                       |
| Severity       | **P2 — Medium**                                                                                                                                                                                                                                              |
| Category       | Semantic duplication, cross-runtime coupling                                                                                                                                                                                                                 |
| Location       | `src/lib/content/categories.ts:86–93`; `src/lib/content/posts.ts:116–140,189–191`; `scripts/build-search-index.mjs:26–32,89–98`; `scripts/validate-seo.mjs:19–44`; `scripts/validate-links.mjs:38–75`; `scripts/validate-discoverability.mjs:65–75,172–185`. |
| Evidence       | Category/path normalization appears in application and Node tools; several scripts regex-extract the TypeScript alias object instead of importing an environment-neutral contract.                                                                           |
| Problem        | One canonical URL rule is maintained through parallel implementations and source-format parsing.                                                                                                                                                             |
| Impact         | A future alias/normalization refactor can make search/validation/redirect consumers disagree. No current broken URL was established.                                                                                                                         |
| Root cause     | **Inferred:** build-time tooling needed runtime knowledge before a stable shared data/helper boundary was extracted.                                                                                                                                         |
| Recommendation | Share neutral alias/taxonomy/path data and a small pure normalization contract usable by both environments; add parity/redirect cases before changing URLs. Preserve the existing `sections.json` shared-data success.                                       |
| Scope          | Content helpers, search indexing, SEO/link/discoverability scripts.                                                                                                                                                                                          |
| Risk           | Low to medium: canonical URLs, redirects, discovery output and historic aliases must remain stable.                                                                                                                                                          |
| Validation     | Table-driven parity across Bengali/ASCII/case/punctuation/category/alias cases; generated links, canonical redirects, search records and RSS/sitemap validation.                                                                                             |
| Status         | **Open**.                                                                                                                                                                                                                                                    |

### AF-010 — Verification accumulated by feature without a coherent repository check matrix

| Field          | Evidence and assessment                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ID             | AF-010                                                                                                                                                                                                                                                                                                                                                                                                      |
| Severity       | **P2 — Medium**                                                                                                                                                                                                                                                                                                                                                                                             |
| Category       | Testing, CI, foundational engineering drift                                                                                                                                                                                                                                                                                                                                                                 |
| Location       | `package.json:127–135,150–167`; `vitest.config.ts:7–43`; `.github/workflows/ct-responsive.yml:4–35,60–70`; `.github/workflows/double-pendulum.yml:4–29,54–61`; `.github/workflows/indexnow.yml`; baseline lint results below.                                                                                                                                                                               |
| Evidence       | `npm test` runs many focused Vitest suites before `notes:test` reruns all 283 default test files. Separate ray-marching/Human+AI configs intentionally cover ten other source test files. Baseline CI has only two path-limited browser regressions and IndexNow, with no general type/lint/unit/security workflow. `lint` stops at formatting: 530 baseline files fail Prettier, so ESLint is not reached. |
| Problem        | Commands' names/aggregation and checked-in CI coverage do not provide one reliable account of which boundaries were checked.                                                                                                                                                                                                                                                                                |
| Impact         | Repeated work, hidden lint status and server/cross-cutting changes outside the existing workflow triggers. Broad concurrent local tests also hit four five-second deadlines; later isolated rerun outcomes are reported below. External required checks were not inspected.                                                                                                                                 |
| Root cause     | **Inferred:** feature-specific verification grew independently; history `674af9b5` and `06d5ba37` records the focused workflow additions.                                                                                                                                                                                                                                                                   |
| Recommendation | Define a truthful command/CI matrix; run each default unit suite once, keep intentional custom configs explicit, decouple formatting/lint status, address baseline formatting in a separate controlled change, and add proportionate broad boundary/security checks. The new documentation gate solves only its own policy scope.                                                                           |
| Scope          | Package scripts, Vitest/Playwright orchestration, workflows and contribution guidance.                                                                                                                                                                                                                                                                                                                      |
| Risk           | Medium: CI duration, resource contention and existing baseline noise; avoid one enormous formatting/refactor diff.                                                                                                                                                                                                                                                                                          |
| Validation     | Clean-checkout command matrix, each unit suite once, explicit custom configs, lint reaches ESLint, negative server-boundary fixtures, stable worker budgets and scoped browser runs.                                                                                                                                                                                                                        |
| Status         | **Open**; architecture policy automation is delivered separately.                                                                                                                                                                                                                                                                                                                                           |

### AF-011 — Architecture knowledge had no durable canonical maintenance contract

| Field          | Evidence and assessment                                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ID             | AF-011                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Severity       | **P2 — Medium**                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Category       | Documentation drift, governance                                                                                                                                                                                                                                                                                                                                                                                                             |
| Location       | Baseline `README.md:1–21` and feature documentation; `docs/handwritten-notes-architecture.md` baseline `65–71,341–342`; `src/lib/server/notes/referrer-policy.ts:4–9`; `src/lib/components/tts/ChatterboxTTS.svelte:3,9`; original `.env.example`; workstation `.git/info/exclude:9`.                                                                                                                                                       |
| Evidence       | README opens with the starter scaffold; no canonical architecture/contribution gate/PR template/ADR directory existed. Root AGENTS was excluded locally, so its instructions did not travel with a clone. Notes text claimed all auth pages used no-referrer after code intentionally adopted clean-page same-origin; version guidance described historical choices as current. The dynamic public TTS flag was absent from `.env.example`. |
| Problem        | Feature documents and workstation instructions could diverge without a required cross-cutting update or review entry point.                                                                                                                                                                                                                                                                                                                 |
| Impact         | Contributors can repeat outdated design/security/configuration assumptions and miss structural consequences.                                                                                                                                                                                                                                                                                                                                |
| Root cause     | **Inferred:** documentation accumulated alongside features, with no single ownership/maintenance contract. Referrer history `96870910` demonstrates intentional code change followed by stale text.                                                                                                                                                                                                                                         |
| Recommendation | Maintain one factual canonical reference, one contribution policy and linked entry points; adopt explicit architecture review with selective automation and significant ADRs. Preserve feature documents as detailed/historical sources.                                                                                                                                                                                                    |
| Scope          | README, AGENTS, CONTRIBUTING, architecture/report/coverage/ADR files, PR template/workflow/gate, `.env.example`, narrow Notes documentation correction.                                                                                                                                                                                                                                                                                     |
| Risk           | Low application risk; moderate process noise if heuristics are overbroad. Required-status hosting configuration is a separate maintainer action.                                                                                                                                                                                                                                                                                            |
| Validation     | Path/link/line evidence checks, policy fixtures, targeted formatting/lint, diagrams against source, final diff scope; no meaningless canonical edits merely to pass a path check.                                                                                                                                                                                                                                                           |
| Status         | **Resolved in this change** at the repository documentation/policy layer. Hosted workflow execution and required branch status are unverified; the remaining application defects stay open.                                                                                                                                                                                                                                                 |

### AF-012 — Generated note metadata bypasses its final persistence constraints

| Field          | Evidence and assessment                                                                                                                                                                                                                                                                                                                                                             |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ID             | AF-012                                                                                                                                                                                                                                                                                                                                                                              |
| Severity       | **P3 — Low**                                                                                                                                                                                                                                                                                                                                                                        |
| Category       | Validation fragmentation, boundary correctness                                                                                                                                                                                                                                                                                                                                      |
| Location       | `src/lib/server/notes/repository.ts:102–111,543–547`; `supabase/migrations/202607230001_handwritten_notes.sql:11–12`; `src/routes/notes/studio/+page.server.ts:41–46`; `src/lib/notes/schema.ts:224–226`.                                                                                                                                                                           |
| Evidence       | Slug helper trims edge hyphens before truncating at 150. A valid 151-character title of 149 letters plus ` b` produces a trailing-hyphen slug rejected by SQL. Duplicate appends ` (copy)` without reserving space under SQL's 160-character title limit; a 160-character title becomes 167. `createNoteInputSchema` has no caller. Both helper edge cases were reproduced locally. |
| Problem        | Original form input is checked/truncated, but derived values do not pass the same final creation contract.                                                                                                                                                                                                                                                                          |
| Impact         | Valid titles near boundary lengths fail creation or duplication. Existing valid saved notes were not shown corrupt.                                                                                                                                                                                                                                                                 |
| Root cause     | **Verified:** normalization/truncation order and duplicate-title generation bypass final constraints.                                                                                                                                                                                                                                                                               |
| Recommendation | Trim/validate the final slug, reserve suffix length for copy titles, and reuse an explicit final creation contract. Preserve existing slugs and collision retries.                                                                                                                                                                                                                  |
| Scope          | Note creation/duplication helpers and focused boundary tests.                                                                                                                                                                                                                                                                                                                       |
| Risk           | Low; avoid changing existing public paths.                                                                                                                                                                                                                                                                                                                                          |
| Validation     | Lengths 149–160, separator boundaries, non-Latin-only titles, reserved paths, collisions and duplicate suffixes.                                                                                                                                                                                                                                                                    |
| Status         | **Open**.                                                                                                                                                                                                                                                                                                                                                                           |

### AF-013 — Meaning Map view state has competing imperative owners

| Field          | Evidence and assessment                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ID             | AF-013                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Severity       | **P2 — Medium**                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Category       | Svelte reactivity, semantic interaction, accessibility                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Location       | `src/lib/visualizations/meaning-connection-map/MeaningConnectionMap.svelte:101–109,141–144,152–186,199–229,265–271,327–369`; `src/lib/visualizations/meaning-connection-map/simulation.test.ts`.                                                                                                                                                                                                                                                                                           |
| Evidence       | Search updates `searchQuery`/`filteredNodes`, but the derived result is never consumed. Category filters, connection highlights and clearHighlights independently write opacity; clearing selection can visually restore filtered nodes while their pointer events remain disabled. Background clear does not clear highlighting. Initially appended SVG concept groups only have click handlers, with no focus/keyboard activation/roles or initially available semantic concept browser. |
| Problem        | Rune-owned controls and imperative D3 state are not composed through one semantic view model. This is separate from the resource-lifetime cause in `AF-006`.                                                                                                                                                                                                                                                                                                                               |
| Impact         | Inert search, contradictory category/selection rendering, stale highlights and no initial keyboard path into primary concept exploration. Compiler-clean markup does not cover imperatively appended graph semantics.                                                                                                                                                                                                                                                                      |
| Root cause     | **Inferred:** interaction semantics were split between UI controls and renderer mutation paths without composition tests.                                                                                                                                                                                                                                                                                                                                                                  |
| Recommendation | Derive a combined query/category/selection model and apply it through one renderer update; expose an accessible concept/result list or semantic keyboard graph controls. Keep authored edge IDs isolated through the existing simulation-edge adapter.                                                                                                                                                                                                                                     |
| Scope          | Map interaction/controller logic and focused browser/view-model tests.                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Risk           | Medium: selection and transitions must stay coherent when filters hide the selected node.                                                                                                                                                                                                                                                                                                                                                                                                  |
| Validation     | Search results; category hide → select/close/background clear; initial keyboard-only concept selection; screen-reader names/descriptions; retain current edge integrity/mutation-isolation tests.                                                                                                                                                                                                                                                                                          |
| Status         | **Remediated in source, focused unit tests and production-browser checks**; comprehensive accessibility integration remains open.                                                                                                                                                                                                                                                                                                                                                          |

**20 October 2026 visualization-review follow-up:** a single reactive D3 projection now composes
search, category visibility, selection highlighting, pointer access and keyboard tab order.
Closing the panel or clicking the background clears highlighting without restoring filtered nodes.
Filtering the selected concept clears selection; following an explicit detail link enables the
destination category and clears a conflicting search. SVG concepts have button roles, names,
pressed state, Enter/Space activation and a visible focus ring. Incoming relations name both
authored endpoints instead of presenting the relation backwards. A container resize observer
replaces the fixed 2400-by-1800 viewport crop and is disconnected at teardown. Nine focused
graph/projection/lifecycle fixtures pass, including search/category intersection and authored-edge
mutation isolation. Production-browser checks also pass for keyboard selection, search clearing a
hidden selection, mobile detail-panel width and navigation/header geometry. See the
[visualization review](../visualization-review-2026-10-20.md) for the complete exercised scope.
These checks are not a comprehensive screen-reader or accessibility integration audit.

## Non-findings and deliberate exceptions

- Stores and legacy syntax are not automatically wrong. The sole unreferenced readable-store helper
  is optional cleanup; no broad migration is justified. Svelte 5 compatibility is documented in the
  [official legacy overview](https://svelte.dev/docs/svelte/legacy-overview).
- Generic shader experiments, dedicated Canvas/WebGL/Three/D3 labs, game controllers and Observable
  notebooks have different model/lifecycle contracts. Shared abstraction would need measured
  repetition, not a common word in component names.
- Feature co-location and type-only component references are directory exceptions, not proof of
  runtime coupling. The five UI barrel cycles have no demonstrated TDZ failure and are not counted.
- Notes editor/viewer wrappers are keyed by identity/revision. Their intentional initialization and
  `untrack` usage were not misreported as stale props. Existing effects often synchronize imperative
  controllers/observers with appropriate cleanup.
- Public-note offline retention after unpublishing is explicitly documented. The worker excludes
  private authoring/auth/API responses; no private-cache leak was found.
- Local Supabase signup/password defaults are not production evidence. Hosted configuration was
  not inspected. Manually asserted row types are a testing/type-assurance limitation, not proof of
  an authorization failure.
- Retained backups/captures and large components are not automatically abandoned application
  implementations. Source globs and actual script consumers determine whether they participate.
- A sandboxed notebook iframe and blanket framing-denial header form a source-level compatibility
  question. Deployed headers/browser behavior were not checked, so no additional verified runtime
  failure is counted.

## Prioritized remediation roadmap

This is the baseline order. The urgent follow-up completed the owned-resource correction in
step 1 and the stale-session/no-op correction in step 2, with focused mocked tests. Step 3 now
has public TTS/contact containment. Live database evidence and the remaining work are still open.

| Order                              | Work                                                                                                               | Dependencies and validation before changes                                                                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 — Quick containment              | `AF-006`: restore scroll state and clean map resources.                                                            | Add a focused repeat-navigation/unmount regression first; small scope and immediate cross-page benefit.                                                               |
| 2 — Establish persistence evidence | `AF-003`: disposable DB/API role/revision/session fixtures; then `AF-002` metadata outcome.                        | Test real fresh/stale transitions and publication visibility. Do not change RPC security or rewrite deployed migration history without this coverage.                 |
| 3 — Public resource contract       | `AF-001`: streamed readers, runtime shape, durable cost controls/deadlines and meaningful security commands.       | Mock providers/streams and verify supported forms/private/public headers; complete before expanding enabled TTS usage. This can proceed in parallel with DB fixtures. |
| 4 — Recoverable browser boundaries | `AF-004`, `AF-005`, `AF-013`: bounded save operations, validated specimen envelope, composed accessible map state. | Add unknown-outcome/idempotent save tests, backward-compatible import fixtures and keyboard/filter tests before extracting controllers.                               |
| 5 — Small final-value correction   | `AF-012`: slug/title generation boundaries.                                                                        | Focused pure/handler tests; preserve existing links and collision behavior. Can land independently.                                                                   |
| 6 — Media contract design          | `AF-007` then `AF-008`: agree source preservation/derived assets and coherent cache revision policy together.      | Source hashes/dimensions and cache-replacement fixtures required. Do not mass-regenerate/rename assets before the contract is tested.                                 |
| 7 — Systemic maintenance           | `AF-009`, `AF-010`: shared URL data/parity and one truthful verification matrix.                                   | Establish golden canonical/redirect/index output before consolidation; separate formatting cleanup from behavior; preserve custom configs and build:site split.       |
| Ongoing                            | Maintain the resolved `AF-011` reference/policy and add significant ADRs.                                          | Review semantic impact; configure the architecture job as required in hosted branch rules when adopted. No path heuristic proves architectural accuracy.              |

Do not start a repository-wide runes rewrite, universal engine abstraction, global store migration,
mass formatting, asset deletion or numerical refactor as a consequence of this audit. Those changes
were not requested and are not justified by the demonstrated failures.

## Documentation and enforcement delivered

- [ARCHITECTURE.md](ARCHITECTURE.md): current implementation, versions, diagrams, boundaries,
  rendering/cache/security/state/test conventions, explicit exceptions/debt and adding-feature guidance.
- [AUDIT_COVERAGE.md](AUDIT_COVERAGE.md): area inventory, methods and limitations.
- Root README links; [CONTRIBUTING.md](../../CONTRIBUTING.md#architecture-change-gate) is the one
  mandatory policy; versioned AGENTS references it while retaining existing rules.
- [PR template](../../.github/pull_request_template.md), [ADR convention](decisions/README.md) and
  [ADR 0001](decisions/0001-canonical-architecture.md).
- Dependency-free gate/script fixtures and [workflow](../../.github/workflows/architecture.yml):
  explicit PR declaration plus selected structural signals, canonical-file/README checks, base-policy
  execution via a read-only trusted-base workflow and merge-base/history checks. The initial
  introducing change requires local fixture validation/manual review until adopted on the base. Ordinary component/post/test edits do not
  force a cosmetic architecture diff.
- `.env.example` now documents the existing visitor-readable dynamic TTS flag; Notes feature docs
  point to current architecture/versions and correctly distinguish clean/secret auth referrer policy.

The gate cannot evaluate prose quality or infer every semantic change. It does not configure hosted
branch protections or Actions event policy. Documentation/enforcement alone does not resolve
production findings; the implemented follow-ups are identified separately.

## Validation record

This table records the original audit before the production follow-ups. Later verification is
listed separately below.

| Check                                                                                                                         | Result and practical limit                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`                                                                                                               | **Passed**: zero errors, zero warnings.                                                                                                                                                                                                                                                                                                                                                  |
| Installed compiler sweeps                                                                                                     | **Passed**: 406 library + 37 route Svelte files, zero errors/warnings; route sweep transpiled TypeScript first. Not a full browser/a11y test.                                                                                                                                                                                                                                            |
| `npm run notes:test`                                                                                                          | **Failed on four 5-second timeouts**: 279 files passed, three failed, one skipped; 1,936 tests passed, four timed out, one skipped. Broad run overlapped other checks. Chained SQL step did not run after this failure.                                                                                                                                                                  |
| Isolated rerun of three timed-out files, `--maxWorkers=1`                                                                     | **Default deadlines still fail**: two files failed/one passed; 43 tests passed/two timed out. City Master Plan and the second Footpath case passed. This narrows, but does not clear, the baseline timeout failure.                                                                                                                                                                      |
| `node --test scripts/handwritten-notes-migration.test.mjs`                                                                    | **Passed 6/6** separately. SQL source checks only, not migration/role execution.                                                                                                                                                                                                                                                                                                         |
| Focused recovery/referrer tests                                                                                               | **Passed 21/21**, two files.                                                                                                                                                                                                                                                                                                                                                             |
| `npm run lint` baseline                                                                                                       | **Failed**: 530 files have formatting differences. Chained ESLint was not reached. No baseline formatting changes applied.                                                                                                                                                                                                                                                               |
| New gate Git-fixture tests                                                                                                    | **Passed 13/13**: ordinary edits, declared impact, structural signals, rename/delete/empty docs, README links, metadata placeholders, missing/unrelated/shallow history and merge-base behavior.                                                                                                                                                                                         |
| New gate formatting/ESLint/workflow YAML                                                                                      | **Passed** targeted checks; workflow parsed with unique keys and read-only permissions. Hosted execution unverified.                                                                                                                                                                                                                                                                     |
| Isolated behavior probes                                                                                                      | Confirmed TTS body/null handling, partial metadata persistence, note slug/title boundaries and Fractal lab NaN. Mocked/local source execution, not live integration.                                                                                                                                                                                                                     |
| Diagnostic rerun of the two remaining timeout cases, one worker and `--testTimeout=30000`                                     | **Passed 2/2**, 31 unrelated tests skipped. This diagnostic did not change committed test deadlines and does not clear the default-command failure.                                                                                                                                                                                                                                      |
| Source inventory/import graph/history                                                                                         | Completed with explicit limits in coverage document.                                                                                                                                                                                                                                                                                                                                     |
| New/edited Markdown links, source path/line references, final formatting and `git diff --check`                               | **Passed**: 43 local Markdown links/anchors, 69 source references and 34 line-range checks; 15 cited history commits resolved. Diagrams reviewed against implementation. New/edited entry-point Markdown and new gate files pass targeted formatting; new JS passes ESLint; diff whitespace check passed. Existing Notes document received narrow factual edits without mass formatting. |
| Full production build, aggregate `npm test`, custom ray/Human+AI unit configs, browser/GPU/live provider/DB/deployment checks | **Not run**. Build mutates content/media; no application changes require regeneration. Other omissions are not implied passes.                                                                                                                                                                                                                                                           |

Temporary command logs were retained under the audit host's temp directory using the
`codex-architecture-*-20261020.log` names. Repository documentation contains the outcomes so it does
not depend on those workstation files. No secret values, real note contents or provider responses
were collected.

## Follow-up verification record

- `npm run check`: **passed, zero errors and warnings** after correcting two new test-only
  TypeScript annotations identified on the first integrated run.
- `npm run test:critical`: **83 tests passed in eight files**, covering shared request/deadline
  controls, TTS, contact, Notes metadata and Meaning Map simulation/lifecycle behavior. Providers
  and persistence transports were mocked; this is not live database/provider assurance.
- `npm run build-workflow:test`: **14 tests passed**. Six check npm lifecycle reachability and
  workflow selection/security; eight exercise the real gallery CLI in isolated temporary fixtures.
- `npm run notebooks:test`: **12 tests passed**. `npm run notebooks:prepare` verified both existing
  source/output contracts without rendering or modifying notebook HTML.
- `npm run features:check`: **passed** all retained Barnum, Bias Archipelago, BZ, Prior Authorization
  and Strange Attractor checks.
- Architecture gate fixtures: **13 tests passed**; **47 local Markdown links/anchors** resolve.
  Targeted formatting and ESLint checks passed for the changed boundary code, tests and entry-point
  documentation. Existing feature components received only the lifecycle edits, without mass formatting.
- The first routine build found a gallery verification false positive caused by CRLF versus LF
  line endings. The comparison now treats only those line endings as equivalent, preserves
  existing bytes/mtime, and still rejects semantic or whitespace changes. The regression fixtures
  cover both verification flags and missing/stale outputs.
- Corrected `npm run build`: **passed**, using `IMAGE_OPTIMIZE_VERIFY_ONLY=1` and
  `WORDCLOUD_VERIFY_ONLY=1`. Publication validators, search generation, SSR/client compilation,
  Vercel adaptation and rendered discoverability checks completed; the final check covered 701
  published posts and representative rendered routes. Chunk-size and dependency-tracing warnings
  were emitted; a passing build does not establish live provider/native-module behavior.
- `npm run barnum-lab:route-assets`: **passed** against the completed production output. Together
  with feature checks and notebook preparation above, this exercises every maintenance-lane
  component without repeating the production build.
- A before/after SHA-256 comparison covered **3,167 tracked content/media/generated inputs**.
  Posts, notebook sources/HTML and artwork stayed byte-identical. The sole byte difference was
  CRLF-to-LF in the tag manifest, with identical normalized text/JSON and no staged Git diff.

Repository-wide formatting debt and the baseline default-unit timeouts above remain open.
Full browser navigation/gesture behavior, live Supabase concurrency/RLS, paid providers and
production deployment were not exercised by this correction.
