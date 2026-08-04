# Brownian Motion Laboratory internals

This directory contains the rendering-independent numerical core for the article
`/blog/visualizations/brownian-motion-laboratory`. Svelte components live in
`src/lib/components/visualizations/brownian-motion`; they consume this package but the package does
not import the DOM, canvas, or Svelte.

## Architecture

- `simulation.ts` owns a fixed-timestep clock, a model, typed particle state, labelled random
  streams, and a bounded trajectory ring buffer.
- `models/*.ts` contain the steppable stochastic processes. `model-registry.ts` is the exhaustive
  user-facing catalogue: controls, equation, interpretation, diagnostics, validation, theory, and
  factory are defined together.
- `presets.ts` holds deterministic model stories. Every process has at least two validated presets.
- `advanced/` contains the radix-2 FFT, Davies–Harte fractional Brownian generator, bulk
  first-passage solver, and density estimator.
- `workers/` wraps the advanced tasks in a versioned protocol. A client owns cancellation,
  generation barriers, transferables, disposal, progress, and a cooperative asynchronous fallback
  when `Worker` is unavailable.
- `experiment-state.ts` is the versioned, validated query-string codec. It deliberately serializes
  seeds and parameters rather than path data.

## Mathematical conventions

- The ordinary two-dimensional Brownian update is
  `Δx = sqrt(2 D Δt) ξx`, `Δy = sqrt(2 D Δt) ξy`, with independent standard normal values. Its
  radial ensemble MSD is `4 D t`.
- Coordinates are dimensionless laboratory units unless a physical preset explicitly supplies a
  unit interpretation.
- Population variances divide by the number of living particles, because the displayed ensemble is
  the population being measured rather than a sample-estimator exercise.
- Periodic boundaries keep wrapped coordinates for drawing and unwrapped coordinates for
  displacement statistics. Reflection handles arbitrarily large overshoot and flips retained
  velocity according to reflection parity.
- Overdamped Brownian models do not claim an instantaneous velocity. Velocity arrays are meaningful
  only for models such as underdamped Langevin dynamics; orientation is meaningful for active
  particles.
- Ornstein–Uhlenbeck position and velocity transitions are exact over a finite step. The underdamped
  position uses a trapezoidal update around the exact velocity transition.
- A Brownian bridge uses the exact finite-step conditional Gaussian transition and snaps to its
  endpoint within a scale-aware floating-point tolerance.
- The symmetric Lévy model uses a fixed-cost Chambers–Mallows–Stuck draw. For stability index below
  two, ordinary theoretical variance/MSD is marked divergent rather than plotted as a Brownian law.
- Fractional Brownian motion is generated as a whole path with Davies–Harte circulant embedding.
  `H = 1/2` recovers ordinary Brownian increment correlation; other values are non-Markovian. Tiny
  negative FFT eigenvalues inside a documented round-off envelope are clamped, while genuine
  embedding failures are reported.
- The half-line first-passage benchmark is `S(t) = erf(a / sqrt(4 D t))`. A Brownian-bridge crossing
  test reduces missed within-step events; reported event time still has a documented finite-step
  approximation.

## Reproducibility and performance invariants

1. A physics step, not an animation frame, consumes randomness.
2. Every subsystem obtains a stream by stable label from the root seed. Creating or changing a
   cosmetic layer cannot advance a model stream.
3. Resetting the same model with the same seed, parameters, timestep, and step count reproduces the
   same state.
4. Hot state uses structures of typed arrays. Histories are bounded ring buffers; workers transfer
   copies when ownership must move.
5. Numerical validation fails visibly. The UI never repairs an exploding run by silently resetting
   or changing its timestep.
6. Worker clients must be cancelled when a task changes and disposed when their mode or component is
   destroyed.

## Verification

Run the focused numerical suite with:

```sh
npx vitest run --config vite.config.ts src/lib/visualizations/brownian-motion
```

The suite covers PRNG/Gaussian behavior, frame-schedule independence, boundaries, every model family,
registry and preset invariants, Davies–Harte covariance, first passage, worker/main agreement,
cancellation/disposal, and URL round-trips. Browser tests cover hydration, controls, mobile/reduced
motion behavior, exports, sharing, and navigation cleanup.
