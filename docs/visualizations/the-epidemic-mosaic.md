# The Epidemic Mosaic (`the-epidemic-mosaic`)

Canonical route: `/blog/visualizations/the-epidemic-mosaic`

## Purpose and questions

This interactive visualization answers two linked questions on a synthetic Voronoi city:

1. **What changes when two separate communities gain one connection?** (`Add a bridge` experiment comparing `Without bridge` against `With one bridge`).
2. **With the same number of vaccine doses, does their placement change the outcome?** (`Place the same vaccines` experiment comparing `Spread evenly`, `Most connections`, and `Around the bridge` with a fixed bridge and shared dose budget).

## Synthetic city geometry and contact network (`city.ts`)

- **Fixed logical viewport:** `600 × 420` (`DEFAULT_CITY_SEED = 1854`).
- **36 irregular Voronoi regions:** Divided into two communities of 18 regions (`A01`–`A18` in Community A on the left, `B01`–`B18` in Community B on the right), generated from a seeded stratified grid with three iterations of constrained Lloyd relaxation so regions are irregular without tiny slivers.
- **Equal populations:** Every region starts with $N_i = 100$ residents (`TOTAL_CITY_POPULATION = 3,600`). Polygon size does not represent population.
- **Explicit separation of geometry and contact network:** Each community forms a sparse, internally connected graph with both short-range and long-range contact links. Sharing a Voronoi polygon border never creates an implicit contact:
  - Example of touching polygons with no contact link: `A05` (`A5 · Market Cross`) and `A02` (`A2 · Old Wharf`).
  - Example of visually distant polygons joined by a direct contact link: `A05` (`A5 · Market Cross`) and `A16` (`A16 · South Downs`).
  - No route crosses between Community A and Community B until the single undirected bridge edge ($w_{AB} = 1$, default `A06 ↔ B03`) is added.
- **Area-proportional stained-glass bands:** `computePolygonPopulationBands` clips each irregular polygon horizontally via Sutherland–Hodgman half-plane clipping (`clipPolygonHorizontalStrip`) and binary search (`findHorizontalCutForAreaFraction`) so that the geometric **area** of each band (`S`, `V`, `R`, `I`) matches its compartment fraction $count / N_i$ to within `< 10^{-4}`.

## Stochastic epidemic model (`model.ts`)

For each region $i \in \{1, \dots, 36\}$, the model tracks integer counts $S_i, I_i, R_i, V_i$ satisfying $S_i + I_i + R_i + V_i = N_i = 100$. Vaccination ($V_i$) and recovery after infection ($R_i$) are tracked separately so cumulative infections count only $I_i + R_i$.

Each susceptible person in region $i$ experiences infection hazard

$$\lambda_i = \beta_{\mathrm{local}}\frac{I_i}{N_i} + \beta_{\mathrm{link}} \sum_{j \ne i} w_{ij}\frac{I_j}{N_j},$$

and events are simulated in continuous time via **Gillespie’s direct method** across three explicit event channels:

- Local infection in $i$: $\beta_{\mathrm{local}} S_i I_i / N_i$
- Cross-link infection in $i$ from $j$: $\beta_{\mathrm{link}} w_{ij} S_i I_j / N_j$
- Recovery in $i$: $\gamma I_i$

Default calibrated parameters (`DEFAULT_EPIDEMIC_PARAMETERS`): $\beta_{\mathrm{local}} = 0.28\text{ day}^{-1}$, $\beta_{\mathrm{link}} = 0.04\text{ day}^{-1}$, mean infectious period $1/\gamma = 7\text{ days}$, observation window $T_{\mathrm{obs}} = 120\text{ days}$, and primary seed `2026`. Adding a bridge adds one undirected link of weight $1$ without normalising existing contact weights.

## Equal-budget vaccination allocation (`vaccination.ts`)

At $t = 0$, region $i$ has eligible susceptible capacity $C_i = N_i - I_i(0)$ ($95$ in `A05`, $100$ elsewhere; total capacity $3,595$). Given budget $B$ (default $540$ doses $= 15\%$ of the city), `allocateVaccines` deterministically allocates integer doses using iterative largest-remainder (Hamilton) rounding with explicit per-region capacity caps and overflow redistribution:

- **`even` (`Spread evenly`):** Single tier across all 36 regions weighted by $C_i$; remainder ties broken by descending total contact weight $W_i$ then ascending region index.
- **`most-connections` (`Most connections`):** Descending tiers of total contact weight $W_i$; overflows into lower-weight tiers until all $B$ doses are placed.
- **`around-the-bridge` (`Around the bridge`):** Priority tier 1 covers the bridge endpoints ($d_i = 0$, relative weight $1.5\,C_i$) and their directly connected neighbours ($d_i = 1$, relative weight $1.0\,C_i$), overflowing into graph-hop shells $d_i = 2, 3, \dots$ until all $B$ doses are placed.

## Runtime boundaries and lifecycle

- `src/lib/visualizations/the-epidemic-mosaic/{types.ts, random.ts, city.ts, vaccination.ts, model.ts, worker.ts, worker-client.ts}` are pure TypeScript modules with zero Svelte imports and zero `Math.random()` calls.
- `EpidemicMosaicInstrument.svelte` renders the SSR-safe intro copy, rules, and static computed comparison poster (`poster.png`) before lazily mounting `EpidemicMosaicApp.svelte` (or retaining the static fallback when `?canvas=off` is supplied).
- `EpidemicMosaicApp.svelte` starts paused at day `0.0`, keeps model event simulation independent of playback speed and animation frames, runs 20-repetition batch comparisons in a cancellable Web Worker (`EpidemicMosaicWorkerClient`), pauses animation when hidden (`visibilitychange`) or offscreen (`IntersectionObserver`), respects `prefers-reduced-motion: reduce`, and disposes all owned resources on unmount.

## Verification commands

- Unit and numerical verification: `npm run epidemic-mosaic:test`
- Publication asset generation / verification: `npm run epidemic-mosaic:assets` / `npm run epidemic-mosaic:assets:check`
- Focused Playwright browser suite: `npm run epidemic-mosaic:browser:test`
