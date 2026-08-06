# Content and demand

## Corpus shape

The repository contains 560 Markdown sources: 549 canonical published articles, one unpublished source, and ten redirect-source records. The deterministic corpus audit classifies the canonical articles into twelve distinct jobs rather than treating every post as a search landing page.

All impression, click, CTR, average-position, query, and index fields remain blank or `UNVERIFIED`; authenticated Google and Bing datasets are unavailable. Content scores, audience labels, intended outcomes, and treatments are documented heuristics for review—not search-demand measurements.

## Main diagnostic

The archive is not a 549-page commercial SEO catalogue. It is a mixed library of professional authority, technical/scientific explainers, interactive work, current-affairs analysis, medical/healthcare pages, essays, personal writing, satire, fiction, projects, and archival work. Applying one keyword/conversion template to all of it would damage the site's identity and still not solve the evidence gap.

Observable acquisition signals are sparse and contaminated; they do not measure search demand:

- Vercel's 28-day page table shows small relative pockets around the blog hub, interactive laboratories, and a handful of essays.
- Google public tests retrieve the professional brand, the exact “Hello, Fragment” title, and the gradient-descent visualization for a descriptive non-brand phrase.
- The tested competitive `HL7 vs FHIR explained simply` surface did not show this site.
- Search Console and Bing performance are unavailable, so demand and cannibalization cannot be confirmed.

## Review queues

The local audit produced 205 conservative review candidates:

- 148 tag-fragmentation candidates;
- 55 thin-category candidates;
- one near-duplicate body pair (“English AI Songs” / “AI Music”);
- one title-variant relationship;
- no canonical exact-body duplicates;
- no repeated exact passage crossing the documented threshold.

These are review signals only. They do not authorize merging, deleting, redirecting, noindexing, or rewriting. Thin-category detection counts source articles and does not by itself condemn the rendered hub.

## Evidence risk

Many healthcare, AI, scientific, and current-affairs pages have high evidence requirements but no machine-detected direct evidence. A missing machine signal is not proof that every claim is unsupported; it is a prioritization signal for human source-to-claim review. The required treatment is to connect consequential claims to primary or institutional evidence, document calculations/methods, and separate fact, inference, experience, opinion, satire, and fiction.

The bounded follow-up inspected all 14 canonical pages containing authored external Markdown links. Local context triage found **7 aligned, 4 partial, and 3 concern** pages; “aligned” means only that the citation placement and nearby claim appear topically matched. HTTP checks covered 86 unique page/target pairs: **49 live responses, one HTTP 404 confirmed by HEAD and GET, 14 access/bot restrictions, 20 network/redirect unknowns, and two redacted private targets that were not requested**. Liveness is not semantic support. See `SOURCE_TO_CLAIM_REVIEW.md`, `CITATION_LIVENESS.csv`, and `CITATION_REVIEW.md`.

## Provisional flagship set

`FLAGSHIP_PAGES.csv` records a provisional 25-page cohort—10 healthcare/professional, 10 scientific/interactive, and 5 essays. This stays below the 30-page ceiling but is not a final owner-approved selection.

Selection combines:

- intended page job;
- local business/search/originality/evidence heuristics;
- relative Vercel page observations;
- public Google retrieval where observed;
- coherent portfolio coverage.

Because Vercel data is contaminated and authenticated engine demand is missing, these are **provisional investment pages**, not proven winners. “Hold” means evidence or readiness work should precede active promotion. Essays are selected only where the available page table shows relative audience potential; they retain literary treatment rather than forced keyword targeting.

## Treatment policy

- Preserve satire, fiction, personal, and literary work unless the owner makes an editorial decision.
- Upgrade claims and methods before expanding high-risk healthcare/science distribution.
- Consolidate only after side-by-side human review plus query evidence.
- Redirect only when a canonical replacement and audience intent are genuinely equivalent.
- Noindex only for a real indexing-policy reason, not because a page has low traffic.
- Use hubs and reading paths to make different page jobs legible to readers and engines.

Supporting files: `CONTENT_INVENTORY.csv`, `CONTENT_CLASSIFICATION.csv`, `DUPLICATION_AND_CANNIBALIZATION.csv`, `EVIDENCE_AUDIT.csv`, `CONTENT_REMEDIATION_QUEUE.md`, `SOURCE_TO_CLAIM_REVIEW.md`, `CITATION_LIVENESS.csv`, and `CITATION_REVIEW.md`.
