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
enforcement gap. The feature-local generation flow is retained; no new service or hosted
security policy is introduced. The incomplete framework migration remains a separate plan.
