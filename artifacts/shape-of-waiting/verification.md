# The Shape of Waiting — verification

Verified locally on **21 October 2026** at
`http://127.0.0.1:4281/blog/visualizations/the-shape-of-waiting`, using a fresh
production build. The final ten browser tests passed in **44.0 seconds**. The
WCAG A/AA audit recorded **zero violations** and **20 passing rules**. Desktop,
tablet and mobile captures were visually reviewed.

## Browser commands and evidence

Run against the already-started loopback preview:

```powershell
$env:PLAYWRIGHT_REUSE_SERVER='1'; npm run shape-of-waiting:browser:test
```

All ten tests passed, including the real worker-script request gate and network
abort/recovery fixture. The tests cover all seven presets; exact native slider
values; keyboard and touch inspection; paired comparisons; the lower-mean,
worse-tail fixture; real PNG/JSON downloads; exact replay after remount;
JavaScript-disabled reading; malformed replay; responsive geometry; reduced
motion; increased text size; in-flight comparison closure; clock clamping; and
automated accessibility rules with advanced controls open.

After the full pass, only screenshot capture options changed: comparison
element captures hide the sticky site header during the screenshot so it
cannot cover the comparison title. The two affected tests passed again in
**9.0 seconds**:

```powershell
$env:PLAYWRIGHT_REUSE_SERVER='1'; npm run shape-of-waiting:browser:test -- --grep 'headline guided|mobile Still'
```

- [Machine-readable verification receipt](verification.json).
- [Compact axe report](axe-results.json): tool/version, browser context, rule
  identifiers and counts, and complete violation details when present. Passing
  DOM node arrays are omitted.
- [Desktop opening](desktop-opening.png): 1440 × 1000.
- [Desktop comparison](desktop-comparison.png): 1401 × 1463.
- [Tablet opening](tablet-opening.png): 834 × 1112.
- [Mobile opening](mobile-opening.png): 390 × 844.
- [Mobile comparison](mobile-comparison.png): 374 × 2345.

The mobile checks use touch and reduced motion at 390 × 844, then increase text
size to 125 per cent. The tablet check resizes to 834 × 1112. Neither produces
page-level horizontal overflow. The installed Chrome channel supplies
Chromium; service workers are blocked throughout.

## Numerical, publishing and build checks

- `npm run shape-of-waiting:test` — **26 tests passed**.
- `node --test scripts/build-workflow.test.mjs scripts/visualizations.test.mjs`
  — **30 tests passed**.
- `npm run check` — passed during initial feature verification.
- `npx svelte-check --tsconfig ./tsconfig.json` — **zero errors and zero
  warnings** after the final lifecycle fixes.
- `npm run shape-of-waiting:assets:check` — model-derived artwork, pixel
  identities, dimensions and provenance verified as part of the feature lane.
- Scoped Prettier, ESLint and `git diff --check` passed for the changed feature,
  publication and verification files.

The complete feature build lane was checked through the following repair
sequence. The original `build:full` invocation did not itself finish
successfully:

1. `npm run build:full` completed feature artifact checks and notebook
   preparation, then stopped during publishing validation because the new
   article description exceeded the repository's limit.
2. After shortening the description, `npm run build` passed, including routine
   generation, publishing validators, site compilation and discoverability.
3. `npm run barnum-lab:route-assets` completed the remaining full-lane route
   artifact audit.
4. After the final runtime, accessibility and first-viewport fixes,
   `npm run build:site` passed again; this final production build took
   **5 minutes 18 seconds**. The preview was restarted from that output before
   the ten-test browser pass.

## Interpretation and architecture

These checks verify the implemented synthetic laboratory. They do not
calibrate it against institutional data, and the automated accessibility audit
does not establish complete accessibility conformance.

Architecture impact: yes

Architecture rationale: The canonical architecture and contribution gate were
reviewed. The feature adds a per-mount laboratory, pure deterministic queue
model, owned worker, coordinated snapshots and bounded replay/export within
the ordinary Markdown route. Section 6 of the canonical architecture records
these boundaries and their diagram. No foundational decision changed, so no
additional ADR was required.
