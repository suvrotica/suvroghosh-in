# ADR 0001: Maintain the canonical architecture alongside structural changes

- Date: 20 October 2026
- Status: Accepted for the documentation/enforcement change introducing this record

## Context

The application grew through independently documented features. The README still led with its
starter scaffold, feature documents contained stale cross-cutting details, and the root agent
instructions were excluded from version control on the audit workstation. No repository-wide
architecture reference, contributor gate or PR template connected these sources. Existing CI
covered selected feature regressions and IndexNow, not architecture review.

## Decision

Adopt the [canonical contribution policy](../../../CONTRIBUTING.md#architecture-change-gate).
Keep [ARCHITECTURE.md](../ARCHITECTURE.md) factual about the current implementation and
[FORENSIC_AUDIT.md](../FORENSIC_AUDIT.md) explicit about evidence and unresolved debt. README,
agent instructions and PR descriptions point to that policy. Future significant decisions use
this directory.

The PR gate combines explicit impact/rationale declarations with a narrow set of detectable
structural changes. Its trusted-base workflow reads proposed Git objects as data and executes only
base policy/tests; the introducing change requires local validation and manual review. Semantic review is
still necessary, and branch protection is a maintainer configuration rather than an assumed
property of adding a workflow.

## Alternatives

- Feature documents alone: useful depth, but no shared description of imports, rendering,
  security and build contracts across features.
- Require architecture diffs for every source edit: creates noise and meaningless changes for
  prose, local component fixes and tests.
- Infer all architectural impact from paths: misses semantic changes inside existing modules
  and gives unjustified confidence in automation.

## Consequences and verification

The initial reference records intentional exceptions and open defects without refactoring the
application. Contributors maintain only affected sections and diagrams. The guard adds a small
dependency-free CI step, with Git-fixture tests for declarations, structural diffs, history and
canonical-file presence. Reviewers must assess the substance of updates and significant ADRs.
GitHub required-status/event-policy configuration and execution on hosted PRs remain deployment follow-up,
not locally verified behavior.
