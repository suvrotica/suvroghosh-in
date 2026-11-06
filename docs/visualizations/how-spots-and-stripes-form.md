# How spots and stripes form (`how-spots-and-stripes-form`)

Canonical route: `/blog/visualizations/how-spots-and-stripes-form`

## Purpose and question

This visualization answers one concrete question: **How can a nearly uniform surface develop spots or stripes?**

Unlike the existing Gray–Scott reaction–diffusion atlas (`/blog/visualizations/reaction-diffusion-atlas`), which explores feed-and-kill dynamics on nonnegative chemical concentrations, this workbench uses a dimensionless, signed cubic activator–inhibitor PDE system designed around a single controlled comparison:

1. Evolve tiny deterministic disturbances around the model's uniform equilibrium when the inhibitor spreads faster than the activator ($D_v = 9.0 = 15 D_u$).
2. Repeat the exact same experiment from the identical starting arrays and random seed with equal signal spreading rates ($D_v = D_u = 0.6$, or $1\times$).

## Governing equations and equilibrium

$$\frac{\partial u}{\partial t} = 0.6\nabla^2 u + u - u^3 - 1.2v + k$$

$$\frac{\partial v}{\partial t} = D_v\nabla^2 v + 1.5(u - v)$$

- $u(x, y, t)$ and $v(x, y, t)$ are normalised, signed signal fields (negative values are valid deviations below baseline).
- $D_u = 0.6$ is the fixed activator diffusion coefficient.
- $D_v = 0.6 \times \text{ratio}$ is the inhibitor diffusion coefficient ($1\times$ corresponds to $D_v = D_u = 0.6$).
- For any pattern balance $k$, the uniform equilibrium $u = v = s$ satisfies the depressed cubic:
  $$s^3 + 0.2s = k$$
  Solved analytically via Cardano's formula in `solveUniformEquilibrium(k)`.

## Numerical solver and domain masks

- **Spatial discretisation:** Five-point finite-difference Laplacian with uniform model-space grid spacing $h = 0.8$ and zero-flux Neumann boundary conditions across all domain masks (`Broad sheet` $96 \times 96$, `Narrow strip` $120 \times 24$, `Tapered patch` $120 \times 48$ active wedge).
- **Time integration:** Explicit second-order Heun (RK2) predictor–corrector scheme with fixed dimensionless timestep $\Delta t = 0.01$ (diffusion stability limit $\Delta t_{\text{diff}} = h^2 / (4 D_v) = 0.01778$ at $15\times$).
- **Initialisation:** Mulberry32 deterministic PRNG seeded by `seed` (default `1952`) generates identical perturbations $(\delta u, \delta v) \in [-0.03, +0.03]$ around $(s, s)$ for both the differential-spreading and equal-spreading fields.

## Verified presets (seed `1952`, $t = 60.0$, $h = 0.8$, $\Delta t = 0.01$)

| Preset | $k$ | $D_v / D_u$ | Equilibrium $s$ | $\sigma_u$ ($15\times$) | $\sigma_u$ ($1\times$ control) | Morphology |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| **Spots** | `-0.075` | `15×` ($D_v = 9.0$) | `-0.27307` | `0.5019` | `0.0000` | 53 isolated positive islands on 1 connected negative background |
| **Stripes** | `0.000` | `15×` ($D_v = 9.0$) | `0.00000` | `0.5250` | `0.0000` | 50.4% positive area in connected labyrinthine bands |
| **Inverse spots** | `+0.075` | `15×` ($D_v = 9.0$) | `+0.27307` | `0.5018` | `0.0000` | 55 isolated negative pockets inside 1 connected positive background |

## Runtime boundaries and lifecycle

- `src/lib/visualizations/how-spots-and-stripes-form/engine.ts` and `display.ts` are framework-free TypeScript modules with zero Svelte or DOM dependencies.
- `src/lib/visualizations/how-spots-and-stripes-form/worker.ts` runs synchronised step batches off the main thread; `worker-client.ts` manages generation IDs, worker termination, and a synchronous fallback for non-worker test environments.
- `SpotsAndStripesInstrument.svelte` provides the SSR-safe static computed preview and `?canvas=off` fallback before lazily mounting `SpotsAndStripesApp.svelte`.
- `SpotsAndStripesApp.svelte` pauses simulation frames when offscreen (`IntersectionObserver`), when the tab is hidden (`visibilitychange`), or when `prefers-reduced-motion: reduce` / `?motion=reduce` is active, and disposes its worker, animation frame, and observers on unmount.

## Verification commands

- Unit and numerical verification: `npm run spots-and-stripes:test`
- Publication asset generation / verification: `npm run spots-and-stripes:assets` / `npm run spots-and-stripes:assets:check`
- Focused Playwright browser suite: `npm run spots-and-stripes:browser:test`
