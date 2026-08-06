# Owner actions

Audit date: **2026-08-06 (Asia/Calcutta)**

Scope: owner-controlled accounts, production settings, DNS/mail, editorial decisions, provider evidence, and manual distribution

## Control rule

These are instructions for the site owner; the audit did not perform any of them. Nothing in this document authorizes an agent to change DNS, ownership, production settings, mail policy, analytics, content, external profiles, or third-party accounts. Keep raw exports, screenshots, account names, message headers, keys, and provider identifiers in the ignored `.audit-private/2026-08-06/` folder. Commit only sanitized aggregates.

Priority below means operational sequencing, not proof of an incident. The security audit found no P0 or P1 security defect; do not treat an evidence-access task as evidence that a penalty or compromise exists.

## Ordered owner queue

| ID    | Operational priority | Owner                                        | Action                                                                                     | Dependency                                                                       | Evidence to retain privately                                                                        | Close condition                                                                                                                        |
| ----- | -------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| OA-01 | P1                   | Search property owner                        | Establish read-only evidence from Google Search Console                                    | Existing verified domain property or an explicitly approved verification route   | Dated account exports and status captures, with account identity and verification material redacted | Manual Actions, Security Issues, performance, indexing, sitemaps, links, CWV, and the inspection sample have dated, sanitized verdicts |
| OA-02 | P1                   | Bing property owner                          | Establish read-only evidence from Bing Webmaster Tools and inspect live IndexNow operation | Existing property, or explicit owner choice of import/manual verification        | Dated exports, workflow summary, and redacted IndexNow evidence                                     | Bing performance, crawl/indexing, sitemaps, security, backlinks, URL inspection, and IndexNow Insights have dated verdicts             |
| OA-03 | P1                   | Site owner and analytics/privacy owner       | Create a clean human-traffic and outcome-measurement boundary                              | Agreed outcome definitions, privacy review, and owner/test identification method | Instrumentation specification, test log, exclusion/annotation rules, and change date                | Thirty consecutive days can be interpreted without silently mixing owner, audit, preview, monitoring, or known synthetic activity      |
| OA-04 | P1                   | Site owner and web-performance owner         | Approve and verify route-specific loading remediation                                      | Final performance report and stable before/after test protocol                   | Sanitized before/after lab reports and same-window field observations                               | No route is called improved until comparable lab checks pass and a stable field window shows no regression                             |
| OA-05 | P2                   | Domain/site owner and security owner         | Close the unverified browser, abuse-service, provider, and subdomain checks                | Legitimate owner sessions; no upload of private or unpublished material          | Dated, sanitized service verdicts and provider inventory                                            | Each named service is either verified, explicitly remains unverified, or has a service-specific remediation case                       |
| OA-06 | P2                   | Email/domain owner and mail administrator    | Inventory senders, prove alignment, then roll out DMARC in stages                          | Sanitized headers from every legitimate sender and provider status evidence      | Sender inventory, alignment matrix, aggregate summaries, change/rollback record                     | Enforcement advances only after every legitimate source is aligned and a monitoring interval shows no legitimate loss                  |
| OA-07 | P2                   | Editorial owner with subject-matter reviewer | Review the provisional flagship cohort and clear evidence holds page by page               | Search/index evidence where available and `FLAGSHIP_PAGES.csv`                   | Page-level editorial decision, source-to-claim map, contribution statement, and review date         | A page is ready only when its audience, unique contribution, evidence, limitations, next action, and distribution fit are approved     |
| OA-08 | P2                   | Site owner                                   | Confirm professional identities and public-record linkage                                  | Owner knowledge and exact stable identifiers                                     | Private confirmation note and public source URL; no personal account data                           | Only confirmed identities and accurately scoped contributions are linked or described                                                  |
| OA-09 | P2                   | Site owner/editor                            | Run a small manual distribution cycle for pages that passed OA-07                          | Clean measurement, page readiness, channel-rule check                            | Channel, date, placement type, canonical URL, aggregate results, and private correspondence log     | Six-week review separates attributable value from owner/test traffic; no automated outreach occurs                                     |
| OA-10 | P2                   | Application/security owner                   | Review dependency, notebook, contact, and optional TTS findings in isolated changes        | Compatibility review and a rollback/test plan                                    | Patch diff, advisory paths, tests, headers, rate-limit evidence, and production verification        | Each accepted fix passes its specified tests without weakening content, forms, embeds, or security controls                            |
| OA-11 | P3                   | DNS/platform/security owner                  | Evaluate DNSSEC, CAA, subdomain inventory, and optional browser-policy hardening           | Complete DNS/provider/subdomain inventory and compatibility testing              | Current/desired record inventory, recovery plan, and test matrix                                    | Change is made only when every host/provider is accounted for and rollback is documented; otherwise the item remains deferred          |
| OA-12 | P2                   | Site owner and audit owner                   | Reconcile results after a clean 30-day window and authorize only evidenced next work       | OA-01 through OA-04 outputs and finalized crawl/performance reports              | Sanitized scorecard and decision log                                                                | Findings are re-prioritized from observed indexing, demand, performance, authority, and outcomes—not raw page views alone              |

## OA-01 — Google Search Console

Current status: **UNVERIFIED — REQUIRES OWNER ACTION**. Public Google results show that the site has not completely disappeared, but they cannot verify Manual Actions, Security Issues, coverage, ranking, or the number of indexed URLs.

1. Open the existing `suvroghosh.in` domain property as a verified owner.
2. Prefer least-disruptive access: either grant the auditing account temporary **Full user** access under **Settings → Users and permissions**, or export the evidence directly. Revoke delegated access after the evidence is captured.
3. If no property exists, stop and explicitly choose a verification method. A DNS record, verification file, or imported property is an owner change and must not be made implicitly.
4. Capture dated Manual Actions and Security Issues verdicts. Do not infer either verdict from email, public search, or Safe Browsing.
5. Export Performance for the maximum available period and comparable 90-, 28-, and 7-day windows: totals, daily rows, query, page, country, device, search appearance, image, video, Discover, and News where available.
6. Export Page Indexing reasons and examples, Crawl Stats, Core Web Vitals, HTTPS, Removals, and Links.
7. Verify existing processing for both canonical sitemap URLs. Do not repeatedly resubmit a sitemap without a demonstrated status defect.
8. Complete every row in `URL_INSPECTION_SAMPLE.csv`, including index status, crawl/fetch/index permission, last crawl, crawler, declared/selected canonical, referring sitemap/pages, enhancements, and mobile status.

Verification and sanitization details are in [GOOGLE_SEARCH_CONSOLE.md](./GOOGLE_SEARCH_CONSOLE.md) and [OWNER_ACTIONS_GSC.md](./OWNER_ACTIONS_GSC.md).

## OA-02 — Bing Webmaster Tools and IndexNow

Current status: **UNVERIFIED — REQUIRES OWNER ACTION**. The public Bing search surface was challenged and no authenticated property was available.

1. Open the existing property and grant temporary **Read only** access, or export the required evidence directly.
2. If no property exists, explicitly choose Google Search Console import or manual ownership verification before changing external state.
3. Export Search Performance for the maximum available period and comparable 90-, 28-, and 7-day windows, including Web/Chat splits where available, page, and keyword.
4. Export indexed pages, crawl requests/errors, Site Explorer, both sitemap statuses, Site Scan, Recommendations, Backlinks, Keyword Research, security/malware state, AI Performance where available, and URL Inspection for the audit sample.
5. In private, confirm that the Vercel and GitHub Actions `INDEXNOW_KEY` values match. Do not copy the key into a report, issue, screenshot, or log.
6. Using the known value privately, verify that the canonical key URL returns HTTP 200 with an exact plain-text body match.
7. Inspect the latest successful production IndexNow workflow. Record deployment SHA, time, skip/submit state, URL count, and accepted status, with secrets and account data redacted.
8. Inspect IndexNow Insights and reconcile a small URL sample. Receipt is not proof of crawl, index, rank, click, or citation.
9. Review the audit-branch change that gives the main and Notes sitemaps distinct cached snapshots and production-only notification passes. If it is merged, verify both paths in the first successful production workflow and confirm that unchanged sitemaps skip submission. The local **11-test** result also covers fail-closed rejection of malformed sitemap responses, but it does not establish live receipt.

See [SEARCH_CONSOLE_AND_BING.md](./SEARCH_CONSOLE_AND_BING.md) and [OWNER_ACTIONS_BING.md](./OWNER_ACTIONS_BING.md).

## OA-03 — Clean analytics and conversion measurement

The observed 28-day Vercel counter was 913 visitors and 3,394 page views, while the retained seven-day view was 164 visitors and 302 views. These are operational counts, not verified humans or organic visits. The period contains a severe page-view burst, unusual geography/device concentrations, extensive development activity, private/auth-lifecycle route activity, and a known audit-induced navigation interval. Missing referrer data is not direct traffic.

1. Choose the one or two legitimate outcomes that matter: for example a privacy-safe résumé action and a confirmed contact/consulting outcome. Do not instrument every gesture.
2. Decide whether the current analytics tier can support the required retention and events or whether a different privacy-reviewed tool/tier is necessary. Upgrading, adding a data drain, or adding another provider is an explicit owner decision.
3. Define owner, developer, preview, monitoring, and synthetic-test handling before collecting the baseline. Where exclusion cannot be technically reliable, maintain a dated annotation log and reject affected intervals.
4. Implement only aggregate, non-identifying properties. Never send contact fields, names, addresses, message text, typed values, raw network identifiers, private routes, or unique payloads to analytics.
5. Validate in preview with synthetic values and confirm that no real form submission occurs. Publish an appropriate privacy disclosure before production collection.
6. Freeze the event definitions, canonical route mapping, environment filter, timezone, and counting units for 30 days. Record any instrumentation or deployment change.

Close condition: the owner can state what a visitor, click, action, and enquiry mean; the clean window can be reproduced; and the funnel can be measured without treating a page view as a person or outcome. See [ANALYTICS_TRUTH.md](./ANALYTICS_TRUTH.md) and [CONVERSION_MEASUREMENT.md](./CONVERSION_MEASUREMENT.md).

## OA-04 — Performance decision and verification

The available field baseline is desktop RES 56, p75 FCP 5.68 s, LCP 6.96 s, INP 104 ms, CLS 0.01, and TTFB 0.94 s over 250 points. Overall mobile field data is insufficient. Loading, not interaction or layout stability, is the established defect.

1. Review the finalized [PERFORMANCE_AND_ACCESSIBILITY.md](./PERFORMANCE_AND_ACCESSIBILITY.md), [CORE_WEB_VITALS.csv](./CORE_WEB_VITALS.csv), and lab matrix before authorizing code work.
2. Start with a measured route-specific cause, not a site-wide rewrite. The current evidence specifically calls for reviewing the résumé's eager third-party video embeds and the heaviest article/visualization bundles.
3. Preserve a pre-change production SHA and comparable device/route protocol. Block analytics telemetry in synthetic tests and annotate all audit traffic.
4. Require widening validation: narrow component tests, affected routes, accessibility/semantics, full repository checks, production build, and production runtime inspection.
5. Compare a stable post-deploy field window to the same route template/device. Do not declare a win from one Lighthouse run or mix contaminated dates with clean dates.

## OA-05 — Reputation, provider, and subdomain evidence

Google Safe Browsing, Spamhaus DBL, and SURBL were **CLEAN — VERIFIED** at the audit time. No action or delisting request is warranted for those services unless a later explicit positive result appears. Other systems remain unverified.

1. Open Search Console Manual Actions/Security Issues and Bing security reports through OA-01/OA-02.
2. In an authorized VirusTotal session, retrieve the public domain analysis without uploading files, private exports, or unpublished URLs and without requesting repeated rescans.
3. Retrieve the URLhaus host result through an authorized session/API route; do not bypass a challenge.
4. Test the homepage and one representative article in a current Edge profile with SmartScreen enabled. Record the exact URL, browser version, time, and warning state.
5. Use owner-facing Meta, LinkedIn, and X inspectors for exact public URLs. Do not test by publishing posts. Preserve platform results privately.
6. Compare the Vercel domain/project inventory, DNS records, certificate-transparency alerts, and provider mappings. Investigate an unknown mapping before removal; deletion can be destructive.
7. Review production/provider logs for unexpected redirects, abuse, authentication anomalies, TTS workload, contact abuse, and suspicious deployment history. Publish only sanitized counts and verdicts—never raw network addresses or identities.
8. If any service returns an explicit positive, preserve its exact evidence first, then use that service's remediation/delisting playbook in [BLACKLIST_AND_REPUTATION.md](./BLACKLIST_AND_REPUTATION.md). Do not translate one service's result into a claim about every reputation category.

## OA-06 — Staged DMARC rollout

Missing DMARC is an email anti-spoofing gap, not a demonstrated cause of low web traffic. SPF, DKIM, and mail routing being present does not prove message alignment or inbox placement.

1. **Inventory:** enumerate every legitimate sender and visible From domain, including hosted mail, website contact/recovery flows, transactional streams, newsletters, monitoring, forwarding, and dormant services. Obtain one consented, sanitized full header per real sender.
2. **Align:** confirm current provider domain/DKIM status and that each representative message passes SPF and DKIM, with at least one DMARC-aligned identity. Do not add providers blindly to apex SPF or exceed its lookup limit. Keep one SPF record per exact domain.
3. **Monitor:** create a private owner-controlled aggregate-report destination and publish one syntactically valid apex DMARC record beginning at `p=none`. Explicitly review alignment and subdomain policy. Do not enable forensic reports without accepting their privacy implications.
4. **Observe:** monitor for at least two to four weeks or one complete representative sending cycle. Classify every unknown source before authorization.
5. **Enforce gradually:** move to a limited-percentage quarantine only after all legitimate sources align; increase cautiously while monitoring delivery. Move to reject only when intended traffic is fully aligned and a rollback owner/procedure exists.
6. **Measure:** use provider delivery/bounce/complaint/suppression telemetry and small owner-authorized tests to consented mailboxes. Do not send unsolicited tests or expose headers publicly.

Every DNS change and policy transition requires explicit owner approval, TTL-aware validation, rollback, and a legitimate-delivery check. Full gates are in [EMAIL_REPUTATION_APPENDIX.md](./EMAIL_REPUTATION_APPENDIX.md).

## OA-07 through OA-09 — Editorial readiness, identity, and manual distribution

1. Treat the 25 rows in `FLAGSHIP_PAGES.csv` as a provisional review cohort, not proven demand and not an instruction to rewrite all 549 canonical articles.
2. Confirm each page's intended job before judging it. Preserve essays, satire, fiction, personal records, and literary voice; do not force commercial CTAs or keyword templates onto them.
3. For healthcare/science pages, map consequential claims to primary or institutional sources; state method, date, limitations, fact versus inference, and the owner's precise contribution. Obtain appropriate subject-matter review.
4. Confirm the DOI/publication and professional/company records before linking them to the site's Person entity or biography. Do not add an identity based only on a common name.
5. Approve at most one healthcare and one interactive flagship per six-week cycle. Require evidence, accessible/static explanation, performance, canonical, audience, and outcome gates before promotion.
6. Use one confirmed owned channel and at most five carefully selected curators, educators, editors, or communities per cycle. Make a useful, audience-specific contribution before mentioning the link. Ask for corrections or usage feedback, not a backlink.
7. Keep correspondence and people-level details private. Respect channel rules, use a bare canonical URL where tracking parameters are prohibited, and record only channel-supplied aggregate results publicly.
8. Stop if a page is not evidence-ready, an interactive fails mobile/accessibility checks, a community disallows promotion, outreach requires personal-data harvesting, or results remain dominated by owner/test traffic.

No outreach is automated. Do not buy links, use link exchanges at scale, submit to mass directories, create fake profiles, manufacture engagement, or claim a mention as an endorsement. See [CONTENT_AND_DEMAND.md](./CONTENT_AND_DEMAND.md), [AUTHORITY_AND_DISTRIBUTION.md](./AUTHORITY_AND_DISTRIBUTION.md), and [MANUAL_DISTRIBUTION_PLAN.md](./MANUAL_DISTRIBUTION_PLAN.md).

## OA-10 and OA-11 — Security engineering and optional hardening

These are separately reviewed implementation projects, not traffic remedies:

- Decide whether the two exported notebooks must remain executable; then self-host/pin or add verified integrity protection and an appropriate CSP without breaking mathematical output or intended embedding.
- Update vulnerable dependency paths in a controlled branch without an unreviewed forced major upgrade. Require both audit modes, signature checks, full tests, lint/check, and production build.
- If the optional TTS backend is enabled, choose authentication or durable distributed rate limiting and budget controls. If it is disabled, verify that production fails closed.
- Strengthen contact body-size enforcement and distributed abuse controls without storing unnecessary personal data or weakening legitimate delivery.
- Evaluate response-header CSP migration, HSTS subdomain scope, DNSSEC, CAA, and cross-origin policies only after inventorying every subdomain, provider, embed, font, analytics, notebook, and recovery path.

No provider, DNS, production, or package change is authorized by this document. The detailed risks and verification requirements are in [SECURITY_FINDINGS.md](./SECURITY_FINDINGS.md).

## Final owner evidence package

When the queue is complete, the owner should be able to provide a sanitized package containing:

- dated Google and Bing verdicts and aggregate exports;
- a clean-window analytics dictionary, contamination log, and outcome counts;
- comparable pre/post performance evidence;
- explicit service-by-service reputation statuses;
- sender-alignment and staged DMARC status without record values or addresses;
- page-level flagship decisions and source-to-claim review status;
- owned versus earned reference classification and manual distribution results; and
- a decision log showing which changes were approved, deferred, rejected, or rolled back.

Re-open the remediation backlog only after this package exists. Unknown values stay `UNVERIFIED` or `NOT ESTABLISHED`; they never become zero or clean by inference.
