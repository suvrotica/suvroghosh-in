# Knowledge Gap Atlas: real-document review

Review date: 27 October 2026. This record distinguishes a public, externally authored corpus
from the app's deliberately illustrative practice cases. It records the observed engine and
production-preview browser results, with the limits of each check stated separately.

## Corpus and reproducibility

The review uses the complete UTF-8 plain-text [RFC 9110, HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110.txt),
retrieved on 27 October 2026. It includes its original headings, table of contents, section
references, normative language, examples and back matter. No introductory passage is substituted
for the full document, and no hand-cleaned version is used for the baseline.

| Property                  | Baseline input                                                      |
| ------------------------- | ------------------------------------------------------------------- |
| UTF-8 bytes               | 502,941                                                             |
| UTF-16 units              | 502,907                                                             |
| Words                     | 70,786                                                              |
| Independent lexical count | 70,786                                                              |
| SHA-256                   | `21c1cdce6ab0e5509b04d84a28000836c7a087cf786efe6f04877ebfff47232a`  |
| Settings                  | Word window 5; minimum support 2; community resolution 1; seed 1729 |

The independent count uses a Unicode-aware lexical expression rather than the number of
displayed concepts. Bytes, source characters, words, eligible concepts and visible nodes measure
different things. Full-source preservation and tail evidence must be checked separately from
the visual impression of the map.

RFC 9110 is useful for this review because it is long, heterogeneous technical prose with
cross-references, identifiers and repeated document conventions. One protocol specification
does not establish quality across languages, academic disciplines, interviews or all hardware.

## Baseline observations

The baseline extractor counted all 70,786 words. It retained 8,633 term aggregates and 37,289
association aggregates; the default support rules produced 3,503 analytical concepts and
25,081 associations, divided into 60 topics. The resulting findings included 1,481 bridge
findings and 606 weak-connection findings.

Those large output counts did not establish usefulness. The highest-ranked concept was
“section”, with 1,028 mentions. Its bridge finding linked 36 topics and received priority 100.
This mainly reflected document cross-references. The review also found possessive or verb
fragments in labels, hexadecimal identifiers forming singleton topics, and gap factors that
saturated near their maximum despite dozens of observed cross-links.

These are ranking and analytical-projection defects exposed by ordinary document structure.
The correction changes what the analysis prioritises while retaining the complete original
source and reproducible raw counts. A lower number of visible nodes is not evidence of a fix.

## Engine comparison

The same complete source and default settings produced these observed results:

| Measurement                     | Revision one | Revision two |
| ------------------------------- | -----------: | -----------: |
| Words processed                 |       70,786 |       70,786 |
| Retained term aggregates        |        8,633 |        8,633 |
| Retained association aggregates |       37,289 |       37,289 |
| Analytical concepts             |        3,503 |        3,432 |
| Analytical associations         |       25,081 |       23,992 |
| Topic communities               |           60 |           56 |
| Bridge findings                 |        1,481 |           37 |
| Weak-connection findings        |          606 |           68 |
| Fragile-connection findings     |          104 |            0 |
| Peripheral findings             |           41 |           33 |

The revised leading topic labels include “header field”, “content coding”, “status code”,
“request method”, “media type” and “target resource”. “Header field”, “origin server”, “status
code” and “content negotiation” remain discoverable concepts. The general word “field” still
has substantial legitimate support in an HTTP specification; the correction does not pretend
that every common word is irrelevant.

Document-navigation and citation fragments now receive much less influence on salience and
association weights. English possessive forms combine in the analytical projection, with explicit
user alias targets respected. Syntactic fragments have less influence; low-degree encoded
literals are excluded from the graph while substantive identifiers can remain. These changes
do not rewrite the raw index or source text.

Weak-connection findings now name an observed pair of representative concepts and show evidence
for that exact pair. Existing occurrences and separate sampled windows reduce priority; a large
graph alone is no longer treated as proof of a missing connection. Bridge suggestions require
repeated, supported links and discount broad hubs. Fragility requires at least two substantial
branches after removing a concept, rather than treating a dangling one-term fragment as an
important dependency.

The smaller finding set is a consequence of those rules, not a target count or a recall score.
Manual inspection still matters. For example, the high-ranked `ip ↔ user` lead points to passages
about user identifiers and IP addresses; the specification already says something substantive
about them. That is a useful reading location, not proof that the RFC lacks an explanation.
Words such as “address” can also refer to different meanings. This remains a lexical network,
not semantic disambiguation, contradiction detection or a judgement about a reader's knowledge.

Compatibility checks compared baseline extraction, fresh extraction and checkpoint-resumed
extraction. All three retained-aggregate hashes were
`a4f55245010adb68a7802f387b03c98f4c810d3776e7a2f10d9c028ca74ac0d2`.
Reanalysing retained aggregates and freshly extracted aggregates produced the same revised
result hash, `f888e19eabdc37b6d7664a4092d7836fa68e2b3d1f9934da5a3811fd36bc269a`.
The existing lexer/checkpoint format remains compatible. Revision-two analysis is an explicit
update for a saved older result; saved questions and original sources remain available.

## Reading a large result

The overview gives a limited set of topic islands enough room to read: four on a narrow phone
map, eight at an intermediate width and twelve on a wide map. Visible/total counts disclose
that choice. Every topic remains accessible, and **All concepts** explicitly shows the complete
analytical graph. Searching and selecting concepts can bring the relevant points into view.

Dense drawings retain a maximum-weight spanning forest and strong incident links, with counts
that distinguish shown links from eligible links. Selecting a concept reveals its links to
other visible concepts. Canvas and SVG use the same collision-aware label placement. These
are drawing choices; they do not remove associations from the analytical result.

A separate renderer check calculates text contrast against the map background. Six of the
eight palette colours failed 4.5:1 on paper, and all eight failed on the night background.
Topic headings therefore fall back to the theme's ink colour when their palette colour does
not meet that threshold; dots and contours keep their topic colours. Canvas text is outside
the reach of the DOM accessibility audit, so the real-document browser review also captures
both paper and night maps for visual inspection.

A separate deterministic fixture with 3,600 concepts and 60 topics checks projection behaviour.
It is a synthetic regression fixture, not another real-document benchmark. Small-corpus tests
also distinguish the responsive overview from the explicit All option.

## Browser review

The prepared `scripts/verify-knowledge-gap-atlas-real.mjs` uses the public application through a
loopback browser, without importing internal Vite modules. It validates the exact source hash,
including this file's UTF-8 byte-order mark, before selecting the complete local file.

The production-preview run passed. Its retained
[machine-readable report](knowledge-gap-atlas-real-world-browser.json) records these observations:

| Check                        | Observed result                                                                                           |
| ---------------------------- | --------------------------------------------------------------------------------------------------------- |
| Complete original source     | Exact bytes, characters, word count and SHA-256; UTF-8 byte-order mark preserved                          |
| Source storage and reading   | 31 stored chunks; all 101 reader pages matched the original, including the final passage                  |
| Explicit All concepts view   | All 3,432 analytical concepts and all 56 topics disclosed as visible                                      |
| Important concept workflow   | “origin server” found through map search and Concepts, then inspected in original passages                |
| Research and portable export | Custom question saved; two NDJSON parts reconstructed the complete original source with its exact SHA-256 |
| Browser integrity            | Zero runtime errors and zero network writes; no sampled source passage found in request data              |
| Responsive layout            | Desktop and 390-pixel mobile app fitted their viewports                                                   |
| Import plus analysis         | 5,891 ms in this observed run                                                                             |

The browser was Chromium 156.0.8078.48 on Windows 10.0.26200 x64, with a 12th-generation
Intel Core i5-12500H, 16 logical processors and 15.7 GiB system memory. Timing includes
automation and local machine load; it is an observation, not a performance guarantee.
External requests were blocked. The source-bearing request check compares selected original
passages and their encoded forms against request URLs and bodies. It supplements code review;
it is not a proof about every possible browser extension or hosting environment.

The separate production browser suite passed all 11 workflows in 48.8 seconds. Those checks
include both new practice cases, meaningful research questions, source-inclusive export and
import, saved tutorial identity, and an explicit revision update that preserves source data
and saved questions. The suite also covers pause/resume, settings, accessibility and mobile
navigation. Both that suite and the complete RFC workflow passed again after the final
comparison-ranking correction. The refreshed product-guide capture and browser report confirm
that its first question concerns keyboard access.

The focused feature suite passed 59 tests, including 30 engine tests. The project check reported
zero errors and zero warnings. The complete feature publication build passed before the final
comparison-only correction; the final production build also passed, followed by the successful
browser reruns recorded here.

Visual review covered the full-corpus paper and night maps, concept evidence, a focused topic,
the final source page, the first gap question and a clean mobile overview with its inspector
closed. The narrow map displayed four readable topic headings and truthful visible/total
counts. The gap inspector named the same `ip ↔ user` pair in its explanation and question.
Additional captures checked the five practice cards and the expanded product-review guide.
Screenshots are local QA artifacts under `test-results/knowledge-gap-atlas-real/`; the JSON
report above is retained with this review because test artifacts are disposable.

## Practical examples are a different kind of evidence

The app includes five practice cases written specifically for the interface. They contain
original illustrative prose, including fictional meetings and interviews. They are tutorials,
not customer evidence, research findings or large-corpus benchmarks.

| Practice case                               | Review task                       | Concrete output                                                                            |
| ------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------ |
| A cooler city. For whom?                    | Policy and report review          | A question linking a proposed improvement with maintenance, access or responsibility.      |
| The library after the flood                 | Creative research                 | A possible exhibition thread with a source or permission check.                            |
| Is the draft telling the whole story?       | Draft and reference review        | A deliberate revision decision about access, land tenure or maintenance.                   |
| The launch is agreed. Is the handoff ready? | Meeting and project handoffs      | An owner-specific question about rollback, queued submissions or support cover.            |
| Does the roadmap answer the field notes?    | Product requirements and feedback | An acceptance check or research question about offline recovery, shared devices or access. |

Each case supplies a task and three suggested actions using the actual Concepts, Compare,
Sources, Discoveries and Research plan views. The instructions ask the visitor to inspect the
source and make a judgement; they do not guarantee a particular generated finding. The app
does not classify decisions reliably, infer the number of affected customers, determine a
person's mastery or prove that a field of research contains an unexplored gap.

Reviewing the product-case screenshot exposed a separate ranking weakness: the first coverage
question asked whether the target should address “interview”, reflecting the format of its
reference material. Coverage ranking now gives recurring phrases more specificity and reduces
the influence of format words corroborated by reference-source names. It keeps the word and
its counts available, and does not penalise a subject phrase such as “interview technique”.
The corrected product case leads with keyboard access and offline drafts; the handoff case
leads with queued submissions. These are observed tutorial results, not guarantees for arbitrary
material. This comparison-only correction does not change RFC extraction, graph or topic counts.

## Architecture review

Architecture impact: **yes**. The canonical
[architecture](../architecture/ARCHITECTURE.md#knowledge-gap-atlas-local-corpus-analysis)
and mandatory change gate were reviewed and updated in this change. The analytical projection,
saved-result revision handling, tutorial identity and evidence-to-question workflow have more
specific contracts; the renderer now distinguishes the responsive overview from the complete
analytical graph. The route, browser-local persistence owner and no-API analysis boundary remain
the same. ADR 0019 records the foundational local-analysis decision and remains applicable;
these refinements do not require a new architectural decision record.
