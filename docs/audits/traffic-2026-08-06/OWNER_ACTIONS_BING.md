# Owner actions: Bing Webmaster Tools

## Minimum path

1. Sign in to the Bing Webmaster Tools account that owns the existing site, if one exists.
2. Grant the auditing account temporary **Read only** access through User Management; this role can view reports without changing settings. Revoke it after export.
3. If no Bing property exists, explicitly choose either Google Search Console import or manual ownership verification. Both are external account changes and are outside this audit until approved.
4. Export Search Performance for the maximum available period and comparable 90-, 28-, and 7-day windows, split by Web/Chat where available, page, and keyword.
5. Record Indexed Pages, crawl requests/errors, sitemap status, URL Inspection for the sample, Site Scan issues, backlinks, and security/malware verdict.
6. Save raw exports/screenshots only under `.audit-private/2026-08-06/`; publish sanitized aggregates.

Completion condition: a dated authenticated verdict exists for indexing, search performance, sitemaps, crawl health, security, backlinks, and representative URLs.
