# HTTP/TCP instrument verification

Verified locally on 23 October 2026 on branch `codex/http-tcp-request-bench`.
Production preview: `http://127.0.0.1:4296/blog/visualizations/between-a-click-and-a-page`.

## Passed

- `npm run http-tcp:test`: 10 tests, including 72 settings combinations with exact
  timing accounting, ordered delivery, no duplicated bytes, cache/reuse bypasses
  and bounded malformed inputs.
- `npm run check`: zero errors and zero warnings.
- Focused ESLint over the three new Svelte components, model/tests, asset renderer
  and browser harness: clean.
- `npm run build-workflow:test`: 15 tests. The routine publishing lane remains
  separate from the feature-artifact lane, and the new artifact checks participate
  in the latter.
- `npm run http-tcp:geometry`: 145 true recorded solids; all audit checks zero,
  with 522 measured overlaps/order rules. Both Anatomy line checks report zero
  floating ends. Static audit and separate token-route bounds are distinguished
  from a complete dynamic collision audit.
- `npm run http-tcp:assets:check`: actual article capture, 1200 × 630 PNG, source
  hashes and pixel provenance verified. Capture dismisses the current native
  privacy notice without storing a choice in its isolated browser context. The
  social image was recaptured from the final integrated production preview;
  its image manifest, gallery entry and media validation were refreshed.
- `npm run build:full`: all feature-artifact checks, notebook preparation, content
  generators and validators, production compilation, discoverability validation
  and the final Barnum route-asset audit passed. Both committed notebook renders
  also pass `npm run notebooks:verify` without unrelated regeneration.
- After that full build, upstream PR #15 changed only the comment-form timeout
  and its architecture description. It was merged without changing this feature.
  The final integrated Svelte check again reported zero errors and warnings, and
  all 82 comment tests passed.
- `npm run validate:discoverability`: 724 published posts checked, with
  representative rendered routes verified, including the new article's visible
  publication date. Content, SEO, media, internal links, contrast and search-index
  generation also passed in the publishing lane.
- `npm run http-tcp:browser:test` against the production preview: 8 tests passed
  in 16.4 seconds, with no console errors or uncaught JavaScript errors. Tests cover
  actual no-JavaScript SVG gap state, keyboard timeline/steps/reset, cumulative byte
  counters and loss recovery, connection reuse, fresh browser cache, play/pause,
  offscreen suspension/resume, SPA teardown/remount, Still/OS reduced motion,
  theme changes, mobile crops and no horizontal overflow at 390 pixels.
- The local browser fixture supplies an empty Vercel Insights script because Vite
  preview does not serve that platform URL. This fixture applies only to loopback
  hosts; production continues to use Vercel's actual script. All six clean final
  screenshots were inspected: desktop paper/night, phone coupling/server/buffer/overview.
- `git diff --check`: clean.

## Resolved release-build failures

The first full-lane attempt stopped at `barnum-lab:surface-bank` with:

> The committed Barnum v2 surface bank is stale. Regenerate it before release.

The committed corpus was current. Git's Windows checkout converted its LF text
to CRLF while the generator emitted LF. The freshness check now normalizes CRLF
for comparison and remains read-only. Two regression tests invoke the actual
generator: LF and CRLF both pass unchanged; modified and missing output still fail.
The complete Barnum suite passed (82 model tests, one existing skipped test, plus
editorial, corpus, route and performance checks). The final integrated route-audit
suite passed all five tests.

Later Bias, BZ and prior-authorization checks exposed the same checkout conversion
in JSON artifacts, including metadata authenticated by exact SHA-256 hashes.
`.gitattributes` now preserves LF for JSON and JSON-formatted notebook sources.
Every existing JSON blob already used LF; no corpus, layout or publication plate
needed regeneration. A checkout fixture with `core.autocrlf=true` confirmed that
the Bias layout, BZ metadata and synthetic FHIR JSON remain byte-identical to Git.
Strict JSON and binary checksum checks remain intact. The full lane subsequently
passed, including the Barnum initial-asset budget and lazy comments boundary.

## Scope and architecture

The original checkout's unrelated work was preserved in place. All feature work
lives in the attached isolated worktree and uses the existing Markdown route,
feature-owned model, lazy Svelte UI and vendored Anatomy helpers. No new endpoint,
runtime dependency, external packet probe, persistence or global state owner was
introduced. The canonical architecture's HTTP/TCP section and data-flow diagram
were updated and checked against implementation; no foundational ADR was needed.

The article and explanatory copy follow the user's supplied writing instructions.
No missing `suvros-writing-style` file was installed. Deployment status and the
live-site checks are recorded in the release handoff; social broadcasting is
outside this task.

Architecture impact: yes

Architecture rationale: the canonical architecture was reviewed and its HTTP/TCP
section and data-flow diagram were updated for the existing pure-model/lazy-UI
extension. The localized Barnum comparison and checkout rules change build
portability without changing runtime boundaries or requiring a foundational ADR.
