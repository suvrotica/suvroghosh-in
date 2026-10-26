# Living Systems

See the [26 October verification record](living-systems-verification.md) for
the completed checks, build corrections, browser evidence and measurement limits.

Living Systems is an ordinary Visualizations Markdown article at
`/blog/visualizations/living-systems`. Its explicit `LivingSystems.svelte` shell
loads `LivingRuntime.svelte` near the viewport. The generic article route owns
SEO, category discovery, RSS, sitemap and search; the gallery registry contains
only a lightweight summary and poster reference.

## Ownership and boundaries

- `src/lib/posts/living-systems.md` owns the article and publication metadata.
- `src/lib/components/visualizations/living-systems/` owns per-mount UI,
  transport, camera, pointer interaction, canvas rendering and browser lifecycle.
- `src/lib/visualizations/living-systems/` owns the four pure numerical models,
  deterministic random streams and bounded numerical histories.
- `static/images/visualizations/living-systems/social.png` is captured from the
  implemented interface rather than painted as a substitute for the model.

The shared clock and Canvas 2D stage belong to this feature. They do not impose
an interface on unrelated existing visualizations. Experiments remain in memory
in the browser. There is no runtime endpoint, external provider, new credential
or stored visitor profile.

## Scientific contract

**Life:** the 120 × 84 grid applies B3/S23 from a complete previous generation.
The finite boundary treats out-of-range neighbours as dead; wrapping joins
opposite edges. Age is visual telemetry and does not alter the transition rule.
Presets include a glider, blinker, pulsar, Gosper glider gun and seeded random
soup. Painting, erasing and stamping are explicit interventions.

**Ant:** a white cell causes a right turn, a black cell a left turn; the current
cell flips before the ant moves forward. A sparse logical grid avoids a
canvas-imposed boundary. Direction is an integer cardinal orientation. The
highway preset performs 11,000 real model steps before presentation, which are
included in its step counter. A one-million-step bound prevents unbounded
session growth; the interface exposes the limit instead of continuing silently.

**Diffusion:** a 120 × 84 concentration field uses a five-point neighbour
exchange with no-flux outer boundaries and obstacles. The explicit coefficient
is bounded at 0.24, below the 0.25 nonnegative stability limit for this stencil.
Without active sources or manual changes, total concentration is conserved
within floating-point tolerance. Diffusivity is separate from wall-clock
playback rate. Dye deposition is a manual mass addition; a continuous source is
labelled as ongoing input. Field variance describes concentration differences
across the accessible field, rather than the physical radius of a fluid plume.
Painting a wall redistributes displaced dye equally onto its remaining fluid
boundary, preserving mass. A stroke that would remove an entire isolated fluid
pocket is rejected because it has no receiving fluid boundary. Erasing is an
explicit removal of dye and walls. Concentration is shown on a fixed 0–4 scale
with saturation at 4, so colour changes remain comparable across time.

**Walk:** independent walkers take unbiased cardinal unit steps from the same
origin. The seed is consumed only when the model takes a step. Position and
mean squared displacement use unwrapped integer coordinates; the 120 × 84
display occupancy can wrap independently. For this model the expected MSD is
the number of steps. The finite measured ensemble is allowed to fluctuate.
Population is bounded at 600 and each retained trajectory at 256 positions.

Numerical histories retain at most 180 samples. These bounds constrain stored
display history without changing the underlying update rules.

## Interaction and lifecycle

The runtime maintains independent state for each mode. Reset uses the selected
preset, seed and parameters; a new seed is an explicit separate action. The
Life and random-walk modes retain separate seeds so returning to an experiment
does not mislabel its existing state with the other mode's most recent seed. The
shared transport distinguishes playback from a single model step. Camera
changes and resize alter the view while preserving model state. Pointer
coordinates are transformed through the current camera before editing.

Animation uses a bounded fixed-step accumulator and requestAnimationFrame for
painting. The component owns visibility/intersection/resize observers and
listeners, suspends unnecessary work while hidden and releases browser
resources when destroyed. Reduced motion starts the experiment paused. Native
controls retain keyboard focus; shortcuts are scoped to the feature and ignore
typing targets. Canvas state has accompanying numerical and explanatory text.

The static shell, poster and article retain explanatory value when the runtime
cannot load or JavaScript is disabled. The interactive simulations require a
working Canvas 2D implementation.

## Verification

Run focused numerical checks:

```sh
npx vitest run src/lib/visualizations/living-systems
npm run check
npm run build:full
npx playwright test --config playwright.living-systems.config.ts
```

The unit fixtures check Life stability/periodicity, the ant's known short
sequence and pre-roll, diffusion mass/nonnegativity and seeded walk replay.
The browser config defaults to a production-bundled feature preview. Its
thirteen tests cover server-rendered explanations, exact stepping and mode
retention, editing through camera transforms, diffusion accounting, scoped
keyboard controls, seeded reset, per-mode seeds, frame export and responsive
screenshots, offscreen suspension, resize preservation, live motion changes
and touch painting at 2× pixel density. Captures are written under
`artifacts/living-systems`.

`npm run living-systems:assets` captures the real interface from a running
local preview. Its manifest hashes normalised source text and decoded RGBA
pixels. The capture encoding hash records the PNG before the existing lossless
PNG optimiser runs; verification uses pixel identity and dimensions so harmless
encoding changes do not invalidate the scientific capture. The asset check is
part of `features:check`, and the article and asset paths activate feature CI.
That workflow also runs the numerical and browser suites.

For production-bundled feature QA, first ensure the committed poster exists,
then use an unused loopback port:

```sh
LIVING_SYSTEMS_PREVIEW_PORT=4388 node scripts/preview-living-systems.mjs --production
LIVING_SYSTEMS_BASE_URL=http://127.0.0.1:4388 npx playwright test --config playwright.living-systems.config.ts
```

Set these environment variables using the host shell's syntax. `--build-only`
produces the same feature bundle without starting its preview. The helper
server-renders the actual article, production-bundles its actual hydrated
components and fonts, then copies only the feature poster into its cache
output. It does not copy the full static corpus. This authoring helper does
not replace a successful full SvelteKit build or verify the site's shared
article layout, headers and route discovery. To verify that integration, point
`LIVING_SYSTEMS_BASE_URL` at the full site's loopback production preview.

Browser runs block service workers. Exercise transport, mode retention,
painting after pan/zoom, boundary changes, mobile controls, reduced motion,
keyboard scope and resize.
Record measured performance against an explicit viewport and workload before
making frame-rate claims. Test commands documented here are verification seams;
the task handoff records which commands actually ran and their results.
