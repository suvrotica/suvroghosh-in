# Site identity and user journeys

## Finding

The site has a coherent underlying identity—an independent portfolio and publication spanning healthcare systems, technical/scientific explanation, interactive work, essays, fiction, and Calcutta—but it serves several reader jobs at once. The architecture already acknowledges this through `Start Here`, topic headquarters, a professional portal, a writing portal, resource/lab areas, and five curated reading paths. The remaining problem is not “pick one niche”; it is to make each journey's promise and next action unmistakable.

This assessment is based on repository navigation and page structure. Search-engine demand remains **UNVERIFIED — REQUIRES OWNER ACTION**, and any crawl-depth or graph measurement belongs to the companion crawl reports.

## Observable identity layers

- The homepage separates **Professional** from **Writing** and gives direct routes to projects, resume, consulting, Gulf healthcare work, the writing room, archive, images, music, and newsletter.
- Global navigation exposes nine destinations: Start Here, Topics, Essays, Notes, Field Kit, Lab, Games, Work, and Resume.
- `Start Here` curates five routes: orientation/voice, healthcare IT, science and mental models, Calcutta, and fiction.
- The footer describes the site as independently maintained work about essays, healthcare systems, science, and Calcutta, while separating exploration from professional links.
- Article pages expose breadcrumbs, topics, and older/newer navigation; topic headquarters and related-resource models provide additional semantic paths.

Repository evidence: `src/routes/+page.svelte`, `src/lib/components/layout/Header.svelte`, `src/lib/components/layout/Footer.svelte`, `src/lib/content/reading-paths.ts`, `src/routes/blog/[category]/[slug]/+page.svelte`, and `src/lib/server/content/topic-headquarters.ts`.

## Journey map

| Reader job                                                         | Best entry                                                            | Desired path                                                                              | Primary action                              | Present risk                                                                                                                                                     |
| ------------------------------------------------------------------ | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Healthcare employer, partner, or buyer validating expertise        | Home, healthcare article, resume, consulting, or Gulf landing page    | Relevant proof-led article → project/capability evidence → resume or consulting → contact | Qualified contact or resume review          | Evidence and project proof are distributed across several surfaces; a generic article reader may not see the professionally relevant next step.                  |
| Technical learner arriving for a concept or interactive laboratory | Article, visualization, Lab, or topic headquarters                    | Explanation → method/evidence → interactive experience → related concept/topic            | Continue learning, cite/share, or subscribe | Large interactive pages can dominate performance and related reading can cross into less relevant archive paths.                                                 |
| Essay, fiction, or Calcutta reader                                 | Public search result, shared article, Writing, or Start Here          | Article → intentional reading path/topic → another related piece → newsletter             | Read another page or subscribe              | Archive/category/tag abundance can substitute taxonomy for an authored reading journey. Literary pages should not be forced into commercial conversion language. |
| Returning reader or researcher                                     | Home recent signals, Topics, Blog search/archive, Notes, or Field Kit | Known subject/tool → fresh or related material → saved/shared reference                   | Return, find, reuse, or subscribe           | Vercel cannot currently distinguish real returning readers from owner/test traffic, so this journey has no trustworthy measurement baseline.                     |

## Recommendations

1. Preserve the site's plural identity, but treat the four journeys above as separate information scents. Each flagship page should name one primary reader job and one next action.
2. On healthcare flagships, connect consequential claims to primary or institutional sources and add context-specific routes to relevant projects, consulting, resume, or contact. Do not add the same commercial block to literary work.
3. On scientific and interactive flagships, put methodology, limitations, static fallback, and a small set of closely related explanations within the principal reading path.
4. On essays and fiction, prefer curated sequences and topic headquarters over indiscriminate tag links. Preserve voice, ambiguity, satire, and narrative form.
5. Keep `Start Here` as the orientation layer. Validate whether its five routes receive meaningful search/reader entry and continuation only after clean analytics and search-console access exist.
6. Use consistent language for overlapping surfaces (`Writing` versus `Essays`, and `Projects`/`Work`/`Consulting`) where user testing or query evidence shows confusion; do not rename globally from inference alone.
7. Measure journey outcomes separately: qualified contact/resume actions for professional pages; continuation, interaction, citation/share, and subscription for editorial/technical pages. Raw page views are not a substitute.

## Verification boundary

The architecture and labels above are directly observable in source. Their effectiveness, search demand, and conversion performance are not established. Validate with the crawl link graph, clean first-party events, Search Console/Bing access, and a short moderated wayfinding test before structural changes.
