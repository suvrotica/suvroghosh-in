# Visualizations authoring and architecture

## Repository fit

Visualizations extends the site's existing SvelteKit 5 and mdsvex publishing path. A visualization article remains an ordinary Markdown file in `src/lib/posts`, so the existing metadata loader supplies its category archive, search facets, Pagefind record, RSS item, sitemap entry, article SEO, topic links, post navigation, and related-post candidates. The category gallery is a specialised view of the normal `/blog/[category]` route rather than a parallel content system.

The runtime dependencies are deliberately narrow. `p5` supports instance-mode WebGL sketches and shader compilation. `d3` supplies data-to-document tools, and `@observablehq/runtime` evaluates native reactive notebook cells. `@types/d3` is development-only. The Observable standard library is not installed because the first notebook provides its small native controls and D3 builtin directly. No chart framework, iframe runtime, state library, syntax-highlighting package, or second Markdown parser was added.

## Directory layout

```text
src/lib/components/visualizations/
  ObservableNotebook.svelte     # selected cells, native DOM output, runtime lifecycle
  Visualization.svelte          # compact mdsvex authoring entrypoint
  VisualizationShell.svelte     # lazy loading, state, fallback, fullscreen
  P5Sketch.svelte                # isolated p5 lifecycle and GPU canvas
  ShaderCanvas.svelte            # lightweight raw-GLSL stage preview
  VisualizationControls.svelte  # playback, presets, and parameter controls
  ParameterSlider.svelte         # labelled accessible range input
  SourceExplorer.svelte          # separate files with copy actions
  CodeWalkthrough.svelte         # staged code/result teaching surface
  WebGLFallback.svelte           # static fallback state

src/lib/visualizations/
  observable.ts                 # notebook and cell metadata types
  registry.ts                    # small ID-to-dynamic-import map
  types.ts                       # experiment, parameter, preset, and source types
  webgl.ts                       # capability and render-density helpers
  experiments/hello-fragment/
    index.ts                     # assembles one self-contained experiment
    metadata.ts                  # title, subjects, poster, controls, presets
    sketch.ts                    # experiment-specific uniform mapping
    vertex.glsl                  # real vertex shader source
    fragment.glsl                # real fragment shader source
    stages.ts                    # incremental teaching stages
  notebooks/hello-observable/
    notebook.ts                  # cells, D3 drawing, controls, invalidation cleanup
```

## Embed a visualization in Markdown

Import the two author-facing components in the Markdown file that needs them. Explicit imports keep the visualization framework out of every ordinary article bundle; the site's existing mdsvex preprocessor still injects its normal image, video, TTS, and notebook helpers into the same script block.

```svelte
<script>
	import Visualization from '$lib/components/visualizations/Visualization.svelte';
	import CodeWalkthrough from '$lib/components/visualizations/CodeWalkthrough.svelte';
</script>

<Visualization
	sketch="hello-fragment"
	title="Animated interference field"
	controls={true}
	source={true}
	caption="Optional figure caption."
/>
```

Add an incremental code-and-result sequence when the experiment exports stages:

```svelte
<CodeWalkthrough sketch="hello-fragment" />
```

## Embed Observable cells in Markdown

Observable/D3 posts use the same Markdown directory and front matter. Import the generic renderer and the post's notebook module, then select one or more named cells:

```svelte
<script>
	import ObservableNotebook from '$lib/components/visualizations/ObservableNotebook.svelte';
	import { helloObservableNotebook } from '$lib/visualizations/notebooks/hello-observable/notebook';
</script>

<ObservableNotebook
	notebook={helloObservableNotebook}
	cells={['viewof controls', 'finalWave']}
	title="A reactive D3 wave"
/>
```

Omit `cells` to render every cell listed in the notebook definition. The component observes only the requested cells; Observable still evaluates any unobserved dependencies they need. Each listed cell supplies its own visible label and description, so the article does not need to repeat accessibility metadata around every embed.

Keep prose in the Markdown post and notebook logic in `src/lib/visualizations/notebooks/<post-slug>/notebook.ts`. Small teaching snippets may appear in the prose, while a `?raw` import and the existing `SourceExplorer` can expose the complete executable module without maintaining a second large source copy.

## Create the next Observable/D3 notebook

1. Create `src/lib/visualizations/notebooks/<post-slug>/notebook.ts`.
2. Export an `ObservableNotebookDefinition` with a stable ID, title, description, ordered cell metadata, and a `define(runtime, observer)` function.
3. Register named cells with their dependencies. Keep browser access inside cell functions; importing the module during SSR must not touch `window` or `document`.
4. Return an SVG, Canvas, native control, or another DOM node from visible cells. Give SVG output a `<title>`, `<desc>`, `role="img"`, and a responsive `viewBox`.
5. Accept Observable's `invalidation` promise in any cell that owns an event listener, timer, animation frame, observer, worker, or generated resource. Stop or remove it when the promise resolves.
6. Create the ordinary Markdown article in `src/lib/posts`, set `category: "Visualizations"`, add subject and technology tags, and import the notebook only there.
7. Add the post slug to the Visualizations entry in `src/lib/content/professional-projects.ts` when it should appear as highlighted project work. The Visualizations gallery itself discovers every published post from category front matter automatically.

The first notebook supplies D3 as an Observable runtime builtin. Add `@observablehq/stdlib` only when a future notebook truly needs standard-library facilities such as a broader `Inputs` or `Generators` surface; do not add it pre-emptively.

The surrounding file still uses the normal front matter. Set `category: "Visualizations"`, choose body-derived tags, add a root-relative thumbnail, and include `<TTS />` when the article should follow the site's TTS convention.

## Create the next experiment

1. Copy `src/lib/visualizations/experiments/hello-fragment` to a new lowercase, hyphenated experiment directory.
2. Replace `vertex.glsl` and `fragment.glsl`. Keep shader source in `.glsl` files; Vite loads them as strings only inside the experiment chunk.
3. Update `metadata.ts` with a stable ID, title, description, subjects, poster, parameter definitions, and at least one useful preset.
4. Update `sketch.ts` so every control value maps to a meaningful shader uniform. Keep conversions here rather than in the generic renderer.
5. Replace `stages.ts` if the article needs an incremental walkthrough. Each stage contains the code the reader sees, a concise explanation, and a small preview fragment shader.
6. Assemble the definition in `index.ts`, including the separately copyable source files.
7. Add one dynamic loader and one lightweight summary entry to `src/lib/visualizations/registry.ts`.
8. Create the ordinary Markdown post and embed the experiment by ID.

This deliberately small registry is the only shared file an experiment normally touches. Renderer code, GLSL, controls, presets, teaching stages, and metadata stay inside the experiment directory.

## Add a uniform and control

1. Declare the uniform in the shader, for example `uniform float u_turbulence;`.
2. Add a parameter to `metadata.ts` using one of the supported types: `range`, `number`, `toggle`, or `select`.
3. Add the new parameter to every preset. A preset changes shader inputs; it must not be a CSS filter.
4. Read the value in `sketch.ts` and return the corresponding uniform from the experiment's `uniforms()` function.
5. Explain the visual consequence in the article or a walkthrough stage.

Range and numeric values are clamped to their declared bounds. Select values are validated against their options. Controls use native inputs, visible labels, descriptions, and mobile-friendly target sizes.

## Client-only lifecycle and cleanup

The server renders article text, the poster, controls container, captions, and a JavaScript-disabled message without touching `window`, WebGL, or p5.

`VisualizationShell` waits until its canvas approaches the viewport. It dynamically imports the experiment module; `P5Sketch` then dynamically imports `p5`. Consequently, pages without an embed do not download p5, and an article does not block its text while the interactive chunk loads.

Each embed creates p5 in instance mode. There are no global `setup`, `draw`, shader, or parameter variables, so multiple experiments can coexist. On unmount, the component disconnects `IntersectionObserver` and `ResizeObserver`, removes pointer and keyboard listeners, calls `p5.remove()`, and drops its instance reference. The raw `ShaderCanvas` also cancels animation frames, deletes its WebGL program, shaders, and buffer, and explicitly loses its context.

`ObservableNotebook` follows the same boundary. Its server-rendered shell contains headings, cell descriptions, loading text, captions, and a `<noscript>` explanation. `onMount` sets up the reduced-motion query and lazily imports both `@observablehq/runtime` and `d3` when the embed approaches the viewport. Each component instance owns one runtime. On unmount it disconnects its intersection observer, removes the media-query listener, calls `runtime.dispose()`, and clears generated nodes.

Runtime disposal resolves Observable invalidation. Notebook cells must use that signal for cell-owned work: the first tutorial removes the form's `input` listener and stops its `d3.timer`. Reactive recomputation invalidates the old cell before starting its replacement, so slider changes do not accumulate timers.

## Accessibility and input

- Native buttons, sliders, checkboxes, number inputs, and selects remain in normal tab order.
- Canvas focus enables arrow-key pointer movement; `Shift` takes larger steps and `Home` returns to the centre. The main p5 canvas also uses Space to pause or start.
- Pointer Events provide one path for mouse, pen, and touch.
- The operating system's reduced-motion request starts the main experiment paused and renders stage previews as still frames. An explicit Start action can opt into motion.
- The article, code, captions, poster, and explanation remain readable with JavaScript disabled.
- Observable controls use labelled native inputs for keyboard, touch, mouse, and pen. SVG cells include a title, description, and image role.
- Observable SVGs use CSS custom properties inherited from the light or dark article shell. A viewBox makes them responsive without measuring `window` during SSR.

## Test the fallback

Append `?webgl=off` to either the category or article URL. The capability helper will deliberately report WebGL as unavailable and the component will show its poster and fallback explanation. This query parameter changes no persistent state and is safe to use in local development or a deployed preview.

Also test the page with JavaScript disabled: the interactive controls will not operate, but the static poster and all educational Markdown remain available.

## Test an Observable notebook locally

1. Run `npm run dev` and open the post's normal `/blog/visualizations/<slug>` URL.
2. Test the live cells at desktop, tablet, and phone widths. Confirm the SVG retains its labels, controls stack on narrow screens, and no horizontal page scroll appears.
3. Switch the site theme and confirm axes, grids, marks, controls, and prose remain legible.
4. Operate every control with the keyboard. Range inputs should respond to arrow keys and the motion checkbox should have a visible focus indicator supplied by the site.
5. Enable the operating system's reduced-motion preference before reloading. Animated controls should begin off; an explicit user action may opt in.
6. Navigate into the post, start animation, then navigate away. In browser developer tools, verify that no D3 timer continues to request work and no console error appears. Return to confirm a fresh runtime starts normally.
7. Run `npm run check`, `npm test`, `npm run lint`, and `npm run build`. The production build is the SSR/Vercel compatibility check; it must finish without evaluating browser-only notebook cells on the server.

For a deterministic reduced-motion check, append `?motion=reduce` to an Observable article URL. The notebook receives the same reduced-motion value it would receive from `prefers-reduced-motion: reduce`, so animated controls begin off without changing any persistent preference.

## Performance decisions and limitations

- p5 and every full experiment are split into lazy chunks.
- Stage previews use a small raw WebGL renderer rather than starting another p5 instance for every step. Only the selected stage owns a context.
- Framebuffer density is capped at `1` on smaller or lower-core devices and `1.5` elsewhere. This avoids multiplying GPU work merely because a screen advertises a very high device-pixel ratio.
- Animation stops while an experiment is paused. Raw previews do not advance while the document is hidden.
- The first release uses WebGL 1-compatible GLSL through p5 for broad compatibility. Advanced experiments needing WebGL 2 features should declare that requirement and supply a specific fallback.
- Fullscreen depends on the browser Fullscreen API. The ordinary embedded view remains usable if fullscreen is denied.
- Static posters cannot reproduce direct manipulation; they preserve composition and article continuity, not the interaction itself.
