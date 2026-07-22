import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const read = (...segments) => fs.readFileSync(path.join(root, ...segments), 'utf8');

test('spacetime laboratory files exist and shaders are wired', () => {
	for (const file of [
		'spacetimeTypes.ts',
		'spacetimeMath.ts',
		'spacetimeState.ts',
		'spacetimeRenderer.ts',
		'spacetimeStore.svelte.ts',
		'index.ts',
		'shaders/index.ts',
		'shaders/fullscreen.vert',
		'shaders/common.glsl',
		'shaders/sky.glsl',
		'shaders/main.frag'
	]) {
		assert.ok(
			fs.existsSync(path.join(root, 'src/lib/visualizations/spacetime-laboratory', file)),
			`missing ${file}`
		);
	}
	const shaderIndex = read('src/lib/visualizations/spacetime-laboratory/shaders/index.ts');
	assert.match(shaderIndex, /\?raw/);
	assert.match(shaderIndex, /commonSource/);
	assert.match(shaderIndex, /skySource/);
	assert.match(shaderIndex, /mainSource/);
});

test('fragment shader declares every uniform the canvas drives', () => {
	const frag = read('src/lib/visualizations/spacetime-laboratory/shaders/main.frag');
	const canvas = read(
		'src/lib/components/visualizations/spacetime-laboratory/SpacetimeCanvas.svelte'
	);
	const uniforms = [...canvas.matchAll(/u_[a-zA-Z_]+:/g)].map((m) => m[0].slice(0, -1));
	assert.ok(uniforms.length > 25, 'expected many uniforms');
	const common = read('src/lib/visualizations/spacetime-laboratory/shaders/common.glsl');
	const all = frag + common;
	for (const u of new Set(uniforms)) {
		assert.match(all, new RegExp(`uniform\\s+\\w+\\s+${u}\\b`), `missing uniform ${u}`);
	}
});

test('shader uses WebGL2 GLSL ES 3.00 and has safety limits', () => {
	const vert = read('src/lib/visualizations/spacetime-laboratory/shaders/fullscreen.vert');
	assert.match(vert, /#version 300 es/);
	const main = read('src/lib/visualizations/spacetime-laboratory/shaders/main.frag');
	assert.match(main, /for \(int i = 0; i < 512; i\+\+\)/, 'hard iteration cap');
	assert.match(main, /invalid state fallback/i);
});

test('post front matter is valid and category is Visualizations', () => {
	const post = read('src/lib/posts/spacetime-laboratory-einstein-equations.md');
	assert.match(
		post,
		/title: "Spacetime Laboratory: See the Universe Through Einstein’s Equations"/
	);
	assert.match(post, /category: "Visualizations"/);
	assert.match(post, /published: true/);
	assert.match(post, /thumbnail: "\/images\/spacetime-laboratory-einstein-equations\.webp"/);
	assert.match(post, /<TTS \/>/);
	assert.match(post, /<SpacetimeLaboratory/);
	assert.match(
		post,
		/G_\{\\mu\\nu\} \+ \\Lambda g_\{\\mu\\nu\} = \\frac\{8\\pi G\}\{c\^4\} T_\{\\mu\\nu\}/
	);
});

test('thumbnail exists and is within the media budget', () => {
	const p = path.join(root, 'static/images/spacetime-laboratory-einstein-equations.webp');
	assert.ok(fs.existsSync(p));
	assert.ok(fs.statSync(p).size < 750 * 1024, 'thumbnail under 750 kB');
});

test('all nine required spacetime modes are present', () => {
	const types = read('src/lib/visualizations/spacetime-laboratory/spacetimeTypes.ts');
	for (const mode of [
		'minkowski',
		'weak-field',
		'schwarzschild',
		'kerr',
		'reissner-nordstrom',
		'flrw',
		'de-sitter',
		'anti-de-sitter',
		'gravitational-wave'
	]) {
		assert.match(types, new RegExp(`'${mode}'`), `missing mode ${mode}`);
	}
});

test('composed fragment source begins with the GLSL ES 3.00 version directive', () => {
	const index = read('src/lib/visualizations/spacetime-laboratory/shaders/index.ts');
	assert.match(
		index,
		/SPACETIME_FRAGMENT_SOURCE = `#version 300 es/,
		'fragment must declare #version 300 es before any out/precision qualifiers'
	);
});
