# GEO Measurement — suvroghosh.in

Guidance reviewed on **30 October 2026**. The July observations below are retained as historical
evidence, not a fresh production or account audit. The current deployment, console access, account
settings and analytics baseline have **not** been reverified for this documentation update.

The historical technical release was commit `5398bacd272e6a1558ffe78f4b80ab3599ebad5d`, recorded as
active on 22 July. Do not reuse that date or its traffic numbers as the baseline for the current
one-page editorial pilot in [GEO_CONTENT_QUEUE.md](GEO_CONTENT_QUEUE.md). Record the pilot's verified
production release as its own measurement day zero (`D0`); until then, its release baseline is blank.

Code changes alone do not produce citations. They can improve technical access and reader usefulness.
The events below are distinct and must not be reported as one number:

1. **Technical eligibility** — pages are crawlable and indexable, with accurate canonicals and
   snippet controls; any structured data is factual and matches visible content.
2. **Indexing** — a search engine has fetched and stored the page.
3. **Search visibility** — the page receives impressions/clicks in results.
4. **Generative citation** — an AI answer provides a source link to the site; check its accuracy
   separately. A name without a source link is a mention.
5. **Referral visits** — a user clicks through from a generative or conventional result.
6. **Reader engagement** — the visitor actually reads, returns, or subscribes.

Schema markup and crawler access do **not** guarantee any of stages 2–6. Structured data is not a
general prerequisite for AI citations. Search/retrieval permissions and training permissions are
separate choices.

## Current Google Reporting And Controls

Official guidance rechecked on 30 October 2026:

- In Search Console, inspect **Settings → Search generative AI**, including inherited parent-property
  settings. Google's [control documentation](https://support.google.com/webmasters/answer/16908024?hl=en)
  describes inclusion/exclusion for AI Overviews, AI Mode and generative features in Discover. This
  does not control model training. Record the effective value if account access exists; do not change
  account settings, DNS, robots policy or training permissions as part of an editorial review.
- The [Generative AI performance report for Search](https://support.google.com/webmasters/answer/16984139?hl=en)
  reports **impressions** for AI Overviews and AI Mode, grouped by page, date, country and device.
  Keep its text-based/multimodal filter consistent between snapshots. It does not supply separate
  AI clicks or queries; its data overlaps overall Search performance, so do not add the totals.
- A missing report can reflect insufficient impressions or an exclusion setting. Record
  `unavailable` and the observed reason; do not replace missing evidence with zero. Save the displayed
  report alongside an export: Google's export can turn unavailable values into zeros. Report dates
  use Pacific Time; preserve that timezone alongside local release timestamps.
- Google stopped showing FAQ rich results on **7 May 2026** and removed their documentation in June;
  see the [official changelog](https://developers.google.com/search/updates). Useful visible FAQs
  remain an editorial option, not a Google rich-result objective.

---

## 1. Historical Console And Measurement Status On 2026-07-22

The following access/deployment assertions and proposed next actions describe that date only.
Recheck current state before acting; none establishes an outstanding task or present permission.

### Bing Webmaster Tools

- The correct site-add/verification flow was reached in an authenticated session.
- An HTML verification meta element was recorded in the then-local working changes. That alone
  did not establish ownership or successful verification of the live page.
- Sitemap processing, URL indexing, crawl/canonical errors, the
  [AI Performance report](https://blogs.bing.com/webmaster/February-2026/Introducing-AI-Performance-in-Bing-Webmaster-Tools-Public-Preview),
  and existing IndexNow status were **unverified** in that observation.
- Proposed owner action at the time, subject to a fresh status check: click **Verify**, submit
  `https://www.suvroghosh.in/sitemap.xml` once if it is not already present, wait for processing, and
  save the first AI Performance baseline. These are external account actions, not local code work.
- [IndexNow](https://www.bing.com/indexnow/getstarted) is optional. Add it only if publication-time
  notification is worth maintaining, and notify only on a genuine publication or substantive
  update—not on every build. Neither IndexNow nor a sitemap guarantees indexing or citation.

### Google Search Console

- The signed-in Google account did not have access to the `suvroghosh.in` domain property. No
  indexing, sitemap, canonical-selection, Core Web Vitals, query, impression, or click baseline
  could therefore be read.
- Proposed owner action at the time, if access is still absent: grant access to the existing property
  or complete ownership verification deliberately. A DNS change must not be made implicitly. Once
  access exists, record the tables below and submit the existing sitemap once if it is absent.

### Vercel and analytics

- The production project was accessible in the authenticated Vercel session, and the active
  production deployment was verified against commit
  `5398bacd272e6a1558ffe78f4b80ab3599ebad5d`.
- The July audit recorded Vercel Analytics and Speed Insights in the site. The then-available 30-day
  Analytics view supplied a site-level baseline and a sparse page table; it did not establish search
  indexing, AI citation, crawler identity, or human intent.
- If longer referrer or request-log retention is unavailable on the current plan, first use periodic
  exports or dated manual snapshots. Do not add a paid analytics service without owner approval.

### Chinese search ecosystems (optional)

Do this only if Chinese-language or mainland-China discovery is an actual audience goal:

1. Verify the site and submit the existing sitemap to
   [Baidu Search Resource Platform](https://ziyuan.baidu.com/college/articleinfo?id=3329).
2. Submit it to [Sogou Webmaster](https://help.sogou.com/sitemap.html). Tencent documents Sogou as
   the index foundation of the web-search service used by Yuanbao.
3. Verify and submit it through [Shenma Webmaster](https://zhanzhang.sm.cn/), the best documented
   Alibaba-family site-owner route. Do not describe this as guaranteed Qwen or Quark inclusion.
4. Test representative pages from a mainland-China network before translating anything at scale.
   If demand exists, add a short, genuinely written Chinese summary to a few relevant technical
   pages rather than machine-translating the entire archive.

### Log / analytics access

- Inspect Vercel access logs or analytics referrer data, where retention permits, so generative-referral
  domains (`chatgpt.com`, `claude.ai`, `perplexity.ai`, `copilot.microsoft.com`, `bing.com`,
  `kimi.com`, and any distinct Chinese-product referrers) can be distinguished from conventional
  search. OpenAI documents `utm_source=chatgpt.com` on its outbound links.
- Record crawler user agent, path, status, timestamp, and verified network identity where the
  provider publishes IP ranges. User-agent text alone is trivially spoofed.

---

## 2. Thirty-, sixty-, and ninety-day schedule

Start this manual review plan only when the current editorial pilot is actually deployed. Record
the production URL, Git SHA, timestamp with timezone, exact changed page(s), and a pre-release
snapshot at `D0`. Take comparable snapshots at **D+30, D+60, and D+90**; do not backdate the plan to
the technical release. This document creates no automation, recurring job or account change.

Choose two to four unchanged pages with similar subject, format, age and baseline demand before
looking at results. Record their canonical URLs and selection rationale. Compare equal 30-day
windows with identical property, page, country/device and search-type filters; flag seasonality,
search updates and any later edits to comparison pages. This is a small observational comparison,
not a controlled experiment proving causation. Report absolute counts and denominators; percentages
from a handful of visits or citations are unstable. If volume remains too low at day 90, record
`insufficient evidence` rather than attributing an improvement or failure to the edits.

| Review | Purpose                                                                                                | Minimum decision                                                    |
| ------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| D0     | Save pre/post-release technical and analytics baselines; confirm all pilot canonicals and redirects.   | Proceed only if the deployed pages match the reviewed local output. |
| D+30   | Check discovery, indexing, first impressions/citations/referrals, engagement, and obvious regressions. | Correct technical defects; do not expand on anecdotal traffic.      |
| D+60   | Compare pilot direction with untouched pages and inspect query/citation accuracy.                      | Draft an expansion recommendation only if evidence is coherent.     |
| D+90   | Evaluate qualified discovery, professional conversions, and editorial cost.                            | Expand, adjust, or stop; a flat result is a valid finding.          |

### Indexing coverage (Search Console → Pages / Coverage)

| Metric                  | D0  | D+30 | D+60 | D+90 |
| ----------------------- | --- | ---- | ---- | ---- |
| Indexed pages           |     |      |      |      |
| Discovered, not indexed |     |      |      |      |
| Crawled, not indexed    |     |      |      |      |
| Excluded (reason)       |     |      |      |      |

### Overall Search Performance (Search Console → Performance)

This includes eligible Google AI-feature activity; it is not a clean conventional-search-only
control. Keep clicks, impressions and CTR separate from the dedicated AI impression report.

| Metric              | D0  | D+30 | D+60 | D+90 |
| ------------------- | --- | ---- | ---- | ---- |
| Total impressions   |     |      |      |      |
| Total clicks        |     |      |      |      |
| Avg. CTR            |     |      |      |      |
| Avg. position       |     |      |      |      |
| Top 5 query groups  |     |      |      |      |
| Top 5 landing pages |     |      |      |      |

### Google AI Visibility (Search Console → Generative AI Performance)

| Metric / context                 | D0  | D+30 | D+60 | D+90 |
| -------------------------------- | --- | ---- | ---- | ---- |
| Report available / reason absent |     |      |      |      |
| Effective inclusion setting      |     |      |      |      |
| Pilot page impressions           |     |      |      |      |
| Comparison page impressions      |     |      |      |      |
| Date window / filters / export   |     |      |      |      |

An impression is visibility of a link, not a click, a verified answer attribution or a reader visit.

### Microsoft AI citations (Bing Webmaster Tools → AI Performance)

| Metric                    | D0  | D+30 | D+60 | D+90 |
| ------------------------- | --- | ---- | ---- | ---- |
| Total citations           |     |      |      |      |
| Distinct cited URLs       |     |      |      |      |
| Top grounding query       |     |      |      |      |
| Top cited article         |     |      |      |      |
| Citation/referral overlap |     |      |      |      |

### Generative referral traffic (analytics referrers / logs)

| Source                             | D0 visits | D+30 visits | D+60 visits | D+90 visits | Landing pages |
| ---------------------------------- | --------- | ----------- | ----------- | ----------- | ------------- |
| chatgpt.com / chat.openai.com      |           |             |             |             |               |
| claude.ai                          |           |             |             |             |               |
| perplexity.ai                      |           |             |             |             |               |
| copilot.microsoft.com              |           |             |             |             |               |
| bing.com (source type unresolved)  |           |             |             |             |               |
| kimi.com                           |           |             |             |             |               |
| Chinese AI products (if separable) |           |             |             |             |               |

A referrer domain alone may not distinguish an AI answer from ordinary search. Preserve unknown
attribution, redirects and missing referrers; do not label every `bing.com` visit as Copilot traffic.

### Reader engagement and professional conversion

The July Vercel view did not expose verified contact, consulting, résumé, or subscription
conversion counts. Record them only after a privacy-conscious event or destination-page method is
approved; do not infer a conversion from an ordinary page view.

| Outcome                                    | D0  | D+30 | D+60 | D+90 | Measurement rule                                                    |
| ------------------------------------------ | --- | ---- | ---- | ---- | ------------------------------------------------------------------- |
| Pilot-page engaged visits                  |     |      |      |      | Use one stable engagement definition across all windows.            |
| Contact enquiries attributable to the site |     |      |      |      | Count completed enquiries, not contact-page views.                  |
| Consulting enquiries                       |     |      |      |      | Count qualified messages with source where voluntarily supplied.    |
| Résumé actions                             |     |      |      |      | Define once: meaningful click/download, not every résumé page view. |
| Subscription completions                   |     |      |      |      | Count confirmed subscriptions, not form impressions.                |

### Verified crawler activity (access logs)

Keep search/retrieval activity separate from possible-training activity.

| Purpose                       | User agents                                                            | Last verified fetch | Pages/status notes |
| ----------------------------- | ---------------------------------------------------------------------- | ------------------- | ------------------ |
| Search index                  | `OAI-SearchBot`, `Claude-SearchBot`, `PerplexityBot`, `Kimi-SearchBot` |                     |                    |
| User retrieval                | `ChatGPT-User`, `Claude-User`, `Perplexity-User`, `Kimi-User`          |                     |                    |
| Possible training/open corpus | `GPTBot`, `ClaudeBot`, `KimiBot`, `CCBot`                              |                     |                    |
| Chinese search indexes        | `Baiduspider`, Sogou spiders, `yisouspider`                            |                     |                    |

### Manual Citation Checks

Use the bounded protocol in [aeo-prompts.md](aeo-prompts.md): at most five questions across two
available engines, once each at D0/30/60/90. Retain exact wording and settings, separate branded
identity tests from unbranded discovery, and verify each cited canonical URL and supporting claim.

| Query | Engine | Cited? (Y/N) | Notes | Date |
| ----- | ------ | ------------ | ----- | ---- |
|       |        |              |       |      |

### Technical Health (Release Evidence)

For ordinary article work, run `npm run build` once. Its prebuild includes content and SEO
validation, and its final step validates rendered discoverability. Do not duplicate those commands
beforehand or run `build:full` for this editorial pilot. Use focused tests for changed validators or
templates, inspect expected generated files, and check `git diff --check`. After deployment, verify
only the pilot URL(s), relevant redirects and sitemap entries; do not crawl the production archive.

| Evidence                                       | Result | Date / SHA |
| ---------------------------------------------- | ------ | ---------- |
| Ordinary build and included validation         |        |            |
| Focused regression checks for changed code     |        |            |
| Expected generated diff and `git diff --check` |        |            |
| Deployed pilot canonicals and visible content  |        |            |

---

## 3. Historical Baseline (July 2026)

### Technical discoverability release

- **Production verification date:** 2026-07-22
- **Verified production Git commit:** `5398bacd272e6a1558ffe78f4b80ab3599ebad5d`
- **Vercel production status:** active production deployment verified in the authenticated project
- **Published Markdown source count recorded by the prior audit:** 530
- **Posts with a substantive `dateModified` in that production release:** 0
- **Then-proposed four-page pilot:** recorded as not yet deployed in July; current release status
  was not rechecked. This is separate from the October one-page pilot.

### Vercel Analytics: 2026-06-22 through 2026-07-22

| Metric      | Baseline |
| ----------- | -------: |
| Visitors    |    1,330 |
| Page views  |    4,490 |
| Bounce rate |      71% |

The canonical `va-healthcare-data-systems-mumps-to-sql` page recorded 5 visitors and 5 views. The
canonical `hie-first-principles-openhie`, `confounding-factors-healthcare-it-analytics`, and
`latent-space-in-healthcare-data` paths had no matching result in the available page table; that is
**missing table evidence**, not a measured zero. Redirected siblings recorded 6 visitors/10 views
(`how-va-healthcare-data-systems-work`), 3/4 (`hie-from-first-principles`), 4/7
(`confounding-factors`), and 0 reported (`latent-space-healthcare-data`). Do not sum canonical and
redirected rows as unique readers.

Roughly 50% of the traffic shown in the available geography view was attributed to Singapore while
referrer detail was unusually sparse. Treat that as an unresolved measurement anomaly—not a target
market or proof of qualified readership—until a longer window or privacy-conscious request logs can
distinguish genuine readers from bots, proxies, privacy effects, and internal traffic.

### Console baseline

| System                 | Status on 2026-07-22                                                                                                        | Next owner action                                                                                                                    |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Vercel                 | Production project and commit verified; 30-day Analytics view inspected.                                                    | Preserve dated snapshots; decide later whether existing retention is sufficient.                                                     |
| Bing Webmaster Tools   | Authenticated verification flow reached; local meta verification change is not yet live; property reports not yet readable. | Deploy the reviewed change, click Verify, submit/check the sitemap, then save indexing and AI Performance baselines.                 |
| Google Search Console  | Signed-in account lacks access to the domain property; no reports inspected.                                                | Grant access or deliberately complete ownership verification; then record sitemap, indexing, CWV, query, and landing-page baselines. |
| Baidu / Sogou / Shenma | Not submitted; optional.                                                                                                    | Act only after deciding mainland-China discovery is a real goal.                                                                     |
| Bing AI Performance    | No baseline yet.                                                                                                            | Inspect after Bing property verification.                                                                                            |
| IndexNow               | Existing configuration not established.                                                                                     | Decide after Bing onboarding; if adopted, notify only genuine publish/update events.                                                 |

---

## 4. What NOT to conclude

- Overall search impressions do not establish AI exposure. Dedicated AI impressions indicate link
  visibility; they still do not count clicks, attributable visits or verified answer accuracy.
- A single manual citation is anecdote, not trend; track queries over time.
- Adding JSON-LD does not entitle the site to rich results or AI citations. It describes content;
  factual markup is not a guarantee of indexing, selection, visits or conversion.
- Allowing a training crawler does not prove that a page entered a dataset or influenced a model.
- A crawler hit does not prove indexing; indexing does not prove retrieval; a generated mention
  without a source link is not a citation.
- `/llms.txt` is an experiment and curated navigation aid. None of the reviewed provider webmaster
  sources documents it as a ranking or ingestion signal.

## 5. Content work to measure, not manufacture

Choose a small cohort of high-value technical pages and improve only what is true and useful:

1. State the page's distinctive claim or contribution near the beginning in plain language.
2. Name important people, systems, standards, places, and dates unambiguously.
3. Link factual claims to strong primary sources and distinguish evidence from the author's
   analysis or experience.
4. Use `dateModified` only after a substantive review; do not freshness-bump unchanged posts.
5. Keep factual author/profile context and related reading accessible. Do not manufacture links,
   testimonials or professional authority.
6. Keep fiction and satire visibly identified, using existing category/context conventions.

Compare that cohort with untouched pages at 30, 60, and 90 days. Do not mass-produce FAQs, summaries,
or keyword variants merely to create machine-facing text; that would make the archive less
distinctive and make causal measurement impossible.
