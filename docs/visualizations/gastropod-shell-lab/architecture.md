# Architecture

> Integration note: the native laboratory separates its pure implementation under `src/lib/visualizations/gastropod-shell-lab/` from its Svelte and Three.js host under `src/lib/components/visualizations/gastropod-shell-lab/`.

## Data flow

```text
ShellRecipe (Zod schema v2)
  → transaction history / autosave / URL serializer
  → GeometryBroker (monotonic request id; superseded worker is restarted)
  → geometry.worker.ts
  → generateShell(recipe, resolution, age)
      ├─ analytic centreline or RK4 local-frame history
      ├─ rotation-minimizing transported frames + authored profile roll
      ├─ validated periodic aperture + continuous ornament field
      ├─ ring-major immutable position history
      └─ indexed tessellation, normals, topology, diagnostics
  → transferable Float32Array / Float64Array / Uint32Array buffers
  → Three.js BufferGeometry owned by Viewport3D
  → drawRange selected from stripIndexEnds[visibleRing]
```

The recipe contains model semantics. Viewport quality contains tessellation only. Preview, refined view, timeline, URL state, CSV, PNG, GLB, and OBJ therefore describe the same recipe rather than parallel implementations.

## Modules

- `src/lib/visualizations/gastropod-shell-lab/shell/model/` — versioned schema, defaults, growth-law evaluation, semantic validation, scientific classification, migrations, and the repository-owned seeded PRNG.
- `src/lib/visualizations/gastropod-shell-lab/shell/presets/` — typed preset definitions with shelf, taxonomy, scientific note, safety expectation, deterministic seed, and camera hint.
- `src/lib/visualizations/gastropod-shell-lab/shell/serialization/` — canonical JSON and compressed URL state with validation/migration on decode.
- `src/lib/visualizations/gastropod-shell-lab/shell/math/` — vectors, logarithmic/Archimedean relationships, analytic centrelines, transported frames, RK4 local-frame integration, periodic apertures, accretion-field decomposition, an unexposed reference oscillator helper, and a dimensionless buckling surrogate.
- `src/lib/visualizations/gastropod-shell-lab/shell/ornament/` — ribs, cords, nodules, varices, spine windows, finite hierarchy, instability proxy, and band-limited seeded imperfection in deposition coordinates.
- `src/lib/visualizations/gastropod-shell-lab/shell/mesh/` — typed ring tessellation, cap, normals, bounds, topology, diagnostics, and conservative ring-envelope overlap broad phase.
- `src/lib/visualizations/gastropod-shell-lab/shell/engine/` — pure deterministic orchestration. It imports no Svelte, Three.js, DOM, or worker state.
- `src/lib/visualizations/gastropod-shell-lab/workers/` — browser worker protocol, transferable-buffer list, request coalescing by worker restart, and stale-response rejection.
- `src/lib/visualizations/gastropod-shell-lab/state/` — transaction-aware undo/redo, normalized-age playback, and persisted presentation preferences. Mesh buffers never enter reactive state.
- `src/lib/components/visualizations/gastropod-shell-lab/Viewport3D.svelte` — the native host's sole owner of renderer, canvas, cameras, controls, resize observer, GPU objects, and invalidation RAF. It sits outside the pure TypeScript core.
- `src/lib/visualizations/gastropod-shell-lab/export/` — canonical recipe and ring-history data exports. Three.js exporters are dynamically imported only when requested.

## Geometry contract

`MeshPacket` contains positions, normals, UVs, indices, cumulative `stripIndexEnds`, bounds, ring/sample counts, apex index, and topology. `RingHistory` stores centres, scales, ages, angles, tangents, local frames, exact ring-major vertices, and a reduced instability proxy.

The first `visibleRingCount × samplesPerRing` history vertices are byte-identical to the adult history. `stripIndexEnds[n]` is the cumulative index count after ring `n`; changing age only changes the mesh draw range. The apex cap is finite, and the adult rim remains the single intended boundary loop.

Invalid aperture data is explicit. The pure engine returns diagnostics plus a finite circular fallback buffer so callers never receive NaNs. The interactive viewport does not display or publish that substitute as its accepted result: it reports the rejected attempt separately, disables geometry/data exports, and retains its previous valid mesh and history.

## Worker and update lifecycle

One recipe edit triggers a low-resolution preview and, after a short debounce, a refined request. A Web Worker processes requests serially, so a superseding request rejects older promises and restarts the worker; the latest edit cannot sit behind an obsolete queue. Typed-array buffers are transferred, not cloned.

Replacing a shell disposes the old geometry and material without recreating renderer, canvas, camera, controls, or listeners. Rendering is invalidation-only: camera motion, resize, age, material, overlay, geometry, and recovery request one RAF; there is no permanent animation loop. The timeline changes age in application state, which invalidates the scene only while playing.

Unmount cancels the refinement timer and RAF, disconnects the observer, removes the visibility listener, terminates both brokers, disposes controls and the scene graph, releases the WebGL context, removes the canvas, and clears the scene. `window.__LIVING_APERTURE_DIAGNOSTICS__` exposes read-only acceptance counters for mounts, live resources, RAFs, requests, accepted request id, draw range, and context recovery; application behavior never depends on it.

## Persistence and trust boundaries

Every imported or URL-decoded recipe is migrated and checked against the strict Zod schema before it enters application state. This decode boundary does not pre-reject semantic warnings. Generation, aperture validation, and mesh analysis produce diagnostics that the host presents and uses when deciding whether to accept a new surface. Canonical serialization produces stable key order. Autosave failure or corrupt local preferences are non-fatal. No recipe evaluation uses `eval`, remote code, uploaded meshes, or network services.

## Extension points

- Add an aperture family in the schema, profile sampler/validator, inspector, migrations, and invariant tests.
- Add a centreline law behind the `GrowthFrame[]` contract; the ring builder and tessellator remain unchanged.
- Add an ornament as an `OrnamentSignal` in deposition coordinates, preserve zero-amplitude identity and Nyquist limits, and add deterministic tests.
- Add a new export from `MeshPacket` or a temporary export tessellation, but keep recipe semantics identical and disclose topology.
- A printable solid should be a separate mesh pipeline with inner wall, joined lip, wall thickness, orientation, collision, and watertight validation. It must not silently reinterpret the visual surface.

## Known architectural limits

- The UV coordinate wraps on a shared geometric seam. A future textured export should duplicate render-only UV seam vertices while welding geometry for topology/export.
- The overlap check is a bounded ring-envelope broad phase combined with an independent parameter-domain risk heuristic. Raw envelope candidates are reported separately from their conjunction. A capped scan is labelled incomplete rather than presented as a clean negative; even a complete negative is not proof of a collision-free triangle surface. A future exact check should use triangle/BVH tests.
- The finite hierarchy is a deterministic multilevel Gaussian-peak surrogate, not the cited constrained-energy solver.
- GPU resource counts are tested indirectly through the single-owner lifecycle and diagnostic counters; browser/driver allocations outside Three.js are not controllable by the app.
