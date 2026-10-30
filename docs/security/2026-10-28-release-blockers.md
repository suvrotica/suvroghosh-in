# Release-blocker follow-up — 28 October 2026

This continues draft PR #19 from clean revision
`dbe6303c4f49105a2e0d6138e2c13e6d492ed3ef`. Fetched `origin/main` remains
`5331974c045ffa655d3024476a8074fc5fa67804`. The user authorized targeted fixes,
dependency investigation, read-only hosted checks and a new preview. Production deployment,
merge, hosted migrations, account changes and advisory suppression remain outside scope.

## Calibration failure: cause and repair

The prior Linux feature-artifact job failed the exact decoded-pixel comparison for
`calibration.png`; the same failure predates the security branch. Local probes held the SVG,
Sharp 0.35.5 and committed images constant while changing font discovery. Normal Windows
font discovery reproduced all five references exactly. An empty Fontconfig configuration
changed 12,691 calibration pixels, 8,319 facade pixels, 4,713 portrait pixels, 5,140 corridor
pixels and 88,453 typography pixels. This establishes a font-dependent source, without
claiming which replacement font the old Linux runner selected.

The renderer now consumes finite complete outlined labels from
`scripts/artwork/lens-mirror-labels.json`, with font-source hashes and authoring-tool provenance.
No font file or reusable character alphabet is distributed. The normal build never loads a
font or invokes the authoring helper. All 47 authored label placements, their strings and
styles, and the five images' non-text geometry are preserved by regression fixtures.

Outlining changes text rasterization, so this is an intentional reviewed artwork update rather
than a claim of identical old pixels. Changed pixels comprise 0.319% of calibration, 0.464%
of facade, 0.196% of portrait, 0.272% of corridor and 1.264% of typography. Before/after images
were inspected. The five references and manifest were regenerated only after that review;
the actual running default lab was recaptured on loopback for its 1400 × 1271 poster.
Poster provenance now includes the outline asset.

The checker still requires exact decoded-pixel agreement and now also compares source/label
provenance. Tests reject a one-channel, one-pixel edit and an altered source hash without
rewriting either artifact. Normal and empty font discovery produce identical new hashes.
The feature workflow adds Ubuntu and Windows jobs running these fixtures and the same strict
sample checker. Hosted results are reported in the PR; local success is not evidence that a
Linux job has passed.

## Browser provisioning: follow-on CI repair

At revision `e6a60f2d`, the Ubuntu and Windows portability jobs both passed all three
regressions and exact comparisons for all five images. The full feature job also passed
calibration, the complete build, public-link audit, 64 navigation checks and eight HTTP/TCP
browser checks. It then failed before executing all nine essay-anatomy cases: the suite
requested `chromium_headless_shell`, while CI deliberately installs full Chromium with
`--no-shell`.

The essay configuration now selects the installed `chromium` channel in CI, matching the
other feature suites. Local Chrome and explicit channel overrides are retained. The existing
workflow contract now covers this suite and reproduced the old mismatch before the fix;
all eight workflow tests then passed. Actual local CI-mode runs passed all nine essay,
13 Living Systems and ten Strange Matter browser cases using separate loopback previews.
No application behavior, browser assertion or artifact threshold was relaxed. Hosted results
for the follow-on revision are recorded in the PR.

## Stationary graphics: additional browser blocker

The full feature run at `181e13b7` passed calibration, complete artifact/notebook/site
builds and the navigation (64), HTTP/TCP (8), essay (9) and Living Systems (13) browser
cases. Strange Matter passed five cases and failed five on the Linux runner. Four
exhausted their total 60-second budget during later interactions. The fifth exhausted
the ten-second sustained-image sampling deadline.

Retained screenshots show intact artwork. The Liquid Knot trace records successful
bright-artwork samples taking about five seconds each; its second sample completed
after the deadline. The reported counter of one is not evidence of one bright pixel
or a black frame. Other traces show multi-second delays before ordinary key presses
and clicks. An unchanged local test forced through Chromium's
[documented SwiftShader driver](https://github.com/chromium/chromium/blob/main/docs/gpu/swiftshader.md)
also exhausted 60 seconds; the same test took about 14 seconds on the normal GPU.

The renderer scheduled 35 frames after every redraw, including paused or zero-speed
edits, resizes and export restoration. Stationary invalidations now settle the exact
settings and request one frame, then idle. Deferred geometry rebuilding still requests
its own final frame; moving animation retains its existing easing. A new regression
counts actual WebGL submissions and first failed against the old renderer because the
paused scene kept drawing. Existing pixel thresholds, browser timeouts and export
assertions are retained. All eleven native browser cases passed after the fix. The
unchanged software-rendered four-world case then passed in 33.8 seconds, followed by
all ten remaining cases, including the new idle regression, with no skips or failures.
The software comparison used the same Chromium 151.0.7922.34 and confirmed ANGLE /
Vulkan SwiftShader Device (Subzero), with sandboxing enabled. Hosted results are
recorded in the PR; local software rendering does not establish a Linux CI pass.

The actual loopback application's 1600 × 1000 PNG export was recaptured after this
change. Its 1200 × 750 poster has zero changed decoded pixels versus the committed
reference, so the existing lossless encoding is retained. Only the renderer source
hash changes in the provenance manifest; the strict source/pixel check passes.

## Dependencies: unsupported migrations remain excluded

The starting complete audit reported ten low affected packages from three advisories,
with zero source/workflow policy violations. The unused `@vercel/speed-insights` SDK is now
removed from the manifest and lockfile, along with its unused test mock. ADR 0008 already
retired its initialization; no runtime import or other integration required it. The active
Web Analytics integration and the browser guard against Speed Insights requests remain.
This removes an unused dependency and propagated advisory entry, not an underlying Kit or
`deepmerge` vulnerability. All retained dependency versions are unchanged; no suppression,
forced peer install, downgrade or private fork was introduced.

The resulting audit reports nine low affected packages from the same three advisories and
zero policy violations across 1,993 source modules and nine workflows. It still exits 1.
All ten active Web Analytics tests passed after removing the dead Speed Insights mock.

The [migration-readiness investigation](2026-10-28-kit3-migration-readiness.md) records exact
stable and canary resolver experiments. A stable Kit 3 core resolves but still fails audit
because its build plugin depends on unpatched `deepmerge`. The full stable application fails
peer resolution at the Vercel integrations. A canary experiment resolves only by retaining
nested vulnerable Kit 2 copies through UI dependencies. These results do not provide a
supported clean migration. The investigation isolates the required upstream compatibility
work and application migration inventory without mixing an incomplete framework migration
into this remediation.

## MFA: source enforcement and hosted access are distinct gaps

An earlier recommendation to enable owner MFA was incomplete. Checked-in Notes authentication
accepts an owner password session without a second-factor challenge. Its owner checks,
private-data/storage policies, privileged owner RPCs and session-freshness checks do not
require `aal2`. A recent password-only session satisfies the implemented freshness predicate.

Supabase Auth factor enrollment does not itself add those authorization checks. Supabase
dashboard/account MFA protects management access and is a separate control. A future Notes
MFA rollout needs a challenge/recovery flow and coordinated enforcement across private routes,
direct database/storage access and privileged RPCs, preserving public published-note reads.
See the [Supabase application MFA guide](https://supabase.com/docs/guides/auth/auth-mfa) and
[platform MFA guide](https://supabase.com/docs/guides/platform/multi-factor-authentication).

Source evidence: `src/routes/notes/sign-in/+page.server.ts`, `src/lib/server/notes/auth.ts`, and
the session, owner RPC, RLS and storage policies in
`supabase/migrations/202607230001_handwritten_notes.sql`. This is a confirmed source-level
gap, not proof that production has no additional deployed controls.

Fresh access discovery found no active Supabase connector, installed CLI or existing CLI
authentication. Native browser inspection found no authenticated Supabase tab; navigation
failed because coordinate input geometry was unavailable. No login/signup attempt or blind
input retry was made. Production signup policy, owner factor enrollment and separately
deployed enforcement therefore remain unverified. The Supabase plugin is available but
uninstalled; no plugin or account setting was changed. No active official Codex Security
workflow was exposed, so this remains a Codex-assisted review.

## Integration with the completed UML feature

After the security revision `d40fc85a` passed the full functional CI run, external `main`
advanced to `d060e60f`. The security branch was rebased onto that revision. The integration
preserves genuine local PlantUML rendering, current-source/metadata export review, owner-only
AI authorization and the shared Prompt Atlas quota. The independent UML flag and unconditional
preview AI disablement remain, including before OIDC credential discovery. Full-configuration
regressions prevent missing credentials from accidentally masking a preview-gate failure.
Compiler/AST fixtures preserve inert exported metadata, and conditional saved-figure imports
retain the article bundle boundary. TTS enablement remains false.

The new disposable PostgreSQL test executes the existing shared-quota migration. It verifies
RPC/table permissions, mixed UML/Prompt Atlas admission into one 50-request daily pool, and
refusal of a sixth owner-hour reservation without spending the daily pool. It uses serial
PGlite execution; it does not verify hosted deployment or multi-session contention. These four
tests join the existing nineteen Notes/TTS SQL tests in `security:sql`.

The incoming UML decision retains ADR 0020; the unmerged TTS decision is renumbered ADR 0021
with its references updated. Earlier preview-preparation notes describe the earlier UML
implementation; their process-local-only limitation is superseded by this integrated quota.
Provider pricing, actual owner MFA enforcement and hosted settings remain separate release gates.

The combined graph installs with strict peer checks. The audit still fails on the same nine
low affected packages and three advisories, with zero policy violations across 2,010 source
modules and nine workflows. The 28 package paths added by main retain its exact versions,
resolved locations and integrity metadata; no unrelated upgrades were introduced. UML unit
verification passes 103 tests in eleven files, and its real engine passes all fourteen diagram
fixtures plus unsafe-input rejection, cancellation/recovery and network-isolation assertions.
Type checking reports zero errors/warnings; architecture/workflow fixtures pass 21 tests.

The full build, browser suites, CI and preview receive fresh verification. Their final results
are recorded in the PR against its exact revision; passes from `d40fc85a` are retained as
historical evidence, not attributed to the new head.

## Hosted UML acceptance: server module compatibility

The integrated `fa59a6a6` revision passed local and functional CI checks, but exact-preview
acceptance exposed HTTP 500 from `/api/uml`. Vercel runtime logs identify `ERR_REQUIRE_ESM`:
CommonJS `sanitize-html@2.18.1` requires its ESM-only `htmlparser2@12.0.0`. Ordinary local Node
24 accepts that bridge; the deployed loader did not. The same failure is reproducible locally
with `--no-experimental-require-module`, including against the generated server chunk.

Keep the patched sanitizer and parser. Vite now selectively bundles the sanitizer, its complete
parser/DOM dependency family and `is-plain-object`. Bundling the nested family also prevents
bare external imports from silently resolving older root packages used by LinkeDOM. This does
not change sanitizer allowlists, dependency versions, the client bundle policy or runtime flags.
The new `security:smoke` fixture reads the actual Vite configuration, creates an isolated SSR
bundle of the real policy, and exercises its import and SVG preservation/rejection in a child
process with CommonJS-to-ES-module loading disabled. The fixture failed before the change.

Earlier preview acceptance remains failed evidence, not a pass retroactively attributed to this
fix. The corrected server artifact, local browser behavior and a fresh exact-revision deployment
must be verified; their results belong in the PR and final handoff.

## Hosted UML acceptance: first worker download

The first protected browser case on `fa59a6a6` also failed independently of the API error.
Its worker asset had cache-MISS response headers but no completed body before the 20-second
render timer expired. A bounded authenticated measurement later downloaded the same 3,402,281
bytes in 1.27 seconds with cache HIT and matching SHA-256; the unchanged first browser case
then passed in 4.8 seconds. That supports a startup-delay diagnosis, not a measured CPU-only
render failure. The original failed run is preserved.

The old timer began immediately after `new Worker()`, covering fetch, initialization and
rendering together. The worker now signals readiness only after imports, isolation and its
message handler are ready. Startup is bounded to 60 seconds; untrusted source is withheld
until readiness, then the existing 20-second render deadline starts. Queue/input/output limits
are unchanged. Cancellation and timeout terminate the worker, clear both lifecycle states and
ignore stale callbacks. Fake-worker regressions exercise delayed startup, bounded failure,
unchanged rendering deadlines, reuse and cancellation. A real-engine harness delays the first
worker response by 25 seconds to exercise the protocol separately from warmed-cache success.

## Verification and handoff

The three new sample fixtures, five exact sample checks, authoring-provenance check and real
poster provenance check passed locally. Architecture/workflow/security-policy fixtures passed
27 tests. The full build, final CI and exact-preview results are recorded in the PR and final
handoff, including any additional failure. No local test establishes hosted Auth, production
database enforcement or a live paid-provider result. TTS remains disabled.

Ignored evidence is under `.audit-private/calibration-determinism/`,
`.audit-private/lens-mirror-baseline/`, `.audit-private/dependency-research-kit3/`,
`.audit-private/security-production/` and `.audit-private/security-release-blockers/`.

Architecture impact: yes

Architecture rationale: Reviewed the canonical reference; documented finite label artwork as
a generated-image input, exact cross-platform verification, and the existing Notes MFA
enforcement gap. Browser provisioning now consistently uses the full Chromium installed by
feature CI; stationary Strange Matter rendering returns to idle after necessary redraws.
The incoming UML owner/shared-quota and genuine local-rendering boundaries are retained
alongside preview containment, executable shared-quota verification and selective server dependency
bundling for the deployed loader, plus separate bounded worker startup and rendering. No new service or hosted
security policy is introduced. The incomplete framework migration remains a separate plan.
