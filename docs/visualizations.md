# Visualizations authoring and architecture

## Repository fit

Visualizations extends the site's existing SvelteKit 5 and mdsvex publishing path. A visualization article remains an ordinary Markdown file in `src/lib/posts`, so the existing metadata loader supplies its category archive, search facets, Pagefind record, RSS item, sitemap entry, article SEO, topic links, post navigation, and related-post candidates. The category gallery is a specialised view of the normal `/blog/[category]` route rather than a parallel content system.

The only added runtime dependency is `p5`. It is needed for instance-mode WebGL sketches and shader compilation. No syntax-highlighting package, state library, iframe runtime, or second Markdown parser was added.

## Directory layout

```text
src/lib/components/visualizations/
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

## Accessibility and input

- Native buttons, sliders, checkboxes, number inputs, and selects remain in normal tab order.
- Canvas focus enables arrow-key pointer movement; `Shift` takes larger steps and `Home` returns to the centre. The main p5 canvas also uses Space to pause or start.
- Pointer Events provide one path for mouse, pen, and touch.
- The operating system's reduced-motion request starts the main experiment paused and renders stage previews as still frames. An explicit Start action can opt into motion.
- The article, code, captions, poster, and explanation remain readable with JavaScript disabled.

## Test the fallback

Append `?webgl=off` to either the category or article URL. The capability helper will deliberately report WebGL as unavailable and the component will show its poster and fallback explanation. This query parameter changes no persistent state and is safe to use in local development or a deployed preview.

Also test the page with JavaScript disabled: the interactive controls will not operate, but the static poster and all educational Markdown remain available.

## Performance decisions and limitations

- p5 and every full experiment are split into lazy chunks.
- Stage previews use a small raw WebGL renderer rather than starting another p5 instance for every step. Only the selected stage owns a context.
- Framebuffer density is capped at `1` on smaller or lower-core devices and `1.5` elsewhere. This avoids multiplying GPU work merely because a screen advertises a very high device-pixel ratio.
- Animation stops while an experiment is paused. Raw previews do not advance while the document is hidden.
- The first release uses WebGL 1-compatible GLSL through p5 for broad compatibility. Advanced experiments needing WebGL 2 features should declare that requirement and supply a specific fallback.
- Fullscreen depends on the browser Fullscreen API. The ordinary embedded view remains usable if fullscreen is denied.
- Static posters cannot reproduce direct manipulation; they preserve composition and article continuity, not the interaction itself.
