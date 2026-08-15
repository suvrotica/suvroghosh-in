import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const experimentDirectory = path.join(root, 'src/lib/visualizations/experiments/ray-marching');
const componentDirectory = path.join(root, 'src/lib/components/visualizations/ray-marching');
const articlePath = path.join(root, 'src/lib/posts/ray-marching-fragment-shader-from-scratch.md');
const helloArticlePath = path.join(
	root,
	'src/lib/posts/hello-fragment-your-first-shader-from-scratch.md'
);
const posterPath = path.join(
	root,
	'static/images/visualizations/ray-marching-cathedral/cathedral-poster.jpg'
);
const socialPath = path.join(
	root,
	'static/images/visualizations/ray-marching-cathedral/ray-marching-fragment-shader-og.jpg'
);

async function text(relativePath) {
	return readFile(path.join(root, relativePath), 'utf8');
}

function occurrences(source, expression) {
	return [...source.matchAll(expression)].length;
}

test('publication metadata, discovery and reciprocal article links are wired to the canonical route', async () => {
	const [article, helloArticle, metadata, registry, landing] = await Promise.all([
		readFile(articlePath, 'utf8'),
		readFile(helloArticlePath, 'utf8'),
		text('src/lib/visualizations/experiments/ray-marching/metadata.ts'),
		text('src/lib/visualizations/registry.ts'),
		text('src/lib/components/visualizations/VisualizationsLanding.svelte')
	]);

	assert.match(article, /title: "The Pixel Has a Postbox: Build a 3D World with Ray Marching"/u);
	assert.match(article, /date: "2026-08-15"/u);
	assert.match(article, /category: "Visualizations"/u);
	assert.match(article, /published: true/u);
	assert.match(article, /interactiveFirst: true/u);
	assert.match(
		article,
		/thumbnail: "\/images\/visualizations\/ray-marching-cathedral\/ray-marching-fragment-shader-og\.jpg"/u
	);
	assert.match(article, /<RayMarchingExhibit \/>\s*\n\s*<TTS \/>/u);
	assert.match(article, /\/blog\/visualizations\/hello-fragment-your-first-shader-from-scratch/u);
	assert.match(helloArticle, /\/blog\/visualizations\/ray-marching-fragment-shader-from-scratch/u);
	assert.match(metadata, /id: 'ray-marching-cathedral'/u);
	assert.match(
		metadata,
		/poster: '\/images\/visualizations\/ray-marching-cathedral\/cathedral-poster\.jpg'/u
	);
	assert.match(registry, /import\('\.\/experiments\/ray-marching'\)/u);
	assert.match(
		registry,
		/href: '\/blog\/visualizations\/ray-marching-fragment-shader-from-scratch'/u
	);
	assert.match(landing, /'ray-marching-fragment-shader-from-scratch'/u);
});

test('the article contains the complete teaching contract and a substantial readable explanation', async () => {
	const article = await readFile(articlePath, 'utf8');
	const requiredHeadings = [
		'Quick Answer',
		'Key Terms',
		'Why a flat rectangle can depict an implicit 3D surface',
		'Give every fragment a camera ray',
		'Signed distance: outside, surface, inside',
		'Sphere tracing: how the postman walks',
		'Build the cathedral in eight views',
		'Estimating a direction that was never stored',
		'Combining, subtracting and repeating questions',
		'Light, shadow, occlusion, emission and fog',
		'The signal carried from the first shader',
		'Break it deliberately',
		'What this visualization does—and does not—claim',
		'Why a phone may choose less work',
		'Experiments to try',
		'Frequently asked questions',
		'Sources and further reading'
	];
	for (const heading of requiredHeadings) assert.ok(article.includes(heading), heading);

	for (const question of [
		'What is ray marching?',
		'What is sphere tracing?',
		'How is this different from ordinary ray tracing?',
		'What is a signed distance field?',
		'Why does the browser still draw a rectangle?',
		'Why can the scene run slowly on a phone?',
		'Does the scene use Three.js, a model or a texture?',
		'What happens when WebGL is unavailable?'
	]) {
		assert.ok(article.includes(question), question);
	}

	for (const failure of [
		'Too few march steps',
		'A hit epsilon that is too large',
		'Unsafe overstepping',
		'Starting the camera inside geometry',
		'Modulo seams',
		'Shadow acne'
	]) {
		assert.ok(article.includes(failure), failure);
	}

	assert.match(article, /t_\{i\+1\}=t_i\+s\\,d_i/u);
	assert.match(article, /John C\. Hart/u);
	assert.match(article, /distance estimator or conservative bound/iu);
	assert.match(article, /not path tracing/iu);
	assert.match(article, /(?:not a physical simulation|simulates no physical)/iu);
	assert.ok(article.split(/\s+/u).length >= 2_400, 'article should contain at least 2,400 words');
	assert.doesNotMatch(article, /\b(?:TODO|FIXME|PLACEHOLDER)\b/u);
});

test('all eight stages use complete excerpts from the one running fragment shader', async () => {
	const [stages, fragment] = await Promise.all([
		readFile(path.join(experimentDirectory, 'stages.ts'), 'utf8'),
		readFile(path.join(experimentDirectory, 'fragment.frag'), 'utf8')
	]);
	const stageNumbers = [...stages.matchAll(/\bstage:\s*([1-8]),/gu)].map((match) =>
		Number(match[1])
	);
	const markers = [...stages.matchAll(/sourceMarker:\s*'([^']+)'/gu)].map((match) => match[1]);

	assert.deepEqual(stageNumbers, [1, 2, 3, 4, 5, 6, 7, 8]);
	assert.equal(new Set(markers).size, 8);
	for (const marker of markers) {
		assert.equal(
			occurrences(fragment, new RegExp(`// @excerpt ${marker}:start`, 'gu')),
			1,
			`${marker} start marker`
		);
		assert.equal(
			occurrences(fragment, new RegExp(`// @excerpt ${marker}:end`, 'gu')),
			1,
			`${marker} end marker`
		);
	}
	assert.equal(occurrences(fragment, /\bvec2 mapScene\s*\(/gu), 1);
	assert.match(fragment, /uniform float u_stage;/u);
	assert.match(fragment, /uniform float u_debug;/u);
	assert.match(fragment, /uniform float u_pulseRadius;/u);
	assert.match(fragment, /uniform float u_pulseStrength;/u);
});

test('quality variants replace fixed loop budgets and Saver compiles shadow and AO work out', async () => {
	const [quality, fragment] = await Promise.all([
		readFile(path.join(experimentDirectory, 'quality.ts'), 'utf8'),
		readFile(path.join(experimentDirectory, 'fragment.frag'), 'utf8')
	]);
	for (const token of [
		'__MAIN_STEPS__',
		'__SHADOW_STEPS__',
		'__AO_SAMPLES__',
		'__ENABLE_SHADOWS__',
		'__ENABLE_AO__'
	]) {
		assert.ok(quality.includes(token), token);
		assert.ok(fragment.includes(token), token);
	}
	assert.match(quality, /mainSteps: 96[\s\S]*shadowSteps: 24[\s\S]*aoSamples: 5/u);
	assert.match(quality, /mainSteps: 72[\s\S]*shadowSteps: 14[\s\S]*aoSamples: 4/u);
	assert.match(quality, /mainSteps: 48[\s\S]*shadowSteps: 0[\s\S]*aoSamples: 0/u);
	assert.match(fragment, /for \(int stepIndex = 0; stepIndex < RM_MAIN_STEPS; stepIndex\+\+\)/u);
	assert.match(fragment, /#if RM_ENABLE_SHADOWS == 1/u);
	assert.match(fragment, /#if RM_ENABLE_AO == 1/u);
});

test('the client owns one lazily imported p5 instance, one canvas and explicit lifecycle cleanup', async () => {
	const [sketch, host, exhibit, sourceExplorer] = await Promise.all([
		readFile(path.join(experimentDirectory, 'sketch.ts'), 'utf8'),
		readFile(path.join(componentDirectory, 'RayMarchingCanvas.svelte'), 'utf8'),
		readFile(path.join(componentDirectory, 'RayMarchingExhibit.svelte'), 'utf8'),
		readFile(path.join(componentDirectory, 'RayMarchingSourceExplorer.svelte'), 'utf8')
	]);
	const wholeFeature = `${sketch}\n${host}\n${exhibit}`;

	assert.equal(occurrences(wholeFeature, /await import\('p5'\)/gu), 1);
	assert.equal(occurrences(sketch, /\bp\.createCanvas\s*\(/gu), 1);
	assert.equal(occurrences(exhibit, /<RayMarchingCanvas\b/gu), 1);
	assert.equal(occurrences(host, /new ResizeObserver\s*\(/gu), 1);
	assert.match(sketch, /new P5\(\(p\) =>/u);
	assert.match(sketch, /preserveDrawingBuffer: false/u);
	assert.match(sketch, /version: 1/u);
	assert.match(sketch, /webglcontextlost/u);
	assert.match(sketch, /webglcontextrestored/u);
	assert.match(sketch, /WEBGL_lose_context/u);
	assert.match(host, /touch-action: pan-y/u);
	assert.match(exhibit, /IntersectionObserver/u);
	assert.match(exhibit, /visibilitychange/u);
	assert.match(exhibit, /prefers-reduced-motion: reduce/u);
	for (const rawImport of [
		'RayMarchingExhibit.svelte?raw',
		'RayMarchingCanvas.svelte?raw',
		'sketch.ts?raw',
		'vertex.vert?raw',
		'fragment.frag?raw',
		'stages.ts?raw',
		'quality.ts?raw'
	]) {
		assert.ok(sourceExplorer.includes(rawImport), rawImport);
	}
	assert.doesNotMatch(wholeFeature, /preserveDrawingBuffer:\s*true/u);
	assert.doesNotMatch(wholeFeature, /\bTHREE\b|from ['"]three['"]/u);
});

test('deterministic poster and social assets have their promised dimensions and bounded files', async () => {
	const [posterMetadata, socialMetadata, posterStat, socialStat] = await Promise.all([
		sharp(posterPath).metadata(),
		sharp(socialPath).metadata(),
		stat(posterPath),
		stat(socialPath)
	]);
	assert.deepEqual(
		{ width: posterMetadata.width, height: posterMetadata.height, format: posterMetadata.format },
		{ width: 1600, height: 900, format: 'jpeg' }
	);
	assert.deepEqual(
		{ width: socialMetadata.width, height: socialMetadata.height, format: socialMetadata.format },
		{ width: 1200, height: 630, format: 'jpeg' }
	);
	assert.ok(posterStat.size <= 900 * 1024, `poster is ${posterStat.size} bytes`);
	assert.ok(socialStat.size <= 700 * 1024, `social image is ${socialStat.size} bytes`);
});
