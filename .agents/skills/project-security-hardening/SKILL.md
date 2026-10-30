---
name: project-security-hardening
description: Review and harden SuvroGhosh.IN security boundaries with evidence, targeted fixes, and regression verification. Use for an explicitly requested security review or remediation of this repository.
---

# Project security hardening

Read the repository's `AGENTS.md`, the architecture change gate in `CONTRIBUTING.md`, and the affected sections of `docs/architecture/ARCHITECTURE.md` before implementation. Classify architecture impact first. The forensic audit records outstanding work, not implemented safeguards.

## Tool selection and evidence

- Prefer the official Codex Security plugin when its installed workflows are available in the active session. Follow its actual scan/triage/validation/fix contracts; preserve its generated evidence unchanged. Installation on disk does not establish active-session availability.
- If a workflow is unavailable, identify the missing capability and continue authorized independent work as a **Codex-assisted security review**. Never synthesize plugin verification receipts or Claude Security panel votes. Do not weaken or edit vendor-managed skills.
- Record the source revision, dirty state, scope, tool versions, commands, and exclusions. Prior reports and advisory severities are hypotheses to check against current dependency paths and reachable code.
- For a finding, show attacker input, preconditions, entry point, failing control, sink, impact, counterevidence, and validation method. Independent review helps challenge findings; agreement alone is not verification.

## Repository boundaries

- Review API handlers with their hooks, server actions, shared helpers, database policies/RPCs, and provider transports. Do not infer database authorization from SQL token tests or hosted settings from `supabase/config.toml`.
- Preserve server-only secrets, CSP, Vercel headers, private-response caching, public content/crawlers/RSS/sitemaps/previews, and the trusted-base `pull_request_target` workflow. Never execute untrusted PR-head code in a privileged job.
- Expensive or state-changing endpoints require runtime validation, actual streamed byte limits before parsing, appropriate same-origin policy, bounded lifetimes, and cost-appropriate admission. Origin is not authentication; process-local throttling is not a shared quota.
- Public TTS must remain unavailable when its durable resource admission cannot be established. Keep provider error bodies and credentials out of public responses. Existing Prompt Atlas patterns are references, not evidence that another endpoint is protected.
- Assess login abuse together with account-lockout risk. Hosted signup/MFA settings and enrollment require separate evidence and authorization; do not silently change account policy.

## Changes and validation

Use small coherent fixes, compatible dependency upgrades, and focused regression tests. Demonstrate rejected abuse and preserved legitimate behavior; record before/after evidence where feasible. Avoid blanket forced dependency upgrades and broad advisory suppressions.

Use loopback requests, mocked providers, and disposable databases for destructive or abuse fixtures. Keep secrets redacted and detailed artifacts in ignored `.audit-private/`, outside public content. Do not call paid providers or change production merely to validate a claim.

Inspect the current `package.json` before naming runnable checks. Use `security:audit`, `security:smoke`, focused suites, `check`, the appropriate build lane, and the architecture fixtures as applicable. Missing tools, failed advisory lookups, skipped tests, and unavailable database checks remain explicit gaps. A failing security check is not a pass with warnings.

Update affected architecture text/diagrams and significant ADRs in the same change. Keep a sanitized remediation record with verified facts, residual risks, and exact deployment prerequisites. Follow the user's Git/publication scope; authorization for local remediation does not authorize production changes.

The handoff identifies the reviewed and final revisions, tool used, tested fixes, rejected claims, unverified surfaces, commands/results, artifact paths, and remaining operator work. Include exactly one architecture-impact declaration and a substantive rationale as required by `CONTRIBUTING.md`. Do not certify that a clean scan proves the absence of vulnerabilities.
