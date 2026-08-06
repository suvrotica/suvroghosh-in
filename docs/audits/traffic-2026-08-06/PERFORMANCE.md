# Performance

Audit date: 2026-08-06 (Asia/Calcutta, UTC+05:30)

## Executive result

Production field evidence, not the high desktop lab scores, determines the verdict: Vercel Speed Insights reported desktop RES 56 (`Needs improvement`), p75 LCP 6.96 s, and p75 FCP 5.68 s across 250 data points. The available INP (104 ms) and CLS (0.01) were comparatively healthy. Overall mobile field data was unavailable.

The clean lab evidence consists of 48/48 accepted Lighthouse reports and 16 medians. Every accepted row verified the Vercel telemetry blocks and recorded zero completed telemetry requests. The earlier **31 completed unblocked navigations, 13:05:43–13:15:54 IST**, are excluded from all public results.

Highest-leverage work:

1. Replace the résumé's three eager YouTube players with accessible click-to-play previews. Median JavaScript transfer was about 1 MiB, and one mobile run reached 8.25 s LCP.
2. Add responsive, compressed archive thumbnails. The desktop archive median included 1.64 MiB of images.
3. Defer the Fractal Atlas laboratory while preserving its server-rendered article, poster, captions, and fallback. It used 4.37 s of mobile main-thread time and produced a 772 ms maximum long task.
4. Reduce unconditional font transfer, then validate against a clean field window.

## Evidence map

- `PERFORMANCE_AUDIT.md` — methodology, all median tables, route findings, limits, and reproduction instructions.
- `LIGHTHOUSE_RESULTS.csv` — 48 run rows and 16 medians, including telemetry-verification columns.
- `CORE_WEB_VITALS.md` — field interpretation, data gaps, and owner follow-up.
- `CORE_WEB_VITALS.csv` — machine-readable field rows and explicit unavailable-source status.
- `VISUALIZATION_PERFORMANCE.md` — activation cost, memory direction, resize behavior, reduced motion, and source-level lifecycle review.
- `ACCESSIBILITY.md` — concise accessibility result.
- `ACCESSIBILITY_AND_SEMANTIC_STRUCTURE.md` — detailed defects and test boundaries.

This file is the exact Phase 7 entry point requested by the brief; `PERFORMANCE_AUDIT.md` is the detailed technical record.
