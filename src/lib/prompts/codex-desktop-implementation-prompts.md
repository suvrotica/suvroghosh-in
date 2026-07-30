---
title: 'Codex Desktop Implementation Prompts'
description: 'Reusable engineering briefs for asking Codex Desktop to inspect a repository, implement a bounded change, repair failures and report evidence.'
date: '2026-07-30'
dateModified: '2026-07-30'
kind: 'prompt'
tags:
  - 'Codex Desktop'
  - 'Software engineering'
  - 'Repository work'
  - 'Testing'
  - 'Debugging'
published: true
featured: false
order: 10
thumbnail: '/images/resources/codex-desktop-implementation-prompts.webp'
thumbnailAlt: 'A software workbench with a repository tree, test results, terminal notes and a reviewed code diff'
estimatedLength: '2 prompt templates'
related:
  - 'prompts/research-and-verification-prompts'
  - 'prompts/editing-prompts'
  - 'prompts/healthcare-architecture-prompts'
language: 'en'
---

Use these briefs when a coding task belongs inside an existing repository and must survive more than a plausible-looking patch. They are designed for work where local conventions, current user changes, tests and the final diff all matter.

## Intended use

The first template is for a bounded feature or engineering change. The second is for a defect whose cause must be demonstrated before it is repaired. Both give Codex room to investigate while keeping requirements, authority and completion evidence explicit.

## Suitable inputs

Provide the repository or workspace, the user-visible outcome, known constraints, useful starting files, behaviour that must not regress and the commands that normally validate the project. If a field is genuinely unknown, say so; do not invent architectural certainty merely to fill the form.

<!-- resource-copy:start -->

## Feature-implementation master prompt

You are working directly in the existing [REPOSITORY OR WORKSPACE].

Implement [FEATURE OR CHANGE].

Do not stop after inspection, a plan, scaffolding or sample snippets. Inspect the repository, implement the complete bounded change, validate it, repair failures caused by the work, and report the evidence. Do not push, deploy, create a pull request, rewrite history or commit unless I explicitly ask.

### User outcome

[DESCRIBE WHAT A USER OR MAINTAINER MUST BE ABLE TO DO WHEN THE CHANGE IS COMPLETE]

### Requirements

- [REQUIRED BEHAVIOUR 1]
- [REQUIRED BEHAVIOUR 2]
- [REQUIRED BEHAVIOUR 3]
- Preserve [EXISTING BEHAVIOUR OR PUBLIC CONTRACT].
- Treat [DATA RULE, UNIT, FORMAT, ACCESSIBILITY REQUIREMENT OR SECURITY BOUNDARY] as an invariant.

### Constraints

- Work within [ALLOWED SCOPE].
- Do not change [PROTECTED FILES, INTERFACES OR BEHAVIOURS].
- Do not perform broad unrelated refactors, dependency upgrades or formatting churn.
- Do not replace real behaviour with mock data, placeholders or comments claiming later completion.
- Reuse existing dependencies and nearby repository patterns unless evidence shows they cannot satisfy the requirement.
- Preserve all unrelated uncommitted or user-authored changes.
- Ask before any destructive operation, migration, secret-handling change, significant external action or materially different expansion of scope.

### Repository context

- Likely starting points: [RELEVANT FILES, ROUTES, MODULES OR DOCUMENTATION]
- Known conventions: [FRAMEWORK, LANGUAGE, STYLE OR ARCHITECTURAL CONVENTIONS]
- Known validation commands: [FOCUSED TESTS, TYPE CHECK, LINT, BUILD OR OTHER GATES]
- Known risks or edge cases: [RISKS, COMPATIBILITY CONSTRAINTS OR FAILURE CONDITIONS]

Treat these as starting information, not permission to skip inspection or proof that my file guesses are current.

### Required workflow

1. Read the repository instructions, package scripts, configuration and relevant documentation.
2. Inspect version-control status before editing. Identify existing changes and avoid overwriting them.
3. Trace the nearest existing implementation pattern, its callers, tests, public contracts and generated counterparts.
4. Separate what is known from what is inferred. Resolve ordinary reversible uncertainty from repository evidence; ask only when the choice would materially change the product or require new authority.
5. State a concise implementation plan tied to actual files and validation, then continue with the work.
6. Implement the smallest coherent vertical slices. Keep data, business rules, UI, integration and validation separated where the repository already separates them.
7. After each meaningful slice, run the narrowest relevant check. If it fails, diagnose the cause and repair it rather than weakening, deleting or skipping the test.
8. Run validation in widening circles: focused tests, affected-module tests, type/static checks, integration checks, then the production build or representative runtime check where applicable.
9. Inspect the complete final diff. Remove debug output, temporary flags, dead experiments, accidental formatting churn and any unrelated edits introduced by this task.
10. Compare the implementation against every requirement and acceptance criterion before declaring completion.

### Implementation requirements

- Follow the repository's current language, framework and event/state conventions.
- Keep public APIs, schemas, units and persisted formats unchanged unless this brief explicitly requires a change.
- Fail clearly rather than silently coercing invalid input into plausible-looking output.
- Add or update focused tests for the behaviour being changed, including important error and boundary cases.
- Preserve accessibility, security, privacy, offline and performance properties that apply to the affected path.
- Do not claim a check passed unless you actually ran it and observed a passing result.

### Acceptance criteria

- [OBSERVABLE ACCEPTANCE CRITERION 1]
- [OBSERVABLE ACCEPTANCE CRITERION 2]
- [OBSERVABLE ACCEPTANCE CRITERION 3]
- Existing [REGRESSION-SENSITIVE PATH] still works.
- Invalid or unsupported [INPUT OR STATE] produces [EXPECTED FAILURE BEHAVIOUR].
- The final diff contains only files necessary for this change.

### Validation

Run, at minimum:

- [NARROW TEST COMMAND]
- [RELEVANT TEST GROUP]
- [TYPE-CHECK OR STATIC-ANALYSIS COMMAND]
- [LINT OR FORMAT CHECK]
- [PRODUCTION BUILD OR RUNTIME CHECK]

If a listed command is stale or unavailable, discover the repository's real equivalent. Report what could not be run, why, the substitute evidence gathered and the remaining risk.

### Final report

Report:

- what was implemented;
- important design decisions and why they fit repository evidence;
- every file added, changed, moved or deleted;
- every validation command actually run and its actual outcome;
- build or representative runtime status;
- known limitations, unresolved issues and manual follow-up;
- confirmation that unrelated user changes were preserved.

Do not describe the task as complete if a required behaviour or validation gate remains unresolved.

## Bug-fixing variant

You are diagnosing and fixing [BUG] in [REPOSITORY OR WORKSPACE].

### Observed failure

- Reproduction steps: [STEPS]
- Expected behaviour: [EXPECTED]
- Actual behaviour: [ACTUAL]
- Error, log or failing test: [EXACT EVIDENCE]
- Environment or input conditions: [CONDITIONS]

### Boundaries

- Limit the fix to [AFFECTED AREA].
- Preserve [BEHAVIOUR THAT MUST NOT REGRESS].
- Do not silence the symptom with broad exception handling, weakened assertions, arbitrary retries or unrelated refactoring.
- Do not discard existing changes or alter data outside the stated scope.

### Required method

1. Inspect repository instructions, status, the failing path, its callers and existing tests before editing.
2. Reproduce the failure with the smallest reliable case. If it cannot be reproduced, continue evidence-gathering and state what differs; do not apply a speculative patch merely to produce activity.
3. Form a falsifiable root-cause hypothesis and test it against code, data and runtime evidence.
4. Make the smallest coherent correction at the layer that owns the defect.
5. Add a regression test that fails for the demonstrated cause and passes for the correction. Test an important adjacent boundary where appropriate.
6. Run the narrow failing test, then the affected suite, type/static checks and the relevant production build or runtime path.
7. Repair failures caused by the fix. Do not delete, skip or dilute tests to obtain a green result.
8. Review the final diff for unintended changes, debug output and suppressed errors.

### Fix acceptance criteria

- The original reproduction now yields [CORRECT RESULT].
- The regression test proves [SPECIFIC FAILURE MODE].
- [ADJACENT OR ERROR PATH] remains correct.
- No unrelated public contract or behaviour changed.

### Fix report

State the root cause, the correction, the changed files, the regression coverage and every command run with its actual outcome. Distinguish verified facts from inference, and report any residual risk honestly.

<!-- resource-copy:end -->

## Usage notes

Replace the bracketed fields, delete irrelevant bullets and retain constraints that protect the repository. A longer brief is not automatically better: the useful parts are the user outcome, invariants, scope, acceptance criteria and observable checks. Review the resulting patch yourself when the change is consequential; generated summaries are not a substitute for the diff.
