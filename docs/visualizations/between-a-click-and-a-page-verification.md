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
  hashes and pixel provenance verified. Capture explicitly rejects optional
  measurement in its isolated browser context and dismisses the native notice.
- `npm run build:site`: final production compilation passed. The initial publication
  check identified a missing visible Updated date; the conventional date stamp was
  added and the final site compiled again.
- `npm run validate:discoverability`: 721 published posts checked, with
  representative rendered routes verified, including the new article's visible
  publication date. Content, SEO, media, internal links, contrast and search-index
  generation also passed in the publishing lane.
- `npm run http-tcp:browser:test` against the production preview: 8 tests passed
  in 16.3 seconds, with no console errors or uncaught JavaScript errors. Tests cover
  actual no-JavaScript SVG gap state, keyboard timeline/steps/reset, cumulative byte
  counters and loss recovery, connection reuse, fresh browser cache, play/pause,
  offscreen suspension/resume, SPA teardown/remount, Still/OS reduced motion,
  theme changes, mobile crops and no horizontal overflow at 390 pixels.
- The visual test was rerun alone after correcting the capture harness's race with
  the native privacy notice: 1 test passed in 3.7 seconds. All six clean screenshots
  were inspected: desktop paper/night, phone coupling/server/buffer/overview.
- `git diff --check`: clean.

## Unrelated full-lane stop

`npm run build:full` was attempted. The HTTP geometry and asset-provenance checks,
memory-palace checks, maker-collection geometry/assets, OpenHIE, queue, missing-data
and piano artifact checks passed before the command stopped at
`barnum-lab:surface-bank` with:

> The committed Barnum v2 surface bank is stale. Regenerate it before release.

That existing generator compares its output to the committed file as raw text.
Its artifact is outside this change and was not regenerated. Consequently, the
complete `build:full` lane is not reported as passing. Production compilation and
the final publication validator were run separately and passed. Unrelated sketch
cache line-ending churn from the clean Windows checkout was excluded.

## Scope and architecture

The original checkout's unrelated work was preserved in place. All feature work
lives in the attached isolated worktree and uses the existing Markdown route,
feature-owned model, lazy Svelte UI and vendored Anatomy helpers. No new endpoint,
runtime dependency, external packet probe, persistence or global state owner was
introduced. The canonical architecture's HTTP/TCP section and data-flow diagram
were updated and checked against implementation; no foundational ADR was needed.

The article and explanatory copy follow the user's supplied writing instructions.
No installation of a missing `suvros-writing-style` file, live-site publication,
external social broadcast or successful complete feature build is claimed.
