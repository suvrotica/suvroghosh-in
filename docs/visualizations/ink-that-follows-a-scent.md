# Ink That Follows a Scent (`ink-that-follows-a-scent`)

Canonical route: `/blog/visualizations/ink-that-follows-a-scent`

## Purpose and question

This visualization answers one concrete question: **How can a group look purposeful when each particle follows only a local rule?**

Visitors paint or drag a chemical landscape on a fixed `256 × 192` logical grid while thousands of independent particles (`5,000` on desktop, `2,400` on constrained devices) wander through it. Each particle updates its position using only the chemical concentration slope at its own coordinate and an unbiased random step. Accumulated ink trails on a `512 × 384` buffer gradually reveal where the invisible chemical biases particle movement.

## Particle update model

At each fixed timestep $\Delta t = 1/60\text{ s}$, every particle updates its position independently:

$$\text{nextPosition} = \text{reflectAtBoundary}\!\left(\text{position} + \sqrt{2 D \Delta t}\,\mathbf{Z} + \chi \nabla C(\text{position})\,\Delta t\right)$$

- $C(x, y) \in [0, 1]$ is the prescribed chemical concentration field on a fixed scale (`256 × 192` grid).
- $\nabla C(x, y) = (\partial C / \partial x, \partial C / \partial y)$ is the local concentration gradient bilinearly interpolated at the particle's current position, with a smooth hyperbolic-tangent drift cap (`MAX_DRIFT_SPEED = 42` logical units/s) to keep heavy painting numerically stable while preserving gradient magnitude.
- $D$ (`randomWandering`, default `1.0`, scaled to `22` logical units²/s) controls the strength of the random diffusive step.
- $\mathbf{Z} = (Z_x, Z_y)$ contains two independent standard normal values generated deterministically from the stateless tuple `(seed, particleId, simulationStep, component)`.
- $\chi$ (`sensitivity`, default `1.2`, scaled to `420` logical units²/s per unit concentration gradient) controls the chemotactic drift strength; setting $\chi = 0$ produces an unbiased random walk.
- `reflectAtBoundary` reflects out-of-bounds steps across `[0, 256] × [0, 192]` without wrapping lines across the canvas.

## Separation of chemical, particles, and trails

1. **Chemical concentration ($C$):** Stored in `ChemicalField` (`paintedGrid`, `sourceEraseGrid`, `combinedGrid`, `gradX`, `gradY` on `256 × 192`). Combines soft-brush painted strokes with an optional movable Gaussian source peak (`radius = 40`, `peak = 0.88`). Moving the source updates its contribution immediately without leaving a chemical wake. This version does not simulate chemical diffusion, secretion, or consumption.
2. **Particle positions:** Stored in `ChemotaxisRun` (`posX`, `posY` on `[0, 256] × [0, 192]`). Particles are independent point agents with no leader, memory of a target coordinate, or inter-particle messaging.
3. **Visible trail history:** Stored in a separate `512 × 384` floating-point buffer (`trails`) with time-based exponential decay $\exp(-\Delta t / \tau_{\text{trail}})$ that pauses when the simulation is paused. Trails never attract particles or deposit chemical.

## Paired comparison (`Compare from same start`)

`Compare from same start` starts a synchronised pair of runs (`sensingOnRun` with current `sensitivity` and `sensingOffRun` with `sensitivity = 0`) that share:

- Identical initial particle positions and IDs (`sampleInitialPosition(seed, particleId)`).
- Identical random nudges $\mathbf{Z}$ for each matching `(particleId, simulationStep)` at every timestep.
- Identical fixed timestep $\Delta t = 1/60\text{ s}$, chemical landscape, and tick-stamped field/parameter edit events.

Because random walk noise is identical particle-by-particle and step-by-step, any difference in the two panels and in the **Average chemical at particle positions** readout is caused strictly by the local gradient-sensing term.

## Runtime boundaries and lifecycle

- `src/lib/visualizations/ink-that-follows-a-scent/{types.ts, random.ts, presets.ts, field.ts, engine.ts, display.ts}` are pure TypeScript modules with zero Svelte or DOM imports and zero `Math.random()` calls.
- `InkFollowsScentInstrument.svelte` renders the SSR-safe intro sequence, static computed comparison poster (`poster.png`), and "How it works" disclosure before lazily mounting `InkFollowsScentApp.svelte` (or retaining the static fallback when `?canvas=off` is supplied).
- `InkFollowsScentApp.svelte` pauses simulation frames and trail decay when paused, when offscreen (`IntersectionObserver`), when the tab is hidden (`visibilitychange`), or on initial load when `prefers-reduced-motion: reduce` / `?motion=reduce` is active, and cleans up all observers and listeners on unmount.

## Verification commands

- Unit and numerical verification: `npm run ink-follows-scent:test`
- Publication asset generation / verification: `npm run ink-follows-scent:assets` / `npm run ink-follows-scent:assets:check`
- Focused Playwright browser suite: `npm run ink-follows-scent:browser:test`
