# Public-site link and navigation audit — 22 October 2026

The reported footer failures were reproduced as interaction defects in shared privacy/search UI.
The footer destinations themselves returned the expected pages. Repairs are on
`codex/site-link-repair`, isolated from the unfinished feature in the original checkout.

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

## Coverage and results

The complete rendered audit used an HTTP loopback production preview, four bounded workers,
explicit redirect limits, GET/body deadlines and streamed HTML limits. It reused the existing
source URL inventory, added both sitemaps and RSS, followed rendered links, preserved query states,
and checked fragments against actual IDs and named anchors. Raw scripts, comments and inert
templates do not invent links or fragment targets.

| Measure                                                          | Final result |
| ---------------------------------------------------------------- | -----------: |
| Source URL inventory records                                     |        1,250 |
| Internal destination URL states, including queries and downloads |        6,576 |
| HTML responses                                                   |        5,356 |
| Internal referring-link instances                                |      284,417 |
| Fragment references                                              |       15,939 |
| Internal HTTP/redirect/fragment failures                         |        **0** |
| Discovery warnings or truncated inventory                        |        **0** |
| Unique rendered external destinations                            |          544 |
| External reference instances                                     |       44,350 |
| External destinations verified                                   |          405 |
| Confirmed remaining broken external destinations                 |        **0** |
| External destinations still unverified                           |      **139** |

URL states include archive pagination and filters; they are not 6,576 distinct articles. The
published repository-backed content includes 709 canonical posts, eight Topic Headquarters and
18 resources. Source validation independently checks 738 authored references, canonical aliases,
route membership and exact static-file letter case, including on Windows.

The external checker treats publisher challenges, login/access restrictions, pending HTTP 202
responses, TLS failures and timeouts as unresolved. Successful status alone does not prove useful
content. Separately, all 26 rendered YouTube video IDs across 34 references returned valid public
oEmbed metadata. The external report lists remaining verification limits, including LinkedIn's
automated-access refusal and the exact McCarthy reference that could not be reached.

Production checking was confined to 19 fixed public URLs: the 17 footer destinations, the public
Notes sitemap, and its published `Vectors` page. All returned HTTP 200 with the expected page/feed.
There was no production corpus crawl. The comprehensive Notes crawl used local demo publications;
the live sitemap and `Vectors` check supplement that fixture coverage. Private/auth/API routes,
contact submission, email delivery, subscriptions and owner data were not exercised.

## Footer verification

All 23 footer controls passed pointer and keyboard activation at desktop and mobile sizes.
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

## Verification record

- `npm run build:full`: passed, including feature artifacts, committed notebooks, content/SEO/media,
  source links, production compilation, rendered discoverability and Barnum route assets.
- `npm run links:audit`: passed as the exact self-managed-preview CLI; inventory complete, zero issues.
- Source-validator fixtures: 25 passed; rendered-crawler fixtures: 14 passed; external-checker
  fixtures: 13 passed (52 link fixtures in total). The final source validator was rerun after the exact-case refinement and
  still recognises the same 738 valid references; that refinement changes no application output.
- `npm run check`: zero errors and zero warnings.
- Scoped ESLint and Prettier: passed. Architecture gate fixtures: 13 passed.
- Final navigation browser suite: 54 passed across desktop and mobile, zero failed.
- Existing privacy browser suite: 16 passed, including accessibility, consent withdrawal,
  media gating, private routes, mobile layouts and enlarged text.

Initial hash-based feature/sketch checks exposed CRLF checkout differences. The isolated worktree
was normalized to its committed LF text and configured to preserve that locally; the two scripts
whose committed blobs intentionally contain CRLF were retained unchanged. All 81 sketches then
verified from cache with zero rendered/changed variants, and the Barnum bank verified unchanged.
No historical asset regeneration or feature maintenance was needed.

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
  Third-party network availability does not gate ordinary builds or CI. Hosted workflow execution
  and required-status configuration are not established by these local checks.

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
publication content. External reconciliation preserves the original check timestamps and reuses
unchanged destination outcomes.

Architecture impact: yes
Architecture rationale: Reviewed the canonical architecture and updated sections 9 and 11 plus the
verification-flow diagram for dialog lifecycle, neutral privacy dismissal and the source/rendered/
browser/external checks and CI lanes. Existing state owners, routes, server boundaries and security
contracts are preserved; no foundational decision or new ADR is required.
