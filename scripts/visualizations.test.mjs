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
