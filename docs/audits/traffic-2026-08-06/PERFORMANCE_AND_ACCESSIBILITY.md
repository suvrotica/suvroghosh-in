# Performance and accessibility

Audit date: 2026-08-06 (Asia/Calcutta, UTC+05:30)

## Plain-language verdict

Real production visits show a loading problem. The available seven-day Vercel Speed Insights desktop result was **RES 56 (`Needs improvement`)**, with p75 **LCP 6.96 s**, **FCP 5.68 s**, and **TTFB 0.94 s** across 250 data points. Interaction and layout stability were comparatively healthy: p75 INP was 104 ms and CLS was 0.01. There was not enough overall mobile field data to make a mobile Core Web Vitals claim.

The controlled lab tests explain several plausible contributors but do not overrule the field result. The strongest route-specific opportunities are:

1. replace the résumé's three eager YouTube players;
2. serve responsive, smaller archive thumbnails;
3. repair the lightweight shader's narrow resize behavior;
4. defer the Fractal Atlas laboratory while preserving its article, poster, captions, state sharing, and fallbacks;
5. reduce unconditional font transfer; and
6. correct the repeatable contrast and accessible-name defects.

The desktop lab was much faster than real visits, including 41–177 ms route median TTFB versus 0.94 s field p75. That gap likely reflects differences in geography, cache state, devices, networks, and route mix; this audit does not prove which factor dominates. Field p75 over a clean, stable window remains the acceptance signal.

## Evidence boundary

The accepted laboratory dataset contains:

- eight representative production URLs;
- mobile and desktop Lighthouse profiles;
- exactly three serial runs for every page/profile pair;
- **48 clean accepted runs plus 16 medians** in `LIGHTHOUSE_RESULTS.csv`;
- Lighthouse 13.4.1 and Headless Chrome 151.0.7922.75;
- all five required Vercel telemetry block patterns in every accepted raw report;
- zero Lighthouse runtime errors and zero completed matching telemetry requests;
- eight additional telemetry-blocked semantic/browser probes, all HTTP 200 with zero completed telemetry.

An initial runner error completed **31 unblocked navigations, 13:05:43–13:15:54 IST**. Those 31 runs are rejected and excluded from every public run row and median. They may contaminate later 2026-08-06 Vercel traffic/page-view totals, although the authenticated field snapshot used here was captured before the incident. Raw rejected and accepted reports remain under the ignored `.audit-private` tree.

Blocking Vercel Analytics and Speed Insights prevents the accepted audit from altering those datasets, but it slightly understates the requests and JavaScript received by an ordinary visitor.

## Key route lab medians

TBT is shown as the navigation-lab interaction proxy; it is not INP. Transfer figures are medians of the Lighthouse resource summary.

| Representative route      | Mobile: Perf / LCP / TBT | Desktop: Perf / LCP / TBT | Payload or workload signal                                                        |
| ------------------------- | ------------------------ | ------------------------- | --------------------------------------------------------------------------------- |
| Homepage                  | 97 / 2,015 ms / 18 ms    | 100 / 527 ms / 0 ms       | 307 KiB mobile / 494 KiB desktop total; fonts were 162 / 349 KiB                  |
| Résumé                    | 95 / 2,270 ms / 44 ms    | 94 / 1,251 ms / 0 ms      | 1,508 / 1,830 KiB total; 981 / 1,004 KiB JavaScript                               |
| Consulting                | 99 / 1,799 ms / 25 ms    | 100 / 548 ms / 0 ms       | 305 / 493 KiB total; 99 KiB JavaScript on both profiles                           |
| Normal long article       | 88 / 3,295 ms / 68 ms    | 99 / 817 ms / 0 ms        | 2,723 ms mobile main thread; seven long tasks, maximum 514 ms                     |
| Media-heavy article       | 93 / 2,923 ms / 35 ms    | 99 / 699 ms / 0 ms        | 575 / 762 KiB total; 105 KiB median image transfer                                |
| Archive                   | 94 / 3,022 ms / 31 ms    | 99 / 775 ms / 0 ms        | 815 / 2,143 KiB total; 495 / 1,635 KiB images                                     |
| Lightweight visualization | 94 / 2,758 ms / 36 ms    | 100 / 723 ms / 0 ms       | 145–146 KiB initial JavaScript; runtime activation added 344,482 B                |
| Fractal Atlas             | 88 / 3,197 ms / 187 ms   | 95 / 1,025 ms / 0 ms      | 275 KiB initial JavaScript; 4,371 ms mobile main thread; 772 ms maximum long task |

The résumé median hides substantial variance: one of its three clean mobile runs reached **8.25 s LCP** and transferred 2.08 MiB. Run-level evidence remains public for this reason.

## Performance findings

### Field loading is the controlling result

The desktop field sample is not uniformly distributed. The article-route template supplied 158 displayed data points with RES 66, while `/blog` supplied 43 with RES 48. The homepage had RES 99 over 37 points. These segments support route-level investigation but do not isolate a single cause. Recheck the same route templates over a clean 28-day window after fixes.

### Résumé video payload

`/resume` renders three video URLs as YouTube iframes during initial navigation. The shared embed component has no lazy-loading or click-to-play gate. Typical clean reports attributed roughly 1.11 MiB of mobile and 1.23 MiB of desktop transfer to YouTube-related resources. This is the clearest high-business-value payload defect.

Use accessible local posters with a focused “Play on YouTube”/“Load video” control. Create the external player only after activation. Preserve the title, caption, direct link, and keyboard path.

### Archive image weight

The desktop monthly archive transferred a median 1.64 MiB of images. The gallery uses one original thumbnail URL per card without `srcset` and `sizes`. Although lower cards are lazy, a four-column desktop grid places many of them close enough for browser lazy-load heuristics to fetch.

Generate smaller AVIF/WebP/JPEG candidates and serve truthful responsive sources. Retain intrinsic dimensions and verify which first card is actually the LCP element before assigning eager priority.

### Fonts

Even light routes transferred 162 KiB of fonts on mobile and about 349 KiB on desktop. Desktop commonly loaded a large Bengali variable face for the short bilingual brand, plus Source Serif and Roboto. Code/math articles add Courier Prime and KaTeX faces. Preserve the bilingual identity, but test smaller subsets, narrower variable ranges, route-conditional code/math fonts, and fewer preloads.

### Hydration and main-thread interpretation

The production application emits no dedicated Svelte hydration performance mark. Main-thread, script-evaluation, and JavaScript-bootup columns are workload proxies rather than measured hydration cost. The long SQL article and Fractal Atlas need production-mode traces and explicit user-timing marks before attributing their work to hydration or a particular component.

## Accessibility and semantic findings

All eight semantic probes reported `lang="en"`, one `<main>`, one `<h1>`, no adjacent heading-level skips, no image missing an `alt` attribute, no perceivable focusable without a programmatically derived name in the probe heuristic, reduced motion active, and no global horizontal overflow at the initial 390 px viewport.

Three deterministic P2 defects repeated across all applicable Lighthouse runs:

- **Résumé contrast:** nine 12 px nodes rendered at 4.46:1 instead of the required 4.5:1 — eight experience dates and one publication citation.
- **Fractal Atlas contrast:** five tiny family labels rendered at 4.20:1 and four readout labels at 4.31:1.
- **Visible label versus accessible name:** the desktop bilingual brand's accessible name omits the visible Bengali text; five mobile Atlas tabs replace visible labels (`Map`, `Colour`, `Rule`, `Limits`, `Trips`) with different accessible names.

The repository contrast validator passed its theme/token checks, which means it does not cover these rendered Tailwind/component combinations. Add rendered regression cases after fixing them.

The bounded Tab sample found a visible CSS indicator on every observed distinct top-document stop except one step whose active element was a cross-origin résumé iframe. The player's internal focus cannot be inspected reliably from the parent document, so this remains a manual check, not a confirmed failure. Automated results do not establish WCAG conformance; video caption/transcript quality and complete assistive-technology behavior also require manual review.

## Visualization findings

### Lightweight shader

The loading split works: the initial route used about 145–146 KiB of JavaScript, and activation added 344,482 bytes for p5/WebGL. Under reduced motion the shader started paused and exposed `Start`; its canvas has an accessible name and supports Arrow keys, Home, and Space. Unmount cleanup disconnects the resize observer, removes listeners, and removes the p5 instance.

Two defects remain:

- after activation at 390 px, resizing to 320 px left a 398 px canvas inside a 256 px shell after 500 ms; global overflow stayed zero because the shell clipped the bitmap;
- after the near-viewport loader disconnects, normal-motion p5 rendering has no explicit offscreen or hidden-tab pause. Browser rAF throttling is not an application-level lifecycle guarantee.

### Fractal Atlas

The Atlas laboratory code arrives before interaction: runtime script transfer was 287,080 bytes both before and after bringing the lab into view. Lighthouse reported about 72–73 KiB of unused-JavaScript opportunity.

Its lifecycle implementation is otherwise strong. The canvas layer caps device pixel ratio, applies pixel budgets, observes proximity, pauses Worker/progressive work offscreen or in hidden tabs, cancels animation frames, and disposes Worker/WebGL/CPU resources on unmount. Reduced motion, keyboard/touch instructions, labelled application surfaces, static figures, captions, an Open Graph poster, and a `noscript` explanation are present.

The lab stores versioned shareable state in query parameters. The canonical remains the base article URL, and sitemap generation emits the base post path without experiment parameters. Keep those regression checks; Search Console parameter indexing is unverified because property access was unavailable.

The roughly 91 Hz foreground `requestAnimationFrame` samples are browser scheduling observations on a headless display, **not renderer FPS**. One-cycle used-heap differences are GC-sensitive and do not prove or disprove a memory leak. Physical low-end GPU, thermal, orientation, and repeated-navigation testing remains necessary.

## Remediation ownership and verification

| Priority     | Work                                                                               | Primary owner                           | Acceptance evidence                                                                                                                                                                        |
| ------------ | ---------------------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P1           | Preserve a clean field baseline and investigate desktop loading by route/geography | Site owner + performance/SEO engineer   | Same Vercel route templates over a stable 28-day window after fixes; compare p75 LCP/FCP/TTFB and sample counts; exclude the contaminated 2026-08-06 interval                              |
| P1           | Replace three eager résumé players with accessible click-to-play previews          | Frontend engineer + content/video owner | No YouTube iframe/script request before activation; three clean mobile/desktop lab medians; keyboard/focus/caption review; no conversion-content loss                                      |
| P1           | Add responsive compressed archive thumbnails                                       | Frontend/media-pipeline engineer        | Valid `srcset`/`sizes`; desktop median image transfer materially below the 1,635 KiB baseline; correct LCP priority; visual and alt-text regression review                                 |
| P1           | Repair lightweight shader resizing                                                 | Visualization frontend engineer         | Automated 390 → 320 → 768 test proves every visible canvas width is at most its shell width; keyboard/pointer coordinates remain correct; no clipping/overflow                             |
| P2           | Split the Fractal Atlas laboratory from initial article navigation                 | Visualization/platform engineer         | Initial JavaScript and main-thread work improve against the 275 KiB / 4,371 ms mobile baselines; lab activation, state restoration, fallbacks, canonical, keyboard, and cleanup still pass |
| P2           | Pause lightweight p5 work offscreen/hidden                                         | Visualization frontend engineer         | Intersection and `visibilitychange` tests show the loop pauses/resumes without overriding the user's chosen play state; reduced motion still starts paused                                 |
| P2           | Fix résumé/Atlas contrast and visible-label/name mismatches                        | Design-system + frontend engineer       | Lighthouse failure node counts reach zero on both profiles; rendered contrast tests cover the exact components; voice-control/name review passes                                           |
| P2           | Reduce unconditional font transfer                                                 | Frontend performance + design owner     | Route font bytes improve against the recorded medians without CLS, language coverage, typography, or LCP regression                                                                        |
| P2           | Complete manual accessibility and device acceptance                                | Accessibility QA + visualization QA     | Keyboard-only, NVDA/Firefox, NVDA/Chrome, VoiceOver/Safari, 200%/400% zoom, forced colours, physical low-/mid-range Android, resize/orientation, and repeated-navigation memory soak       |
| Owner action | Grant Search Console domain-property access                                        | Verified site owner                     | Mobile/desktop CWV issue groups and parameter-indexing evidence can be inspected without changing ownership/DNS silently                                                                   |

Every performance change should retain a before-change SHA and repeat the telemetry-blocked three-run medians for affected representative routes. A fix is accepted only if the targeted metric improves without accessibility, interaction, layout, content, canonical, or route regression.

## Limitations and unavailable evidence

- Overall mobile Vercel field metrics were unavailable; sparse mobile route rows are directional only.
- Search Console Core Web Vitals is **UNVERIFIED — REQUIRES OWNER ACTION** because the signed-in account lacked domain-property access.
- Public CrUX distributions are **UNVERIFIED** because the keyless PageSpeed Insights attempt returned HTTP 429; no values were inferred.
- Lighthouse simulated mobile is not a physical low-end handset or GPU. Three runs reduce noise but remain a small sample.
- TBT is not INP, workload timing is not direct hydration timing, rAF callback rate is not renderer FPS, and one-cycle JS heap is not leak proof.
- Blocking Vercel telemetry slightly understates normal production request/JavaScript cost.
- Lighthouse/axe and DOM heuristics cannot prove complete keyboard, screen-reader, caption, forced-colour, zoom, or WCAG behavior.
- The 31 rejected unblocked runs may affect post-snapshot 2026-08-06 Vercel analytics and cannot be withdrawn.
- This phase documents defects and verification paths; it does not silently change production, Vercel settings, DNS, Search Console ownership, content, or visualization behavior.

## Supporting evidence

- `PERFORMANCE.md` and `PERFORMANCE_AUDIT.md`
- `LIGHTHOUSE_RESULTS.csv`
- `CORE_WEB_VITALS.md` and `CORE_WEB_VITALS.csv`
- `ACCESSIBILITY.md` and `ACCESSIBILITY_AND_SEMANTIC_STRUCTURE.md`
- `VISUALIZATION_PERFORMANCE.md`
- `scripts/audit-performance.mjs` and `scripts/audit-performance.test.mjs`
