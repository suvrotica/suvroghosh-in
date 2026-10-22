# External source-link audit — 22 October 2026

This supplements the local rendered-page audit. It is a source inventory, not a claim that every
candidate is rendered or that an HTTP success proves the destination's scientific claims.
The production site corpus was not crawled. No forms, subscriptions, account changes, provider
calls requiring credentials, or private services were exercised.

## Coverage and method

- Inventoried **601 unique external HTTP(S) URL candidates**, **1,117 source references**,
  **187 hosts**, and **83 active source/static files**.
- Included Markdown links/reference definitions/autolinks, HTML anchor destinations, and
  Svelte/TypeScript/JSON URL literals in navigation, content and feature source registries.
  Markdown destinations were parsed with balanced parentheses, so DOI parentheses were retained.
- Excluded fenced code examples, test fixtures, server-only/provider modules, retained article
  archives, generated indexes, URL templates, and ordinary same-site links. A literal inventory
  can still include non-rendered data; the rendered report is the final public-link corpus.
- Used unauthenticated GET requests with redirects, eight concurrent checks globally and at most
  two per initial URL host, a 14-second attempt deadline, and a canceled response stream after the HTML prefix.
  Retried transport failures separately with a 22-second deadline. Used primary author,
  institution and publisher sources to establish replacements.
- Raw working inventories and checks are local files under
  `.codex-artifacts/site-links-2026-10-22/`; they are deliberately not committed.

The first pass returned **449 HTTP 2xx responses**, **134 access/rate/negotiation refusals**
(403/406/429/999), **one HTTP 405 human-verification page**, **16 transport/TLS failures**, and
**one definitive HTTP 404**. These are transport observations, not 449 independently reviewed
content endorsements. Publisher challenges, authentication, rate limits, certificate-chain errors
and timeouts were not treated as proof that a URL was broken.

## Repairs

| Source                                                                            | Defect and evidence                                                                                                                       | Replacement and verification                                                                                                                                                                                                                                                                                                                       |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/posts/the-matrix-is-random-why-does-it-have-a-shape.md` (two references) | `10.1516/0100000001` returned HTTP 404, “Error: DOI Not Found”.                                                                           | Corrected to [10.1561/0100000001](https://doi.org/10.1561/0100000001). The [publisher's own summary](https://nowpublishers.com/article/DownloadSummary/CIT-001) gives this DOI for Tulino and Verdú's _Random Matrix Theory and Wireless Communications_. The DOI resolves to the matching Emerald article; Emerald requires browser verification. |
| `src/lib/posts/how-a-scanner-sees-reconstructing-a-body-from-shadows.md`          | The Slaney HTTPS host repeatedly refused connections; its HTTP version returned 404.                                                      | Used the [author's Purdue-hosted table of contents](https://engineering.purdue.edu/~malcolm/pct/pct-toc.html), HTTP 200, title “Principles of Computerized Tomographic Imaging”, with the same authors and chapters.                                                                                                                               |
| `src/lib/posts/the-city-that-refuses-a-master-plan.md`                            | The legacy Stanford dissertation URL timed out/refused connections; the web fetch also exposed a redirect to the author's current domain. | Used [Paul Merrell's current dissertation PDF](https://paulmerrell.org/wp-content/uploads/2021/06/thesis.pdf), HTTP 200, `application/pdf`; primary author search identifies it as the same 2009 _Model Synthesis_ dissertation.                                                                                                                   |
| `src/lib/posts/fhir-the-universal-language-of-health-data.md`                     | The old Argonaut wiki timed out repeatedly. The reference concerns the project generally.                                                 | Used the [official HL7 Argonaut project overview](https://projectlifedashboard.hl7.org/accelerators/argonaut-project/), HTTP 200, title “Argonaut Project \| Project Life Dashboard”. Updated only that citation's label to describe the current project overview.                                                                                 |

## Footer external destinations

| Item                | Result                                                                                                                                                                                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Substack newsletter | HTTP 200; “Systems in Plain Sight \| Suvro Ghosh \| Substack”.                                                                                                                                                                                               |
| X                   | HTTP 200; “Suvro Ghosh (@suvroghoshin) / X”.                                                                                                                                                                                                                 |
| YouTube             | HTTP 200; “SUVROGHOSH°IN - YouTube”.                                                                                                                                                                                                                         |
| LinkedIn            | HTTP 999 automation refusal. The [indexed public LinkedIn profile](https://in.linkedin.com/in/suvro-ghosh-78a5aa278) identifies Suvro Ghosh, SuvroGhosh.IN and Kolkata, confirming the intended account. The automated destination check remains unresolved. |

These response checks supplement the footer's browser interaction results. They do not test mail
delivery or send messages.

To cover YouTube's HTTP-200 unavailable-video pages, a separate unauthenticated public oEmbed
check examined **26 unique rendered video IDs across 34 references**, excluding the channel profile
and source-only examples. All 26 returned valid HTTP 200 title/author metadata; none were
unavailable, private/restricted or unverifiable in that check. The résumé/project videos resolve
to the intended SUVROGHOSH°IN account. Local evidence is
`.codex-artifacts/site-links-2026-10-22/youtube-oembed-checks.json`. This establishes public metadata
availability, not successful playback in every country, browser or future session.

## Outstanding verification limits

John McCarthy's exact “Branches of AI” reference at
`https://www-formal.stanford.edu/jmc/whatisai/node2.html` refused HTTPS connections and timed out
over HTTP on recheck. The current `jmc.stanford.edu` author-site variants were also unreachable.
An exact author/institution replacement or archival capture could not be verified. The citation
remains unchanged and explicitly unresolved; an unrelated AI overview would lose the intended source.

In the final rendered corpus, transport/TLS failures remain for three NOAA NSSL pages, a
Harvard-hosted PDF, TU Delft's tomography chapter, the Marchenko–Pastur DOI publisher destination,
fxhash and the McCarthy source above. Pearson's _Modern India_ product page and two India Code
URLs exhausted the request deadline. Repeated failure from this environment alone is insufficient
to invent replacement sources. The final JSON records each affected URL and referring page.

## Repeatable check

`scripts/audit-external-links.mjs` consumes the local crawler's `external` URL-to-reference map.
It deduplicates fragments while retaining each source, performs bounded unauthenticated GETs,
caps/cancels response streams, bounds redirects/retries, and reports `passed`, `broken`,
`unresolved` or `unsupported`. Local/private IP and credential-bearing URLs are not fetched;
URL credentials are redacted from evidence. Deterministic tests cover the network policy,
classification, redirects, timeout, body cap, retry recovery and concurrency. External network
checks are separately runnable and are not required in ordinary CI.
Explicitly incomplete or warned local crawl inputs are rejected before any external request or
output report, so an incomplete discovery subset cannot be presented as a completed external audit.

The first complete local rendered corpus supplied **544 external destinations** to this checker:
**404 passed**, **zero confirmed broken**, and **140 unresolved**. The unresolved outcomes were
112 browser-verification pages, eight access restrictions, nine transport/TLS failures, seven
pending/empty HTTP 202 responses, three timeouts and one HTTP 406 response. Rechecking the 13
HTTP 202/203 cases identified JavaScript cookie/proof-of-work gates even though their status was
successful; the checker and its regression tests now classify them as unresolved. The full local evidence is
`.codex-artifacts/external-links-baseline.json`. This build already included the Purdue, Merrell
and corrected DOI repairs; its obsolete Argonaut reference is superseded by the final rebuild.
External fragment references are retained for traceability; this bounded HTTP checker does not
establish foreign-page fragment existence.

## Final production-build reconciliation

The successful full production build and complete local crawl produced
`.codex-artifacts/site-links.json`. Its **544 external destinations across 44,350 rendered
references** reconcile to **405 passed, zero confirmed broken, 139 unresolved and zero
unsupported**. The final unresolved breakdown is 112 browser-verification pages, eight access
restrictions, eight transport/TLS failures, seven pending HTTP 202 responses, three timeouts and
one HTTP 406 response.

Compared with the baseline, the final rendered corpus removes the obsolete
`https://argonautwiki.hl7.org/` target and its two FHIR-article references, and adds the verified
`https://projectlifedashboard.hl7.org/accelerators/argonaut-project/` target with two references
labelled “HL7 project overview”. All other destination URLs remain present. Every referring
page/label was taken from the final crawl rather than retained from the baseline; the total
external reference count is unchanged.

The reconciliation reused prior outcomes for all 544 final destinations, including the separately
verified HL7 replacement. It made **zero additional HTTP checks**. The baseline checks completed
at 18:24 IST, the HL7 replacement was verified at 18:25 IST, the 13 challenge/pending cases were
rechecked at 18:31 IST, and final reference reconciliation completed at 18:51 IST on
22 October 2026. The evidence in `.codex-artifacts/external-links-final.json` preserves a
`checkedAt` timestamp per result and the baseline/reconciliation provenance.

The final corpus contains the same **26 YouTube video IDs and 34 references** as the successful
oEmbed audit at 18:34 IST; no video IDs were added or removed. Its existing metadata results
therefore apply to the final build without repeating requests. The 139 unresolved destinations
remain explicit verification limits, including LinkedIn's automation refusal; they have not been
silently treated as passed or removed from the inventory.
