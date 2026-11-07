# The Predator–Prey Loom (`the-predator-prey-loom`)

Canonical route: `/blog/visualizations/the-predator-prey-loom`

## Purpose and questions

This interactive visualization answers two linked questions about interacting populations:

1. **Why do predator numbers often peak after prey numbers?**
2. **How can increasing the food available to prey produce larger population swings?** (the paradox of enrichment).

## Mathematical model (`model.ts`)

The visualization solves the autonomous two-variable **Rosenzweig–MacArthur** predator–prey model with logistic prey growth and a saturating (Holling type II) functional response:

$$\frac{dN}{dt} = rN\left(1 - \frac{N}{K}\right) - \frac{aNP}{1 + ahN}, \qquad \frac{dP}{dt} = e\frac{aNP}{1 + ahN} - mP.$$

Starting configuration (`DEFAULT_LOOM_PARAMETERS`, `DEFAULT_INITIAL_STATE`):

- Prey growth rate $r = 1$
- Handling time $h = 1$
- Conversion efficiency $e = 0.5$
- Predator mortality $m = 0.2$
- Hunting efficiency $a = 1$
- Initial prey density $N_0 = 1.0$, initial predator density $P_0 = 0.6$
- Three worked settings for food availability (carrying capacity $K$):
  - `K = 1.5`: oscillations settle towards steady coexistence ($N^* = 2/3 \approx 0.67, P^* = 25/27 \approx 0.93$).
  - `K = 3.0`: persistent oscillations around a stable limit cycle.
  - `K = 4.0`: larger persistent oscillations with lower prey troughs ($N_{\min} \approx 0.0105$).

Analytical coexistence equilibrium and Hopf stability boundary (`analyzeEquilibrium`):

$$N^* = \frac{m}{a(e - mh)}, \qquad P^* = \frac{r}{a}\left(1 - \frac{N^*}{K}\right)\left(1 + ahN^*\right), \qquad K_{\text{crit}} = \frac{e + mh}{ah(e - mh)}.$$

For the starting configuration, $K_{\text{crit}} = \frac{0.5 + 0.2}{1 \cdot (0.5 - 0.2)} = \frac{7}{3} \approx 2.3333$.

## Solver, interventions, and comparison grid

- **Piecewise fourth-order Runge–Kutta (`simulatePredatorPreyLoom`):** Integrates across exact intervention knots (`dt = 0.02`) without straddling discontinuities or silently clamping negative values. Simulation trajectories are strictly independent of playback frame rate and cursor scrubbing.
- **Interventions:**
  - **Add food briefly (`food-pulse`):** Raises $K$ by $+50\%$ for $10$ model-time units and then restores its previous value, evolving $(N, P)$ continuously through both endpoints.
  - **Remove 25% of predators (`predator-removal`):** Applies a one-time instantaneous reduction $P(t^+) = 0.75\,P(t^-)$ and renders an explicit jump discontinuity on the phase portrait and predator time track rather than a continuous slope.
  - **Sustained parameter changes (`sustained-food`, `hunting-efficiency`) and `Restore earlier conditions`:** Continue from the current populations while recording a faint `Without this change` comparison trajectory from the state immediately before the intervention.
- **$3 \times 3$ comparison grid (`computeComparisonGrid`):** Evaluates $K \in \{1.5, 3, 4\} \times a \in \{0.75, 1, 1.25\}$ over $T = 120$ from $(N_0, P_0) = (1.0, 0.6)$, combining analytical Jacobian eigenvalues with numerical late-window amplitudes so slow convergence near a stability boundary ($a = 0.75, K = 3 < K_{\text{crit}} = 28/9 \approx 3.11$) is explicitly labelled as still settling.

## Runtime boundaries and lifecycle

- `src/lib/visualizations/the-predator-prey-loom/{types.ts, presets.ts, model.ts, geometry.ts}` are pure TypeScript modules with zero Svelte imports and zero `Math.random()` calls.
- `PredatorPreyLoomInstrument.svelte` renders the SSR-safe intro copy and verified computed comparison poster (`poster.png`) before lazily mounting `PredatorPreyLoomApp.svelte` (or retaining the static fallback when `?canvas=off` is supplied).
- `PredatorPreyLoomApp.svelte` starts paused with the computed history and measured peak lag immediately visible, pauses playback when hidden (`visibilitychange`), offscreen (`IntersectionObserver`), or under `prefers-reduced-motion: reduce`, and cleans up all listeners and observers on unmount.

## Verification commands

- Unit and numerical verification: `npm run predator-prey-loom:test`
- Publication asset generation / verification: `npm run predator-prey-loom:assets` / `npm run predator-prey-loom:assets:check`
- Focused Playwright browser suite: `npm run predator-prey-loom:browser:test`
