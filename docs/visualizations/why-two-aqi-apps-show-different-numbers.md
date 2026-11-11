# Why two AQI apps show different numbers

Canonical route: `/blog/visualizations/why-two-aqi-apps-show-different-numbers`

## Purpose

An SSR-readable, mobile-first three-panel interactive explainer paired with Suvro Ghosh's accompanying article explaining why two air-quality apps can show different AQI numbers for the same place without any change in outdoor pollution:

1. **Same pollution on two scales**: Shared 24-hour PM2.5 concentration presets (`30`, `60`, `90`, `120 µg/m³`, defaulting to `60 µg/m³`) evaluated simultaneously on India's CPCB PM2.5 breakpoint table (`50 Good`, `100 Satisfactory`, `200 Moderately polluted`, `300 Poor`) and the current US EPA PM2.5 breakpoint table (`90 Moderate`, `154 Unhealthy`, `175 Unhealthy`, `196 Unhealthy`), plus a shared `0–130 µg/m³` physical concentration band strip demonstrating why the numerical ordering reverses at `90` and `120 µg/m³`.
2. **Which hours are being described**: Labelled made-up 24-hour concentration sequences (`Steady day` at `60 µg/m³` vs `Smoke arrives` with twenty hours at `60 µg/m³` and four hours at `360 µg/m³`) plotted on fixed `0–400 µg/m³` vertical axis limits, contrasting the `24-hour average` (`110 µg/m³`) with the `Latest hourly average` (`360 µg/m³`) in concentration units without misapplying daily AQI breakpoints to a single hour.
3. **Which pollutant sets the overall number**: Three illustrative horizontal score bars (`PM2.5: 154`, `PM10: 62`, `Ozone: 37`) on a single `US AQI` scale demonstrating that the highest valid sub-index sets `Overall AQI: 154` without averaging, summing, or pie-charting overlapping particle size fractions.

Beside the panels, a concise ceiling note distinguishes CPCB's published `500` category endpoint from an instrument's physical concentration-measurement limit and notes that current US EPA guidance (May 2026 TAD) permits calculated values above `500` while retaining the **Hazardous** category. Linear interpolation equations, the four-preset verification table, the static `1200 × 750` default comparison image (`default-comparison.png`), and dated official references (`checked 11 November 2026`) live inside an optional `<details>` disclosure.

## Boundaries & Invariants

- Pure TypeScript calculation domain in `src/lib/visualizations/why-two-aqi-apps-show-different-numbers/model.ts` with zero DOM, Svelte, network, or live-feed dependencies.
- Missing, `NaN`, infinite, or negative inputs throw a `RangeError` and are never coerced to zero.
- No backend endpoint, storage, external client fetch, or CSP change.

## Verification Commands

- Unit tests: `npm run aqi-scales:test`
- Deterministic static PNG generation & pixel-hash check: `npm run aqi-scales:assets` / `npm run aqi-scales:assets:check`
- Browser SSR, preset, keyboard, theme & `375px` mobile verification: `npm run aqi-scales:browser:test`
