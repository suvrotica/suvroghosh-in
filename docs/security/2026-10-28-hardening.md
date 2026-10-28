# Security hardening — 28 October 2026

## Scope and method

Baseline: `362500d8818eeb0ac6609d2b5c527b3bbd005315`, initially clean. Implementation is on
`codex/security-hardening`. The earlier Claude review of `981a178` was treated as leads rather
than verified evidence about this checkout.

This is a **Codex-assisted security review with executable local checks**. The official Codex
Security plugin installed as `codex-security@openai-curated`, version `d6169bef`, but its workflows
were not exposed in this active chat. No official plugin scan or Claude panel verification is
claimed. A fresh session must discover the installed workflows before using them. The project
skill is [.agents/skills/project-security-hardening/SKILL.md](../../.agents/skills/project-security-hardening/SKILL.md).
It passed the Skill Creator validator and an independent read-only behavioral review.

Reviewed surfaces: TTS, Notes document/upload/auth/transport helpers, hooks, Supabase role/RPC
contracts, workflow trust boundaries, dependencies, the Synthetic Data Lab HTTP/provider boundary,
and supporting tests. Additional inspection covered comments/moderation/email capabilities,
Prompt Atlas admission, and public Enquiry Demo state/worker boundaries. This is not exhaustive
manual coverage of every visualization, rendering path, historical commit, or deployment setting.
The source-policy check examines direct import edges across application modules; it is not a
general vulnerability detector.

Tools: Node 24.11.1, npm 11.12.1, Python 3.12, Vitest 4.1.12, PGlite 0.5.11, Gitleaks 8.30.1,
and pip-audit 2.10.1. Gitleaks was downloaded from the official release and its SHA-256 checksum
was checked before execution. Python dependencies were installed into an ignored disposable
virtual environment. No hosted settings, secrets, migrations, deployments or account enrollment
were changed. Tests used mocks or disposable local data, without paid-provider requests.

Detailed logs and before/after probes are ignored under `.audit-private/security-2026-10-28/`
and `.audit-private/security-tts-baseline/`. They are not public site content or plugin receipts.

## Findings and changes

| Finding                                              | Evidence, preconditions and disposition                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vulnerable dependencies                              | The original full npm audit reported 21 affected packages: 1 critical, 9 high, 6 moderate and 5 low. Package severity does not establish application exploitability. Compatible upgrades now remove all critical/high/moderate flags. Remaining low advisories are detailed below and still fail the audit.                                                                |
| Optional public TTS had no shared resource admission | A forged Origin could reach generation when the endpoint was configured; local guards did not coordinate server instances. New private enablement and a service-only atomic quota precede provider calls. Missing configuration, identity, schema, quota response or capacity denies generation. Conditional resource-abuse risk; production enablement was not inspected. |
| TTS disclosed backend error text                     | Non-success and non-audio upstream responses copied backend text into public JSON. Responses now omit that detail; diagnostic logs contain only fixed labels and numeric status. The content and sensitivity of actual provider errors were not inspected.                                                                                                                 |
| Notes body limits occurred after buffering           | Authenticated owner document/upload requests called unbounded parsing before their size checks. Limits now apply to arriving bytes before JSON/multipart parsing with a ten-second deadline. Owner authorization already limited the attacker population; no anonymous Notes exploit is claimed.                                                                           |
| Notes provider transport lacked shared bounds        | Session, public and admin Supabase clients now share a 15-second per-fetch lifetime and 32 MiB decoded-response ceiling. Resource-limit failures prevent SDK retry renewal. Client cancellation, late-response cleanup and decoded response headers are tested. This does not establish a transaction-wide SQL deadline.                                                   |
| Conflicting Origin could be overridden               | Notes previously accepted `Sec-Fetch-Site: same-origin` before checking an explicitly different Origin. An explicit Origin is now authoritative; Fetch Metadata is a fallback only when Origin is absent. Non-browser clients can forge both headers; authorization remains separate.                                                                                      |
| Weak throttle configuration                          | Sign-in/recovery runtime now requires the already documented minimum 32-character salt. The existing IP-plus-normalized-email key is retained to avoid introducing an attacker-triggerable global owner lockout. Distributed guessing remains an account/provider-policy concern.                                                                                          |
| Mutable CI action tags                               | Remaining action tags now use full official commit SHAs, with version comments and Dependabot maintenance. Checkout credentials are not persisted. The architecture workflow retains exact trusted-base checkout and no PR-head execution. Required branch protection remains unverified.                                                                                  |
| Missing named security checks                        | `security:audit`, `security:smoke`, and `security:sql` now execute checks and return failures honestly. The CI job preserves an audit failure while continuing smoke/SQL after successful installation.                                                                                                                                                                    |
| Database assurance gap                               | Notes and TTS migrations are executed under isolated PostgreSQL roles in PGlite. This adds evidence beyond SQL text matching. PGlite's queued connection and Auth/Storage schema fixtures do not prove hosted services or true multi-session contention.                                                                                                                   |
| SvelteKit 2 enhanced-action redirect advisory        | A narrow hook rejects parsed pathnames beginning with `//` before routing/authentication, following the official workaround. Ordinary paths and public caching/crawlability remain covered. The package advisory remains visible pending the framework migration.                                                                                                          |

Implementation anchors:

- [TTS handler](../../src/routes/api/tts/chatterbox/+server.ts), [quota client](../../src/lib/server/tts/quota.ts), [quota migration](../../supabase/migrations/202610280001_chatterbox_usage.sql), [ADR 0020](../architecture/decisions/0020-durable-chatterbox-admission.md).
- [Notes document handler](../../src/routes/api/notes/%5Bid%5D/document/+server.ts), [asset handler](../../src/routes/api/notes/%5Bid%5D/assets/+server.ts), [body reader](../../src/lib/server/notes/request-body.ts), [bounded transport](../../src/lib/server/notes/bounded-fetch.ts), [auth policy](../../src/lib/server/notes/auth.ts).
- [Hooks](../../src/hooks.server.ts), [audit implementation](../../scripts/security-audit.mjs), [policy checks](../../scripts/security-policy.mjs), [smoke runner](../../scripts/security-smoke.mjs), [security CI](../../.github/workflows/security.yml).

### Dependencies and residual advisories

No forced major upgrade was used. Important lockfile changes include Kit 2.69.2 → 2.70.3,
devalue 5.8.1 → 5.9.4, sharp 0.35.3 → 0.35.5, Zod 4.4.3 → 4.6.7,
DOMPurify 3.4.12 → 3.4.17, Vite 7.3.6 → 7.3.7 and Vitest 4.1.10 → 4.1.12.
The typography package pins an affected selector parser; a narrowly scoped override uses
the compatible 6.1.5 fix. PGlite 0.5.11 is an exact development dependency for reproducible SQL tests.

Authoritative references for the original runtime leads:
[SvelteKit Accept-header ReDoS](https://github.com/advisories/GHSA-29g2-3rmr-qm68),
[devalue key validation](https://github.com/advisories/GHSA-4q55-j62x-fr9h),
[sharp librsvg dependency](https://github.com/advisories/GHSA-wq5f-xc86-pv6w),
[Zod oversized collections](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5).
Bounded bodies and owner-only image uploads reduce reachability; they were not used to excuse
compatible security upgrades. The inspected PDF export uses canvas `addImage`, not `jsPDF.html`;
DOMPurify was upgraded anyway rather than relying on that one observation for all future use.

The final audit has **12 low affected-package flags from four underlying advisories**, including
dependent packages whose flags inherit another package's issue:

| Advisory                                                                 | Current assessment and remaining work                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [GHSA-pfhg-q3qv-9q6r](https://github.com/advisories/GHSA-pfhg-q3qv-9q6r) | Kit 2 enhanced-form authority-path redirect; the documented pathname workaround is implemented and regression-tested. An upstream package fix requires Kit 3.                                                                                                                               |
| [GHSA-27mw-82g8-phjj](https://github.com/advisories/GHSA-27mw-82g8-phjj) | Kit prerender cache-control issue remains package-flagged. No application exploit was established in this review; do not infer a universal exemption. Requires a separate Kit 3 migration and compatibility validation.                                                                     |
| [GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4) | deepmerge 4.3.1 has no published fix in the consulted advisory. It is present through the Svelte build tooling. No attacker-controlled merge input was established here; the dependency remains flagged.                                                                                    |
| [GHSA-238p-pmpm-9mq7](https://github.com/advisories/GHSA-238p-pmpm-9mq7) | KaTeX requires an already polluted prototype or attacker-controlled renderer-option prototype. No such chain was established. The current 0.16 dependency chain remains flagged; an upgrade across the 0.x minor boundary and rehype integration needs dedicated math-rendering validation. |

`security:audit` deliberately returns **exit 1** for these results; no advisory is hidden by a
blanket exemption. A separate framework/toolchain migration is needed before expecting a clean
dependency audit. The security workflow is therefore expected to remain red for this reason.

The resolved Python service/test environment had no advisories after updating the disposable
environment's initially bundled pip 24.0. The earlier pip-only findings concerned that local
installer, not the service's pinned runtime requirements. Hosted container/package resolution
was not inspected.

### Secret scan triage

Gitleaks examined 2,034 commits reachable from local Git refs (about 148 MB of diff data) and
reported nine candidates. Review identified two intentional browser-test credentials, one
verification idempotency key, one stored SHA-256 key fingerprint used by narration state,
three keyboard-shortcut attributes, and two copies of a synthetic prior-authorization identifier.
No live credential was confirmed. This finding does not establish that all history, encrypted
assets, external CI settings or untracked local files are free of secrets. Values are not copied
into this record and no rotation/history rewrite was performed.
The final staged-change scan also passed with no leaks reported.

## Verification record

- Skill Creator validator: passed; independent read-only skill behavior review passed.
- `npm run check`: passed, zero errors and zero warnings after correcting new test event types.
- `npm run security:smoke`: passed, nine checker fixtures plus 507 mocked tests in 30 files.
  The final late-response cleanup test was additionally verified in the focused Notes suite
  (90 tests across eight files). These tests block default fetch, not all OS-level networking.
- `npm run security:sql`: passed, 19 tests, zero skips, covering Notes and TTS database roles/RPCs.
- Existing Comments, Prompt Atlas and Enquiry Demo SQL suites: 53 passed, zero skips, using the
  same pinned PGlite runtime explicitly. Together these runs execute 72 database checks; the
  real-concurrency and hosted-service limitations still apply.
- Synthetic Data Lab service/hosted Python suites: 27 passed with local fixtures/fake Redis.
- `pip-audit` in the resolved disposable Python environment: no known vulnerabilities.
- `npm run security:audit`: policy checks pass; dependency audit exits 1 for the 12 low flags above.
- Architecture gate regression fixtures: 13 passed.
- `npm run test:critical`: passed, including service-worker/SEO checks and 361 tests in 22 files.
- Before/after TTS: six selected cases fail on isolated baseline route copies and pass after fixes.
- Before/after Notes: five selected cases fail on isolated baseline handler copies and pass after
  fixes. Eight unrelated cases were deliberately filtered from this probe; the full route suite
  was run separately. These are handler reproductions, not production exploitation claims.
- Before/after authority-like paths: two hook cases fail before the guard and pass after it.
- `npm run build:full`: passed, including feature artifacts, notebook preparation, content and
  link validation, production compilation, discoverability and Barnum route-asset verification.
  The sharp upgrade changed the sketch generator's dependency signature; regenerated image
  bytes were unchanged, and only the expected cache signature is included in this change.

- Scoped ESLint, Prettier and `git diff --check`: passed. Existing architecture documents were
  edited narrowly rather than reformatted in full.

The committed-tree architecture-gate result is recorded in the task handoff after final integration.
No deployed-header/browser or hosted-account acceptance is implied by these local results.

## Deployment prerequisites and remaining risks

1. Review/apply the additive TTS migration through an authorized deployment process; verify
   hosted grants, PostgREST behavior and actual multi-session admission contention. Then deploy
   compatible application code and configure the private enable flag and dedicated salt. The
   code fails closed until the controls exist. No migration was applied by this task.
2. Verify provider-side execution limits and billing caps before enabling paid TTS. These local
   controls bound requests/characters, not money or remote work after cancellation. Anonymous
   visitors can still exhaust the permitted shared daily allowance.
3. Verify production Supabase signup policy, owner MFA enrollment/enforcement and recovery.
   Local config is not production evidence. The distributed sign-in guessing risk is not solved
   merely by the retained per-IP-plus-email limiter.
4. Complete the remaining dependency migration work above. Contact and some public Enquiry
   request-frequency limits remain process-local; they do not provide distributed admission.
5. Verify hosted Auth/Storage integration, true concurrent transactions, the owner browser journey,
   and deployed headers. Configure required CI checks/rulesets if desired; local workflow files
   do not prove their enforcement.
6. Run the official Codex Security workflow from a fresh session once its capabilities are
   available. Preserve its independent coverage/evidence rather than relabelling this review.

Architecture impact: yes

Architecture rationale: shared TTS admission adds a database control flow; Notes transport and
body admission change request contracts; security scripts/CI add enforcement surfaces. The
canonical architecture was reviewed and affected descriptions, diagram, toolchain inventory,
AF-001/AF-003 follow-ups and ADR 0020 were updated in the same change.
