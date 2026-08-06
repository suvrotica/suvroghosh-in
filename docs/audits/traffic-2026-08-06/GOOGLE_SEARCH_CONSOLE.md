# Google Search Console

## Access verdict

**UNVERIFIED — REQUIRES OWNER ACTION.**

On 2026-08-06, the signed-in browser was sent directly to the domain-property URL for `suvroghosh.in`. Search Console returned its no-access/not-verified state and said the current account did not have access. The audit did not start ownership verification, add a DNS record, request access, or alter the property.

Consequently, none of the following can be reported as clean, failing, zero, or absent:

- Performance clicks, impressions, CTR, average position, pages, queries, countries, devices, dates, search appearance, or Discover;
- Page Indexing and excluded-reason trends;
- submitted/discovered sitemap state;
- URL Inspection live/index verdicts;
- Core Web Vitals field groups;
- Links report;
- removals;
- Manual Actions;
- Security Issues.

The Manual Actions and Security Issues verdict is specifically **UNVERIFIED**, not “none”. Google exposes those conclusions inside their respective property reports. Google distinguishes manual actions (index-policy/spam enforcement) from security issues (hacking or harmful behaviour); a public site query cannot substitute for either report.

## What public evidence does establish

Time-stamped Google queries returned the homepage, resume, consulting, writing, notes, contact, images, and individual articles for both `site:suvroghosh.in` and `site:www.suvroghosh.in`. An exact-title query returned the intended “Hello, Fragment” canonical URL. This rules out a complete public disappearance at the time of observation.

It does **not** establish that all 549 canonical articles are indexed, that sitemap URLs were accepted, that rankings are healthy, or that no manual/security issue exists. Site-operator result counts are intentionally not used.

## Required evidence after access

Use consistent Asia/Calcutta-labelled windows and export:

1. Performance totals and daily rows for 16 months, 90 days, 28 days, and 7 days.
2. Query, page, country, device, and search-appearance tables for the same comparable windows.
3. Page Indexing totals and every exclusion reason, including example URLs and trend dates.
4. Sitemap status for `/sitemap.xml` and `/notes/sitemap.xml`.
5. Manual Actions and Security Issues verdicts with observation date.
6. Links report (top linked pages, linking sites, and anchor text).
7. Core Web Vitals mobile and desktop groups.
8. URL Inspection for the representative URLs in `URL_INSPECTION_SAMPLE.csv`.

Keep screenshots and raw account exports in `.audit-private/2026-08-06/`; only sanitized aggregates and URL-level technical statuses belong in public reports.

Official references: [Search Console permissions](https://support.google.com/webmasters/answer/7687615?hl=en), [Manual Actions report](https://support.google.com/webmasters/answer/9044175?hl=en), and [Security Issues report](https://support.google.com/webmasters/answer/9044101?hl=en).
