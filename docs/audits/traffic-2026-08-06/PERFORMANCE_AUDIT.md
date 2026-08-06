# Performance audit

Audit date: 2026-08-06 (Asia/Calcutta, UTC+05:30)

## Verdict

The production field signal says the site has a loading problem even though most desktop lab runs are fast. Authenticated Vercel Speed Insights reported desktop p75 LCP **6.96 s**, FCP **5.68 s**, and RES **56 / Needs improvement** across 250 data points. INP (104 ms) and CLS (0.01) were comparatively healthy. Overall mobile field data was unavailable.

The controlled lab matrix found three concrete payload risks:

1. The résumé loads three YouTube players on initial navigation. Its median JavaScript transfer was **981 KiB mobile / 1,004 KiB desktop**, and one of the three mobile runs reached **8.25 s LCP**.
2. The archive transferred a median **1,635 KiB of images on desktop**. Its four-column gallery uses original thumbnail URLs without responsive `srcset` candidates.
3. The Fractal Atlas transferred **275 KiB of JavaScript before interaction**, reported about **72–73 KiB unused JavaScript**, and occupied **4.37 s of mobile main-thread time**, including a 772 ms maximum long task.

The field result remains authoritative. The lab environment produced much lower desktop TTFB and LCP than real visits, so its high desktop scores do not disprove the field defect.

## Evidence and contamination control

The published lab evidence contains only the corrected telemetry-blocked run:

- 8 representative production URLs;
- Lighthouse mobile and desktop profiles;
- exactly 3 serial runs for each page/profile pair;
- 48 accepted raw reports and 16 medians;
- Lighthouse 13.4.1 and Headless Chrome 151.0.7922.75;
- report timestamps 2026-08-06T07:53:56.158Z through 2026-08-06T08:11:13.484Z;
- every accepted raw report contains all five required Vercel telemetry block patterns;
- zero accepted report recorded a completed matching telemetry request.

The lab blocks Vercel Analytics and Speed Insights collection paths. This prevents the audit from altering those datasets but slightly understates the requests and JavaScript a normal production visitor may receive. Other first- and third-party resources remain in scope.

An earlier runner error completed **31 unblocked navigations, 13:05:43–13:15:54 IST**. Those reports are private evidence only and are excluded from every public row and median. They may contaminate later 2026-08-06 Vercel traffic totals. The authenticated field snapshot was captured before the incident.

## Representative pages

| Page type                 | Production path                                                      | Selection basis                                                               |
| ------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Homepage                  | `/`                                                                  | Required business/navigation entry point                                      |
| Résumé                    | `/resume`                                                            | Required professional landing page                                            |
| Consulting                | `/consulting`                                                        | Required conversion-oriented landing page                                     |
| Normal long article       | `/blog/engineering-blog/sql-or-sequel-the-immortal-language-of-data` | Longest canonical article in the audited corpus                               |
| Media-heavy article       | `/blog/personal/schooling-in-calcutta`                               | Highest image count among ordinary canonical articles selected for this phase |
| Archive                   | `/blog/archive/2026/07`                                              | Representative monthly archive/gallery                                        |
| Lightweight visualization | `/blog/visualizations/hello-fragment-your-first-shader-from-scratch` | Small visualization shell with deferred p5 activation                         |
| Heaviest visualization    | `/blog/visualizations/the-fractal-atlas`                             | Largest visualization article/component selected by build/source evidence     |

## Lab methodology

Mobile used Lighthouse's simulated mobile profile: 412 × 823 screen emulation, device scale factor 1.75, 150 ms RTT, 1,638.4 Kbps throughput, and 4× CPU slowdown. Desktop used 1,350 × 940 emulation, 40 ms RTT, 10,240 Kbps throughput, and 1× CPU. Lighthouse used its simulated throttling method. Runs were serial with a two-second cooldown.

All values below are medians of three accepted runs. TBT is the suitable navigation-lab interaction proxy; it is not INP. Main-thread, script-evaluation, and JavaScript-bootup time are workload proxies, not a direct hydration measurement. The runner records all run-level values and additional audit fields in `LIGHTHOUSE_RESULTS.csv`.

### Mobile medians

| Page                      | Perf | A11y |      LCP |      FCP |   TTFB |    TBT |    CLS |     Total |      JS |  Images |   Fonts | Main thread | Long tasks / max | Unused JS |
| ------------------------- | ---: | ---: | -------: | -------: | -----: | -----: | -----: | --------: | ------: | ------: | ------: | ----------: | ---------------: | --------: |
| Homepage                  |   97 |  100 | 2,015 ms | 1,757 ms | 177 ms |  18 ms | 0.0504 |   307 KiB | 100 KiB |   1 KiB | 162 KiB |    1,607 ms |       3 / 234 ms |     0 KiB |
| Résumé                    |   95 |   95 | 2,270 ms | 1,820 ms | 146 ms |  44 ms |      0 | 1,508 KiB | 981 KiB |   8 KiB | 242 KiB |    1,341 ms |       5 / 221 ms |     0 KiB |
| Consulting                |   99 |  100 | 1,799 ms | 1,349 ms |  44 ms |  25 ms |      0 |   305 KiB |  99 KiB |   1 KiB | 162 KiB |    1,516 ms |       4 / 182 ms |     0 KiB |
| Normal long article       |   88 |  100 | 3,295 ms | 2,520 ms |  44 ms |  68 ms |      0 |   579 KiB | 156 KiB |  46 KiB | 221 KiB |    2,723 ms |       7 / 514 ms |     0 KiB |
| Media-heavy article       |   93 |  100 | 2,923 ms | 2,098 ms |  46 ms |  35 ms |      0 |   575 KiB | 134 KiB | 105 KiB | 202 KiB |    1,690 ms |       4 / 251 ms |     0 KiB |
| Archive                   |   94 |  100 | 3,022 ms | 1,597 ms |  43 ms |  31 ms |      0 |   815 KiB | 104 KiB | 495 KiB | 162 KiB |    1,532 ms |       3 / 140 ms |     0 KiB |
| Lightweight visualization |   94 |  100 | 2,758 ms | 2,083 ms |  42 ms |  36 ms |      0 |   501 KiB | 146 KiB |   1 KiB | 221 KiB |    1,883 ms |       3 / 378 ms |     0 KiB |
| Heaviest visualization    |   88 |   97 | 3,197 ms | 2,147 ms |  56 ms | 187 ms | 0.0415 |   817 KiB | 275 KiB |  87 KiB | 305 KiB |    4,371 ms |       6 / 772 ms |    72 KiB |

### Desktop medians

| Page                      | Perf | A11y |      LCP |      FCP |   TTFB |  TBT |    CLS |     Total |        JS |    Images |   Fonts | Main thread | Long tasks / max | Unused JS |
| ------------------------- | ---: | ---: | -------: | -------: | -----: | ---: | -----: | --------: | --------: | --------: | ------: | ----------: | ---------------: | --------: |
| Homepage                  |  100 |  100 |   527 ms |   449 ms |  68 ms | 0 ms | 0.0601 |   494 KiB |   100 KiB |     1 KiB | 349 KiB |      465 ms |        1 / 76 ms |     0 KiB |
| Résumé                    |   94 |   96 | 1,251 ms | 1,222 ms |  41 ms | 0 ms | 0.0012 | 1,830 KiB | 1,004 KiB |   121 KiB | 429 KiB |      352 ms |        1 / 62 ms |     0 KiB |
| Consulting                |  100 |  100 |   548 ms |   498 ms |  55 ms | 0 ms | 0.0032 |   493 KiB |    99 KiB |     1 KiB | 349 KiB |      388 ms |         0 / 0 ms |     0 KiB |
| Normal long article       |   99 |  100 |   817 ms |   685 ms | 117 ms | 0 ms | 0.0096 |   766 KiB |   156 KiB |    46 KiB | 408 KiB |      549 ms |        1 / 90 ms |     0 KiB |
| Media-heavy article       |   99 |  100 |   699 ms |   559 ms |  46 ms | 0 ms |  0.011 |   762 KiB |   134 KiB |   105 KiB | 389 KiB |      387 ms |        1 / 67 ms |     0 KiB |
| Archive                   |   99 |  100 |   775 ms |   549 ms |  50 ms | 0 ms |      0 | 2,143 KiB |   104 KiB | 1,635 KiB | 349 KiB |      522 ms |        1 / 50 ms |     0 KiB |
| Lightweight visualization |  100 |  100 |   723 ms |   619 ms |  51 ms | 0 ms | 0.0109 |   849 KiB |   145 KiB |   161 KiB | 408 KiB |      457 ms |        1 / 81 ms |     0 KiB |
| Heaviest visualization    |   95 |   97 | 1,025 ms |   910 ms |  44 ms | 0 ms | 0.0234 | 1,004 KiB |   275 KiB |    87 KiB | 491 KiB |    1,063 ms |       1 / 214 ms |    73 KiB |

## Findings and remediation order

### P1 — Treat field loading performance as the primary defect

The authenticated desktop field p75 (LCP 6.96 s, FCP 5.68 s, TTFB 0.94 s) is materially worse than the desktop lab. Article routes supplied 158 of the displayed 250 desktop points and had RES 66; `/blog` had 43 points and RES 48. This supports route-level investigation, but not a single-cause claim.

After payload fixes, compare the same route templates over a clean 28-day field window. Segment by geography and route if the dashboard supports it. Do not use the contaminated 2026-08-06 interval as a clean traffic baseline.

### P1 — Replace eager résumé video players

`src/routes/resume/+page.svelte` renders three video URLs through `YouTube.svelte`. The shared component creates an iframe immediately and has no `loading="lazy"`. In the clean raw reports, YouTube resources contributed roughly 1.11 MiB on the typical mobile run and 1.23 MiB on desktop; the Lighthouse resource summary recorded about 1 MiB of JavaScript in both profiles. One mobile run transferred 2.08 MiB total and reached 8.25 s LCP, showing material variance hidden by the median.

Use a click-to-play “lite” embed with a locally hosted poster and ordinary YouTube link. At minimum, lazy-load each iframe, but three lazy players can still activate together when the long résumé is scanned. Preserve titles/captions and keyboard operation.

### P1 — Add responsive archive thumbnails

The archive median was 2.14 MiB total on desktop, including 1.64 MiB of images. `PostGallery.svelte` marks all but the first card lazy, but each card supplies one original URL and fixed dimensions without `srcset`/`sizes`. The four-column layout places many cards close enough to the viewport for browser lazy-load heuristics to fetch them.

Generate small AVIF/WebP/JPEG candidates, add truthful `srcset` and `sizes`, keep width/height, and retain lazy loading below the first likely LCP card. Verify the first card's priority against actual LCP attribution rather than assuming it is always the LCP element.

### P2 — Split the Fractal Atlas laboratory from the article shell

The Fractal Atlas is the heaviest tested route: 275 KiB initial JavaScript, 72–73 KiB reported unused, 4.37 s mobile main-thread time, 187 ms TBT, and a 772 ms maximum long task. Its laboratory component is imported directly by the article. Runtime probing confirmed no additional script transfer when the lab was brought into view because its code had already arrived.

Keep the hero, poster, captions, explanatory prose, canonical URL, and accessible fallback server-rendered. Dynamically import the laboratory on explicit “Enter the laboratory” activation or a conservative near-viewport boundary. Split rarely used export, precision, palette, tour, and worker tooling where dependency boundaries permit.

### P2 — Reduce unconditional font transfer

Even the homepage and consulting page transferred 162 KiB of fonts on mobile and about 349 KiB on desktop. Desktop loaded a 187 KiB Bengali variable font for the two-word Bengali brand plus a 120 KiB Source Serif font and a 42 KiB Roboto variable font. Article and mathematics routes added Courier Prime and KaTeX faces.

Preserve the bilingual identity, but test a smaller Bengali subset or system fallback for the short brand, narrower variable-font ranges, route-conditional code/math fonts, and fewer preloads. Check visual stability and real FCP/LCP after each change.

### P2 — Profile the long-article main thread

The long SQL article had the slowest median mobile LCP (3.30 s), 2.72 s main-thread time, seven long tasks, and a 514 ms maximum long task. No single Lighthouse unused-JS opportunity was reported, so bundle coverage alone does not identify the cause. Capture a production-mode performance trace and add explicit Svelte hydration/user-timing marks before attributing the cost to hydration, reading widgets, syntax/math tooling, or another component.

## Metric interpretation and limits

- TBT is a navigation-lab proxy. Field INP is the interaction metric and was 104 ms p75 in the available desktop window.
- The audit cannot directly measure Svelte hydration because the production app emits no dedicated hydration performance mark. Main-thread, script-evaluation, and bootup columns are deliberately labelled proxies.
- A zero in `unused_javascript_bytes` means Lighthouse found no reportable savings in that navigation. It does not prove every transferred byte was useful, particularly inside cross-origin iframes.
- Three runs satisfy the brief and reduce one-run noise, but they are still a small sample. The résumé's 8.25 s mobile outlier is why run-level rows remain public.
- Simulated mobile throttling is not a physical low-end handset or GPU. It cannot validate thermal throttling, actual WebGL frame pacing, or memory pressure.
- Blocking telemetry slightly understates ordinary production cost. The exact patterns and verification columns are retained in the CSV.
- Lighthouse accessibility scores are diagnostic, not a WCAG conformance statement. See `ACCESSIBILITY_AND_SEMANTIC_STRUCTURE.md`.

## Reproduction and outputs

Run the complete controlled matrix from the repository root:

```powershell
node scripts\audit-performance.mjs
```

Focused diagnostics are available through `--page`, `--profile`, `--lab-only`, `--probes-only`, and `--dry-run`. The pinned tool version and telemetry patterns are part of the script, and focused tests live in `scripts/audit-performance.test.mjs`.

Public sanitized evidence:

- `LIGHTHOUSE_RESULTS.csv` — all 48 accepted runs plus 16 medians;
- `CORE_WEB_VITALS.csv` and `CORE_WEB_VITALS.md` — field evidence and unavailable-source status;
- `ACCESSIBILITY_AND_SEMANTIC_STRUCTURE.md` — accessibility and semantic findings;
- `VISUALIZATION_PERFORMANCE.md` — visualization-specific runtime and source review.

Raw Lighthouse JSON and Playwright probe data remain under the ignored `.audit-private` tree. They contain diagnostic URLs and browser details and are intentionally not committed.
