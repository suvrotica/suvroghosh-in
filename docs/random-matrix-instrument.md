# Random-matrix instrument: implementation notes

The article at `/blog/visualizations/the-matrix-is-random-why-does-it-have-a-shape`
uses the site's normal Markdown publishing, SEO, topic, related-reading and search
pipeline. The Svelte instrument is client-enhanced and its surrounding article,
equations, sources and `<noscript>` poster remain server-rendered.

## Numerical boundary

- `ml-matrix` 6.15.0 supplies double-precision real symmetric and nonsymmetric
  eigendecomposition plus singular-value decomposition. It is MIT-licensed,
  browser-compatible, typed and isolated behind the numerical module/Worker.
- Full nonsymmetric eigendecomposition is capped at `n = 128`; symmetric
  eigendecomposition and SVD are capped at `n = 256`. Ensemble caps decrease
  from 400 samples for small matrices to 10 at the largest supported size.
  The browser additionally reduces the interactive dimension ceiling to 96 on
  narrow or low-capability devices and to 128 on moderate-capability devices,
  announcing the reduction before any decomposition begins.
- Decomposition work happens in a module Worker. A superseded synchronous
  decomposition is cancelled by terminating that Worker; cooperative ensemble
  loops also check cancellation between samples. Run identifiers keep stale
  results from replacing newer state.
- Matrices and numerical results use row-major `Float64Array` buffers. Rendering
  never generates random values or alters mathematical outcomes.
- The deterministic pseudorandom streams are derived from the text seed,
  model version, parameters, purpose label and sample index. Gaussian values use
  a reproducible Box–Muller transform; uniform and Rademacher inputs are
  moment-matched by the model layer.
- Numerical rank uses
  `max(rows, columns) * sigma_max * Number.EPSILON`. The UI reports this
  tolerance, residual warnings and an effectively infinite condition number
  instead of presenting unsupported precision.

## Scientific contract

The circular-law overlay is enabled only for compatible centered IID states and
is rescaled for the supported variance-`1/n` or unscaled convention. The Wigner
overlay uses off-diagonal variance `1/n` at its default scale and the GOE
diagonal convention. Wishart matrices use variance-one entries in `X` at their
default unscaled setting, compute `XX^T / m`, expose `gamma = n / m`, and report
the zero atom when `gamma > 1`. Unscaled and variance-`1/n` overlays are
rescaled to the matrix actually generated; data-dependent Frobenius and
spectral-radius normalizations disable the asymptotic reference.

Heatmap rearrangements state whether they preserve the spectrum. `PAP^T` and
`Q^TAQ` are orthogonal similarities; entry shuffling and row-norm ordering are
not. Nearest-neighbour rendering is the default so the display does not invent
intermediate cell values.

Null comparisons are conditional empirical comparisons, not detection verdicts.
They retain the selected null model, sample count and finite tail resolution in
the result. The eigenvector-localization comparison retains the selected
eigenvalue's magnitude rank across null draws. Trying several metrics is
disclosed as a multiple-comparisons risk.

## Interaction and access

Meaningful state is versioned in the URL rather than serializing matrices.
Invalid values clamp or fall back to documented defaults. The same URL restores
the same seed, preset, dimension, distribution, normalization, signal, lens and
sample selection.

The instrument uses semantic controls, keyboard-operable marks, an accessible
selected-value readout, a table/summary alternative, polite recomputation
announcements, reduced-motion defaults, forced-colour rules, high-contrast mode,
focus restoration after fullscreen, and a focus-mode fallback. Dense work pauses
when the document is hidden. PNG export captures the current figure and URL copy
captures the reproducible experiment state.

## Deliberate limitations

- The two-dimensional direction view is a labelled projection, never a claim to
  display every direction in an `n`-dimensional transformation.
- The non-normal preset demonstrates transient growth and eigenvalue sensitivity.
  It does not claim that a coarse browser grid is a publication-grade
  pseudospectral computation.
- Finite ensembles illustrate asymptotic laws; they do not prove universality or
  convert theoretical support edges into exact finite-matrix bounds.
- Browser, CPU and memory differences can alter completion time and rasterized
  pixels. They do not alter the versioned numerical sequence.
