# Search Console, Bing Webmaster Tools, and IndexNow

Audit date: **2026-08-06 (Asia/Calcutta)**

Canonical production origin: `https://www.suvroghosh.in`

## Executive verdict

- **Google Search Console: UNVERIFIED — REQUIRES OWNER ACTION.** The signed-in browser reached the `suvroghosh.in` domain property's no-access/not-verified state. No Search Console metric or property-level verdict was available.
- **Bing Webmaster Tools: UNVERIFIED — REQUIRES OWNER ACTION.** No authenticated site property was available. A public Bing query encountered an automated challenge, which was not bypassed.
- **Google public discovery: VERIFIED — PUBLIC OBSERVATION ONLY.** Public searches exposed the homepage, professional pages, hubs, media pages, and individual articles. This rules out total Google disappearance at the observation time, but it is not an index census or an account-level verdict.
- **IndexNow repository implementation: VERIFIED — SOURCE AND TESTS.** The deployed baseline SHA contains a same-host key route, the global IndexNow endpoint, production-deployment gating, exact-origin URL validation, sitemap differencing, and deleted-URL notification. The baseline workflow covered only the main sitemap; the audit branch now adds an independently cached Notes-sitemap pass. That remediation is tested locally but is not deployed.
- **IndexNow live operation: UNVERIFIED — REQUIRES OWNER ACTION.** The production key file, actual submission status, workflow-run history, and Bing IndexNow Insights were not inspected. The audit made no IndexNow submission.

No Google manual action, Google security issue, Bing penalty, or Bing malware warning was verified. Equally, none can be called absent: those reports were inaccessible. The status is **unverified**, not clean.

## Evidence-status matrix

| System or question                                                                                                              | Status                                 | Evidence                                                                                                                     | Bounded interpretation                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Search Console property access                                                                                                  | **UNVERIFIED — REQUIRES OWNER ACTION** | Signed-in property URL returned the no-access/not-verified state; see [GOOGLE_SEARCH_CONSOLE.md](./GOOGLE_SEARCH_CONSOLE.md) | No account report was inspected or exported                                                                             |
| Google clicks, impressions, CTR, position, queries, pages, countries, devices, appearance, Discover, image, video, or News data | **UNVERIFIED — REQUIRES OWNER ACTION** | Property access unavailable                                                                                                  | No value, trend, ranking diagnosis, or zero may be asserted                                                             |
| Google Page Indexing, Sitemaps, Crawl Stats, Core Web Vitals, HTTPS, Removals, and Links                                        | **UNVERIFIED — REQUIRES OWNER ACTION** | Property access unavailable                                                                                                  | Crawl eligibility from the independent crawl cannot substitute for Google's account data                                |
| Google Manual Actions                                                                                                           | **UNVERIFIED — REQUIRES OWNER ACTION** | Required property screen was not accessible                                                                                  | Public search visibility does not prove that the report is clear                                                        |
| Google Security Issues                                                                                                          | **UNVERIFIED — REQUIRES OWNER ACTION** | Required property screen was not accessible                                                                                  | Public hacked-term probes do not prove that the report is clear                                                         |
| Google URL Inspection                                                                                                           | **UNVERIFIED — REQUIRES OWNER ACTION** | All 45 rows in [URL_INSPECTION_SAMPLE.csv](./URL_INSPECTION_SAMPLE.csv) retain the access-required status                    | Google-selected canonicals, last crawls, fetches, and index states remain unknown                                       |
| Google public result observations                                                                                               | **VERIFIED — PUBLIC OBSERVATION**      | [PUBLIC_SEARCH_TESTS.csv](./PUBLIC_SEARCH_TESTS.csv) and [PUBLIC_SEARCH_TESTS.md](./PUBLIC_SEARCH_TESTS.md)                  | Some pages were retrievable; result counts and comprehensive coverage were not inferred                                 |
| Bing Webmaster Tools property and reports                                                                                       | **UNVERIFIED — REQUIRES OWNER ACTION** | The browser reached Bing's signed-out entry page; see [BING_WEBMASTER_TOOLS.md](./BING_WEBMASTER_TOOLS.md)                   | Performance, indexing, crawl, sitemap, backlinks, recommendations, security, and AI reports remain unknown              |
| Bing public `site:` result                                                                                                      | **UNVERIFIED — REQUIRES OWNER ACTION** | Bing presented an automated challenge                                                                                        | No search-result evidence was collected and the challenge was not bypassed                                              |
| Repository-to-production identity                                                                                               | **VERIFIED**                           | [DEPLOYMENT_IDENTITY.md](./DEPLOYMENT_IDENTITY.md) records an exact SHA match for the audited baseline                       | Source-level IndexNow findings apply to the deployed baseline code, but not automatically to its secrets or run history |
| IndexNow live key and submission history                                                                                        | **UNVERIFIED — REQUIRES OWNER ACTION** | No key value, verification URL, Actions log, response, or Bing Insights report was exposed                                   | Runtime ownership and successful notification cannot be claimed                                                         |

## Public-search observations and limits

Google searches were observed from India with `pws=0`. Localisation, experiment assignment, session state, spelling rewrites, and live-index changes can still affect the surface. Positions and result-count estimates were deliberately not recorded.

Observed examples included:

- both apex and `www` site-operator queries returning a range of first-party pages;
- the exact title “Hello, Fragment: Your First Shader from Scratch” returning its intended canonical article;
- a brand-plus-professional-role query returning the home, resume, consulting, and healthcare material;
- a descriptive gradient-descent query returning the intended visualization;
- no first-party result on the inspected surface for the non-brand query `HL7 vs FHIR explained simply`;
- legitimate editorial matches, rather than obviously injected landing-page titles, for several hacked-term probes; and
- no inspectable Bing result because of the automated challenge.

These observations establish pockets of Google discovery and rule out complete public disappearance at that moment. They do **not** establish the number of indexed URLs, sitemap acceptance, impressions, clicks, ranking health, a Google-selected canonical, a clear manual-actions report, a clear security-issues report, or Bing visibility. A generated overview shown for one query was not treated as durable citation or traffic evidence.

## Google Search Console assessment

The audit did not request access, initiate verification, add a DNS record, upload a verification file, submit a sitemap, request indexing, or change any property setting. Because property access was unavailable, all of these remain **UNVERIFIED — REQUIRES OWNER ACTION**:

- Search Performance and every dimension required by the brief;
- Page Indexing reasons and trends;
- `/sitemap.xml` and `/notes/sitemap.xml` processing;
- Crawl Stats and bot-request evidence;
- representative URL Inspection outcomes;
- Core Web Vitals field groups and HTTPS status;
- Manual Actions, Security Issues, and Removals; and
- the Links report.

The public-search evidence is compatible with partial or broad indexing, but cannot distinguish between them. It also cannot determine whether low traffic is caused by low demand, weak rankings, low CTR, limited authority, or an indexing problem. That diagnosis requires the account exports listed below.

Google's own documentation separates the [Manual Actions report](https://support.google.com/webmasters/answer/9044175?hl=en) from the [Security Issues report](https://support.google.com/webmasters/answer/9044101?hl=en); neither can be replaced by a `site:` query.

## Bing Webmaster Tools assessment

The audit did not sign in, import a Google property, add a Bing property, verify ownership, submit a sitemap, run Site Scan, inspect URLs, or change crawl settings. The following are therefore **UNVERIFIED — REQUIRES OWNER ACTION**:

- property verification and assigned role;
- Search Performance, including Web/Chat splits where available;
- indexed pages, crawl requests, crawl errors, and Site Explorer;
- `/sitemap.xml` and `/notes/sitemap.xml` status;
- URL Inspection for the 45-row sample;
- Site Scan, Recommendations, and crawl information;
- Backlinks and Keyword Research;
- malware or other security warnings;
- IndexNow Insights; and
- AI Performance, if available to the property.

The public Bing challenge is an evidence-access limitation, not evidence that the site or crawler is blocked. Bing documents its [site-verification flow](https://www.bing.com/webmasters/help/add-and-verify-site-12184f8b) and [Search Performance reports](https://www.bing.com/webmasters/help/search-performance-c680da36), but no values from those reports are assumed here.

## IndexNow implementation assessment

The assessment below separates repository controls from runtime evidence. The relevant source is `scripts/indexnow.mjs`, `.github/workflows/indexnow.yml`, `src/routes/[indexnowKey].txt/+server.ts`, `scripts/indexnow.test.mjs`, and the IndexNow section of `README.md`.

| Requirement                             | Status                                               | Verified implementation                                                                                                                                                                                                                                                                                                                                           | Residual uncertainty or limitation                                                                                                                                                                                       |
| --------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Key storage and validation              | **VERIFIED — SOURCE**                                | The route and submitter read `INDEXNOW_KEY` from private/runtime or CI environment state and accept only 8–128 letters, numbers, or dashes. No real key is committed in the inspected implementation or included in this report.                                                                                                                                  | Whether identical values are configured in Vercel and GitHub is **UNVERIFIED — REQUIRES OWNER ACTION**                                                                                                                   |
| Key location and contents               | **VERIFIED — SOURCE; LIVE UNVERIFIED**               | `keyLocation` is constructed as `https://www.suvroghosh.in/<key>.txt`. The dynamic route returns only the exactly matching configured key as `text/plain`, with `no-store`, `nosniff`, and `noindex`; all other values return 404.                                                                                                                                | The live file was not requested because the key was not exposed to the audit. Its HTTP status and exact-body match are **UNVERIFIED — REQUIRES OWNER ACTION**                                                            |
| Host alignment                          | **VERIFIED — SOURCE**                                | `SITE_URL`, payload `host`, key location, sitemap URL, and accepted submitted origins all resolve to canonical `www.suvroghosh.in`. Apex and foreign origins are rejected by exact-origin validation.                                                                                                                                                             | The runtime environment is still required for a live end-to-end ownership check                                                                                                                                          |
| Submission endpoint and payload         | **VERIFIED — SOURCE AND TEST**                       | JSON is posted to `https://api.indexnow.org/indexnow` with `host`, `key`, `keyLocation`, and deduplicated `urlList`; non-2xx responses fail the run.                                                                                                                                                                                                              | The test uses a mocked HTTP 202. A real response status and timestamp are **UNVERIFIED — REQUIRES OWNER ACTION**                                                                                                         |
| Production-only automatic behaviour     | **VERIFIED — WORKFLOW SOURCE**                       | Automatic execution is gated to a successful deployment whose environment is `Production`/`production`. The workflow is not attached to `push` or every build.                                                                                                                                                                                                    | Workflow-run history was not inspected. `workflow_dispatch` is an explicit manual exception, although it still reads and submits only the canonical production origin                                                    |
| Preview URL avoidance                   | **VERIFIED — SOURCE AND TEST**                       | The workflow fetches the production sitemap and `validateUrls` rejects every origin other than `https://www.suvroghosh.in`; credentials and fragments are rejected too.                                                                                                                                                                                           | Historical payloads were not exported, so prior operational behaviour remains unverified                                                                                                                                 |
| Canonical URL selection                 | **VERIFIED — SOURCE; AUDIT-BRANCH FIX NOT DEPLOYED** | Baseline inputs came from the main production sitemap. The audit branch now runs the same exact-origin validation and differencing independently for `/sitemap.xml` and `/notes/sitemap.xml`, with separate snapshots. URLs are deduplicated and capped at 10,000 per request. Deployment cache-busting affects only sitemap fetch URLs, not submitted page URLs. | Correctness still depends on both sitemap contents. Runtime coverage remains **UNVERIFIED — REQUIRES OWNER ACTION** until the reviewed branch is merged, deployed, and observed in a successful production workflow run. |
| Avoiding submission on every deployment | **VERIFIED — SOURCE AND TEST**                       | Each sitemap family restores its previous successful snapshot, compares URL plus `lastmod`, and submits only added, modified, or deleted URLs. Identical sitemaps produce no POST.                                                                                                                                                                                | A missing or evicted snapshot makes that prior sitemap empty and can cause a full current-sitemap submission; this is broader but still not a preview/every-build trigger                                                |
| Deleted URL handling                    | **VERIFIED — SOURCE AND TEST**                       | URLs present in the previous sitemap but absent from the current sitemap are included in the notification list. The unit test covers added, changed, deleted, and unchanged cases.                                                                                                                                                                                | Bing's receipt and later crawl/removal response are **UNVERIFIED — REQUIRES OWNER ACTION**                                                                                                                               |
| Failure and checkpoint handling         | **VERIFIED — SOURCE**                                | The current sitemap snapshot is saved only after an accepted response, or after a no-change skip. A rejected response throws and does not advance the successful snapshot.                                                                                                                                                                                        | GitHub Actions logs and alerting outcomes were not inspected                                                                                                                                                             |

`npm run indexnow:test` is a no-side-effect test suite: its network behaviour is supplied by local mocks, and the dry-run test asserts that no POST occurs. The baseline run passed eight tests; see [COMMAND_RESULTS.md](./COMMAND_RESULTS.md). After the audit-branch workflow and parser changes, **11 tests passed**, including distinct-snapshot coverage for both sitemap families, empty/final-deletion handling, and fail-closed rejection of malformed sitemap responses. The test proves the implementation contract, not production delivery.

IndexNow is a change-notification mechanism. Even a verified successful submission would not guarantee crawling, indexing, ranking, clicks, or AI citation. The official [IndexNow documentation](https://www.indexnow.org/documentation) describes the protocol; engine-side outcomes must be checked in Bing Webmaster Tools and, independently, in search performance/indexing reports.

## Exact owner actions

Keep raw exports, screenshots, account names, and any key-bearing evidence in `.audit-private/2026-08-06/`. Publish only sanitized aggregates and technical statuses.

### Google Search Console

1. Open the existing `suvroghosh.in` domain property as a verified owner.
2. Either grant the auditing account temporary **Full user** access under **Settings → Users and permissions**, or export the evidence directly. Do not add the account address to this repository. Revoke delegated access after export.
3. Capture dated Manual Actions and Security Issues verdicts. These two screens are mandatory before any Google penalty/security conclusion.
4. Export Performance for the maximum available history and comparable 90-, 28-, and 7-day windows: totals, daily rows, query, page, country, device, search appearance, image, video, Discover, and News where present.
5. Export Page Indexing reasons/examples, Crawl Stats, Core Web Vitals, HTTPS, Removals, and Links.
6. Record sitemap processing for both `https://www.suvroghosh.in/sitemap.xml` and `https://www.suvroghosh.in/notes/sitemap.xml`. Verify existing submissions; do not repeatedly resubmit without evidence of a defect.
7. Run URL Inspection for every row in [URL_INSPECTION_SAMPLE.csv](./URL_INSPECTION_SAMPLE.csv), recording index status, last crawl, crawler, crawl/fetch/index permission, user-declared and Google-selected canonicals, referring sitemap/pages, enhancements, and mobile status.
8. Follow the detailed handoff in [OWNER_ACTIONS_GSC.md](./OWNER_ACTIONS_GSC.md). If no property exists, pause for explicit authorization before making a DNS or verification change.

### Bing Webmaster Tools and IndexNow

1. Open the existing Bing property and grant temporary **Read only** access, or export the evidence directly. If no property exists, explicitly authorize either Google Search Console import or manual verification before changing external state.
2. Export Search Performance for the maximum available period plus comparable 90-, 28-, and 7-day windows, including page, keyword, and Web/Chat splits where available.
3. Export Indexed Pages, Site Explorer, crawl requests/errors, both sitemap statuses, Site Scan, Recommendations, Backlinks, Keyword Research, malware/security status, AI Performance if present, and URL Inspection for the same 45-row sample.
4. In private, confirm that the Vercel `INDEXNOW_KEY` and GitHub Actions `INDEXNOW_KEY` are identical without copying the value into a screenshot, log, issue, or report. Using the known value, verify that the canonical `/<key>.txt` URL returns HTTP 200 and an exact plain-text body match.
5. Inspect the latest successful production `indexnow.yml` run. Record the deployment SHA, timestamp, whether it skipped or submitted, URL count, and accepted HTTP status; redact the key and account identity.
6. Open Bing **IndexNow Insights** and record received URLs, response/processing observations, and errors. Reconcile a small sample with the workflow log.
7. Review and merge the audit-branch Notes-sitemap remediation if desired. After its first production run, verify that main and Notes changes are evaluated independently and that the workflow does not submit unchanged URLs.
8. Follow the detailed handoff in [OWNER_ACTIONS_BING.md](./OWNER_ACTIONS_BING.md).

## Decision rule after owner evidence

- A clear Manual Actions screen may support “no Google manual action observed on the recorded date”; it does not prove ranking health.
- A clear Security Issues screen may support “no Google security issue observed on the recorded date”; it does not replace browser/domain reputation checks.
- URL Inspection and Page Indexing exports can establish specific indexing defects; public result absence by itself cannot.
- Performance exports can distinguish no impressions, weak rank, weak CTR, and low clicks; public result order cannot supply those metrics.
- A successful IndexNow response establishes receipt of a notification only. It does not establish crawl, index, rank, click, or citation.
