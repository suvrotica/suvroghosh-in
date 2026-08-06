# Traffic and indexing audit baseline

## Immutable starting point

- Observation time: `2026-08-06T12:25:06.1483637+05:30`
- Time zone: India Standard Time (`UTC+05:30`, Asia/Calcutta)
- Original branch: `main`
- Original commit: `1952c2d523bf4b6bbd352d8e8c041b912ae9ae89`
- Upstream state: `origin/main`, ahead 0, behind 0
- Working tree: clean; no staged, modified, deleted, or untracked files were reported
- Audit branch created after recording the baseline: `audit/traffic-indexing-2026-08-06`
- Repository: `https://github.com/suvrotica/suvroghosh-in`
- Deployment hostname under audit: `www.suvroghosh.in`
- Canonical production origin: `https://www.suvroghosh.in`

## Local environment

- Operating system: Microsoft Windows 11 Home Single Language, version `10.0.26200`, build `26200`, 64-bit
- PowerShell: `7.6.3`
- Node.js: `v24.11.1`
- npm: `11.12.1`
- Package manager and lockfile: npm with `package-lock.json` lockfile version 3
- Framework: SvelteKit 2 / Svelte 5 / Vite 7, deployed through `@sveltejs/adapter-vercel`
- Test systems: Node test runner, Vitest, and route-specific Playwright suites

No `AGENTS.md`, `CONTRIBUTING*`, `.openai/hosting.json`, or Sites hosting configuration was present. The repository's own instructions are primarily in `README.md`, `package.json`, configuration files, validation scripts, and topic-specific documentation.

## Existing measurement and search architecture read before changes

The following existing material was inspected before audit implementation:

- `docs/GEO_AUDIT.md`
- `docs/GEO_MEASUREMENT.md`
- `docs/seo-aeo-checklist.md`
- `README.md`
- `package.json` and `package-lock.json`
- `vercel.json`
- `svelte.config.js` and `vite.config.ts`
- `static/robots.txt` and `static/llms.txt`
- the main and notes sitemap endpoints
- the RSS endpoint
- central SEO metadata and schema utilities
- published-post loaders, canonical path helpers, and redirect aliases
- Vercel Analytics and Speed Insights integration
- IndexNow implementation, tests, and GitHub workflow
- existing content, SEO, link, discoverability, media, contrast, and resource validators

The prior GEO audit verified production commit `5398bacd272e6a1558ffe78f4b80ab3599ebad5d` on 2026-07-22. The current audit commit is 101 commits later, so that deployment identity and its conclusions are historical evidence only until independently reverified.

## Initial invariants

- Evidence must distinguish crawl eligibility, indexing, impressions, clicks, human engagement, conversion, security reputation, and email reputation.
- Lack of traffic is not evidence of a blacklist, manual action, malware, indexing defect, or backlink shortage.
- Account-derived data and screenshots stay under `.audit-private/2026-08-06/`, which is ignored by Git.
- Public audit files contain only sanitized, aggregate, reproducible evidence.
- Crawling is limited to at most four concurrent requests and approximately one or two requests per second.
- Automated tests must not submit the contact form, send outreach, mutate DNS/webmaster/Vercel settings, upload private material, or trigger IndexNow submissions.
- Literary, personal, satirical, fictional, professional, and search-oriented pages are classified by intended job before recommendations are made.
- Large editorial changes remain proposals requiring owner review.

## Untouched baseline summary

- Dependency installation from the lockfile succeeded.
- Content, SEO, internal-link, discoverability, Svelte diagnostics, and production build checks passed.
- `npm test` failed on one stale implementation assertion in `scripts/living-pigment.test.mjs`; all test groups reached before it passed, and the four groups that npm did not reach were run separately and passed.
- `npm run lint` failed at the Prettier stage on 55 pre-existing files; ESLint was therefore not run by the aggregate command.
- npm reported three dependency advisories: one moderate and two high. No automatic dependency update was performed.
- The build completed successfully but reported large chunks, 20 images above the repository review budget, and optional/native dependency-resolution warnings.

See `COMMAND_RESULTS.md` for exact commands, exit codes, durations, and diagnostic summaries.
