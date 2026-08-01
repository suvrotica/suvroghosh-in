# The Fractal Atlas — implementation record

Route: `/blog/visualizations/the-fractal-atlas`

## Repository fit

The atlas is an ordinary published mdsvex post in `src/lib/posts`. That keeps the established
frontmatter-driven Visualizations gallery, article shell, search index, topic pages, related posts,
RSS, sitemap, canonical URL, BlogPosting schema, FAQ schema, author panel, sharing controls, and
next/previous navigation. The post imports focused Svelte components from
`src/lib/components/visualizations/fractal-atlas`; browser-independent mathematics and rendering
code lives in `src/lib/visualizations/fractal-atlas`.

The existing `article-breakout not-prose` convention supplies the wide laboratory without creating
a route, iframe, microsite, or second content system. KaTeX remains the notation pipeline. Browser
renderers are created only inside `onMount`, and the article, formulae, captions, FAQ, and static
poster remain server-rendered.

## Stable contract and precedence

The first implementation brief in the supplied attachment is the final brief. Its exact title,
description, date, thumbnail, category, tags, colour, published status, and slug take precedence
over the older embedded master prompt. In particular, the final atlas includes Barnsley fern,
Sierpiński, and L-system “recursive cousins”, and is published only after the repository quality
gates pass.

The central invariant is:

> In the Mandelbrot view, the pixel chooses the law. In the Julia view, the law is fixed and the
> pixel chooses where the experiment begins.

Every family must state its recurrence, computational class, pixel role, fixed and changing
quantities, colour meaning, and finite-computation caveat. “Not escaped after N iterations” is not
silently relabelled “proven inside”. Colour is an encoding, not part of the mathematical set.

## Architecture decisions

- Reuse the domain-colouring complex arithmetic and viewport conventions where their assumptions
  match; add fractal-specific orbit, polynomial, state, palette, and recursive-construction modules.
- Use a data-driven family registry and one versioned serialisable state. Incoming URL and local
  data are allow-listed, finite, clamped, and bounded before they can affect iteration or memory.
- Use a demand-rendered WebGL2 full-screen triangle for escape-time and Newton families. A bounded
  Canvas 2D CPU path remains available when WebGL2 is absent.
- Use a typed, generation-tagged Worker for progressive Buddhabrot and IFS work. Stale work is
  rejected, hidden/offscreen work is paused, and the Worker is terminated on teardown.
- Keep large pixel buffers, GPU resources, and progressive histograms outside reactive Svelte
  state. Cap live device-pixel ratio and lower preview quality during direct manipulation.
- Support normal high-precision GPU floats for ordinary exploration and expose a precision meter
  that detects coordinate collapse. The brief permits explicit removal of perturbation deep zoom;
  the published runtime excludes it rather than faking detail, and explains when active arithmetic
  has run out of distinguishable values.
- Use the existing deterministic `SeededRandom` utility. The same seed and settings must reproduce
  Buddhabrot and IFS calculations.
- Keep user formula input structured. Multibrot accepts bounded integer powers, Newton uses bounded
  coefficient presets/editor fields, and L-systems use a restricted grammar with a hard symbol and
  segment limit. No `eval`, `new Function`, raw JavaScript, or raw shader entry is permitted.
- Keep generated media local and deterministic. The thumbnail and poster are rendered from the
  atlas mathematics rather than fetched from a remote artwork or image API.

## Interaction, accessibility, and performance invariants

- Drag pans; pointer-centred wheel/pinch zoom preserves the complex point beneath the gesture;
  click/tap probes; keyboard pan, zoom, reset, history, inspector, colour, preset, Julia, and
  fullscreen controls remain available without hijacking text inputs.
- The Canvas never carries the explanation alone. Formulae, a family passport, numerical status,
  orbit table, legends, captions, and FAQ remain text.
- Narrative actions update the same laboratory, preserve an undo state, scroll with reduced-motion
  awareness, briefly identify the changed instrument, and announce one deliberate status update.
- Mobile shows one useful Canvas at a time with reachable controls; panels do not obscure the
  complete image. Touch targets are at least approximately 44 px and safe-area insets are respected.
- Rendering is event driven. Animations and progressive jobs pause on document hiding, offscreen
  state, direct interaction where appropriate, and component destruction.
- WebGL programs, buffers, textures, observers, listeners, animation frames, and Workers are
  released. Context loss preserves serialisable state and restoration rebuilds GPU resources.
- Export sizes, iteration limits, sample budgets, polynomial degree, saved specimens, palette
  stops, and grammar expansion are explicitly bounded.

## Validation contract

The implementation is not complete until the focused mathematical/state tests, Svelte type check,
content/SEO/media/link validators, lint, production build, browser interaction checks, console
inspection, responsive views, reduced motion, theme/high-contrast behaviour, CPU fallback, and
final diff review have been run. Any unavailable or failing check remains visible in the final
report; a colourful Canvas alone is not completion.
