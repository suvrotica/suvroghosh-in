# Deployment identity

## Repository side

- Audited repository commit: `1952c2d523bf4b6bbd352d8e8c041b912ae9ae89`
- Original branch: `main`
- Audit branch: `audit/traffic-indexing-2026-08-06`
- Canonical production host configured in source: `www.suvroghosh.in`
- Apex host policy in `vercel.json`: permanent redirect to `https://www.suvroghosh.in/$1`
- Deployment adapter: `@sveltejs/adapter-vercel`

## Production side

Current production deployment SHA: **VERIFIED MATCH** — `1952c2d523bf4b6bbd352d8e8c041b912ae9ae89`.

Authenticated, read-only Vercel inspection showed the current deployment as `Ready`, `Latest`, `Production`, and `Current`, serving `www.suvroghosh.in`. Its source commit exactly matches the audited repository commit. Vercel recorded the deployment creation time as 2026-08-06 04:40:31 UTC (10:10:31 Asia/Calcutta).

The account, team, and deployment identifiers are intentionally omitted from this public report. The historical 2026-07-22 production identity in `docs/GEO_AUDIT.md` is superseded for this audit.

Verdict: repository-to-production mismatch is ruled out for the audited baseline. Later audit commits are not represented by this verification until deployed by the owner.

No Vercel setting, domain, environment variable, or deployment will be changed by this audit without explicit owner authorization.
