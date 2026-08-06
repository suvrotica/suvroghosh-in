# Accessibility and semantic structure

Audit date: 2026-08-06 (Asia/Calcutta, UTC+05:30)

## Verdict

The representative pages have a sound semantic baseline, but the audit found three repeatable accessibility defects:

1. The résumé has nine small-text contrast failures in every mobile and desktop run.
2. The Fractal Atlas has nine small-label contrast failures in every mobile and desktop run.
3. Visible text and accessible names disagree in the desktop header and in five mobile Fractal Atlas tabs.

Automated scores of 100 on several desktop routes do not erase the header failure: Lighthouse assigns no category weight to some diagnostic audits. This is not a WCAG conformance statement.

## Method

- Lighthouse 13.4.1 accessibility category, three telemetry-blocked mobile and desktop navigations for each of eight representative URLs.
- A telemetry-blocked Playwright probe at a 390 × 844 mobile viewport with `prefers-reduced-motion: reduce`.
- Up to 40 Tab presses per page, recording distinct top-document focus stops and whether CSS exposed an outline or box shadow.
- DOM checks for language, landmarks, H1 count, heading-level skips, image `alt` attributes, perceivable focusable names, canvas semantics, and horizontal overflow.
- Source inspection of layout, video, visualization, focus, reduced-motion, and cleanup implementations.
- Existing repository validators: `npm run validate:contrast` and `npm run validate:media`.

The Playwright probe completed 8/8 pages with HTTP 200 and zero completed Vercel telemetry requests.

## Lighthouse results

These are medians of three runs. Failure labels are the audit IDs observed in at least one accepted run in the group.

| Page                      | Mobile score / failures                              | Desktop score / failures                             |
| ------------------------- | ---------------------------------------------------- | ---------------------------------------------------- |
| Homepage                  | 100 / none                                           | 100 / `label-content-name-mismatch`                  |
| Résumé                    | 95 / `color-contrast`                                | 96 / `color-contrast`, `label-content-name-mismatch` |
| Consulting                | 100 / none                                           | 100 / `label-content-name-mismatch`                  |
| Normal long article       | 100 / none                                           | 100 / `label-content-name-mismatch`                  |
| Media-heavy article       | 100 / none                                           | 100 / `label-content-name-mismatch`                  |
| Archive                   | 100 / none                                           | 100 / `label-content-name-mismatch`                  |
| Lightweight visualization | 100 / none                                           | 100 / `label-content-name-mismatch`                  |
| Heaviest visualization    | 97 / `color-contrast`, `label-content-name-mismatch` | 97 / `color-contrast`, `label-content-name-mismatch` |

Across all 48 reports, `label-content-name-mismatch` failed in 27 reports and `color-contrast` failed in 12. Repetition across all three runs establishes that these are deterministic rendered defects, not one-run noise.

## Confirmed defects

### P2 — Résumé small text narrowly misses contrast

Every résumé run reported nine nodes at **4.46:1** against a required **4.5:1**:

- eight experience-date labels using `text-xs font-bold ... text-neutral-500` on `#1e1b18`;
- one 12 px publication citation using `text-xs text-neutral-500` on the same background.

The rendered foreground was `#898176`. Raise the dark-theme text token or use the next stronger neutral for these two selectors, then test the rendered page at 12 px. The repository contrast validator passed four themes and seven essay inks, which shows that its token-level coverage does not include this rendered Tailwind combination.

### P2 — Fractal Atlas tiny labels miss contrast

Every Fractal Atlas run reported nine nodes:

- five family-group headings at **4.20:1**, `#767887` on `#12141c`, rendered at about 8.64 px bold;
- four readout labels at **4.31:1**, `#747684` on `#0b0d13`, rendered at about 8.32 px bold.

Increase contrast and consider increasing the very small type size. Retest every responsive breakpoint because the same selectors fail on both profiles.

### P2 — Accessible names omit visible text

On every desktop route, the header brand exposes visible text `SuvroGhosh.IN` and `সুভ্র ঘোষ`, while its `aria-label` is only `SuvroGhosh.IN — home`. Voice-control and speech-input users need the visible label to be contained in the accessible name. Include both visible strings or remove the overriding label when the link text already conveys the destination.

On mobile Fractal Atlas, five visible tab labels — `Map`, `Colour`, `Rule`, `Limits`, and `Trips` — are overridden by different `aria-label` values such as `Explore` and `Palette laboratory`. Preserve each visible word in its accessible name; supplementary context can move to `aria-describedby` or a title/description.

### Manual check — iframe focus visibility

The 40-step top-document focus sample found visible indicators on every observed distinct stop except one résumé step whose active element was a YouTube iframe. Cross-origin player focus cannot be inspected reliably from the parent document, so this is not recorded as a confirmed failure. Manually Tab through all three players in Chrome, Firefox, Safari, and a screen reader. The recommended click-to-play replacement should provide its own clearly focused button before the external player is created.

## Semantic and keyboard baseline

All eight runtime probes reported:

- `lang="en"` on the document element;
- exactly one `<main>` and one `<h1>`;
- no adjacent heading-level skips in DOM order;
- no image missing an `alt` attribute;
- no perceivable focusable element without a programmatically derived name in the probe's DOM heuristic;
- no global horizontal overflow at the 390 px probe width;
- reduced-motion media preference active;
- zero custom button/link/checkbox/slider roles forced out of the Tab order by negative `tabindex`.

The layout provides route-appropriate skip links to `#main-content`. Source review also found deliberate `:focus-visible` styling, reduced-motion CSS, and one main landmark per route shell.

The focus sample is bounded. It covered all or nearly all short-page stops but only the first 40 distinct positions on long articles, and 35 distinct stops on the control-dense Fractal Atlas. It cannot prove every late-page path is operable.

## Visualization semantics

The lightweight shader creates a focusable canvas with an explicit accessible name and implements Arrow keys, Home, and Space. Its source also provides a static poster, caption, visible explanatory article, playback controls, and a `noscript`/WebGL fallback path.

The Fractal Atlas places render canvases behind labelled `role="application"` wrappers, implements keyboard/touch instructions and controls, exposes status messages, and keeps the mathematical article, figures, captions, FAQ, hero image, and `noscript` explanation available as ordinary HTML. The visual render canvases are deliberately `aria-hidden`; users interact with the named application surface and form controls rather than an unnamed bitmap.

Canvas/application patterns are complex and automated naming checks are insufficient. Manually test the two visualizations with NVDA/Firefox, NVDA/Chrome, VoiceOver/Safari, keyboard only, zoom at 200% and 400%, and Windows forced colours.

## Media validation

`npm run validate:media` passed 1,438 references against 1,523 assets and checked the media-review metadata used by the selected posts. It warned that 20 images exceed the 0.73 MiB review budget. Passing this validator does not prove that every alternative text is useful, that decorative images are correctly classified, or that video captions/transcripts are complete.

The three résumé YouTube figures have titles and captions, but the audit did not verify the videos' hosted caption tracks or transcript accuracy. That requires editorial review in YouTube or the source media account.

## Required manual acceptance checks

1. Re-run Lighthouse after the two contrast fixes and accessible-name fixes; require the failure node counts to reach zero on both profiles.
2. Traverse every header, mobile menu, résumé player/preview, archive card, article action, table of contents, visualization control, and dialog with keyboard only.
3. Confirm the focused element remains visually apparent at 200% and 400% zoom and in forced-colours mode.
4. Test the skip link after route navigation, not only on a fresh load.
5. Verify screen-reader announcements for visualization status, pause/start, parameter changes, errors, and fullscreen state.
6. Review every selected video's captions and provide a transcript-like text alternative where the video carries information not present in surrounding prose.

## Boundaries

- Lighthouse/axe can find deterministic rule violations; it cannot assess comprehension, reading order quality in every assistive technology, caption accuracy, or full keyboard usability.
- The DOM accessible-name heuristic includes associated `<label>` elements and excludes hidden/inert elements, but browser accessibility trees remain authoritative.
- Reduced-motion was enabled and controls reflected paused/static states; the probe did not measure every animation in every theme and interaction mode.
- No automated result here supports a claim of WCAG 2.2 AA conformance.
