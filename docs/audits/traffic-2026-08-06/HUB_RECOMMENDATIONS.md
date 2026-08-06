# Hub recommendations

Audit date: **2026-08-06 (Asia/Calcutta)**

Source: accepted rendered canonical graph; companion evidence in `INTERNAL_LINK_GRAPH.csv` and `FLAGSHIP_ARCHITECTURE.csv`

## Outcome

The site already has functioning hub layers. The visualization gallery and Interactive Mathematics headquarters each reach all 10 visualization flagships; Projects reaches nine flagships across healthcare and visualization; Consulting reaches three healthcare flagships; HL7 & FHIR reaches four healthcare flagships; Healthcare AI reaches three. The appropriate remedy is therefore **selective path repair**, not a new global navigation system and not links from every hub to every flagship.

The crawler labels **320 source pages** as explicit hubs: **141 base/category/topic/static hubs** and **179 pagination variants**. Pagination variants are reported separately because their large target counts are archive mechanics, not curated editorial breadth.

## Measurement definitions

- Target count is the number of distinct visible canonical destinations; occurrences are visible rendered anchors after subtracting hidden occurrences.
- Contextual targets use `main`, `article`, or `body`. Header/footer/nav/breadcrumb links are boilerplate; pagination and related widgets are separate.
- Descriptive coverage is the share of targets with at least one visible non-generic anchor. The extractor's empty/non-text marker does not calculate accessible names, so it is a review flag rather than an accessibility verdict.
- Flagship counts use the fixed 25-page provisional cohort. Observed visitors are directional Vercel route counts, not additive or verified human/organic demand.

## Existing hub coverage

| Hub                             | Visible targets | Contextual targets | Flagships | Flagship mix                            | Observed 28-day visitors |
| ------------------------------- | --------------- | ------------------ | --------- | --------------------------------------- | ------------------------ |
| /                               | 19              | 11                 | 2         | science_visualization: 2                | 150                      |
| /start-here                     | 28              | 15                 | 2         | healthcare: 2                           | 11                       |
| /writing                        | 29              | 19                 | 2         | science_visualization: 2                | 34                       |
| /blog                           | 44              | 12                 | 3         | science_visualization: 3                | 296                      |
| /topics                         | 21              | 8                  | 0         | none                                    | 5                        |
| /projects                       | 26              | 14                 | 9         | healthcare: 4; science_visualization: 5 | 9                        |
| /resume                         | 13              | 1                  | 0         | none                                    | 16                       |
| /consulting                     | 18              | 9                  | 3         | healthcare: 3                           | 11                       |
| /healthcare-it-gulf             | 13              | 3                  | 0         | none                                    | 5                        |
| /resources                      | 28              | 15                 | 0         | none                                    | 2                        |
| /blog/visualizations            | 29              | 17                 | 10        | science_visualization: 10               | 9                        |
| /topics/hl7-fhir                | 34              | 20                 | 4         | healthcare: 4                           | unavailable              |
| /topics/healthcare-ai           | 29              | 15                 | 3         | healthcare: 3                           | unavailable              |
| /topics/interactive-mathematics | 50              | 36                 | 10        | science_visualization: 10               | unavailable              |
| /topics/calcutta                | 47              | 33                 | 1         | essay: 1                                | 4                        |

Two apparent gaps are intentional routing layers, not defects by count alone: `/topics` links to topic headquarters rather than directly to flagships, and `/resume` is a professional record rather than a reading index. Preserve those jobs unless user testing shows confusion.

## Bounded recommendation register

| ID     | Source scope                            | Measured evidence                                                                                                                                          | Proposal                                                                                                                                                              | Verification                                                                                                                 | Priority         |
| ------ | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| HUB-01 | /healthcare-it-gulf                     | 13 visible targets, 3 contextual targets, 0 healthcare flagships; Consulting already reaches 3 and Projects 4.                                             | After owner/evidence review, add a small selected-work block with two or three Gulf-relevant healthcare flagships. Do not add all ten.                                | Chosen pages are evidence-ready; descriptive anchors; graph shows direct contextual links; professional outcome is measured. | P2 proposal      |
| HUB-02 | /writing or one relevant essay hub      | All five essay flagships have hub support, but The Curriculum Vitae of a Vanishing Man remains four meaningful clicks deep.                                | If it remains in the owner-approved essay cohort, add one contextual selected-essay link from the closest literary journey. Preserve its non-commercial framing.      | Meaningful depth becomes ≤3 without a generic CTA or unrelated professional block.                                           | P2 proposal      |
| HUB-03 | Shared topic navigation                 | 86 visible redirecting occurrences from 43 source pages to two promoted topic destinations.                                                                | Replace the two shared legacy topic hrefs with their terminal canonical topic URLs in one reviewed registry/template change.                                          | Rerun graph: zero redirecting shared-topic links; anchors and destinations unchanged.                                        | P2 technical     |
| HUB-04 | /resources                              | /resources/lists/satirical-insults-by-intensity has three inlinks, all hidden in the inactive rendered tab, and is the sole visible-unreachable canonical. | If the list remains public, expose one visible descriptive link in the active resources journey. If not, document its intended role before changing indexability.     | At least one visible contextual source; no fragment-exclusive principal content introduced.                                  | P2 proposal      |
| HUB-05 | Two standalone Mojo notebook HTML pages | Each has one source, no outbound canonical target, no canonical declaration, and no sitemap entry.                                                         | Choose the standalone role. If retained, add a self-canonical and a visible return link to its parent article/project; otherwise seek explicit owner indexing policy. | Self-canonical or documented alternative; no dead end; parent article remains unchanged.                                     | P2 technical     |
| HUB-06 | Image thumbnail pagination              | 78 visible links from 16 sources to 15 canonical targets differ only by query-parameter order.                                                             | Normalize the link builder's query ordering during a future gallery maintenance change. This is consistency work, not a duplicate-indexing emergency.                 | Raw and normalized linked URLs match; canonical count and gallery state remain unchanged.                                    | P3 opportunistic |
| HUB-07 | Shared header/card semantics            | 939 visible empty/non-text extractor occurrences, primarily the repeated header pattern; accessible names were not computed by this graph.                 | Inspect the shared pattern once with the accessibility evidence before changing markup. Do not create hundreds of page-level tickets.                                 | Accessible-name test passes and the rendered graph retains the intended destination.                                         | P3 review        |

## What not to change from this graph alone

- Do not noindex, sitemap, or remove the 218 pagination-only canonicals as a bulk operation.
- Do not consolidate the 41 category/writing-hub near-orphans without query evidence and editorial equivalence.
- Do not add all 25 flagships to the homepage, Start Here, résumé, consulting, or every topic page.
- Do not treat the 9 flagships without a high-traffic source as broken. The high-traffic cohort is contaminated Vercel context.
- Do not erase the site's healthcare, technical, visualization, essay, fiction, or Calcutta identities. Route them through clear landing promises and bounded selected work, as described in `SITE_IDENTITY_AND_JOURNEYS.md`.

## Sequencing

1. Resolve the four exact canonical-policy rows and the two shared redirect hrefs.
2. Decide whether the hidden resource and standalone notebooks are intended public destinations.
3. Owner-review at most the two proposed path additions: one professional selected-work block and one literary link.
4. Re-run the same rendered graph and compare only the affected source/target rows, depth, canonicals, and initial content.
5. Use Google/Bing query/index evidence and clean-human path data before any taxonomy consolidation or broader hub expansion.
