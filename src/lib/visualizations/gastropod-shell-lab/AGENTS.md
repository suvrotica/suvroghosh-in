# The Living Aperture integration guide

## Commands

- `npm run gastropod-shell-lab:test` — deterministic math, mesh, serialization, and property tests.
- `npm run gastropod-shell-lab:browser:test` — article-route interaction, accessibility, responsive, and export checks.
- `npm run gastropod-shell-lab:benchmark` — focused deterministic engine benchmarks.
- `npm run check` — parent Svelte and TypeScript diagnostics.
- `npm run lint` — parent Prettier and ESLint gate.
- `npm run build` — complete SvelteKit/Vercel build and discoverability validation.

## Architecture boundaries

- `shell/` is pure TypeScript. It must not import Svelte, Three.js, browser globals, or renderer state.
- `workers/` owns heavy geometry work and returns transferable typed arrays. Request IDs are monotonic; superseded work is rejected and its worker is restarted so stale jobs cannot block the newest edit.
- `state/` owns the versioned recipe, timeline, preferences, and transaction history. Mesh arrays are not reactive state.
- `src/lib/components/visualizations/gastropod-shell-lab/Viewport3D.svelte` is the only owner of the Three.js renderer, canvas, controls, active frame callback, and GPU disposal.
- Preview and export use the same recipes and equations; only tessellation quality may differ.
- The laboratory is embedded in an article. Theme, contrast, CSS variables, keyboard shortcuts, URL state, and viewport sizing must remain scoped to the laboratory and must not take over the parent document.

## Scientific wording

- Call the product a procedural, mathematically grounded shell-design laboratory, not a complete simulation of molluscan development.
- Analytic geometry is descriptive; aperture accretion is kinematic; oscillator, mismatch, stiffness, strain, and buckling values are reduced model parameters or proxies.
- Named presets are morphological archetypes or inspirations, never specimen reconstructions.
- Nautilus and ammonites are cephalopods, not gastropods.
- Use “finite hierarchical” or “fractal-like,” never an infinite or true-fractal claim.
- The default spiral family is logarithmic with a free expansion factor. Do not invoke golden-ratio or Fibonacci folklore except to correct it.
- Lecture lift has a self-similar top view but is not strictly self-similar in 3D. Cone-similar mode can give an exactly self-similar underlying centreline/scale law when every invariant passes; the finite capped and truncated rendering is never labelled globally exact.

## Testing and definition of done

Changes must preserve finite deterministic arrays, a right-handed transported frame, seam continuity, genuine ring-prefix timeline growth, one renderer/canvas, idle rendering, worker race safety, keyboard/text equivalents, mobile usability at 360 px, and no serious Axe findings. Do not expose STL unless a separate printable solid passes manifold validation. Run the focused unit and browser tests plus parent check, lint, and build before claiming completion; report any check not run.
