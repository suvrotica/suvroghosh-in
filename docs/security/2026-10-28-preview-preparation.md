# Security preview preparation — 28 October 2026

## Source and authorization

The user authorized rebasing the security branch, pushing it, opening a draft PR and creating
a preview for verification. Production deployment, PR merge, hosted migrations, account-setting
changes and advisory suppression remain outside scope. No official Codex Security workflow is
claimed; this remains a Codex-assisted review.

`codex/security-hardening` was rebased onto fetched `origin/main` at
`5331974c045ffa655d3024476a8074fc5fa67804`. The rebase had no conflicts, and `git range-diff`
confirmed that the two original security patches were unchanged:

| Original local commit | Rebased commit |
| --------------------- | -------------- |
| `a3800c14`            | `506900df`     |
| `dbe96c17`            | `89a3cf41`     |

The new UML private-cache handling, `UmlFigure` preprocessing import and article publications
are preserved. A local backup branch retains the pre-rebase commits. Earlier findings and
validation are in the [initial report](2026-10-28-hardening.md) and
[dependency/release follow-up](2026-10-28-release-readiness.md).

## Additional integration findings

### UML AI inherited unrelated enablement

The incoming UML configuration fell back to `PROMPT_ATLAS_AI_ENABLED`. A deployment enabling
Prompt Atlas could therefore enable a separate UML provider endpoint, although UML does not
share Prompt Atlas's durable quota or price verification. Origin checks and process-local
admission do not establish a global resource budget.

UML now requires its own explicit flag, and Vercel previews reject provider generation before
credential discovery. The public availability response states that preview AI is disabled;
deterministic generation, editing and export remain usable. Isolated old/new configuration
fixtures showed that Prompt-only and explicitly enabled preview configurations previously
exposed AI and now do not. Focused configuration/route tests verify that denied requests never
construct provider dependencies and that mocked explicit production and local modes still work.

This is containment, not completion of UML cost controls. Explicit production enablement still
needs a separate durable admission/pricing review. The existing salt is unused and is no longer
presented as an activation safeguard. No provider call or production setting change was made.

### Exported metadata could become Svelte code

The UML export builder placed metadata into quoted mdsvex attributes using backslash quote
escaping, leaving Svelte braces active. An inert fixture title containing a global assignment
compiled through mdsvex and Svelte into executable server JavaScript. This requires an author
to ingest/compile the exported bundle; it is not evidence of an anonymous visitor exploit.

Metadata now escapes HTML metacharacters and both braces before interpolation. Compiler/AST
regressions check that titles, captions, alt text and assumptions remain literal strings, while
ordinary exports retain their existing quoted-attribute format.

### Unrelated article bundles imported the UML renderer

The first combined-tree production compilation and discoverability checks passed, but the final
Barnum route-asset audit failed: 338,459 raw JS bytes and 118,397 gzip bytes exceeded unchanged
limits of 327,680 and 112,640. The new universal `UmlFigure` import introduced the renderer into
articles that did not use it. The preprocessor now adds that import only to Markdown containing
the component tag, preserving automatic authoring support and both existing script-injection paths.
The source and asset budgets were not relaxed. Rebuilding the site, discoverability audit and
route-asset audit passed: 264,278 raw JS bytes, 94,779 gzip bytes and 35 assets, with no forbidden
assets or boundary failures. All 744 published posts passed discoverability checks. The rebuilt
UML article still contains its figure, title and existing SVG reference; the SVG exists locally.
The earlier full build's feature/content preparation was unchanged, so only its affected final
compilation and validation stages were repeated after this import adjustment.

## Preview boundaries

Read-only Vercel metadata identifies project `suvroghosh-in` and the connected repository
`suvrotica/suvroghosh-in`. No project environment entries for TTS, Supabase/Notes, UML enablement,
Prompt Atlas enablement or an AI Gateway key target preview. System-injected OIDC availability
is not inferred from that list; UML's explicit preview gate prevents using it. TTS still requires
the private enable flag and all durable admission configuration. No settings or secrets were changed.

The repository also connects to `synthetic-data-lab-api`. Historical Git pushes created both
frontend and Python previews; current hosted branch-disable rules were not exposed by the
connector. A branch push can therefore create both. Preview verification must not exercise Python
mutations, live AI generation, signup/login attempts or production-backed data changes.

Authenticated Supabase settings remain unavailable through the connected tools. Local configuration
does not verify production signup or owner MFA. The earlier failed browser avenue is not retried
without evidence that an authenticated session is now accessible.

## Validation and release limits

The security smoke suite now includes UML configuration, route, deterministic renderer/export
and alias tests, and scrubs UML credentials from child processes. Hook tests retain `/api/uml`
private responses. Tests use mocks, inert compiler fixtures and disposable data.

Before preview publication, type checking passed with zero errors/warnings; security smoke passed
15 checker/math tests plus 546 Vitest tests in 34 files; Notes/TTS SQL passed 19 tests with no
skips; and the critical suite passed its service-worker/SEO checks plus 361 tests in 22 files.
The new UML export regression fails all six cases against the original exporter and passes them
after the fix. An existing UML test no longer overwrites the tracked example SVG during validation.
Scoped ESLint, formatting and whitespace checks passed. The audit found zero source/workflow
policy violations while correctly failing on the ten low affected packages below.

The dependency audit still reports ten low affected packages from three advisories. No exception
or suppression was added; a failing audit/CI job must remain visible. A preview passing acceptance
does not approve those residual risks, hosted TTS migration, production AI enablement or release.

Exact final test results, PR revision, preview URL and deployment/browser observations are recorded
in the draft PR and task handoff. This source document precedes preview creation, so it does not
claim that a preview deployment or authenticated owner workflow has already passed.

Architecture impact: yes

Architecture rationale: the canonical reference was reviewed, both preexisting security data flows
and incoming UML integration were preserved, and the new UML activation/export boundaries are
documented in the same change. No new service, schema or production deployment flow is introduced.
