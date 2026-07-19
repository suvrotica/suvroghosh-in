import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const read = (...segments) => fs.readFileSync(path.join(root, ...segments), 'utf8');

test('the visualization registry keeps experiment and p5 code behind dynamic imports', () => {
	const registry = read('src', 'lib', 'visualizations', 'registry.ts');
	const shell = read('src', 'lib', 'components', 'visualizations', 'VisualizationShell.svelte');
	const p5Sketch = read('src', 'lib', 'components', 'visualizations', 'P5Sketch.svelte');

	assert.match(registry, /import\('\.\/experiments\/hello-fragment'\)/);
	assert.doesNotMatch(shell, /from ['"]p5['"]/);
	assert.match(p5Sketch, /await import\('p5'\)/);
});

test('the first exhibit has real shaders, controls, presets, and a fallback poster', () => {
	const fragment = read(
		'src',
		'lib',
		'visualizations',
		'experiments',
		'hello-fragment',
		'fragment.glsl'
	);
	const metadata = read(
		'src',
		'lib',
		'visualizations',
		'experiments',
		'hello-fragment',
		'metadata.ts'
	);
	const poster = path.join(root, 'static', 'images', 'visualizations', 'hello-fragment-poster.jpg');

	for (const uniform of [
		'u_resolution',
		'u_mouse',
		'u_time',
		'u_speed',
		'u_scale',
		'u_rings',
		'u_warp',
		'u_glow',
		'u_palette',
		'u_cellular'
	]) {
		assert.match(fragment, new RegExp(`uniform[^;]+${uniform}`));
	}
	for (const preset of ['Calm Field', 'Electric Interference', 'Cellular Pulse']) {
		assert.match(metadata, new RegExp(preset));
	}
	assert.ok(fs.existsSync(poster));
	assert.ok(fs.statSync(poster).size < 750 * 1024);
});

test('the Markdown exhibit uses the normal publishing pipeline', () => {
	const post = read('src', 'lib', 'posts', 'hello-fragment-your-first-shader-from-scratch.md');

	assert.match(post, /category: "Visualizations"/);
	assert.match(post, /published: true/);
	assert.match(post, /<TTS \/>/);
	assert.match(post, /<Visualization[\s\S]*sketch="hello-fragment"/);
	assert.match(post, /<CodeWalkthrough sketch="hello-fragment"/);
});

test('the framework exposes a deterministic no-WebGL test path', () => {
	const webgl = read('src', 'lib', 'visualizations', 'webgl.ts');
	assert.match(webgl, /get\('webgl'\) === 'off'/);
});

test('the shader maths and teaching copy keep the corrected technical invariants', () => {
	const fragment = read(
		'src',
		'lib',
		'visualizations',
		'experiments',
		'hello-fragment',
		'fragment.glsl'
	);
	const stages = read('src', 'lib', 'visualizations', 'experiments', 'hello-fragment', 'stages.ts');
	const post = read('src', 'lib', 'posts', 'hello-fragment-your-first-shader-from-scratch.md');
	const teachingCopy = `${post}\n${stages}`;

	assert.match(fragment, /uv \*= u_scale;\s+mouse \*= u_scale;/);
	assert.match(fragment, /colour \*= 1\.0 - smoothstep\(0\.18, 1\.15, length\(uv\) \* 0\.72\);/);
	assert.doesNotMatch(teachingCopy, /pixel address|distance-field habit|dark cancellation lanes/);
	assert.doesNotMatch(teachingCopy, /smoothstep\(1\.15, 0\.18/);
	assert.match(teachingCopy, /window space, measured in framebuffer pixels/);
	assert.match(
		teachingCopy,
		/Bright ridges trace places where the combined field passes through zero/
	);
	assert.match(post, /does not solve a physical wave equation/);
});

test('Observable and D3 stay behind a client-only component boundary', () => {
	const component = read('src', 'lib', 'components', 'visualizations', 'ObservableNotebook.svelte');

	assert.match(component, /onMount\(\(\) =>/);
	assert.match(component, /import\('@observablehq\/runtime'\)/);
	assert.match(component, /import\('d3'\)/);
	assert.doesNotMatch(component, /^\s*import\s+\{?[^;]+from ['"]d3['"]/m);
	assert.match(component, /runtime\?\.dispose\(\)/);
	assert.match(component, /removeEventListener\('change', updateMotion\)/);
	assert.match(component, /intersectionObserver\?\.disconnect\(\)/);
	assert.match(component, /get\('motion'\) === 'reduce'/);
	assert.match(component, /redefine\('reducedMotion', reducedMotionRequested\(\)\)/);
});

test('the first Observable notebook has staged D3 cells, reactive controls, and cleanup', () => {
	const notebook = read(
		'src',
		'lib',
		'visualizations',
		'notebooks',
		'hello-observable',
		'notebook.ts'
	);

	for (const cell of [
		'firstSvg',
		'firstMark',
		'dataMarks',
		'scaledWave',
		'viewof controls',
		'controls',
		'waveData',
		'finalWave'
	]) {
		assert.match(notebook, new RegExp(`observer\\('${cell}'\\)`));
	}
	assert.match(notebook, /\.data\(data\)\s*\.join\('circle'\)/);
	assert.match(notebook, /d3\.scaleLinear/);
	assert.match(notebook, /d3\.timer/);
	assert.match(notebook, /invalidation\.then\(\(\) => timer\.stop\(\)\)/);
	assert.match(notebook, /form\.removeEventListener\('input', signal\)/);
	assert.match(notebook, /prefers reduced motion|reduced motion is preferred/i);
});

test('the Observable tutorial uses normal post metadata and live named cells', () => {
	const post = read(
		'src',
		'lib',
		'posts',
		'hello-observable-your-first-living-d3-visualization.md'
	);

	assert.match(post, /category: "Visualizations"/);
	assert.match(post, /published: true/);
	assert.match(post, /<TTS \/>/);
	assert.match(post, /<Pi[\s\S]*src=""/);
	assert.match(post, /<ObservableNotebook[\s\S]*'viewof controls'[\s\S]*'finalWave'/);
	assert.match(post, /Complete executable notebook source/);
	for (const topic of [
		'Observable',
		'D3',
		'JavaScript',
		'Data Visualization',
		'Interactive Learning'
	]) {
		assert.match(post, new RegExp(`"${topic}"`));
	}
});

test('the existing Visualizations project links both native visualization tutorials', () => {
	const projects = read('src', 'lib', 'content', 'professional-projects.ts');
	const landing = read(
		'src',
		'lib',
		'components',
		'visualizations',
		'VisualizationsLanding.svelte'
	);

	assert.match(projects, /hello-fragment-your-first-shader-from-scratch/);
	assert.match(projects, /hello-observable-your-first-living-d3-visualization/);
	for (const technology of ['D3', 'Observable', 'p5.js', 'GLSL', 'Canvas', 'SVG', 'WebGL']) {
		assert.match(projects, new RegExp(technology.replace('.', '\\.')));
	}
	assert.match(landing, /Observable × D3/);
});
