# Contributing

Start with [README.md](README.md) for development and publishing commands and
[AGENTS.md](AGENTS.md) for repository safety and standard post instructions.
The [architecture reference](docs/architecture/ARCHITECTURE.md) describes current boundaries,
patterns and decisions. The [forensic audit](docs/architecture/FORENSIC_AUDIT.md) tracks known debt;
an open finding is not authorization to refactor unrelated production code.

## Architecture change gate

**Every change that alters the system's architecture, structural organization, module boundaries,
state management strategy, data flow, routing conventions, integration design, or foundational
engineering patterns MUST include a corresponding review and update of
`docs/architecture/ARCHITECTURE.md` in the same change.**

This section is the canonical rule. Agent instructions, the README, PR template and ADRs link here;
they do not define competing versions of the policy. It applies to direct coding-agent work as
well as pull requests, and to semantic changes inside existing files as well as new directories.

For each change:

1. Identify its architecture impact before implementation. Read the relevant architecture sections.
2. If architecture changes, update the affected current-state description, structural references,
   diagrams and invariants in the same change. Update only material that actually changed; an
   unrelated cosmetic edit is not compliance.
3. Record a significant new trade-off or changed foundational decision as an ADR using the
   [decision convention](docs/architecture/decisions/README.md), when warranted. Smaller changes can
   be explained directly in the affected section. Explain the choice during review.
4. Compare the final implementation/imports/routes/configuration with the updated documentation,
   including any known inconsistency that remains. Do not document a proposed design as shipped.
5. In the PR description, include exactly one `Architecture impact: yes` or
   `Architecture impact: no` line and one nonempty `Architecture rationale: ...` line. State the
   affected sections/ADR and validation, or explain why architecture is unaffected. Confirm that
   the canonical reference was reviewed. Coding-agent tasks without a PR provide the equivalent
   confirmation in their final handoff.

Routine prose, supplied assets, local bug fixes and tests may leave architecture unaffected.
An implementation fix that changes a documented data flow, state owner, security contract or
rendering decision still requires an update. Reviewers decide semantic impact; a file extension
alone cannot make that decision.

### Automated checks

`.github/workflows/architecture.yml` checks every PR, including body edits. The dependency-free
`scripts/check-architecture.mjs` reads PR metadata as JSON, requires the impact/rationale fields,
and checks committed trees for the canonical files and README links. A declared architecture
change requires a real diff in `ARCHITECTURE.md`.

Selected structural signals also require that diff even when the declaration says `no`:
foundational package/framework/deployment/type configuration; application hooks/types; database
configuration/migrations; shared `schema.ts` files; adding/removing/renaming route entry files;
adding/removing immediate `src/lib` domain directories; and changes to this policy or its gate.
The implementation's explicit path list is authoritative for the detectable subset. Ordinary
article/component/test changes alone do not trigger a documentation edit. False positives should
be fixed by reviewing the classifier in a documented policy change, not by adding a meaningless
sentence to the architecture document.

The workflow uses `pull_request_target` and checks out only the trusted base revision. It reads
the proposed head as Git objects for comparison, never checks it out, and never executes its code.
Tests and the gate run from the base, so a PR cannot weaken that run by editing its checker or
workflow. The introducing change requires local fixture validation and manual review: this
workflow cannot govern PRs until it exists on the trusted/default branch. It uses read-only
repository permissions and no application secrets or dependency installation/build step.
Local use compares committed revisions:

```sh
node scripts/check-architecture.mjs --base origin/main --head HEAD
node --test scripts/check-architecture.test.mjs
```

The gate rejects missing/shallow/unrelated comparison history and missing canonical files. It
cannot verify the semantic quality of an update or discover every architectural change. Human
review remains required. A repository maintainer must configure the workflow job as a required
status in GitHub branch protection/rulesets for merge enforcement; that account configuration is
not established by a workflow file or verified by this task. The repository/organization Actions
event policy must also permit this workflow; verify that setting when adopting it. The trusted-base
execution choice follows [GitHub's event-security guidance](https://docs.github.com/en/actions/reference/security/securely-using-pull_request_target).
Direct pushes are governed by this
policy and whatever repository protections actually exist.

## Verification and scope

Use checks appropriate to the changed boundary. `npm run check` performs Kit synchronization and
Svelte/TypeScript analysis. `npm run lint` checks formatting before ESLint; a formatting failure
prevents ESLint from running. Feature unit/browser commands are listed in `package.json`.
`npm run notes:test` currently runs the broad default unit collection plus SQL source checks.
The audit records the existing CI/test gaps rather than claiming every boundary is enforced.
`npm run test:critical` selects request-limit/provider, Notes and Meaning Map lifecycle regressions;
the critical-boundaries workflow runs it with `check` for relevant application changes. Publishing
workflow/gallery and incremental notebook fixtures use `build-workflow:test` and `notebooks:test`.

For standard Markdown publication, follow `AGENTS.md`: preserve requested prose, inspect the
adjacent convention, use the requested image, curate tags/pinned tags, run `npm run build` once,
review generated artifacts and follow the prescribed Git publication sequence. The routine build
does not prepare notebooks or run visualization-specific artifact audits. Use `npm run build:full`
for feature, notebook, generated-feature-asset or shared-build work; the feature-artifact workflow
covers those paths. Do not broaden a plain post into old-feature maintenance because a feature
name or non-blocking warning appears in compiler output. Both lanes still compile the whole site.
Build presteps
mutate generated files and can transform raster source assets; the optimizer's current conflict
with the as-is preservation rule is recorded as `AF-007`. Resolve that conflict in a tested
change instead of silently treating lossy processing as lossless.

For documentation/enforcement-only changes, verify links, source evidence, diagrams, policy
fixtures, formatting and `git diff --check`; avoid regenerating unrelated application content.
Report any existing failures or unavailable runtime checks precisely. Never use production
Supabase or paid providers for destructive fixtures or unrequested audit probes.
