# Mindmap Studio

Implementation record, 29 October 2026; reviewed 30 October 2026. Canonical article:
`/blog/visualizations/mindmap-studio`. The Markdown post uses the existing
Visualizations category and `collections: ['apps']`; Apps, Viz, search, RSS and
the sitemap retain one canonical article. This is an interactive feature change,
not the routine text-and-image publication lane.

## Ownership and model

- `src/lib/visualizations/mindmap-studio/` owns the version-one project contract,
  validation, ingestion, extractive analysis, original demonstration, persistence,
  export formats and graph layout.
- `src/lib/components/visualizations/mindmap-studio/` owns the source workspace,
  editor/history, inspector, Mind Elixir adapter and knowledge-graph view.
- `src/lib/server/mindmap-studio/` and `/api/mindmap-studio` own optional provider
  generation. They reuse the existing Prompt Atlas free-model configuration,
  pricing verification and atomic usage reservation; no new credential store or
  quota table is introduced.
- `src/lib/components/blog/MindmapFigure.svelte` owns published, source-free
  snapshots. It has a separate validation path and exposes no editing controls.

`StudioProject` is the state owner. Sources retain the selected text; nodes have
one parent for the mind-map hierarchy, and typed directed edges connect the same
nodes across branches. Evidence stores a source ID, exact quote and UTF-16
start/end offsets into that retained text. PDF offsets refer to extracted text,
not positions in the original PDF binary. Caption-range selection retains only
complete selected cues as the source. Definitions, private notes, review flags,
collapsed state, theme, analysis sections, coverage and generation mode travel
with editable JSON.

`explicit`, `inferred` and `speculative` classify the relationship to a source;
they do not establish truth. Explicit nodes and edges require exact evidence.
Inferred/speculative edges require a rationale. Validation rejects mismatched
quotes, duplicate IDs, missing references, extra fields, disconnected hierarchy
nodes and parent cycles. Cross-link cycles are allowed. Semantic support,
causality and research quality still need human review: exact wording alone
cannot validate an interpretation.

## Source handling and bounded analysis

| Boundary                | Current limit or behaviour                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Source set              | 8 sources; 100,000 UTF-16 characters each; 200,000 combined                                                                    |
| Editable project/import | 500 nodes, 1,500 edges, 2 MiB JSON                                                                                             |
| Evidence                | 16 excerpts per node/edge; 2,000 characters per quote                                                                          |
| Files                   | TXT, Markdown, SRT, VTT and text-based PDF; 10 MiB file ceiling                                                                |
| PDF                     | At most 100 selected physical pages; 100,000 extracted characters including marker allowance; 20-second document-task deadline |
| Local outline           | 24 / 60 / 120 source passages for Overview / Detailed / Research; cancellable worker with a 12-second browser deadline         |
| AI excerpts             | At most 48 trusted units, 1,200 characters each, with a combined 32,000-character excerpt budget                               |
| AI response             | At most 100 nodes, 150 relationships, 10 analysis sections, 10,000 output tokens; 2 MiB streamed upstream-response ceiling     |
| Editable history        | Up to 30 prior revisions; one browser-saved current project                                                                    |

The PDF library and its worker load only after file selection. It extracts text
locally, records physical-page markers, and does not perform OCR. Empty-page
placeholders are not evidence: segmentation omits them and analysis reports
missing text. SRT/VTT and simple timestamped transcripts preserve locators.
Untimestamped introductory prose is retained separately; recognised caption
headers and sequence numbers are metadata. The timestamp-range form supports
complete SRT/VTT cues and does not pretend to cut arbitrary video media.

A URL is a source reference, not a retrieval instruction. The app has no arbitrary
URL fetcher, video playback/transcription service, web research tool, scanned-PDF
OCR, login, cloud map store or multi-user collaboration. A bare link is rejected
when source content is needed.

Local mode is deliberately extractive. It groups exact passages by source,
shortens display labels, and optionally filters passages by focus words. It does
not infer arguments or create semantic edges. Coverage counts represented source
segments and identifies omitted passages. The default 43-node, six-theme example
is grounded in an original demonstration essay, not a fetched blog or research
publication; its eight cross-links are identified as interpretations.

AI mode segments before generation and prioritises focus matches plus distributed
context, taking turns across sources so one long document cannot consume the
entire budget. The application does not run a progressive multi-call analysis of
every chapter. It makes one bounded generation over the selected units, reports
partial coverage, and retains original sources for inspection. `completed` is the
number of units submitted to the model, not an independently verified count of
claims understood or fact-checked. Local and AI segmentation have different unit
sizes, so their counts are not comparable quality scores.

Provider output uses trusted unit IDs. The server reconstructs evidence quotes,
offsets and locators from submitted original text; the provider cannot invent
those fields. Unknown unit IDs and invalid project structure fail closed. The
provider wire format rejects a separate `rootId`; the server derives the canonical
root from exactly one node whose `parentId` is null. Zero or multiple roots still
fail, as do cycles, missing references and invalid evidence. The
same serialised JSON schema is supplied in the model-visible system prompt and
the provider's native structured-output option, with a nonempty rationale required
for every generated relationship. The
prompt requests themes, argument/evidence, assumptions, contradictions, open
questions, learning ideas and research opportunities where supported. It treats
source instructions as data and separates proposed extensions. Those semantic
instructions are guidance, not a factual-verification guarantee.

The portable research-prompt export is a separate manual workflow. It includes
the supplied sources and requests version-one project JSON from another model.
That JSON must still pass exact-evidence validation when imported; a model's
invented offsets are rejected rather than repaired silently.

## Provider and request boundary

`/api/mindmap-studio` is a public, consented free-analysis endpoint, not the
owner-authorised paid UML route. Its settings are the existing private
`PROMPT_ATLAS_AI_ENABLED`, `PROMPT_ATLAS_RATE_LIMIT_SALT`, `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY` and `AI_GATEWAY_API_KEY` or trusted Vercel OIDC
credentials. It pins `nvidia/nemotron-3.5-lightning-free` through NVIDIA only,
disables SDK retries/reasoning, and has no paid fallback, user-selected model,
credit purchase or billing mutation.

Every POST verifies the exact same Origin, JSON content type, valid UTF-8, a
strict consented input schema, streamed 2 MiB request limit, eight-second body
deadline and sixty-second operation deadline. It rechecks live endpoint prices
and structured-output support before reserving shared usage. Missing/unknown or
nonzero pricing, absent quota configuration, unavailable credentials and provider
failure preserve the existing browser map. The browser aborts analysis after
65 seconds and availability probes after 12 seconds. Late response IDs are
discarded; worker cancellation terminates local work.
Editing the working map cancels an active generation before accepting the edit.
The source form clears consent after submission and when its input revision changes.

The existing service-only `reserve_prompt_atlas_usage` RPC supplies a shared
50-request UTC daily pool and five requests per hourly rotating client identity.
Mindmap Studio uses the same identity as Prompt Atlas, so changing routes does
not reset that client allowance. Failed generations consume reservations. The
additional in-process guard permits six attempts/client/minute, sixty global
attempts/minute, four concurrent requests and one per client; these are local
admission controls, not cross-instance guarantees. Availability checks have a
separate bounded guard and a thirty-second price-result cache; POST always
rechecks independently.

The browser sends the full bounded source set to the same-origin server for
preparation. Only selected excerpts plus source metadata/focus go to the provider.
Consent describes the Gateway/NVIDIA transmission and possible NVIDIA retention
for model improvement. Application code does not persist source bodies server-side
or log provider/schema exceptions containing them. API and hook error responses
are private/no-store/noindex. Real deployment availability and provider retention
remain external conditions, not outcomes established by mocked tests.

Invalid-analysis responses include bounded, source-free diagnostic metadata:
an enumerated validation stage and reason, plus an optional allowlisted structural
field path. Unknown field names, raw validation messages, source IDs, node labels,
quotations and provider output are excluded. Unexpected failures use a fixed
generic diagnostic. These diagnostics improve rejection diagnosis without relaxing
schema, evidence or topology validation.

## Rendering, persistence and exports

`mind-elixir@5.15.1` is a browser-loaded dependency for the hierarchical canvas.
Its adapter preserves project IDs, hierarchy and epistemic metadata; the app owns
history, with library undo and default context menus disabled. The themed root,
wrapped labels, branch families and custom curves share paper/night palettes.
The native SVG graph uses finite seeded D3 layout followed by rectangular
collision resolution; physics does not continue while a reader inspects it.
Pan/zoom, selection, filters and graph drag positions are local view state. The
outline provides a second route to concepts and reparenting. On narrow screens,
the initial viewport favours readable labels (at least 55% mind-map scale and
approximately 65% graph scale); the explicit Fit controls show the entire map.

Edits enable debounced IndexedDB autosave into the feature's
`suvro-mindmap-studio` database. The initial untouched demonstration is not saved.
The current saved project is restored on return. Storage operations are serialised
and resolve after commits; browser-storage failure is visible and offers JSON
backup. Removing saved browser data does not discard the open in-memory map and
disables saving until another edit. There is no cloud synchronisation or remote
publication when saving.

Editable JSON includes original source text, quotations and private notes.
Markdown contains labels, descriptions, analysis and source locations; descriptions
may repeat passages. Mermaid uses generated IDs and escaped labels. Mind-map PNG
uses `@mind-elixir/export-mindmap@0.1.11`; portable SVG is available from the
Knowledge graph, not the hierarchical renderer. Graph SVG contains escaped
text/shapes with no executable HTML or external resources. PNG rasterisation is
bounded to an 8,192-pixel longest edge and 24 million pixels. Exported content is
still user-supplied or derived text and needs review before sharing.

## Published snapshots

Public snapshot JSON omits source bodies, source URL metadata, evidence quotes/offsets,
private notes and analysis sections. It preserves node descriptions and edge
rationales, which can contain source-derived content. Exporting a snapshot does
not publish it. Keep the separate editable project privately for future revision.

After review, store the downloaded `.public.json` under an importable repository
directory, for example `src/lib/data/published-maps/my-map.json`, and explicitly
import it in the article:

```svelte
<script>
	import MindmapFigure from '$lib/components/blog/MindmapFigure.svelte';
	import map from '$lib/data/published-maps/my-map.json';
</script>

<MindmapFigure data={map} caption="A map of the article's main ideas and relationships." />
```

`MindmapFigure` validates a strict public contract, renders a complete readable
SSR outline and relationships in native details (collapsed initially; use
`outlineOpen={true}` to start expanded), and loads the map/graph only when a reader chooses
Explore. All supplied text uses Svelte text rendering; no raw HTML, scripts or
remote URLs are interpreted. Interactive views are read-only and cannot edit the
saved snapshot. The component explicitly warns that source evidence is not
bundled and that status labels are the author's classifications. The shipped
article includes `src/lib/data/mindmap-studio-example.json` through this component
as an embedded publication example; its complete outline remains in SSR HTML.

The renderer-only `snapshotForDisplay` projection supplies empty source/evidence
arrays without fabricating evidence. Its `readonlySnapshot` marker intentionally
makes editable-project validation fail. It must never enter authoring persistence,
editable export or AI analysis. The figure uses explicit article imports rather
than a global mdsvex import, keeping this runtime out of unrelated article bundles.

## Verification and current limits

Verified on 30 October 2026 against implementation commit
`09b7f84ef8ffb532394ee4bbf5902eceda3c92be`, pushed to `origin main`.
Vercel deployment `dpl_5hL3kb9i4PnT88MDypmFg8Htim45` is READY and serves the
[live canonical article](https://www.suvroghosh.in/blog/visualizations/mindmap-studio).

- **Actual hosted AI flow:** one normal consented UI POST returned HTTP 200 in
  15.3 seconds. Its project contained nine concepts, nine relationships, six
  analysis sections and eighteen exact citations. Both supplied sources were
  preserved (1,471 text characters and 499 transcript characters; 1,970 combined),
  and all nine prepared segments were submitted. The canonical domain validator
  passed; transcript evidence retained `00:10`, `00:35` and `01:00` locators.
- **Rendered and persisted result:** the actual map rendered nine nodes and the
  graph rendered nine nodes/nine edges. A timestamped quotation was opened and
  checked in context. Consent reset after submission; save/reload restored the
  nine-node project. The browser reported no exceptions. The API response had
  private/no-store/noindex headers.
- **Automated checks:** all 79 focused tests passed across seven files (23
  domain/public-format, 52 server and four renderer). The final repository
  `npm run check` on this implementation passed with zero errors and zero
  warnings. Focused lint/format/whitespace checks passed.
- **Live frontend acceptance:** all eleven browser cases passed on the production
  domain in 1.2 minutes with no runtime errors. They cover editing/evidence/undo/
  persistence, local extraction and JSON round trips, graph filtering/inspection,
  PNG/SVG export, native rename/collapse, the read-only published figure, unavailable
  source links, the production PDF worker and physical-page/blank-PDF handling,
  SRT cue scope, and phone use. The responsive regression checked seven widths
  from 320 to 1,600 pixels, one page heading and Newsreader styling. These tests
  ran on `baa4ee39`; subsequent fixes changed server code only. Desktop, night,
  graph and phone captures were produced, with desktop/night/phone visual review.
- **Build and discovery:** feature-artifact checks, notebook preparation, the full
  content/prebuild stages, the site build and local Barnum route-asset budget
  passed in stages. Hosted discoverability checked 748 published posts and
  rendered/verified representative routes after the heading/metadata correction.
  The canonical article returned HTTP 200 with one H1 and correct canonical
  metadata; Apps and the public catalogue include it. These staged and hosted
  successes do not assert that one local `npm run build:full` invocation completed
  every stage successfully.

Three earlier hosted generations were rejected with `invalid_analysis` while
preserving the previous map. Source-free diagnostics isolated the redundant,
inconsistent provider `rootId`. The current implementation supplies one schema
to both the model prompt and native response format, requires relationship
rationales, and derives the canonical root from exactly one null-parent node.
Strict evidence and topology validation remained in place through the successful
production retry.

The actual provider receipt and screenshots are local verification artefacts under
`.tmp/mindmap-production-proof-09b7f84e/`. This proves the tested end-to-end
workflow, not universal analysis quality: evidence fidelity does not independently
validate an interpretation, full coverage here applies to this small fixture, and
the free provider can become unavailable. Source access, excerpt budgets, quotas,
no-OCR/no-fetch behaviour and publication privacy limits above remain applicable.

Reproducible focused commands:

```text
npm run mindmap-studio:test
npm run check
npm run mindmap-studio:browser:test
npm run build:full
git diff --check
```

The existing forensic-audit gaps, including absent security commands where
applicable, are not implemented safeguards of this feature.

The browser configuration builds and starts a production preview by default. When
using an existing preview, set `PLAYWRIGHT_REUSE_SERVER=1` and, if necessary,
`MINDMAP_STUDIO_BASE_URL` to its origin before running the browser command.

See [ADR 0021](../architecture/decisions/0021-mindmap-studio-source-model.md) and
the [canonical architecture](../architecture/ARCHITECTURE.md#mindmap-studio).
