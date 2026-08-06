# Conversion measurement

## Current state

**No trustworthy conversion baseline exists.** The code loads Vercel Analytics and Speed Insights, but the authenticated Hobby analytics interface reports no custom events and requires Pro for event reporting. No available report connects a search visit or page view to engagement, a return, a deliberate action, or a qualified inquiry.

The audit did not submit the contact form, create events, add a data drain, upgrade the plan, or alter production settings. Every unavailable count below remains **UNVERIFIED**; a missing event row is not a measured zero.

## Required eight-stage funnel

Each stage has a different counting unit and evidence source. Rates may be calculated only between adjacent stages with the same canonical-URL map, window, timezone, environment filter, and documented owner/test exclusions.

|                    Stage | Operational definition                                                                                 | Required evidence and unit                                                                              | Current status                                                                       |
| -----------------------: | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 1. Technical eligibility | A canonical URL is live, crawl-allowed, index-allowed, self-canonical, and technically fetchable       | Accepted production crawl joined to the canonical/redirect inventory; eligible canonical URLs           | **933 TECHNICALLY ELIGIBLE CANONICALS — CRAWL VERIFIED; ENGINE INDEXING UNVERIFIED** |
|               2. Indexed | An engine reports the canonical URL as indexed, including its selected canonical                       | Google URL Inspection/Page Indexing and Bing URL Inspection; indexed canonical URLs                     | **UNVERIFIED — PROPERTY ACCESS REQUIRED**                                            |
|           3. Impressions | An indexed canonical URL appears in an engine result                                                   | Google Search Console and Bing Webmaster performance exports; engine-reported impressions               | **UNVERIFIED — PROPERTY ACCESS REQUIRED**                                            |
|                4. Clicks | The engine records a result click to the site                                                          | Same engine exports; engine-reported clicks, directionally reconciled with analytics                    | **UNVERIFIED — PROPERTY ACCESS REQUIRED**                                            |
|               5. Engaged | A landing produces one approved, bounded engagement signal rather than only a page view                | Privacy-reviewed event stream; engaged sessions or visits under one frozen definition                   | **UNVERIFIED — MEASUREMENT NOT IMPLEMENTED**                                         |
|             6. Returning | An engaged visitor returns in the agreed clean window                                                  | Privacy-reviewed aggregate cohort with retention and owner/test handling documented; returning visitors | **UNVERIFIED — NO CLEAN COHORT**                                                     |
|               7. Actions | A visitor deliberately invokes an approved contact, résumé, resource, or meaningful-interaction action | Accepted events below; action events and action-producing visits                                        | **UNVERIFIED — MEASUREMENT NOT IMPLEMENTED**                                         |
|   8. Qualified inquiries | A valid inquiry meets an owner-approved qualification rule after server acceptance                     | Aggregate count from a private, access-controlled workflow; qualified inquiries                         | **UNVERIFIED — DEFINITION AND MEASUREMENT NOT IMPLEMENTED**                          |

An accepted event can support a stage without being a business conversion. In particular, reading and visualization signals describe engagement; only an owner-approved qualified inquiry belongs at stage 8.

## Event decision register

These decisions are specifications, not authorization to deploy instrumentation. Event properties must remain aggregate and non-identifying.

| Candidate signal                     | Decision                                                                                     | Funnel stage | Bounded trigger                                                                                | Evidence/privacy boundary                                                                                                                                                 |
| ------------------------------------ | -------------------------------------------------------------------------------------------- | -----------: | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Email-link click                     | **ACCEPT** as `email_link_intent`                                                            |            7 | One deliberate activation of a first-party email/contact CTA                                   | Record canonical source path and placement only; never record the address, URI, message, or user identity. Delivery and inquiry quality remain **UNVERIFIED**.            |
| Résumé print                         | **ACCEPT** as `resume_print_intent`                                                          |            7 | One opening of print UI from the résumé's explicit control                                     | This is print intent, not proof of a completed print. Record only canonical path; current event availability is **UNVERIFIED**.                                           |
| Résumé download                      | **ACCEPT ONLY IF** a documented first-party résumé file/control exists, as `resume_download` |            7 | A successful first-party download response initiated by the visitor                            | Current resource/control availability is **UNVERIFIED**. Do not encode filenames containing tokens, private URLs, or user data.                                           |
| RSS link click                       | **ACCEPT** as `rss_link_intent`                                                              |            7 | A deliberate activation of a visible first-party RSS link                                      | Record source path only. Raw `/rss.xml` requests are explicitly **REJECTED** as a human action because feed readers, crawlers, and refreshes cannot be separated.         |
| Visualization start                  | **ACCEPT ONLY WHEN USER-INITIATED** as `visualization_start`                                 |            5 | First explicit start/open/interaction that activates a laboratory                              | Automatic mount, canvas paint, autoplay, or viewport entry is **REJECTED**. Record canonical path and a fixed visualization class only; implementation is **UNVERIFIED**. |
| Meaningful visualization interaction | **ACCEPT** as `visualization_meaningful`                                                     |            7 | One per visit after a documented, route-specific interaction threshold                         | The threshold must be deterministic and versioned. No coordinates, typed values, seeds, or unique payloads; implementation is **UNVERIFIED**.                             |
| 50% reading-depth event              | **REJECT**                                                                                   |            — | None                                                                                           | Too easy to trigger through scrolling, restoration, layout shifts, or automation; it is not a business outcome.                                                           |
| 90% reading-depth event              | **ACCEPT** as `article_read_90` for engagement only                                          |            5 | At most once per article visit after 90% depth plus a documented minimum active-time threshold | Never count it as an action or inquiry. Record canonical path only; threshold and implementation are **UNVERIFIED**.                                                      |
| Contact form accepted                | **ACCEPT** as `contact_success`                                                              |            7 | Server confirms a valid first-party submission                                                 | Record source path and success only. Never send name, email, address, message, headers, raw network identifiers, or validation detail to analytics.                       |
| Qualified inquiry                    | **ACCEPT** as an aggregate owner-side outcome, not a client event                            |            8 | A privately reviewed accepted inquiry meets a frozen qualification rule                        | Keep person-level review outside analytics. Publish only aggregate counts with suppression where needed; the rule and count are **UNVERIFIED**.                           |

## Counting and reconciliation rules

- Do not calculate conversion rates across products unless windows, time zones, canonical URLs, filters, and counting units are documented. A URL, impression, click, visitor, session, event, submission, and person are different units.
- Fire accepted client events at most once per defined scope and deduplicate server confirmations. Preserve event-version and deployment dates so definitions do not drift silently.
- Exclude preview, development, monitoring, audit, and known owner/test activity where technically reliable; otherwise annotate and reject contaminated intervals.
- Alias-to-canonical traffic reconciliation is **COMPLETE FOR THE ACCEPTED CRAWL**: 243 of 245 observed public-path rows match 243 canonical groups, no matched group contains more than one observed alias/canonical path, two historical paths remain unmatched, and the sanitized non-unique owner/account aggregate is excluded. `TRAFFIC_CANONICAL_RECONCILIATION.csv` uses canonical-group maxima, never sums; it does not turn contaminated visitors into human or organic counts.
- Never infer stage 2 from stage 1, stage 3 from public `site:` results, stage 5 from bounce rate, stage 6 from an unavailable referrer, or stage 8 from a contact-page view.

## Owner actions

1. Approve the stage definitions and choose the one or two business outcomes that matter; engagement diagnostics are not outcomes.
2. Decide whether the current analytics tier can support the accepted events and documented retention, or select another privacy-reviewed tool/tier.
3. Add a documented owner/test exclusion strategy before collecting a baseline.
4. Implement the smallest accepted set in preview and verify that rejected signals do not fire and no real personal information is transmitted.
5. Publish an appropriate privacy disclosure before production collection.
6. Freeze event names, triggers, canonical mapping, environment filter, timezone, counting units, and qualification rule for 30 clean days.
7. Report every funnel stage with its source, denominator, status, and confidence; leave unavailable values blank rather than substituting page views.

Until those steps are complete, stages 2–8 remain **UNVERIFIED** and no conversion rate is established.
