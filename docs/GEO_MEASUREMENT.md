# GEO Measurement — suvroghosh.in

The technical discoverability release at Git commit
`5398bacd272e6a1558ffe78f4b80ab3599ebad5d` was verified as the active Vercel production deployment
on 2026-07-22. This document records that baseline and the **manual** work that remains. The separate
editorial pilot in [GEO_CONTENT_QUEUE.md](GEO_CONTENT_QUEUE.md) is not yet deployed; its actual
production release will be measurement day zero (`D0`) for the 30/60/90 comparison.

Code changes alone do not produce citations. They only make the site technically eligible for
crawling, indexing, retrieval, and possible training consideration. The events below are distinct
and must not be reported as one number:

1. **Technical eligibility** — pages are crawlable, canonical, and carry valid structured data.
2. **Indexing** — a search engine has fetched and stored the page.
3. **Search visibility** — the page receives impressions/clicks in results.
4. **Generative citation** — an AI answer names or links the site as a source.
5. **Referral visits** — a user clicks through from a generative or conventional result.
6. **Reader engagement** — the visitor actually reads, returns, or subscribes.

Schema markup and crawler access do **not** guarantee any of stages 2–6.

---

## 1. Console and measurement status on 2026-07-22

### Bing Webmaster Tools

- The correct site-add/verification flow was reached in an authenticated session.
- An HTML verification meta element is present in the local working changes. It is not evidence of
  ownership until that exact change is deployed and Bing successfully verifies the live page.
- Sitemap processing, URL indexing, crawl/canonical errors, the
  [AI Performance report](https://blogs.bing.com/webmaster/February-2026/Introducing-AI-Performance-in-Bing-Webmaster-Tools-Public-Preview),
  and existing IndexNow status remain **unverified** until property verification completes.
- Owner action after the approved deployment: click **Verify**, submit
  `https://www.suvroghosh.in/sitemap.xml` once if it is not already present, wait for processing, and
  save the first AI Performance baseline. These are external account actions, not local code work.
- [IndexNow](https://www.bing.com/indexnow/getstarted) is optional. Add it only if publication-time
  notification is worth maintaining, and notify only on a genuine publication or substantive
  update—not on every build. Neither IndexNow nor a sitemap guarantees indexing or citation.

### Google Search Console

- The signed-in Google account did not have access to the `suvroghosh.in` domain property. No
  indexing, sitemap, canonical-selection, Core Web Vitals, query, impression, or click baseline
  could therefore be read.
- Owner action: grant this account access to the existing property or complete ownership
  verification deliberately. A DNS change must not be made implicitly. Once access exists, record
  the tables below and submit the existing sitemap once if it is absent.

### Vercel and analytics

- The production project was accessible in the authenticated Vercel session, and the active
  production deployment was verified against commit
  `5398bacd272e6a1558ffe78f4b80ab3599ebad5d`.
- Vercel Analytics and Speed Insights are installed in the site. The available 30-day Analytics
  view supplied a site-level baseline and a sparse page table; it did not establish search indexing,
  AI citation, crawler identity, or human intent.
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

Start this schedule only when the editorial pilot is actually deployed. Record the production URL,
Git SHA, timestamp, and the four released pilot pages at `D0`. Take comparable snapshots at **D+30,
D+60, and D+90**; do not backdate the schedule to the technical release.

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

### Conventional search performance (Search Console → Performance)

| Metric              | D0  | D+30 | D+60 | D+90 |
| ------------------- | --- | ---- | ---- | ---- |
| Total impressions   |     |      |      |      |
| Total clicks        |     |      |      |      |
| Avg. CTR            |     |      |      |      |
| Avg. position       |     |      |      |      |
| Top 5 query groups  |     |      |      |      |
| Top 5 landing pages |     |      |      |      |

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
| bing.com (Copilot answers)         |           |             |             |             |               |
| kimi.com                           |           |             |             |             |               |
| Chinese AI products (if separable) |           |             |             |             |               |

### Reader engagement and professional conversion

The inspected Vercel view did not expose verified contact, consulting, résumé, or subscription
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

### Manual citation checks (do periodically, record verbatim)

Pick 5–10 representative questions that a specific page answers unusually well (for example,
"How would you explain an HIE from first principles?" or "How did VA healthcare systems move from
MUMPS to SQL?"). Run the same wording in ChatGPT Search, Claude, Perplexity, and Kimi; optionally
test DeepSeek, Qwen, and Yuanbao when available in the target market. Record whether the site is
named/linked, the exact query, the cited URL, and whether the answer accurately represented it.

| Query | Engine | Cited? (Y/N) | Notes | Date |
| ----- | ------ | ------------ | ----- | ---- |
|       |        |              |       |      |

### Technical health (rerun after each deploy)

| Check                      | Command                            | Result | Date |
| -------------------------- | ---------------------------------- | ------ | ---- |
| Content validation         | `npm run validate:content`         |        |      |
| SEO validation             | `npm run validate:seo`             |        |      |
| Discoverability validation | `npm run validate:discoverability` |        |      |
| Build                      | `npm run build`                    |        |      |

---

## 3. Recorded baseline

### Technical discoverability release

- **Production verification date:** 2026-07-22
- **Verified production Git commit:** `5398bacd272e6a1558ffe78f4b80ab3599ebad5d`
- **Vercel production status:** active production deployment verified in the authenticated project
- **Published Markdown source count recorded by the prior audit:** 530
- **Posts with a substantive `dateModified` in that production release:** 0
- **Editorial pilot deployment date / SHA:** not yet deployed; record at `D0`

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

- A rise in impressions is **not** proof of generative citation; separate the referrer.
- A single manual citation is anecdote, not trend; track queries over time.
- Adding JSON-LD does not entitle the site to rich results or AI citations; it only removes a
  technical barrier. Content quality and genuine authority drive stages 3–6.
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
5. Seek independent links and profile corroboration for professional work, projects, and the 2006
   journal publication.
6. Keep fiction and satire visibly identified. Add a future `contentMode` only to ambiguous hybrids
   such as reported explanation, opinion, memoir, or personal-cultural essays.

Compare that cohort with untouched pages at 30, 60, and 90 days. Do not mass-produce FAQs, summaries,
or keyword variants merely to create machine-facing text; that would make the archive less
distinctive and make causal measurement impossible.
