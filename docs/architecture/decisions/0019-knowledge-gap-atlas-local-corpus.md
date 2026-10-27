# ADR 0019: Knowledge Gap Atlas keeps corpora and evidence in the browser

Date: 27 October 2026. Status: accepted.

## Context

Knowledge Gap Atlas turns visitor-supplied writing and reference material into an inspectable
concept network and research plan. It must impose no word/token quota and must use no AI API.
Its privacy and scale contract differs from Prompt Atlas: there is no remote semantic mode,
and large source files should not be copied into a single editor string or request body.

## Decision

Publish one ordinary Markdown visualization article, also discoverable through the Apps
collection. Keep the feature model, streaming extractor, worker and browser storage under
`src/lib/visualizations/knowledge-gap-atlas`; keep the UI and renderer in the corresponding
visualization component directory. Do not add an analysis endpoint or new server persistence.

Use the existing Dexie dependency for a feature-owned IndexedDB database. Store source text in
chunks, separate from source metadata, term/edge aggregates, analysis checkpoints and project
annotations. Files are decoded incrementally. A worker reads the stored source chunks and
merges analysis deltas into disk-backed aggregate tables. Checkpoint state and its aggregate
updates must commit together so a resumed chunk cannot count twice.

Use a shared per-project Web Lock for analysis and source/project mutations when the browser
provides that API. Reject conflicting operations instead of interleaving them. Project saves
also transactionally verify source signatures and reject deleted-project resurrection. The
fallback without Web Locks does not serialize cross-tab edits; its documented safe workflow is
to edit a given atlas in one tab at a time.

Build a deterministic concept co-occurrence network from the supplied material. Use Graphology
and seeded Louvain community detection, separating disconnected components within communities.
Source offsets refer to original UTF-16 text positions. Representative evidence is a bounded
selection of exact source spans; counts are separate from that excerpt selection.
Clip displayed evidence at 4,000 UTF-16 units and disclose clipping. Preserve original source
offsets and text; the paged source reader provides access beyond an excerpt.

The analytical graph and its visible projection are distinct. Canvas 2D supports the map, with
an HTML concept/evidence workflow for keyboard and non-canvas access. Display density must not
change the underlying counts or gap calculations. Generated questions are labelled templates;
structural gaps remain corpus-relative hypotheses. Reference-relative coverage requires a
reference corpus selected by the visitor.

No model is needed or downloaded. No API key, account or provider configuration is introduced.
Project exports are an explicit user action and may contain source text only when chosen.

## Alternatives and consequences

- A hosted text-analysis service or vector database would introduce upload, retention, security
  and cost boundaries that contradict this feature's requirements.
- Keeping complete text in component state would make large files expensive before analysis
  begins. Chunked IndexedDB sources keep the reading and ingestion boundaries bounded.
- OPFS could improve particular large-file workloads but adds another storage compatibility
  and migration surface. This version uses IndexedDB; it does not claim an OPFS implementation.
- An optional embedding model could improve vocabulary alignment, but downloads, memory,
  conversion provenance and language support would need a separate tested enhancement.
- Sigma/WebGL is a viable renderer for very large visible networks. Canvas 2D and a deliberately
  limited visual projection avoid new rendering dependencies while retaining a full analytical
  result and a textual inspection path. The visible projection is not an input limit.
- There is no application-imposed word/token quota. Device memory, browser storage and time
  remain finite. The graph/community stage materialises aggregate records in memory; this is
  not an external-memory global graph algorithm or a promise of arbitrary corpus scale.
- Browser storage is local working space, not encrypted private storage or guaranteed backup.
  Site-data deletion can erase projects. Export/import supplies portability.

## Verification and regression boundaries

Unit tests cover chunk invariance, source spans, sentence/document separation, graph findings,
comparison normalization and export validation. Production-preview browser tests exercise
import, worker completion, evidence inspection, research questions, persistence and export,
with service workers blocked. Network observation checks that supplied text is not uploaded.

Measured resource limits, test results and any unavailable checks belong in the implementation
handoff and feature documentation; library capabilities alone do not establish app throughput.

The canonical [architecture](../ARCHITECTURE.md#knowledge-gap-atlas-local-corpus-analysis)
describes the implemented data flow. The [feature contract](../../visualizations/knowledge-gap-atlas.md)
records the analytical and storage limits.
