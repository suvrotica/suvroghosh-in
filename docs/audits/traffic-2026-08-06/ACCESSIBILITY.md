# Accessibility

Audit date: 2026-08-06 (Asia/Calcutta, UTC+05:30)

## Result

The eight representative pages have a useful semantic baseline: each telemetry-blocked runtime probe returned HTTP 200, `lang="en"`, one main landmark, one H1, no adjacent heading-level skip, no image missing an `alt` attribute, and no global overflow at the mobile probe width. Reduced motion was active, and all named top-document focus stops sampled outside one cross-origin iframe exposed a CSS focus indicator.

Three deterministic defects remain:

1. Nine résumé text nodes render at 4.46:1 instead of the required 4.5:1.
2. Nine Fractal Atlas labels render at 4.20–4.31:1 and are also exceptionally small.
3. Accessible names omit visible text in the desktop bilingual brand and five mobile Fractal Atlas tabs.

The résumé iframe focus step needs manual verification because the parent document cannot inspect the cross-origin player's internal focus ring. Video caption and transcript quality also remains an editorial/manual check.

See `ACCESSIBILITY_AND_SEMANTIC_STRUCTURE.md` for selectors, scores, semantic evidence, visualization behavior, validation results, test limits, and the manual acceptance checklist. This file is the exact Phase 7 entry point requested by the brief; the longer report is the technical record.

No automated result in this audit is a WCAG conformance claim.
