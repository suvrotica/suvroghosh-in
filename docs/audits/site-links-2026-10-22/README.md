# Public-site link and navigation audit — 22 October 2026

The reported footer failures were reproduced as interaction defects in shared privacy/search UI.
The footer destinations themselves returned the expected pages. The initial repairs were
developed in the isolated `codex/site-link-repair` worktree and released in `c6189ed6`.
The records below distinguish that initial verification from the later published corpus and
the transition correction and its final local verification.

## Repairs

1. **Privacy dialog retained its modal top layer after navigation.** Following its full-policy
   link opened `/privacy` while the dialog remained open and blocked the destination. The shared
   component now closes its dialog before client navigation, including same-URL navigation and
   history changes. Escape still restores focus to the opener.
2. **Command-palette search left the results behind an open modal.** Both button and Enter GET
   submissions now close the palette before navigation. The query, results, ordinary links and
   history remain usable.
3. **The first-visit privacy notice covered footer controls without a neutral dismiss action.**
   Its accessible 44-pixel close button dismisses it for the current layout lifetime. This writes
   no consent choice and enables no optional service. Footer settings remain available; immersive
   essays retain their compact settings trigger. Reloading an undecided visit shows the notice.
4. **Five external references in four articles were corrected:** the mistyped Tulino/Verdú DOI,
   the Slaney tomography book, Merrell's dissertation, and the obsolete Argonaut wiki. Replacements
   were verified against publisher, author or institution sources. See the
   [external audit](external-source-audit.md) for evidence and exact destinations.

The four article revision dates were advanced to 22 October. Required tag/revision manifests and
word-cloud output were refreshed; the generator updated four affected word-cloud entries and
skipped the other 716. Normalized body hashes match the expected URL/citation edits, with no other
prose changes. Existing sketch, notebook and feature artwork was preserved.

## Initial coverage and results

The complete rendered audit used an HTTP loopback production preview, four bounded workers,
explicit redirect limits, GET/body deadlines and streamed HTML limits. It reused the existing
source URL inventory, added both sitemaps and RSS, followed rendered links, preserved query states,
and checked fragments against actual IDs and named anchors. Raw scripts, comments and inert
templates do not invent links or fragment targets.

This initial audit preceded the concurrent Memory Palace publication. Its counts and external
availability results describe that earlier corpus, not every URL in the later hosted build.

| Measure                                                          | Initial result |
| ---------------------------------------------------------------- | -------------: |
| Source URL inventory records                                     |          1,250 |
| Internal destination URL states, including queries and downloads |          6,576 |
| HTML responses                                                   |          5,356 |
| Internal referring-link instances                                |        284,417 |
| Fragment references                                              |         15,939 |
| Internal HTTP/redirect/fragment failures                         |          **0** |
| Discovery warnings or truncated inventory                        |          **0** |
| Unique rendered external destinations                            |            544 |
| External reference instances                                     |         44,350 |
| External destinations verified                                   |            405 |
| Confirmed remaining broken external destinations                 |          **0** |
| External destinations still unverified                           |        **139** |

URL states include archive pagination and filters; they are not 6,576 distinct articles. This
initial repository-backed corpus included 709 canonical posts, eight Topic Headquarters and
18 resources. Source validation independently checked 738 authored references, canonical aliases,
route membership and exact static-file letter case, including on Windows.

The external checker treats publisher challenges, login/access restrictions, pending HTTP 202
responses, TLS failures and timeouts as unresolved. Successful status alone does not prove useful
content. Separately, all 26 rendered YouTube video IDs across 34 references returned valid public
oEmbed metadata. The external report lists remaining verification limits, including LinkedIn's
automated-access refusal and the exact McCarthy reference that could not be reached.

## Later hosted coverage and transition follow-up

The [feature-artifacts job for run 39814349282](https://github.com/suvrotica/suvroghosh-in/actions/runs/39814349282/job/119948787575)
checked commit `f1d62a1c4de39255f3b53ae46a1f39132d60b21d`, which includes the Memory Palace
publication. Its full-build step and rendered-crawl step both passed on 22 October. Source
validation passed at 16:33 UTC with 738 references across 710 published posts, 710 canonical
posts, 13 aliases, eight published topic routes, 18 resource routes and 32 static routes.
The completed rendered crawl reported at 16:36 UTC:

| Measure                                                          | Hosted result |
| ---------------------------------------------------------------- | ------------: |
| Source URL inventory records                                     |         1,252 |
| Internal destination URL states, including queries and downloads |         6,582 |
| HTML responses                                                   |         5,361 |
| Internal referring-link instances                                |       284,709 |
| Fragment references                                              |        15,960 |
| Unique rendered external destinations                            |           550 |
| Excluded destinations                                            |         **0** |
| Internal HTTP/redirect/fragment failures                         |         **0** |

The initial 405 verified and 139 unresolved external results apply only to the earlier 544
destinations. A separate bounded check at 17:03 UTC examined the six Memory Palace article
destinations absent from that initial inventory: one passed, five remain unresolved, and none
was confirmed broken. These six source-derived additions are consistent with the hosted count
of 550; the complete hosted URL map was not available for an exact set comparison. See the
[supplementary results](external-source-audit.md#supplementary-memory-palace-check) for all six
URLs, outcomes and provenance. The initial 544-result report and its timestamps were preserved.

The same hosted job later failed its browser step: 43 tests passed and 11 desktop tests failed;
all 27 mobile tests passed. Failures involved footer history/reload or dialog/history sequences,
with independent View Transition promise rejections and, in some cases, a changed URL before
the destination content committed. The overall job therefore did not pass.

Commit `f718d624`, adopted from the concurrent release, already implements the shared
`runNavigationTransition` helper and adds nine unit cases. It observes `ready`,
`updateCallbackDone`, `finished` and navigation cancellation, releases navigation when an
optional transition fails or is skipped, and handles partial API implementations. The earlier
inline correction was discarded to avoid duplicating this implementation. The browser
harness sets motion through `contextOptions`, defaults to `no-preference` to exercise native
transitions, and retains an explicit reduced-motion regression. The combined harness also
waits for the destination heading and render commit before subsequent history actions and
adds native completion, skipped-ready and rejected-callback scenarios.

The expanded browser matrix covers 64 scenarios. Its first complete CI-mode run passed 61 and
failed three test observations: two no-JavaScript cases waited for an animation callback that
cannot run, and a mobile search case read an SSR card's URL before async Pagefind replaced that
card. The corrected harness skips the frame wait only for ordinary no-JavaScript anchors,
waits for the existing search-completion announcement, pins a result's exact URL and title,
and verifies that article heading. All four affected desktop/mobile search and no-JavaScript
cases passed their focused CI-mode rerun, with zero uncaught browser errors. This verifies all
64 scenarios across the full run and focused rerun; it is not a single 64-pass invocation.
The initial failure reports, screenshots and traces are retained separately.

The full feature, notebook and content preparation/validation steps passed, but the subsequent Vite compilation
of the superseded inline implementation was intentionally canceled to adopt `f718d624`.
That interrupted `build:full` is not recorded as passed. Final verification of the adopted
implementation passed `npm run build:site`, `validate:discoverability` and the Barnum route-asset
check. Svelte/TypeScript checking reported zero errors and warnings; scoped lint and formatting
passed. The later `045e408d` update changes only critical-workflow path matching, so the compiled
application is unchanged. The later `6c85f58a` test/workflow update is also retained; its feature
workflow now watches the navigation spec explicitly. These corrections preserve the existing
nonfatal motion strategy.

Initial production URL checking was confined to 19 fixed public URLs: the 17 footer destinations, the public
Notes sitemap, and its published `Vectors` page. All returned HTTP 200 with the expected page/feed.
There was no production corpus crawl. The comprehensive Notes crawl used local demo publications;
the live sitemap and `Vectors` check supplement that fixture coverage. Private/auth/API routes,
contact submission, email delivery, subscriptions and owner data were not exercised.

## Initial footer verification

All 23 footer controls passed the initial pointer and keyboard checks at desktop and mobile sizes.
External-tab interaction used fixtures with independently expected account URLs; destination
availability and identity were checked separately. Mailto activation was intercepted without
sending a message.

| Footer item             | Target or action               | Result                                                       |
| ----------------------- | ------------------------------ | ------------------------------------------------------------ |
| SuvroGhosh.IN           | `/`                            | Pass; live 200                                               |
| Start here              | `/start-here`                  | Pass; live 200                                               |
| Writing                 | `/writing`                     | Pass; live 200                                               |
| Search & archive        | `/blog`                        | Pass; live 200                                               |
| Topics                  | `/topics`                      | Pass; live 200                                               |
| Handwritten notes       | `/notes`                       | Pass; live 200                                               |
| Field Kit               | `/resources`                   | Pass; live 200                                               |
| Visualizations          | `/blog/visualizations`         | Pass; live 200                                               |
| Games                   | `/blog/games`                  | Pass; live 200                                               |
| Images & sketches       | `/images`                      | Pass; live 200                                               |
| Work & experiments      | `/projects`                    | Pass; live 200                                               |
| About Suvro             | `/about`                       | Pass; live 200                                               |
| Résumé & career history | `/resume`                      | Pass; live 200                                               |
| Contact                 | `/contact`                     | Pass; live 200; form not submitted                           |
| Substack newsletter     | `suvroghosh.substack.com`      | Pass; correct publication; live 200                          |
| LinkedIn                | `/in/suvro-ghosh-78a5aa278`    | Activation/account identity pass; direct HTTP 999 unresolved |
| YouTube                 | `@SuvroGhoshIN`                | Pass; correct channel; live 200                              |
| X                       | `@suvroghoshin`                | Pass; correct account; live 200                              |
| RSS feed                | `/rss.xml`                     | Pass; XML validated; live 200                                |
| Privacy & cookies       | Open settings dialog           | Pass; keyboard/focus/navigation/dismissal checked            |
| Privacy note            | `/privacy`                     | Pass; live 200                                               |
| contact@suvroghosh.in   | `mailto:contact@suvroghosh.in` | Pass; no message sent                                        |
| Sitemap                 | `/sitemap.xml`                 | Pass; XML validated; live 200                                |

## Initial verification record and CI follow-up

- `npm run build:full`: passed, including feature artifacts, committed notebooks, content/SEO/media,
  source links, production compilation, rendered discoverability and Barnum route assets.
- `npm run links:audit`: passed as the exact self-managed-preview CLI; inventory complete, zero issues.
- Source-validator fixtures: 25 passed; rendered-crawler fixtures: 15 passed; external-checker
  fixtures: 13 passed (53 link fixtures in total). The final source validator was rerun after the exact-case refinement and
  still recognises the same 738 valid references; that refinement changes no application output.
- `npm run check`: zero errors and zero warnings.
- Scoped ESLint and Prettier: passed. Architecture gate fixtures: 13 passed.
- Initial local navigation browser suite: 54 passed across desktop and mobile, zero failed.
  This result predates the hosted failures and expanded transition coverage described above.
- Existing privacy browser suite: 16 passed, including accessibility, consent withdrawal,
  media gating, private routes, mobile layouts and enlarged text.

The first hosted content-links run passed its fixtures and routine build, then exposed ANSI colour
codes inside Vite's preview URL. Startup detection now strips terminal control characters; a
regression uses the exact emitted CI line. The complete local audit was repeated with
`FORCE_COLOR=1` to verify the actual CLI startup and crawl together.

A subsequent CI browser-launch failure came from installing full Chromium with `--no-shell`
while requesting the standalone headless shell. Commit `f1d62a1c` selects the `chromium` channel
in CI, retaining local Chrome and an explicit `PLAYWRIGHT_CHANNEL` override. The hosted job
above successfully launched the browser and reached the 43-pass/11-fail navigation result;
the channel correction does not establish that the application regressions passed.

Initial hash-based feature/sketch checks exposed CRLF checkout differences. The isolated worktree
was normalized to its committed LF text and configured to preserve that locally; the two scripts
whose committed blobs intentionally contain CRLF were retained unchanged. All 81 sketches then
verified from cache with zero rendered/changed variants, and the Barnum bank verified unchanged.
No historical asset regeneration or feature maintenance was needed.

## Follow-up diagnosis: audio requests and analytics

On 22 October, the reported audio 404s were traced to optional narration-manifest requests for
`the-machine-can-explain-everything-except-how-i-get-paid`, `the-new-mantra` and
`the-error-bar-around-a-man`. At `f1d62a1c`, none has a published narration manifest or audio
directory in the source or built output; no generated availability index advertises one.
The shared TTS component probes for that optional manifest and falls back to device speech
when it is absent. The four sampled production 404 records identify Googlebot/Bingbot agents;
this does not describe all production traffic. A bounded check found all three article pages
returning 200 with the expected headings. Evidence: `.codex-artifacts/audio-404-requests.jsonl`
and `.codex-artifacts/audio-article-page-checks.json`. This is an optional-media lookup finding,
not a verified repair or a missing article route.

The analytics comparison also crosses a measurement-policy change. Commit `2d2c3447`, authored
on 22 October at 02:42 IST, changed optional analytics to explicit consent. Its main merge
`b71e4840` has a successful Production deployment record at 03:53 IST; that establishes
deployment completion, not the exact historical canonical-alias cutover. Fresh, declined or
expired choices now send no optional measurement, and consent grants do not backfill earlier
unconsented views. Bounded browser checks observed no measurement before consent, intercepted
page-view dispatch after consent, and no further dispatch after withdrawal; they sent no
telemetry. Evidence: `.codex-artifacts/live-analytics.log`, `live-analytics-human.log` and
the [Production deployment status record](https://api.github.com/repos/suvrotica/suvroghosh-in/deployments/7238731024/statuses).
The screenshot's 79% decline therefore cannot establish a 79% loss of actual visitors from
consent-only counts. No tracking-policy change was made during this diagnosis.

## Regression protection and repetition

- `validate:links` remains in the publishing prebuild. Markdown, Svelte/TypeScript/JSON registries,
  same-site absolute/protocol-relative/relative paths, canonical resources and exact static-file
  case are covered. Code examples and unused Markdown reference definitions are excluded.
- `links:audit` runs comprehensively only on loopback and fails on incomplete discovery,
  malformed destinations, HTTP failures, private redirects and missing fragment targets.
- `links:browser:test` covers footer, desktop/mobile header, palette search/shortcuts, modal
  lifecycle, history, fresh consent, compact essay settings, Meaning Map exit and no-JavaScript
  ordinary anchors. Service workers are blocked and optional/external requests are controlled.
- The feature-artifacts workflow runs link fixtures, the local crawl and browser navigation after
  its full build. The separate content-links workflow gives routine articles/resources/static
  assets the routine build and local HTTP audit, without invoking the feature collection.
- `external-links:audit` is separately runnable against the local crawler's URL/reference map.
  Explicitly incomplete or warned crawl inputs fail before any external request or output report.
  Third-party network availability does not gate ordinary builds or CI. The hosted execution
  described above establishes its individual successful steps, not a successful overall browser
  job. Required-status configuration remains unverified.

```sh
npm run links:test
npm run check
npm run build:full
npm run links:audit
npm run links:browser:test
npm run external-links:audit
```

Raw evidence is under `.codex-artifacts/`: `site-links.json`, `external-links-final.json`,
`link-build-full-final.log`, `navigation-final.log`, browser traces/screenshots, live-footer/Notes
responses and normalized article-body hashes. It is local diagnostic output rather than committed
publication content. Those initial local files retain their original scope; the later hosted
counts above come from the completed job's decoded log text. External reconciliation preserves
the original check timestamps and reuses unchanged destination outcomes.

Architecture impact: yes
Architecture rationale: Reviewed the canonical architecture and updated sections 9 and 11 plus the
verification-flow diagram for dialog lifecycle, neutral privacy dismissal and the source/rendered/
browser/external checks and CI lanes. Existing state owners, routes, server boundaries and security
contracts are preserved; no foundational decision or new ADR is required.
