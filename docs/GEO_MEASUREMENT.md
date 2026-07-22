# GEO Measurement — suvroghosh.in

This document describes the **manual** work required after deploying the discoverability changes and
how to record progress. Code changes alone do not produce citations; they only make the site
technically eligible for crawling, indexing, retrieval, and possible training consideration. The
events below are distinct and must not be reported as one number:

1. **Technical eligibility** — pages are crawlable, canonical, and carry valid structured data.
2. **Indexing** — a search engine has fetched and stored the page.
3. **Search visibility** — the page receives impressions/clicks in results.
4. **Generative citation** — an AI answer names or links the site as a source.
5. **Referral visits** — a user clicks through from a generative or conventional result.
6. **Reader engagement** — the visitor actually reads, returns, or subscribes.

Schema markup and crawler access do **not** guarantee any of stages 2–6.

---

## 1. One-time setup

### Bing Webmaster Tools

1. Verify the same property (import from Search Console is fastest).
2. Submit `https://www.suvroghosh.in/sitemap.xml`.
3. Inspect the [AI Performance report](https://blogs.bing.com/webmaster/February-2026/Introducing-AI-Performance-in-Bing-Webmaster-Tools-Public-Preview) for citation count, cited URLs,
   and sampled grounding queries. OpenAI currently names Bing as one of ChatGPT Search's providers,
   making this the highest-value provider console for the current objective.
4. Configure [IndexNow](https://www.bing.com/indexnow/getstarted) if prompt notification of new or
   substantively updated posts is worth maintaining. Submit only real publication/update events;
   neither IndexNow nor a sitemap guarantees indexing or citation.

### Google Search Console

1. Verify ownership of `https://www.suvroghosh.in` (DNS TXT record is cleanest for a Vercel site).
2. Submit `https://www.suvroghosh.in/sitemap.xml` and continue using the conventional Performance
   and indexing reports as a broad web-discovery baseline.

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

- Ensure you can inspect Vercel access logs or analytics referrer data so generative-referral
  domains (`chatgpt.com`, `claude.ai`, `perplexity.ai`, `copilot.microsoft.com`, `bing.com`,
  `kimi.com`, and any distinct Chinese-product referrers) can be distinguished from conventional
  search. OpenAI documents `utm_source=chatgpt.com` on its outbound links.
- Record crawler user agent, path, status, timestamp, and verified network identity where the
  provider publishes IP ranges. User-agent text alone is trivially spoofed.

---

## 2. Recurring measurements

Record the following at **7, 30, and 90 days** after deployment.

### Indexing coverage (Search Console → Pages / Coverage)

| Metric                  | Day 7 | Day 30 | Day 90 |
| ----------------------- | ----- | ------ | ------ |
| Indexed pages           |       |        |        |
| Discovered, not indexed |       |        |        |
| Crawled, not indexed    |       |        |        |
| Excluded (reason)       |       |        |        |

### Conventional search performance (Search Console → Performance)

| Metric              | Day 7 | Day 30 | Day 90 |
| ------------------- | ----- | ------ | ------ |
| Total impressions   |       |        |        |
| Total clicks        |       |        |        |
| Avg. CTR            |       |        |        |
| Avg. position       |       |        |        |
| Top 5 query groups  |       |        |        |
| Top 5 landing pages |       |        |        |

### Microsoft AI citations (Bing Webmaster Tools → AI Performance)

| Metric                    | Day 7 | Day 30 | Day 90 |
| ------------------------- | ----- | ------ | ------ |
| Total citations           |       |        |        |
| Distinct cited URLs       |       |        |        |
| Top grounding query       |       |        |        |
| Top cited article         |       |        |        |
| Citation/referral overlap |       |        |        |

### Generative referral traffic (analytics referrers / logs)

| Source                             | Day 7 visits | Day 30 visits | Day 90 visits | Landing pages |
| ---------------------------------- | ------------ | ------------- | ------------- | ------------- |
| chatgpt.com / chat.openai.com      |              |               |               |               |
| claude.ai                          |              |               |               |               |
| perplexity.ai                      |              |               |               |               |
| copilot.microsoft.com              |              |               |               |               |
| bing.com (Copilot answers)         |              |               |               |               |
| kimi.com                           |              |               |               |               |
| Chinese AI products (if separable) |              |               |               |               |

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

## 3. Baseline record (fill in at deployment)

- **Deployment date of this branch:** `____-__-__`
- **Published post count before this deployment:** **530**
- **Posts using `dateModified` before this deployment:** **0**
- **Search Console verified:** ☐ **Bing Webmaster verified:** ☐ **Sitemap submitted:** ☐
- **Bing AI Performance baseline saved:** ☐ **IndexNow configured (optional):** ☐
- **Baidu / Sogou / Shenma submitted (optional):** ☐ / ☐ / ☐

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

Compare that cohort with untouched pages at 30 and 90 days. Do not mass-produce FAQs, summaries,
or keyword variants merely to create machine-facing text; that would make the archive less
distinctive and make causal measurement impossible.
