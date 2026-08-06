# Owner actions: Google Search Console

## Minimum path

1. Open the existing `suvroghosh.in` domain property as a verified owner.
2. Prefer least-disruptive delegated access: **Settings → Users and permissions → Add user**, grant the auditing Google Account temporary **Full user** access, and revoke it after the evidence export. Do not publish the account address in this repository.
3. If delegation is not desired, the owner can instead export the reports listed in `GOOGLE_SEARCH_CONSOLE.md` and place them in the ignored `.audit-private/2026-08-06/` folder.
4. Open Manual Actions and Security Issues and record the exact UI verdict and date. Do not infer “clean” from an empty email inbox.
5. Run URL Inspection for each row in `URL_INSPECTION_SAMPLE.csv`, recording user-declared canonical, Google-selected canonical, crawl allowed, indexing allowed, last crawl, page fetch, referring sitemap, and rich-result observations. After exporting Page Indexing, extend the sample with representative URLs from every available outcome stratum: indexed, crawled but not indexed, discovered but not indexed, and Google-selected canonical different from the declared canonical. If the export genuinely contains no URL in a stratum, record `NOT PRESENT IN EXPORT`; do not infer absence from the current static sample.
6. Export Page Indexing, Sitemaps, Links, Core Web Vitals, and Performance data without changing settings or requesting mass reindexing.

If no property exists, pause and explicitly authorize a verification method. Do not add DNS, upload a token, or import another property as part of this audit without that authorization.

Completion condition: sanitized exports support a dated verdict for manual actions, security issues, coverage, sitemaps, representative URL inspection, demand, and query/page performance.
