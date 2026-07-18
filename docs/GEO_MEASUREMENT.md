# GEO Measurement — suvroghosh.in

This document describes the **manual** steps required after deploying the
`feat/geo-discoverability` branch, and how to record progress. Code changes alone do not produce
traffic; they only make the site technically eligible for indexing and citation. The events below
are distinct and must not be reported as one number:

1. **Technical eligibility** — pages are crawlable, canonical, and carry valid structured data.
2. **Indexing** — a search engine has fetched and stored the page.
3. **Search visibility** — the page receives impressions/clicks in results.
4. **Generative citation** — an AI answer names or links the site as a source.
5. **Referral visits** — a user clicks through from a generative or conventional result.
6. **Reader engagement** — the visitor actually reads, returns, or subscribes.

Schema markup and crawler access do **not** guarantee any of stages 2–6.

---

## 1. One-time setup

### Google Search Console

1. Verify ownership of `https://www.suvroghosh.in` (DNS TXT record is cleanest for a Vercel site).
2. Submit the sitemap: `https://www.suvroghosh.in/sitemap.xml`.
3. Note: generative / AI-overview citation data is **not** yet exposed as a distinct Search Console
   report. Monitor the standard Performance report and treat any future "AI features" surface as
   additive, not guaranteed.

### Bing Webmaster Tools

1. Verify the same property (import from Search Console is fastest).
2. Submit `https://www.suvroghosh.in/sitemap.xml`.
3. (Optional) Configure **IndexNow** for faster re-crawl of updated posts. This site does not ship
   an IndexNow key by default; add one only if you want near-instant Bing re-indexing.

### Log / analytics access

- Ensure you can inspect Vercel access logs or analytics referrer data so generative-referral
  domains (`chat.openai.com`, `chatgpt.com`, `perplexity.ai`, `copilot.microsoft.com`, `bing.com`)
  can be distinguished from conventional search.

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

### Generative referral traffic (analytics referrers / logs)

| Source                             | Day 7 visits | Day 30 visits | Day 90 visits | Landing pages |
| ---------------------------------- | ------------ | ------------- | ------------- | ------------- |
| chatgpt.com / chat.openai.com      |              |               |               |               |
| perplexity.ai                      |              |               |               |               |
| copilot.microsoft.com              |              |               |               |               |
| bing.com (Copilot answers)         |              |               |               |               |
| Google AI Overviews (if separable) |              |               |               |               |

### Manual citation checks (do periodically, record verbatim)

Pick 5–10 representative queries the site should plausibly answer (e.g. "HIE first principles",
"HL7 vs FHIR difference", "OpenHIE architecture"). Run them in ChatGPT Search, Perplexity, and
Google. Record whether the site is named/linked, and the exact query.

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
- **Published post count at deploy:** **\_\_**
- **Posts using `dateModified` at deploy:** **\_\_**
- **Search Console verified:** ☐ **Bing Webmaster verified:** ☐ **Sitemap submitted:** ☐

---

## 4. What NOT to conclude

- A rise in impressions is **not** proof of generative citation; separate the referrer.
- A single manual citation is anecdote, not trend; track queries over time.
- Adding JSON-LD does not entitle the site to rich results or AI citations; it only removes a
  technical barrier. Content quality and genuine authority drive stages 3–6.
