# Knowledge Gap Atlas

Knowledge Gap Atlas is a browser-local text network and research workspace. The canonical
article is `/blog/visualizations/knowledge-gap-atlas`; Apps and Viz discovery point to that same
article. The post imports `KnowledgeGapAtlas.svelte` through the normal Markdown route.

## Data and ownership

- The visitor supplies target or reference material as pasted text or local text/Markdown files.
- Original text is saved in the feature-owned IndexedDB database `suvro-knowledge-gap-atlas`.
- The Svelte interface owns view state, active jobs and user actions. A disposable worker owns
  text analysis; the renderer owns its canvas, pointer events, observers and animation resources.
- Source text, filenames, concepts, excerpts, notes and questions are not sent to an endpoint,
  model service or remote database. The ordinary site's public pageview policy still applies.
- No account, key, subscription, inference server or model download is required.
- Projects are local to this browser and origin. Clearing site data can remove them. They are
  not encrypted vaults or guaranteed backups; exported project files provide portability.

The architectural decision and data-flow diagram are in
[ADR 0019](../architecture/decisions/0019-knowledge-gap-atlas-local-corpus.md) and the
[canonical architecture](../architecture/ARCHITECTURE.md#knowledge-gap-atlas-local-corpus-analysis).

## Input and resource contract

There is no product-level word count, model-token, document-count or pasted-character quota.
The input control has no `maxlength`. File ingestion uses byte streams with an incremental
UTF-8 decoder; source text is persisted in small UTF-16 chunks. The extractor maintains state
across arbitrary chunk boundaries, and source offsets always refer to the unchanged original.

Chunk size is an implementation detail, not an input limit. Minimum support and term exclusions
are analysis settings, not discarded source data. Display density controls the visible graph,
not the persisted counts. Inspecting a source reads a bounded page rather than mounting the
complete corpus in the DOM.

An evidence preview contains at most 4,000 UTF-16 units, even when a pathological token has
a much longer original span. A clipped-preview notice distinguishes the preview from the
complete passage; the source reader remains paged and the original offsets and text remain
intact. This display bound does not discard source text or change aggregate counts.

The storage and aggregate stages are incremental. The final graph/community stage loads its
aggregate records in memory. Thus practical capacity depends on vocabulary and edge growth as
well as text size, device memory, browser storage and processing time. This is not an
external-memory graph algorithm and does not promise that an arbitrary corpus fits any device.

Cancellation and resource failures must leave a visible interrupted state. A completed result
must never imply that unprocessed sources were analysed. Completed source chunks and analysis
checkpoints permit recovery; incomplete file imports may require selecting the file again.

## Analytical interpretation

The map is a concept association network, not a verified factual knowledge graph. A solid edge
means extracted concepts occurred near one another in the supplied text. It does not mean
causation, agreement, entailment or a prerequisite relationship.

The pure engine uses conservative Unicode-aware normalization, explicit stopwords, candidate
phrases and a configurable sentence-bounded word window. It records raw counts and source
distribution separately from ranking and normalized association weights. Source evidence spans
are representative samples; their number is not the number of occurrences.

English and a small Bengali stoplist are explicit. Other scripts are retained; the application does not claim
language-independent lemmatization, entity disambiguation or translation. User aliases are
deliberate, reversible analysis choices.

Unigrams and adjacent content-word bigrams are candidate concepts. Standalone modifier
fragments such as “public” or “oral” are suppressed while supported phrases such as “public
transport” and “oral history” remain available. Representative evidence retains up to six
spans per source for each aggregate; finding cards select a smaller diverse set. This is
excerpt selection, not source processing coverage.

The initial settings use a five-word window, minimum support of two, community resolution one,
and a recorded deterministic seed. Graphology's Louvain implementation identifies communities;
disconnected groups are separated. Topic labels derive from representative extracted terms.
Changing resolution changes the analytical partition, so topic identity is not a universal
classification.

Concept rank starts from `log(1 + count) × (1 + log((1 + document count) /
(1 + supporting document count)))`, with a small phrase preference, then normalizes against
the largest rank in the analysed graph. Edge weight is the co-occurrence count divided by
the geometric mean of its endpoint counts, capped at one. Neither quantity is a probability.
Pathological tokens longer than 256 UTF-16 units use rolling-hash identities and abbreviated
labels; their source text is preserved. This bounds lexer state, not accepted input length.

Concept and edge ranking, topic membership and finding priority are different measurements.
None is a truth score. Graph layout is navigational; screen distance is not a calibrated
semantic measurement. Topic colours identify groups without asserting their objective validity.

## Findings and comparison

Findings can describe weak relevant connections, cross-topic bridge concepts, fragile
connections, supported peripheral ideas, narrow source support and target/reference coverage.
A connection deficit alone is insufficient evidence that two unrelated subjects ought to meet.

Finding priority exposes relevance, connection deficit and evidence support as heuristic
factors. A numerical rank is not a probability of a claim being correct. Exact source passages
and methodological caveats remain available for inspection.

The displayed priority is the rounded product `100 × relevance × deficit × support`, with
each factor in zero-to-one. For weak topic connections, the engine requires existing cross-topic
evidence, at least three eligible concepts in each community, adequate side support and repeated
cross-topic occurrences. The deficit uses cross-edge weight relative to the geometric mean of
the communities' connection weights. It does not nominate every disconnected pair as a gap.
Bridge findings require a concept to participate in several communities; fragile connections
use articulation points in the explicitly filtered analytical graph. Source concentration is
an occurrence distribution, not a credibility judgement.

Reference-relative coverage requires sources assigned the reference role. Counts are normalized
against the target and reference corpora so a longer corpus does not automatically appear more
complete. “Not found” means not found under the current extraction settings; alternative
vocabulary or deliberate omission can explain a difference.

Generic standalone discourse words such as “problem”, “help” and “advice” need stronger support
and receive lower salience; meaningful phrases retain their own normal threshold. Gap priority
also discounts topic labels that largely repeat the same words (including a simple final-s
variant for that overlap check). This ranking check does not stem or merge concept identities.
It reduces redundant leads such as closely related tree/canopy labels without inventing a
semantic interpretation.

Questions are deterministic templates using extracted concepts. Users can edit them, add notes,
and mark them addressed or dismissed. The application does not generate authoritative answers,
contradiction verdicts or personal mastery scores.

## Persistence and portability

IndexedDB separates project records, source metadata, original chunks, term aggregates, edge
aggregates and checkpoints. Source changes invalidate derived analysis. Settings and project
annotations are stored separately from computed graph properties.

When the browser supports Web Locks, analysis and source addition, removal, invalidation or
project deletion share an exclusive per-project lock. A conflicting operation is rejected with
a visible busy message. Saving a project also checks its result's source signature in the same
IndexedDB transaction and refuses to recreate a project deleted in another tab. Browsers without
Web Locks retain those save-time checks but do not serialize concurrent source changes; avoid
editing the same atlas in multiple tabs on such browsers.

Exports are explicit visitor actions. A research report carries questions, evidence references
and settings. Machine-readable project exports use a versioned format and explicitly control
whether original source text is included. An export without source text cannot recreate missing
passages. Imported project structures must be validated before becoming active state.

Source text and user notes remain untrusted text during rendering and export. CSV fields require
formula-injection protection. Downloaded source-inclusive projects may contain private material;
the application must describe inclusion at the export control, not silently include it.

## Dependencies and licences

The core does not use pretrained weights or AI APIs. Existing Svelte, TypeScript and Dexie
dependencies support the UI and browser storage. Graphology and `graphology-communities-louvain`
provide graph representation and community detection under their published MIT licences.
Exact installed versions are recorded in the lockfile. No external model licence is implied.

Canvas 2D was selected for a controlled visual projection and portable image export, alongside
HTML concept and evidence inspection. This choice does not claim to render every edge of an
arbitrarily large graph at once.

## Verification

Focused tests should cover the actual boundaries:

1. Streaming versus batch equivalence for random chunk sizes, Unicode and phrase boundaries.
2. Original evidence offsets, sentence/document separation and no overlap double counting.
3. Stable communities under a fixed seed, known bridges and unrelated-topic negative controls.
4. Reference normalization, exclusions, aliases and reproducible settings.
5. Save, cancel, resume, import/export validation and resource-error states.
6. Browser import → analysis → evidence → question → export → reopen flow.
7. Keyboard/mobile layouts, reduced motion and no text-bearing network requests.

Use the repository's focused unit command and Playwright configuration. Browser checks run
against a local production preview with service workers blocked; do not crawl production.
The feature follows the `build:full` lane and the mandatory architecture gate.

Run `npm run knowledge-gap-atlas:test` for the focused unit suite and
`npm run knowledge-gap-atlas:browser:test` for the application flow. To reuse an already-built
loopback preview, set `PLAYWRIGHT_REUSE_SERVER=1` and `KNOWLEDGE_GAP_ATLAS_BASE_URL` to its origin.
The UI suite includes a mixed-format long document, a ten-megabyte pause/resume fixture, project
round-trip, reference comparison, numeric-settings undo and scoped paper/night accessibility.

Benchmark results must state hardware, runtime, input shape, vocabulary/edge counts and settings.
Repeated prose measures throughput but does not establish capacity for a large unique vocabulary.
Test sizes are not product limits. Store measured results separately from aspirational targets;
the task handoff records which checks actually ran and passed.

### Engine benchmark, 27 October 2026

Run `node scripts/benchmark-knowledge-gap-atlas.mjs --output docs/visualizations/knowledge-gap-atlas-benchmark.json`.
The committed [raw measurement](knowledge-gap-atlas-benchmark.json) records Node 24.11.1 on
Windows, an Intel i5-12500H and 15.7 GiB system RAM. These measurements exercise the pure engine
through Vite's module loader; they do **not** measure browser storage throughput, end-to-end import,
map interaction or exact peak memory.

| Fixture           | Words counted | Concepts / associations | Extraction + graph |
| ----------------- | ------------: | ----------------------: | -----------------: |
| Repeated prose    |        10,000 |                53 / 148 |              87 ms |
| Repeated prose    |       100,000 |                53 / 148 |             341 ms |
| Repeated prose    |     1,000,000 |                53 / 148 |           3,554 ms |
| Varied vocabulary |       100,000 |         10,000 / 35,000 |           4,535 ms |

The varied-vocabulary run reached about 564 MiB observed process RSS, including Vite and
earlier cases in the same process. The contrast is useful: word count alone is not a reliable
estimate of graph memory. These figures are reproducible observations on one machine, not
performance promises for a visitor's phone or a guarantee of larger-corpus completion.

### Browser storage and recovery, 27 October 2026

With a Vite development server running on loopback, run:

```sh
node scripts/verify-knowledge-gap-atlas-storage.mjs --output docs/visualizations/knowledge-gap-atlas-storage-benchmark.json
```

This [recorded Chrome measurement](knowledge-gap-atlas-storage-benchmark.json) imported a
10,000,000-byte UTF-8 file containing 1,100,000 words of repeated English/Bengali prose with CRLF
line endings. The worker was forcibly terminated after 2,170 committed words, then resumed.
Final word, term and edge counts matched a clean extraction with different chunk boundaries.
Paged original text, source-inclusive NDJSON import/export and remapped evidence also matched.

On Chrome 156 / Windows with 16 reported logical processors, source import took 1,262 ms,
analysis including interruption took 10,804 ms, and the complete integrity probe took 17,367 ms.
No page errors were observed. Both synthetic projects were deleted by the probe.

The fixture has only 31 retained term aggregates and 59 association aggregates. It tests large
text ingestion, checkpoint integrity and portability, not high-vocabulary graph capacity. The
probe loads the real storage/worker modules directly in a fresh browser context; the separate
Playwright suite verifies the public application UI and remains usable against a production
preview. No production corpus is downloaded or used by either check.
