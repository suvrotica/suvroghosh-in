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

test('the visualization registry can publish a laboratory summary without forcing it into the shader shell', () => {
	const types = read('src', 'lib', 'visualizations', 'types.ts');
	const registry = read('src', 'lib', 'visualizations', 'registry.ts');

	assert.match(types, /export type VisualizationSummary/);
	assert.match(types, /export type VisualizationDefinition = VisualizationSummary &/);
	assert.match(registry, /'reaction-diffusion-atlas':\s*\{/);
	assert.match(registry, /href: '\/blog\/visualizations\/reaction-diffusion-atlas'/);
	assert.match(registry, /status: 'published'/);
	assert.match(registry, /isRegisteredVisualizationId/);
	assert.doesNotMatch(registry, /import\('\.\/reaction-diffusion/);
});

test('the reaction-diffusion atlas is a substantial published exhibit rather than an upcoming card', () => {
	const post = read('src', 'lib', 'posts', 'reaction-diffusion-atlas.md');
	const landing = read(
		'src',
		'lib',
		'components',
		'visualizations',
		'VisualizationsLanding.svelte'
	);

	assert.match(
		post,
		/title: "The Chemistry That Draws Without a Hand: A Reaction–Diffusion Atlas"/
	);
	assert.match(post, /date: "2026-08-07"/);
	assert.match(post, /dateModified: "2026-08-07"/);
	assert.match(post, /category: "Visualizations"/);
	assert.match(post, /published: true/);
	assert.match(post, /interactiveFirst: true/);
	assert.match(post, /thumbnail: "\/images\/reaction-diffusion-atlas\.png"/);
	assert.match(post, /<TTS \/>/);

	for (const component of [
		'GuidedReactionDiffusion',
		'ReactionDiffusionExhibit',
		'MorphospaceAtlas',
		'StabilityInspector',
		'ReactionMicroscope',
		'SpatialSpectrum',
		'NumericalHonesty'
	]) {
		assert.match(
			post,
			new RegExp(
				`import ${component} from '\\$lib/components/visualizations/reaction-diffusion/${component}\\.svelte'`
			)
		);
		assert.match(post, new RegExp(`<${component} \\/>`));
	}

	for (const doi of [
		'10.1098/rstb.1952.0012',
		'10.1126/science.261.5118.189',
		'10.1038/369215a0',
		'10.1103/RevModPhys.65.851',
		'10.1126/science.1179047'
	]) {
		assert.ok(post.includes(doi), `missing source DOI ${doi}`);
	}

	for (const relatedSlug of [
		'brownian-motion-laboratory',
		'artificial-life-lab-evolve-a-digital-ecosystem-in-your-browser',
		'double-pendulum-chaos',
		'gradient-descent-landscapes'
	]) {
		assert.match(post, new RegExp(`/blog/visualizations/${relatedSlug}`));
	}

	assert.equal((post.match(/^\d+\. \*\*/gm) ?? []).length, 10);
	assert.match(post, /There is no gene regulation/);
	assert.match(post, /does not validate those equations against nature/);
	assert.match(
		landing,
		/'reaction-diffusion-atlas': visualizationSummaries\['reaction-diffusion-atlas'\]\.subjects/
	);
	assert.doesNotMatch(landing, /title: 'Reaction–diffusion patterns'/);
});

test('the Belousov–Zhabotinsky laboratory is a separate, reproducible production exhibit', () => {
	const post = read('src', 'lib', 'posts', 'belousov-zhabotinsky-laboratory.md');
	const registry = read('src', 'lib', 'visualizations', 'registry.ts');
	const landing = read(
		'src',
		'lib',
		'components',
		'visualizations',
		'VisualizationsLanding.svelte'
	);
	const solver = read('src', 'lib', 'visualizations', 'bz', 'solver.ts');
	const presets = read('src', 'lib', 'visualizations', 'bz', 'presets.ts');
	const gpu = read('src', 'lib', 'visualizations', 'bz', 'gpu', 'simulation.ts');
	const legacyCalibration = JSON.parse(read('static', 'data', 'bz-preset-calibration.json'));

	assert.match(
		post,
		/title: "The Clock That Escaped Into Space: A Belousov–Zhabotinsky Laboratory"/
	);
	assert.match(post, /date: "2026-08-08"/);
	assert.match(post, /published: true/);
	assert.match(post, /interactiveFirst: true/);
	assert.match(
		post,
		/thumbnail: "\/images\/visualizations\/belousov-zhabotinsky\/v2\/bz-v2-visualization-card\.png"/
	);
	assert.equal((post.match(/^ {2}- question:/gm) ?? []).length, 12);
	for (const component of [
		'BZExperienceV2',
		'BZEquationLedger',
		'BZTuringInspector',
		'BZNumericalChecks',
		'BZSpiralDiagram',
		'BZPipelineDiagram'
	]) {
		assert.match(
			post,
			new RegExp(
				`import ${component} from '\\$lib/components/visualizations/bz/${component}\\.svelte'`
			)
		);
		assert.match(post, new RegExp(`<${component} \\/>`));
	}
	assert.doesNotMatch(post, /BZGuidedExperiments/);
	for (const doi of [
		'10.1021/ja00780a001',
		'10.1038/237390a0',
		'10.1063/1.1681288',
		'10.1063/1.440418',
		'10.1126/science.175.4022.634',
		'10.1098/rstb.1952.0012',
		'10.1073/pnas.1322005111'
	]) {
		assert.ok(post.includes(doi), `missing BZ source DOI ${doi}`);
	}
	assert.match(solver, /class BZCpuSolver/);
	assert.match(solver, /heunBZStepInto/);
	assert.match(solver, /activeTerms/);
	assert.match(presets, /'broken-front-spiral'/);
	assert.match(presets, /'collision-annihilation'/);
	assert.match(presets, /'diffusion-driven-spots'/);
	assert.match(presets, /id: 'zhabotinsky-dish',\s*title: 'One Finite Outward Front'/);
	assert.equal(
		legacyCalibration.calibrations.find(
			(calibration) => calibration.sourcePresetId === 'zhabotinsky-dish'
		)?.title,
		'One Finite Outward Front'
	);
	assert.match(gpu, /class BZGpuEngine/);
	assert.match(gpu, /oregonatorPredictorFragmentSource/);
	assert.match(gpu, /schnakenbergCorrectorFragmentSource/);
	assert.match(gpu, /EXT_color_buffer_float|createBZGpuContext/);
	assert.match(registry, /'belousov-zhabotinsky-laboratory':\s*\{/);
	assert.match(registry, /href: '\/blog\/visualizations\/belousov-zhabotinsky-laboratory'/);
	assert.match(
		registry,
		/poster: '\/images\/visualizations\/belousov-zhabotinsky\/v2\/bz-v2-visualization-card\.png'/
	);
	assert.match(
		registry,
		/posterAlt:\s*'A luminous red and violet solver-generated Oregonator spiral curling through a circular dish beside the words Chemical waves with receipts'/
	);
	assert.match(
		landing,
		/'belousov-zhabotinsky-laboratory':\s*visualizationSummaries\['belousov-zhabotinsky-laboratory'\]\.subjects/
	);
	// The existing Gray–Scott Atlas must remain independently published.
	assert.match(registry, /'reaction-diffusion-atlas':\s*\{/);
	assert.ok(fs.existsSync(path.join(root, 'src', 'lib', 'posts', 'reaction-diffusion-atlas.md')));
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

test('wide article visualizations share the viewport-centred breakout contract', () => {
	const appCss = read('src', 'app.css');
	const components = [
		['artificial-life', 'ArtificialLifeLab.svelte'],
		['living-pigment', 'LivingPigmentStudio.svelte'],
		['monte-carlo', 'MonteCarloLab.svelte'],
		['spacetime-laboratory', 'SpacetimeLaboratory.svelte'],
		['domain-coloring', 'DomainColoringExplorer.svelte']
	];

	assert.match(
		appCss,
		/\.article-breakout\s*\{[\s\S]*?left:\s*calc\(50% \+ var\(--article-breakout-offset, 0rem\)\)/
	);
	assert.match(appCss, /@media \(min-width: 80rem\)[\s\S]*?--article-breakout-offset:\s*10rem/);

	for (const [directory, filename] of components) {
		const component = read('src', 'lib', 'components', 'visualizations', directory, filename);
		assert.match(component, /class="[^"]*\barticle-breakout\b/);
	}
});

test('the domain-colouring exhibit uses a safe parser, GPU renderer, fallback, and normal post route', () => {
	const expression = read('src', 'lib', 'visualizations', 'domain-coloring', 'expression.ts');
	const renderer = read('src', 'lib', 'visualizations', 'domain-coloring', 'renderer.ts');
	const component = read(
		'src',
		'lib',
		'components',
		'visualizations',
		'domain-coloring',
		'DomainColoringExplorer.svelte'
	);
	const post = read('src', 'lib', 'posts', 'domain-coloring-complex-functions-explorer.md');
	const poster = path.join(root, 'static', 'images', 'domain-coloring-explorer.svg');

	assert.doesNotMatch(expression, /\beval\s*\(|new Function/);
	assert.match(expression, /maximumExpressionLength/);
	assert.match(renderer, /expressionToGlsl/);
	assert.match(renderer, /logMagnitude \/ log\(2\.0\)/);
	assert.match(component, /onpointerdown/);
	assert.match(component, /onwheel/);
	assert.match(component, /aria-pressed=\{gridVisible\}/);
	assert.match(post, /category: "Visualizations"/);
	assert.match(post, /<DomainColoringExplorer \/>/);
	assert.ok(fs.existsSync(poster));
});

test('the Neuron Zoo article uses the normal publishing pipeline and preserves its scientific contract', () => {
	const post = read('src', 'lib', 'posts', 'the-neuron-zoo.md');
	const landing = read(
		'src',
		'lib',
		'components',
		'visualizations',
		'VisualizationsLanding.svelte'
	);

	assert.match(post, /category: "Visualizations"/);
	assert.match(post, /published: true/);
	assert.match(post, /thumbnail: "\/images\/neuron-zoo-social\.jpg"/);
	assert.match(
		post,
		/import NeuronZoo from '\$lib\/components\/visualizations\/neuron-zoo\/NeuronZoo\.svelte'/
	);
	assert.match(post, /<TTS \/>/);
	assert.match(post, /<NeuronZoo \/>/);
	assert.match(post, /\\Delta t=0\.025\\ \\text\{ms\}/);
	assert.match(post, /I_\{LIF\}=500\\,s\(t\)\\ \\text\{pA\}/);
	assert.match(post, /I_\{HH\}=20\\,s\(t\)\\ \\mu\\text\{A\}\/\\text\{cm\}\^2/);
	assert.match(post, /Biological energy: not identifiable from this model’s state equations/);
	assert.match(post, /modern absolute-voltage convention/);
	assert.match(post, /Q_\{excess\}=\\max\(Q_\{stimulus\}-Q_\{baseline\},0\)/);

	for (const model of [
		'McCulloch–Pitts',
		'Leaky integrate-and-fire',
		'Izhikevich',
		'FitzHugh–Nagumo',
		'Hodgkin–Huxley'
	]) {
		assert.match(post, new RegExp(model));
	}

	for (const doi of [
		'10.1007/BF02478259',
		'10.1113/jphysiol.1952.sp004764',
		'10.1016/S0006-3495(61)86902-6',
		'10.1109/JRPROC.1962.288235',
		'10.1109/TNN.2003.820440'
	]) {
		assert.match(post, new RegExp(doi.replace(/[./()]/g, '\\$&'), 'i'));
	}

	assert.match(landing, /'the-neuron-zoo': \['Biology', 'Mathematics', 'Scientific Computing'\]/);
});

test('the Bias Archipelago preserves its hybrid, deterministic, and accessible publishing contract', () => {
	const post = read('src', 'lib', 'posts', 'the-bias-archipelago.md');
	const shell = read(
		'src',
		'lib',
		'components',
		'visualizations',
		'bias-archipelago',
		'BiasArchipelago.svelte'
	);
	const terrain = read(
		'src',
		'lib',
		'components',
		'visualizations',
		'bias-archipelago',
		'BiasTerrain.svelte'
	);
	const staticIndex = read(
		'src',
		'lib',
		'components',
		'visualizations',
		'bias-archipelago',
		'BiasStaticIndex.svelte'
	);
	const labels = read(
		'src',
		'lib',
		'components',
		'visualizations',
		'bias-archipelago',
		'BiasLabels.svelte'
	);
	const compare = read(
		'src',
		'lib',
		'components',
		'visualizations',
		'bias-archipelago',
		'BiasCompare.svelte'
	);
	const scenarioRail = read(
		'src',
		'lib',
		'components',
		'visualizations',
		'bias-archipelago',
		'BiasScenarioRail.svelte'
	);
	const literalRoute = read(
		'src',
		'routes',
		'blog',
		'visualizations',
		'the-bias-archipelago',
		'+page.server.ts'
	);
	const genericRoute = read('src', 'routes', 'blog', '[category]', '[slug]', '+page.server.ts');
	const biases = JSON.parse(read('src', 'lib', 'data', 'bias-archipelago', 'biases.json'));
	const relations = JSON.parse(read('src', 'lib', 'data', 'bias-archipelago', 'relations.json'));
	const mechanisms = JSON.parse(read('src', 'lib', 'data', 'bias-archipelago', 'mechanisms.json'));
	const sources = JSON.parse(read('src', 'lib', 'data', 'bias-archipelago', 'sources.json'));
	const layout = JSON.parse(
		read('src', 'lib', 'data', 'bias-archipelago', 'layout.generated.json')
	);
	const thumbnail = path.join(root, 'static', 'images', 'bias-archipelago.png');

	assert.match(post, /category: "Visualizations"/);
	assert.match(post, /published: true/);
	assert.match(post, /thumbnailAlt:/);
	assert.match(post, /<BiasArchipelago>[\s\S]*<TTS \/>[\s\S]*<\/BiasArchipelago>/);
	assert.match(post, /<TTS \/>/);
	assert.match(post, /Research lineage contributes \*\*0%\*\* to the position/);
	assert.match(post, /Terrain height means density of related constructs/);
	assert.match(post, /racism, sexism, caste discrimination, and institutional inequity/);

	assert.match(terrain, /<canvas/);
	assert.match(terrain, /<svg/);
	assert.match(terrain, /export function focusBias/);
	assert.match(terrain, /'bias-archipelago-view\.svg'/);
	assert.match(terrain, /vectorTerrainGroup/);
	assert.match(terrain, /makeContours/);
	assert.doesNotMatch(terrain, /canvas\.toDataURL|<image/);
	assert.match(terrain, /touch-action: pan-y/);
	assert.match(terrain, /event\.type === 'wheel'.*!event\.ctrlKey/s);
	assert.match(terrain, /object-fit: contain/);
	assert.match(labels, /layout\.formations/);
	assert.match(compare, /terrainHeight/);
	assert.match(compare, /position: fixed/);
	assert.match(shell, /searchParams\.set\('bias'/);
	assert.match(shell, /searchParams\.set\('compare'/);
	assert.match(shell, /searchParams\.set\('scenario'/);
	assert.match(shell, /searchParams\.set\(\s*'step'/);
	assert.match(shell, /pushState\(resolve\(route\)/);
	assert.match(shell, /window\.addEventListener\('popstate'/);
	assert.match(shell, /scenario-\$\{restored\.scenarioId\}-step-\$\{restored\.step \+ 1\}/);
	assert.match(shell, /Copy view/);
	assert.match(shell, /Vector SVG/);
	assert.match(shell, /44dvh/);
	assert.match(shell, /focusMapPeak\(selectedId\)/);
	assert.match(shell, /prefers-reduced-motion: reduce/);
	assert.match(staticIndex, /Open the complete 90-entry field guide/);
	assert.match(scenarioRail, /scenario-\$\{scenario\.id\}-step-\$\{stepIndex \+ 1\}/);
	assert.match(scenarioRail, /aria-current=\{[\s\S]*?\? 'step'/);
	assert.match(literalRoute, /export const prerender = false/);
	assert.match(literalRoute, /loadPublishedBlogPost\('visualizations', 'the-bias-archipelago'\)/);
	assert.match(genericRoute, /slug !== 'the-bias-archipelago'/);

	assert.equal(biases.length, 90);
	assert.equal(sources.length, 139);
	const registeredSources = new Set(sources.map((source) => source.url));
	for (const source of biases.flatMap((bias) => bias.canonicalSources ?? [])) {
		assert.ok(registeredSources.has(source), `missing bias-source metadata for ${source}`);
	}
	for (const source of relations.flatMap((relation) => relation.sourceIds ?? [])) {
		assert.ok(registeredSources.has(source), `missing relation-source metadata for ${source}`);
	}
	assert.ok(relations.length >= 60);
	assert.ok(relations.some((relation) => relation.type === 'cascade'));
	assert.equal(mechanisms.formations.length, 9);
	assert.equal(layout.formations.length, 9);
	assert.ok(fs.existsSync(thumbnail));
	assert.ok(fs.statSync(thumbnail).size < 750 * 1024);
});

test('the prior-authorization machine is a published, reproducible healthcare exhibit', () => {
	const post = read('src', 'lib', 'posts', 'the-prior-authorization-machine.md');
	const registry = read('src', 'lib', 'visualizations', 'registry.ts');
	const landing = read(
		'src',
		'lib',
		'components',
		'visualizations',
		'VisualizationsLanding.svelte'
	);
	const shell = read(
		'src',
		'lib',
		'components',
		'visualizations',
		'prior-authorization',
		'PriorAuthorizationMachine.svelte'
	);
	const engine = read(
		'src',
		'lib',
		'visualizations',
		'prior-authorization',
		'engine',
		'compile-scenario.ts'
	);
	const poster = path.join(
		root,
		'static',
		'images',
		'visualizations',
		'prior-authorization-machine.png'
	);
	const fhirDownload = path.join(
		root,
		'static',
		'data',
		'prior-authorization',
		'maya-lumbar-mri-fhir-r4.json'
	);

	assert.match(
		post,
		/title: "The Prior Authorization Machine: a patient, an MRI, and the invisible decisions between them"/
	);
	assert.match(post, /category: "Visualizations"/);
	assert.match(post, /published: true/);
	assert.match(post, /interactiveFirst: true/);
	assert.match(post, /thumbnail: "\/images\/visualizations\/prior-authorization-machine\.png"/);
	assert.match(post, /PriorAuthorizationMachine/);
	assert.match(post, /<TTS \/>/);
	assert.match(post, /\/blog\/healthcare-it\/fhir-the-universal-language-of-health-data/);
	assert.match(post, /\/blog\/healthcare-it\/explaining-the-healthcare-it-gap-as-continuity/);
	assert.match(post, /\/consulting/);

	assert.match(registry, /'prior-authorization-machine':\s*\{/);
	assert.match(registry, /subjects: \['Healthcare', 'Computer Science'\]/);
	assert.match(registry, /href: '\/blog\/visualizations\/the-prior-authorization-machine'/);
	assert.match(
		landing,
		/'the-prior-authorization-machine':\s*visualizationSummaries\['prior-authorization-machine'\]\.subjects/
	);
	assert.match(landing, /'Healthcare'/);

	assert.match(shell, /CompactJourney/);
	assert.match(shell, /import\('\.\/MachineStage\.svelte'\)/);
	assert.match(engine, /compilePriorAuthorizationScenario/);
	assert.ok(fs.existsSync(poster), 'missing deterministic prior-authorization poster');
	assert.ok(fs.existsSync(fhirDownload), 'missing downloadable synthetic FHIR fixture');
	assert.ok(fs.statSync(poster).size < 750 * 1024, 'poster exceeds 750 kB');

	const fhir = JSON.parse(fs.readFileSync(fhirDownload, 'utf8'));
	assert.equal(fhir.resourceType, 'Bundle');
	assert.equal(
		fhir.meta?.tag?.some((tag) => tag.code === 'synthetic'),
		true
	);
});

test('the Strange Attractor Orchestra publishes one consistent route and artwork path contract', () => {
	const slug = 'the-strange-attractor-orchestra';
	const articleRoute = `/blog/visualizations/${slug}`;
	const socialPath =
		'/images/visualizations/strange-attractor-orchestra/the-strange-attractor-orchestra.png';
	const posterPath = '/images/visualizations/strange-attractor-orchestra/langford-poster.png';
	const post = read('src', 'lib', 'posts', `${slug}.md`);
	const registry = read('src', 'lib', 'visualizations', 'registry.ts');
	const landing = read(
		'src',
		'lib',
		'components',
		'visualizations',
		'VisualizationsLanding.svelte'
	);
	const stage = read(
		'src',
		'lib',
		'components',
		'visualizations',
		'strange-attractor-orchestra',
		'AttractorStage.svelte'
	);
	const portrait = read(
		'src',
		'lib',
		'components',
		'visualizations',
		'strange-attractor-orchestra',
		'PortraitListeningMode.svelte'
	);
	const genericRoute = read('src', 'routes', 'blog', '[category]', '[slug]', '+page.server.ts');
	const social = path.join(root, 'static', ...socialPath.split('/').filter(Boolean));
	const poster = path.join(root, 'static', ...posterPath.split('/').filter(Boolean));

	assert.match(post, /title: "The Strange Attractor Orchestra: When Chaos Learns to Sing"/);
	assert.match(post, /date: "2026-08-09"/);
	assert.match(post, /dateModified: "2026-08-09"/);
	assert.match(post, /category: "Visualizations"/);
	assert.match(post, /published: true/);
	assert.match(post, /interactiveFirst: true/);
	assert.match(post, /immersiveLead: true/);
	assert.ok(post.includes(`thumbnail: "${socialPath}"`));
	assert.match(post, /thumbnailAlt: "[^"]+"/);
	assert.match(
		post,
		/import StrangeAttractorOrchestra from '\$lib\/components\/visualizations\/strange-attractor-orchestra\/StrangeAttractorOrchestra\.svelte'/
	);
	assert.match(post, /<StrangeAttractorOrchestra \/>/);
	assert.match(post, /<TTS \/>/);

	assert.match(registry, new RegExp(`'${slug}':\\s*\\{`));
	assert.match(registry, new RegExp(`id: '${slug}'`));
	assert.ok(registry.includes(`poster:\n\t\t\t'${socialPath}'`));
	assert.ok(registry.includes(`href: '${articleRoute}'`));
	assert.match(registry, /status: 'published'/);
	assert.match(
		landing,
		/'the-strange-attractor-orchestra':\s*visualizationSummaries\['the-strange-attractor-orchestra'\]\.subjects/
	);
	assert.ok(stage.includes(`src="${posterPath}"`));
	assert.ok(portrait.includes(`src="${posterPath}"`));
	assert.match(genericRoute, /loadPublishedBlogPost\(params\.category, params\.slug\)/);
	assert.doesNotMatch(genericRoute, new RegExp(`slug\\s*!==?\\s*['"]${slug}['"]`));

	assert.ok(fs.existsSync(social), 'missing Strange Attractor Orchestra social image');
	assert.ok(fs.existsSync(poster), 'missing Strange Attractor Orchestra portrait poster');
	const pngDimensions = (file) => {
		const header = fs.readFileSync(file).subarray(0, 24);
		assert.deepEqual(Array.from(header.subarray(0, 8)), [137, 80, 78, 71, 13, 10, 26, 10]);
		return { width: header.readUInt32BE(16), height: header.readUInt32BE(20) };
	};
	assert.deepEqual(pngDimensions(social), { width: 1200, height: 630 });
	assert.deepEqual(pngDimensions(poster), { width: 1440, height: 1080 });
	assert.ok(fs.statSync(social).size < 750 * 1024, 'social image exceeds 750 kB');
});

test('The Living Aperture is a native, scoped, scientifically guarded visualization article', () => {
	const slug = 'the-living-aperture';
	const post = read('src', 'lib', 'posts', `${slug}.md`);
	const registry = read('src', 'lib', 'visualizations', 'registry.ts');
	const landing = read(
		'src',
		'lib',
		'components',
		'visualizations',
		'VisualizationsLanding.svelte'
	);
	const lab = read(
		'src',
		'lib',
		'components',
		'visualizations',
		'gastropod-shell-lab',
		'LivingApertureLab.svelte'
	);
	const styles = read(
		'src',
		'lib',
		'components',
		'visualizations',
		'gastropod-shell-lab',
		'living-aperture-lab.css'
	);
	const worker = read(
		'src',
		'lib',
		'visualizations',
		'gastropod-shell-lab',
		'workers',
		'geometry-broker.ts'
	);
	const poster = path.join(
		root,
		'static',
		'images',
		'visualizations',
		'gastropod-shell-lab',
		'the-living-aperture.png'
	);

	assert.match(post, /category: "Visualizations"/);
	assert.match(post, /published: true/);
	assert.match(post, /interactiveFirst: true/);
	assert.match(post, /immersiveLead: true/);
	assert.match(post, /<LivingApertureLab \/>/);
	assert.match(post, /<TTS \/>/);
	assert.match(post, /Nautilus is an extant cephalopod/);
	assert.match(post, /not automatically a globally self-similar object/);
	assert.match(post, /Nothing in that equation requires the golden ratio/);
	assert.match(post, /fractal-like/);
	assert.match(post, /no preset has been fitted to a specimen/i);

	assert.match(registry, /'the-living-aperture':\s*\{/);
	assert.match(registry, /href: '\/blog\/visualizations\/the-living-aperture'/);
	assert.match(
		landing,
		/'the-living-aperture': visualizationSummaries\['the-living-aperture'\]\.subjects/
	);
	assert.match(lab, /article-breakout not-prose/);
	assert.match(lab, /data-lab-theme/);
	assert.match(lab, /labRoot\.addEventListener\('keydown'/);
	assert.doesNotMatch(lab, /document\.documentElement|<svelte:head>|<svelte:window[^>]+onkeydown/);
	assert.match(styles, /^\.living-aperture-lab\s*\{/);
	assert.match(worker, /new Worker\(/);
	assert.ok(fs.existsSync(poster));
	assert.ok(fs.statSync(poster).size < 750 * 1024);
});
