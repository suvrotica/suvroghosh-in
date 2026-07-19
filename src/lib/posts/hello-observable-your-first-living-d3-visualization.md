---
title: "Hello, Observable: Your First Living D3 Visualization"
description: "Build a responsive, animated sine-wave explorer from first principles while learning Observable cells, D3 selections, SVG marks, scales, data joins, interaction, and browser-safe embedding."
date: "2026-07-19"
category: "Visualizations"
tags: ["Data Visualization","Interactive Learning","Reactive State","Visual Mark","Screen Coordinates","D3","SVG","Observable","JavaScript","Visualization"]
published: true
color: "#0891b2"
author: "Suvro Ghosh"
readingTime: "22 min"
inPlainEnglish: "Observable makes named JavaScript cells react to one another. D3 turns the resulting data into SVG shapes. In this lesson, sliders change a living sine wave without manually coordinating every update."
keyTerms: ["Observable runtime", "Reactive cell", "D3", "SVG", "Scale", "Selection", "Data join", "Invalidation"]
faq:
  - question: "Do I need an Observable account to run this example?"
    answer: "No. The site runs a small native Observable runtime module directly inside the Svelte page; it does not use an iframe or require an Observable account."
  - question: "Is D3 a chart library?"
    answer: "D3 is a collection of tools for mapping data to web documents. It supplies scales, selections, shapes, axes, layouts, and more, but you still decide what to draw and how it should behave."
  - question: "What stops the animation after I leave the page?"
    answer: "The Svelte component disposes its Observable runtime when it unmounts. Observable invalidation then removes input listeners and stops the D3 timer owned by the animated cell."
---

<script>
	import ObservableNotebook from '$lib/components/visualizations/ObservableNotebook.svelte';
	import SourceExplorer from '$lib/components/visualizations/SourceExplorer.svelte';
	import { helloObservableNotebook } from '$lib/visualizations/notebooks/hello-observable/notebook';
	import notebookSource from '$lib/visualizations/notebooks/hello-observable/notebook.ts?raw';

	const notebookFiles = [
		{
			id: 'hello-observable-notebook',
			label: 'Observable + D3 notebook',
			filename: 'notebook.ts',
			language: 'javascript',
			source: notebookSource
		}
	];
</script>

<TTS />

<Pi
	src=""
	alt="Placeholder for a luminous cyan sine wave crossing a dark coordinate grid"
	caption="The live wave below is the real illustration: it is drawn from data every time the notebook runs."
/>

A row of numbers is not yet a wave. It has no colour, no height on a screen, and no reason to move. But give those numbers relationships—*this value controls that one; these pairs become circles; this slider changes the calculation*—and the page begins to behave less like paper and more like a small laboratory.

Here is the finished laboratory. Change **Amplitude** and the crests grow. Increase **Frequency** and more cycles enter the same horizontal space. Lower **Sample points** until the smooth curve reveals the few measurements supporting it. If your device requests reduced motion, animation begins off; the checkbox lets you opt in.

<ObservableNotebook
	notebook={helloObservableNotebook}
	cells={['viewof controls', 'finalWave']}
	title="A sine wave with a pulse"
	description="The controls are one Observable cell. The chart is another. A change flows through the cells between them."
	caption="Native range inputs work with keyboard, pointer, or touch. The SVG keeps the same mathematical viewBox while fitting the available article width."
/>

> **Notice.** The orange dots are the data. The cyan curve is a line generated through those dots. Reduce the sample count and that distinction becomes much easier to see.

# JavaScript

Observable uses JavaScript, but it changes how pieces of JavaScript are scheduled. A notebook cell can hold an ordinary JavaScript value or function. This is still JavaScript; the new part is the dependency-aware runtime around it.

The drawing functions below remain plain JavaScript. JavaScript creates the SVG elements, calculates the wave, and responds to native form events; Observable coordinates when that JavaScript runs again.

An Observable notebook is a collection of named **cells**. A cell may contain a number, a function, a piece of data, a control, an SVG element, or a calculation that depends on other cells.

Ordinary JavaScript is usually read from top to bottom:

```javascript
const amplitude = 40;
const data = makeWave(amplitude);
draw(data);
```

If `amplitude` later changes, ordinary JavaScript does not travel backwards and rerun those earlier statements for us. We write the update path ourselves.

Observable thinks in dependencies:

```javascript
amplitude = 40
data = makeWave(amplitude)
chart = draw(data)
```

The second cell depends on `amplitude`; the third depends on `data`. When `amplitude` changes, Observable marks the dependent cells as stale and evaluates them in dependency order. Their position on the page does not control execution. Their references to one another do.

That is the important difference: an Observable notebook is not merely a JavaScript file split into boxes. It is a small reactive graph.

# Data visualization

Data visualization turns measurements or calculations into marks a person can inspect. A useful data visualization exposes the mapping rather than hiding it, and an interactive data visualization lets the reader test how that mapping responds.

## D3

**D3** stands for Data-Driven Documents. It supplies focused tools for transforming data into things a browser can display:

- scales that map one numerical domain into another;
- selections that find or create document elements;
- axes, line generators, colour interpolators, layouts, timers, and geometric helpers;
- data joins that keep a set of elements aligned with a set of values.

D3 is not a gallery of finished chart widgets. It does not decide that your data must become a bar chart, choose the story, or provide Observable's reactivity. Observable decides *when cells should update*. D3 helps a cell decide *what marks should exist and what attributes they should have*.

The two fit together naturally, but neither requires the other.

# Stage 1: make a place to draw

SVG means **Scalable Vector Graphics**. It is a browser document made of shapes such as `<circle>`, `<line>`, `<path>`, and `<text>`. Unlike a bitmap, an SVG remembers those shapes as elements. They can receive attributes, styles, labels, and updates.

Our first cell asks D3 to create an SVG with a `viewBox`:

```javascript
const svg = d3
  .create('svg')
  .attr('viewBox', '0 0 720 180')
  .attr('role', 'img');

return svg.node();
```

The `viewBox` says that our internal coordinate system is 720 units wide and 180 units tall. CSS may make the result physically narrower on a phone, but the internal geometry remains stable. D3's `.attr(name, value)` sets an SVG attribute. `.node()` returns the real SVG element for Observable to display.

<ObservableNotebook
	notebook={helloObservableNotebook}
	cells={['firstSvg']}
	title="Stage 1 — the coordinate space"
	description="The solid edge and dashed centre guides make an otherwise empty SVG visible."
	compact={true}
/>

> **Visible result.** A responsive frame with its origin still at the top-left; the guides reveal its centre.
>
> **What changed.** We created a document, not yet a data visualization.
>
> **Try it.** Change `180` to `360` in a local copy. The same width now encloses twice the vertical coordinate space.

# Stage 2: add one visual mark

A **visual mark** is a shape that carries information. Before it represents data, let us make one circle:

```javascript
svg
  .append('circle')
  .attr('cx', 360)
  .attr('cy', 90)
  .attr('r', 24)
  .attr('fill', 'var(--observable-ink)');
```

This is a D3 **selection**. `svg.append('circle')` creates a circle and returns a selection containing it. The chain then sets four attributes:

- `cx` and `cy` place the centre;
- `r` sets the radius;
- `fill` chooses the inside colour.

<ObservableNotebook
	notebook={helloObservableNotebook}
	cells={['firstMark']}
	title="Stage 2 — one circle"
	description="A single SVG element turns coordinates into something visible."
	compact={true}
/>

> **Visible result.** One cyan circle sits at `(360, 90)`, the centre of the viewBox.
>
> **What changed.** The SVG now contains a mark with position, size, and colour.
>
> **Try it.** Set `cx` to `90`, or make `r` depend on a number named `amplitude`.

# Stage 3: let data decide how many marks exist

One manually appended circle teaches the grammar. A visualization becomes data-driven when the data decides how many elements exist and where they go.

The notebook samples a sine function into objects shaped like `{ x, y }`. Then D3 joins those objects to circles:

```javascript
svg
  .selectAll('circle')
  .data(data)
  .join('circle')
  .attr('cx', (datum) => x(datum.x))
  .attr('cy', (datum) => y(datum.y))
  .attr('r', 5);
```

Read this from left to right:

1. select the circles that should represent the data;
2. bind the array with `.data(data)`;
3. use `.join('circle')` to create missing circles, retain matching ones, and remove extras;
4. calculate every circle's attributes from its bound datum.

This is the **data join**. If there are 24 objects and no circles yet, the join creates 24 circles. If a later update supplies 48 objects, it creates the missing 24. We describe the relationship; D3 reconciles the document.

<ObservableNotebook
	notebook={helloObservableNotebook}
	cells={['dataMarks']}
	title="Stage 3 — data becomes dots"
	description="Each orange circle is one sampled pair of mathematical values."
	compact={true}
/>

> **Visible result.** Twenty-four separate marks suggest a wave.
>
> **What changed.** The array, rather than repeated drawing commands, determines the marks.
>
> **Try it.** Sample eight values instead of 24. The underlying sine function is unchanged, but your evidence for its shape becomes sparse.

# Stage 4: use scales for screen coordinates

Mathematics gives us the sine function and its domain; it does not know the article's pixel dimensions. A visualization needs a bridge from mathematics to screen coordinates. D3 scales provide that bridge without changing the mathematics represented by the data.

Our angle runs from `0` to `2π`. The SVG's useful horizontal region might run from pixel 58 to pixel 696. Those ranges have different units. A D3 **scale** maps one into the other:

```javascript
const x = d3.scaleLinear(
  [0, Math.PI * 2],
  [58, 696]
);

const y = d3.scaleLinear(
  [-1.2, 1.2],
  [270, 24]
);
```

The first array is the **domain**: values in the data. The second is the **range**: values in the display. The y range looks backwards because SVG y coordinates grow downwards. Mapping a larger mathematical y to a smaller pixel y makes positive values rise.

A line generator turns the mapped points into the `d` attribute of an SVG path:

```javascript
const line = d3
  .line()
  .x((datum) => x(datum.x))
  .y((datum) => y(datum.y));

svg.append('path')
  .datum(data)
  .attr('d', line);
```

`.datum(data)` binds one whole array to one path. That differs from joining each array item to its own circle.

<ObservableNotebook
	notebook={helloObservableNotebook}
	cells={['scaledWave']}
	title="Stage 4 — scales, axes, and a path"
	description="The data now has labelled mathematical meaning instead of merely looking wave-like."
	compact={true}
/>

> **Visible result.** A continuous line crosses labelled x and y axes.
>
> **What changed.** Scales made units explicit; a path connected the samples; axes exposed the mapping to the reader.
>
> **Try it.** Change the x domain to `[0, Math.PI * 4]` without changing the data. Notice how a domain is a claim about what the frame means.

# Stage 5: turn a control into reactive state

In an Observable notebook, a displayed input is conventionally a `viewof` cell. Its visible form is one cell; its current value feeds another. The embedded module registers that relationship explicitly:

```javascript
main.variable(observer('viewof controls'))
  .define(
    'viewof controls',
    ['reducedMotion', 'invalidation'],
    controlsForm
  );

main.variable(observer('controls'))
  .define(
    'controls',
    ['viewof controls', 'invalidation'],
    observeControls
  );
```

`controlsForm` creates ordinary labelled HTML inputs. `observeControls` listens for their `input` events and yields a new object:

```javascript
{
  amplitude: 58,
  frequency: 2,
  speed: 0.7,
  samples: 48,
  animate: true
}
```

Because `waveData` depends on `controls`, and `finalWave` depends on both, changing a slider invalidates and recomputes the cells downstream. We do not call `redrawEverything()` from the event handler. The dependency graph carries the change.

The word **invalidation** matters. Observable resolves that special promise before replacing or disposing a cell. The input cell uses it to remove its listener. The animated chart uses it to stop its D3 timer.

> **Small experiment.** Turn animation off, set frequency to `1`, and count one crest and one trough. Now set it to `3`. The horizontal domain has not changed; the function completes three cycles inside it.

# The finished wave

The last cell combines all the pieces:

```javascript
main.variable(observer('finalWave')).define(
  'finalWave',
  ['d3', 'controls', 'waveData', 'invalidation'],
  finalWave
);
```

Inside `finalWave`, D3 builds axes, a path, and a joined set of circles. If animation is enabled, a restrained timer advances the wave's phase. When the cell is invalidated, the timer stops before a replacement begins.

<ObservableNotebook
	notebook={helloObservableNotebook}
	cells={['viewof controls', 'finalWave']}
	title="Stage 5 — the complete reactive wave"
	description="Change a control and watch Observable recompute the dependent D3 cell."
	caption="Amplitude changes vertical displacement; frequency changes cycles per domain; sample count changes the number of measured marks; speed changes phase advance."
/>

## What the controls change

The final y value is conceptually:

```javascript
y = Math.sin(x * frequency + phase) * amplitude;
```

- **Amplitude** multiplies the output. It changes crest and trough height without changing how many cycles fit.
- **Frequency** multiplies x. It changes how rapidly the angle advances across the same domain.
- **Phase** is added inside the sine. Animation changes phase, sliding the pattern through its cycle.
- **Sample points** changes how many x positions we measure. It changes the visual evidence, not the ideal mathematical function.

That separation is useful beyond sine waves. Scientific visualizations become easier to reason about when each control maps to a named parameter with a specific consequence.

# How this notebook lives inside SvelteKit

This article is still an ordinary mdsvex Markdown post. It receives the site's normal metadata, SEO, table of contents, text-to-speech, topic links, navigation, themes, and typography. The notebook logic lives beside other visualization modules, while a reusable Svelte component supplies the browser lifecycle.

The integration deliberately has three layers:

1. **Article prose** chooses named cells and explains them.
2. **The notebook module** defines cell dependencies and D3 rendering functions.
3. **The Svelte renderer** loads the Observable runtime, observes selected cells, mounts returned DOM, and owns cleanup.

No iframe separates the result from the article. The SVG inherits theme variables from the page, fits its container, and remains part of the document's accessibility tree.

## Why SSR does not break

SvelteKit renders pages on the server, where `window`, `document`, SVG, and animation frames do not exist. The component therefore does not import or start D3 and Observable at module evaluation time. It waits for Svelte's `onMount`, which runs only in the browser, then dynamically imports both packages.

The server can still send the heading, cell descriptions, loading state, caption, and all tutorial prose immediately. Browser-only work begins later as the notebook approaches the viewport.

## What happens when you leave

When navigation destroys an embed, the component:

- disconnects its intersection observer;
- removes the reduced-motion media-query listener;
- calls `runtime.dispose()`;
- clears generated output nodes.

Observable disposal invalidates the active cells. The controls remove their `input` listener, and the final chart stops its D3 timer. A second visit starts a fresh isolated runtime instead of inheriting a hidden animation from the previous page.

# Read the code that runs

The drawer below displays the same TypeScript notebook module imported by every live result in this lesson. The short snippets above favour the idea being taught; this is the complete, copyable implementation, including labels, responsive SVG, reduced-motion defaults, reactive input observation, timer invalidation, and cell registration.

<SourceExplorer files={notebookFiles} label="Complete executable notebook source" />

# Interactive learning

## Keep one idea

The lasting idea is not that sine waves are special. It is that a visualization can be expressed as relationships:

**controls → data → scales → marks**

Observable keeps those relationships live. D3 makes them visible. SVG gives the result a document structure the browser can resize, style, and describe. Once that chain feels ordinary, a pendulum, an epidemic curve, a force-directed atom, a sorting trace, or a gradient-descent landscape is no longer a mysterious animation. It is the next set of data, dependencies, and marks.
