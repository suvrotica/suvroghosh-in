# Core Web Vitals and field experience

Audit date: 2026-08-06 (Asia/Calcutta, UTC+05:30)

## Verdict

Field evidence identifies a real loading-performance problem, not an interaction or layout-stability problem. Vercel Speed Insights labelled the available seven-day **desktop** experience `Needs improvement`: Real Experience Score (RES) 56, p75 FCP 5.68 s, p75 LCP 6.96 s, p75 INP 104 ms, p75 CLS 0.01, p75 FID 15 ms, and p75 TTFB 0.94 s across 250 data points. LCP and FCP are the conspicuous defects; INP and CLS are comparatively healthy.

This is the highest-quality performance evidence available in this audit because it records production visits rather than one synthetic machine. It does not establish that every route or every user has the same experience.

## Field evidence

Source: authenticated Vercel Speed Insights dashboard, project production environment, Last 7 Days, 2026-07-30 12:30 through 2026-08-06 13:29 local time.

| Segment         | Data points | RES | FCP p75 | LCP p75 | INP p75 | CLS p75 | FID p75 | TTFB p75 | Interpretation                                                |
| --------------- | ----------: | --: | ------: | ------: | ------: | ------: | ------: | -------: | ------------------------------------------------------------- |
| Overall desktop |         250 |  56 |  5.68 s |  6.96 s |  104 ms |    0.01 |   15 ms |   0.94 s | Needs improvement; loading is the dominant defect             |
| Overall mobile  |           — |   — |       — |       — |       — |       — |       — |        — | `No data available`; no overall mobile verdict is supportable |

Desktop route rows displayed by Vercel:

| Route template                              | Data points | RES | Evidential weight                                                             |
| ------------------------------------------- | ----------: | --: | ----------------------------------------------------------------------------- |
| `/blog/[category]/[slug]`                   |         158 |  66 | Largest route sample; directional evidence that article experience needs work |
| `/blog`                                     |          43 |  48 | Meaningful warning for the archive hub                                        |
| `/`                                         |          37 |  99 | Directionally healthy, but much smaller than the article-route sample         |
| `/resources/[kind=resourceKind]/[slug]`     |           4 | 100 | Too sparse for a durable conclusion                                           |
| `/topics/[slug]`                            |           3 |  36 | Too sparse for a durable conclusion                                           |
| `/blog/visualizations/the-bias-archipelago` |           3 |  89 | Too sparse for a durable conclusion                                           |

The mobile route table retained only 32 sparse observations even though the overall mobile panel had no result: `/blog` 5 points / RES 85; `/blog/[category]/[slug]` 24 / RES 96; `/images/sketches` 3 / RES 99. China supplied 22 of those 32 route-level points and showed RES 85. These rows are directional only and must not be turned into an overall mobile CWV verdict.

Displayed desktop country rows were United States 122 points / RES 54, China 9 / 68, and Israel 9 / 59. Country mix and small segments may affect the aggregate; Vercel did not expose enough route-by-country detail here to attribute the loading defect to a single geography.

## Evidence unavailable

- Google Search Console Core Web Vitals: **UNVERIFIED — REQUIRES OWNER ACTION**. The signed-in account did not have access to the domain property.
- Public Chrome User Experience data: **UNVERIFIED**. A keyless PageSpeed Insights request for the homepage returned HTTP 429 on 2026-08-06, so no CrUX distributions were recorded or inferred.
- Vercel mobile overall p75 metrics: **INSUFFICIENT DATA** in the selected seven-day dashboard range.

## Field versus lab

The accompanying Lighthouse matrix is controlled laboratory evidence. It uses medians of three cold navigations for eight representative URLs on simulated mobile and desktop profiles. Total Blocking Time is reported as a navigation-lab proxy; it is not INP. Field p75 remains authoritative for user experience because it includes real devices, networks, cache states, routes, and interactions.

The lab runner blocks only Vercel Analytics and Speed Insights collection paths to avoid altering the production dataset. That protection slightly understates the JavaScript and request cost a normal visitor may incur. All other first- and third-party page resources remain part of the lab measurement.

## Audit-traffic incident

The authenticated Speed Insights snapshot above was captured before lab testing. An initial runner mistake allowed **31** Lighthouse navigations to load the production telemetry scripts between 2026-08-06 13:05:43 and 13:15:54 IST. Those navigations are excluded from every published lab median, but they may contaminate later 2026-08-06 Vercel traffic or page-view totals. The corrected runner applies Lighthouse `blockedUrlPatterns`, verifies the configured patterns in every raw report, and rejects a run if any matching telemetry request completes.

## Required follow-up

1. Fix measured route-specific payload defects, beginning with the résumé’s eager third-party video embeds and then the heaviest article/visualization bundles identified in `PERFORMANCE_AUDIT.md`.
2. Compare Vercel p75 for the same production route templates after a stable 28-day window; do not use the contaminated audit interval as a clean traffic baseline.
3. Grant the correct account access to the Search Console domain property and review its mobile and desktop CWV issue groups.
4. Recheck public CrUX only when a legitimate quota-bearing API route or the official user interface is available; do not infer CrUX from Lighthouse.
