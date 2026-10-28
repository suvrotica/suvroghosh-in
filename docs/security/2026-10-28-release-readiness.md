# Security release preparation — 28 October 2026

## Scope and release state

This follow-up starts from clean local commit `a3800c14` on `codex/security-hardening`.
It extends the [initial hardening record](2026-10-28-hardening.md) with a tested KaTeX fix,
current upstream compatibility research and read-only production checks. It remains a
Codex-assisted review; no official Codex Security workflow was exposed in this session.

No push, merge, deployment, hosted migration, production configuration or account enrollment
was performed. TTS enablement was not changed. The local example keeps both private and public
TTS flags false, and the hardened handler requires explicit private configuration and quota
admission before any provider call.

Production and `origin/main` were observed at `5331974c045ffa655d3024476a8074fc5fa67804`.
That contains three commits after this branch's original base `362500d8`, including the new
Post to UML feature and article publications. Changes to hooks, Svelte preprocessing and the
architecture document need integration review when merging is authorized. This branch's tests
do not validate that combined tree or the new UML API. No history was rebased or merged.

## Dependency remediation and residual findings

KaTeX is pinned to **0.18.2**, the minimal patched release for
[GHSA-238p-pmpm-9mq7](https://github.com/KaTeX/KaTeX/security/advisories/GHSA-238p-pmpm-9mq7).
A scoped `rehype-katex-svelte` override selects that same direct dependency rather than retaining
its affected `^0.16.7` renderer. Both the installed tree and lockfile resolve one renderer at
0.18.2. The override needs review when updating that bridge or KaTeX.

The vulnerability requires prior prototype pollution or attacker-influenced option inheritance;
it does not independently pollute a prototype. In isolated fixtures, 0.16.47 emitted an unsafe
link when `trust` was inherited, while 0.18.2 rejected it. The repository's renderers do not
deliberately enable trusted HTML. The fix is retained even without a demonstrated complete
application exploit chain.

Compatibility probes processed 770 Markdown files and the spacetime and gastropod formula sources, extracting
1,947 expressions from 74 source files. Old/new MathML and TeX annotations matched for every
expression, with no Markdown-processing or expression-parse errors. Representative inline, display, matrix and
untrusted-link Markdown compiled through the Svelte bridge. All 60 CSS-referenced font files
exist. HTML layout markup changed, so these checks do not establish pixel equivalence.

A separate headless Chromium fixture then compared six representative formulas with each
version's matching CSS/fonts at desktop and mobile widths. Inspected screenshots showed readable
math, no missing fonts or vertical clipping, and no page overflow. Dimensions matched and no
pixels differed by more than eight RGB levels. A long Schwarzschild formula retained the same
contained horizontal scroll on mobile. HTTP(S) was blocked. This is a static-fixture comparison,
not browser execution of the application components or every formula in the corpus.

The audit now reports **10 low affected packages from three underlying advisories**, with zero
moderate/high/critical findings. Inherited package flags are not ten distinct vulnerabilities.
`security:audit` still fails, and the security CI job remains expected to fail on those findings.
No advisory suppression, forced peer installation, downgrade or unreviewed package fork was used.

| Advisory                                                                                                         | Evidence and disposition                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Kit enhanced-form redirect](https://github.com/sveltejs/kit/security/advisories/GHSA-pfhg-q3qv-9q6r)            | Fixed upstream in Kit 3. The current hook implements the maintainer's `//` pathname rejection and has regression coverage. The Kit 2 package remains flagged.                                                                                                                                                                                                 |
| [Kit prerender cache-control injection](https://github.com/sveltejs/kit/security/advisories/GHSA-27mw-82g8-phjj) | Fixed upstream in Kit 3. It requires untrusted cache-control data passed to `setHeaders` during prerendering. Inspected application cache policies use fixed strings or choices between fixed strings. No matching input-to-sink path was demonstrated; the advisory remains visible.                                                                         |
| [deepmerge object prototype poisoning](https://github.com/advisories/GHSA-gcqx-w48m-w2h4)                        | Latest published 4.3.1 remains affected, with no patched release listed. An inert fixture reproduced poisoning of the returned nested object without changing global `Object.prototype`. The inspected Svelte plugin caller merges trusted build configuration; no visitor-input path was found. Keep build configuration trusted and revisit upstream fixes. |

### Why Kit 3 is a separate migration

Kit 3.1.0 is published. Its required toolchain includes TypeScript 6, Svelte 5.57.1 or later,
Vite 8.0.12 or later, plugin 7 and a compatible Vercel adapter. An isolated manifest using those
versions failed normal npm resolution with `ERESOLVE`: current `@vercel/analytics@2.0.1`
accepts Kit 1/2 only. Speed Insights has the same peer restriction; Bits UI's current Runed
range also selects a Kit 2 peer. These were registry checks and an actual resolver failure,
not an inference from the major version number.

The [official migration guide](https://svelte.dev/docs/kit/migrating-to-sveltekit-3) also requires
moving preprocessing/CSP/adapter configuration to Vite, updating error APIs and service-worker
integration, and reviewing paths and link flags. Local inspection found 78 affected error calls
across 12 files. Existing security-policy checks must follow the configuration move. A temporary
explicit alias can preserve `$lib`; wholesale feature rewrites are not required. Latest plugin
7.3.1 still uses affected deepmerge, so Kit 3 alone does not clear every advisory.

## Read-only production verification

Checks on 28 October used connected Vercel metadata, GitHub reads and bounded unauthenticated
GET requests. Secret values were neither retrieved nor recorded. Sanitized detailed artifacts
are ignored under `.audit-private/security-followup/`.

A read-only inspection of existing browser windows did not establish an authenticated Supabase
dashboard session. Browser input geometry was unavailable, so no dashboard navigation or login
was completed. Signup and MFA therefore remain unverified through that avenue as well.

| Area                 | Verified fact or remaining gap                                                                                                                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deployment           | `www.suvroghosh.in` points to a READY production deployment of `5331974c` from `main`. The local security commits are not deployed.                                                                           |
| TTS project settings | Current production environment metadata contains no Chatterbox endpoint, private enable flag, salt, API key or public UI flag; hidden production variable count is zero.                                      |
| TTS deployed state   | The immutable deployment environment snapshot was unavailable. Current project metadata is not proof of the deployed runtime. No TTS request was made.                                                        |
| GitHub enforcement   | `main` is unprotected, with zero rulesets. Actions permits all actions and does not require SHA pinning at platform level. The new security workflow is not yet on `main`. No protection setting was changed. |
| Public routes        | Home, RSS, sitemap and Notes sign-in all returned 200. HSTS, nosniff, frame denial and restrictive Permissions-Policy were present. Public cache revalidation remained intact.                                |
| Notes sign-in        | Private/no-store, noindex/nofollow/noarchive, same-origin Referrer-Policy and nonce CSP were present. No sign-in or signup was attempted.                                                                     |
| Prerendered CSP      | Home uses a CSP meta element in HTML; absence of a CSP response header is not evidence of absent CSP. This was checked with a bounded HTML-head read.                                                         |
| Supabase signup/MFA  | Unverified: no active Supabase connector or scoped local management/Auth credential was available. Existing Vercel secret values were not read. Local Supabase configuration is not production evidence.      |

## Verification

- `npm run check`: passed with zero errors and warnings.
- `npm run security:smoke`: passed, 15 checker/math regression tests and 508 mocked request
  tests across 30 Vitest files. No live provider request is part of this suite.
- The six new math tests pass with 0.18.2; the same test file against isolated 0.16.47 produces
  four security failures and two compatibility passes. Baseline files did not replace working code.
- `npm run security:audit`: zero policy violations across 1,967 source modules and nine workflows;
  dependency findings remain ten low packages, so the command correctly exits 1.
- `npm ls katex --all` and lockfile inspection: both direct and bridge renderer resolve 0.18.2.
- `npm run build:full`: passed, including feature/notebook checks, content validation, production
  compilation/prerendering, discoverability and route-asset checks. It produced no tracked
  generated-content changes. Existing bundle-size and optional Supabase tracing-dependency
  warnings also appeared in the initial hardening build; they were not introduced by this upgrade.
- Scoped ESLint, Prettier and documentation-link checks passed.

The initial hardening record retains earlier database, Python, history-secret and critical-boundary
results. Those are not presented as fresh runs in this dependency-only follow-up. The committed-tree
architecture gate and final secret-scan results are reported in the task handoff.

## Release prerequisites

1. Integrate the reviewed changes with the current `main` only after merge authorization;
   preserve the new UML private-cache handling and preprocessing import. Rerun checks on that
   exact combined tree and review its additional API surface.
2. Resolve or explicitly review the remaining advisories. The audit has no exceptions and is
   not green. A Kit 3 migration needs its own compatibility work; deepmerge needs upstream
   remediation or a separately reviewed replacement strategy.
3. Verify production Supabase signup policy and owner MFA enrollment/enforcement through
   suitable authenticated read access. No claim about those account controls is currently made.
4. Review GitHub protection/ruleset requirements separately; workflow files alone do not enforce
   mandatory review or required checks.
5. For an eventual code release, retain disabled TTS. Its additive migration and private
   configuration can be a separate authorized rollout after hosted grants, concurrency and
   provider cost/execution limits are verified. No paid-provider probe is needed for this release.
6. Run preview and post-release acceptance on the exact revision eventually approved. Current
   production GET results verify the older live site, not this local branch.
   Include representative article math and both runtime math views; the static visual fixture
   does not substitute for integration testing of the application components.

Architecture impact: yes

Architecture rationale: the tested KaTeX dependency override changes the shared Markdown/runtime
rendering dependency and adds a security regression boundary. The canonical architecture was
reviewed and updated with the version, bridge override and validation contract; no new service,
route, state owner or deployment flow is introduced.
