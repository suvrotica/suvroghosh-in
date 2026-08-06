# Analytics truth

## Verdict

The reported **20–24 visitors per day is a real Vercel counter, but it is not a verified human-audience or organic-search baseline**. Vercel recorded 164 period visitors over the retained seven-day view, an average of 23.4 per day. The available data also contains a large, concentrated viewing burst, unusual geography/device patterns, extensive owner/development activity, and almost no attributable referrer data. It cannot support claims of genuine engagement, search growth, or a loyal direct audience.

Status: **OBSERVED BUT CONFOUNDED**.

## Source and scope

Evidence came from authenticated, read-only Vercel Web Analytics for the `Production` environment. No settings, filters, drains, projects, domains, or deployments were changed.

| Window                                                                 | Visitors | Page views | Bounce rate | Boundary                                                                      |
| ---------------------------------------------------------------------- | -------: | ---------: | ----------: | ----------------------------------------------------------------------------- |
| 2026-07-30 to 2026-08-06, retained seven-day preset                    |      164 |        302 |         84% | Period visitor identities; first/last timestamps are partial days             |
| 2026-07-09 12:30 to 2026-08-06 13:29 Asia/Calcutta, exact audit window |      913 |      3,394 |         73% | Primary 28-day analytical window                                              |
| 2026-07-07 to 2026-08-06, Vercel preset                                |      928 |      3,446 |         73% | Available 30-day comparison                                                   |
| 90 days and all history                                                |        — |          — |           — | **UNAVAILABLE**: the Hobby interface rejected dates before its retained range |

Vercel exposes neither a raw export nor UTM detail on this plan; UTM Parameters and custom Events require an upgrade. The CSVs in this folder transcribe the visible aggregate tables and chart labels. Values shown by Vercel as `K` remain marked as rounded estimates.

## Contamination and anomaly analysis

The 28-day daily chart contains an exceptional concentration:

- 2026-07-16: 26 daily visitors and 848 page views (32.62 views per daily visitor).
- 2026-07-17: 36 daily visitors and 330 page views (9.17 views per daily visitor).
- A targeted 25-hour view spanning those dates showed 34 period visitors, 639 views, and 76% bounce.
- In that targeted view, `/blog` accounted for 502 of 639 views; the United States accounted for 95% of page views; Chrome Mobile and Android each accounted for 96%.

This pattern is **consistent with automation, load/navigation testing, owner activity, or other non-human use, but the aggregate product cannot identify the actor**. It is therefore labelled unknown contaminated traffic, not bot traffic as a proven fact. Removing only 16–17 July would also be an unjustified “cleaning” rule; the full observed series is preserved in `TRAFFIC_BY_DAY.csv`.

Repository history shows 317 commits during the 28-day window. That does not prove 317 deployments, but it establishes unusually intense development activity. In `TRAFFIC_BY_PAGE.csv`, four auth-lifecycle or owner-only route rows are replaced by one sanitized aggregate: 12 summed route-level visitor counts and 29 page views. The visitor value is **not 12 unique people** because the same period visitor may appear on more than one route; the aggregation preserves the source table's row sums while withholding paths and per-route splits. Owner use of public pages cannot be separated. Preview-host activity was negligible in the hostname table (one visitor), while 912 of 913 visitors were attached to the primary production hostname label.

All route-level visitor values in `TRAFFIC_BY_PAGE.csv` are similarly **nonadditive**: their nominal sum is 1,584, versus 913 unique visitors in the period headline. A visitor can appear in multiple route rows, so 1,584 must not be reported as a site-wide visitor count. The route page-view values have a nominal sum of 3,233, which is 161 below the 3,394 headline/daily-series total. That gap is not a measured class of missing visits: `/blog` is displayed as a rounded `1.4K` estimate, and the retained route table may be incomplete. Use the headline/daily-series total for the period and the route table only for directional page mix; the completed canonical join is recorded separately in `TRAFFIC_CANONICAL_RECONCILIATION.csv`.

## Geography, platform, and referrer reconciliation

The exact 28-day country table recorded 283 visitors from India (31%), 278 from China (30%), 227 from the United States (25%), and 113 from Singapore (12%). Singapore is therefore no longer roughly half of observed traffic as in the historical July snapshot, but China, Singapore, and the burst remain anomalous enough to invalidate a simple human-demand interpretation.

Desktop represented 537 listed visitors (61%) and mobile 344 (39%). The named device rows total 883 visitors, leaving 30 of the 913 headline visitors unclassified or not displayed; named operating-system rows have the same 883/30 split. Named browser rows total 891, leaving 22 unclassified or not displayed. `TRAFFIC_BY_PLATFORM.csv` includes explicit reconciliation-gap rows for those differences. Their page-view fields remain blank because the interface did not provide them: no category was rescaled and no page-view value was imputed. Chrome/Chrome Mobile dominated the named browser rows; Windows, Android, and GNU/Linux led the named operating-system rows. Page-view counts above 1,000 are rounded in Vercel and are labelled estimates.

Only nine referrers appeared in the retained table, totalling 19 listed visitors and 23 views: Google 7/9, DuckDuckGo 2/2, LinkedIn 2/2, MSN New Tab 2/3, YouTube 2/2, and one visitor each from Bing, LinkedIn Android, Substack, and Vercel. **The absence of a listed referrer is not evidence of direct navigation or repeat readership.** Referrers may be unavailable, stripped, suppressed, or outside the table's attribution model.

## Search-versus-analytics boundary

Google Search Console performance and Bing Webmaster performance are unavailable because the current sessions do not have verified-property access. Consequently:

- analytics visitors cannot be reconciled with impressions, search clicks, CTR, or average position;
- the seven Google and one Bing referred visitors are not substitutes for engine click reports;
- no claim about rankings, organic sessions, Discover, search appearance, or indexed demand is made;
- a “20–24 genuine visitors per day” baseline and a “20–24 organic visitors per day” baseline are both **NOT ESTABLISHED**.

Alias-to-canonical traffic reconciliation is **COMPLETE FOR THE ACCEPTED CRAWL**. Of 245 observed public-path rows, 243 match 243 canonical groups; no matched group contains more than one observed alias/canonical path. Two historical analytics paths are unmatched (`/blog/math/lu-factorization`, 6 visitors/6 views; `/blog/comic/the-last-analog-town/the-efficiency-inspector`, 1/1), and the sanitized non-unique owner/account aggregate is excluded from every canonical total. `TRAFFIC_CANONICAL_RECONCILIATION.csv` preserves every raw value and uses the maximum within a canonical group—never the sum—as the conservative directional value. This join prevents alias double-counting; it does **not** make the contaminated route visitors additive, human, or organic.

## Usable baseline

For now, use Vercel as an operational counter only:

- retain the full 28-day series and annotate known release/test windows;
- do not optimise against bounce rate or views-per-visitor until human/test separation exists;
- compare Search Console and Bing clicks only after the owner grants property access;
- establish explicit, privacy-aware conversion events before evaluating business outcomes;
- revisit the geography and `/blog` burst after 30 clean days with owner/test exclusion.

Supporting data: `TRAFFIC_BY_DAY.csv`, `TRAFFIC_BY_PAGE.csv`, `TRAFFIC_BY_REFERRER.csv`, `TRAFFIC_BY_COUNTRY.csv`, `TRAFFIC_BY_PLATFORM.csv`, and `SEARCH_VERSUS_ANALYTICS.csv`.

## Audit-induced measurement incident

The analytics snapshot and CSVs above were captured before the full performance matrix began. On 2026-08-06 from 13:05:43 to 13:15:54 Asia/Calcutta, the initial Lighthouse runner completed 31 headless production navigations before its exact process tree was stopped. The 31st completed report was recovered from raw output even though the interrupted parent had not appended it to the summary CSV. Those navigations may have emitted Vercel Analytics and Speed Insights beacons, potentially appearing as a synthetic visitor and repeated views across representative routes. They did not submit forms or change site content, but analytics events cannot be withdrawn.

Those 31 runs are excluded from published performance medians. The replacement runner blocked `/_vercel/insights/` and `/_vercel/speed-insights/` telemetry and completed an accepted matrix of **48 clean raw runs plus 16 median rows**; its telemetry verification observed zero completed Vercel analytics or speed-insights requests. The accepted lab evidence is in `LIGHTHOUSE_RESULTS.csv` and [PERFORMANCE_AND_ACCESSIBILITY.md](./PERFORMANCE_AND_ACCESSIBILITY.md). Treat post-13:05 analytics on 2026-08-06 as known audit-contaminated data unless the platform can prove otherwise.
