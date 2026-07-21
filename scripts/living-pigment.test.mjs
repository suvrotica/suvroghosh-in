import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, test } from 'node:test';
import { createServer } from 'vite';

const root = process.cwd();
const read = (...segments) => fs.readFileSync(path.join(root, ...segments), 'utf8');
const featureDirectory = path.join(root, 'src', 'lib', 'visualizations', 'living-pigment');

function filesBelow(directory) {
	if (!fs.existsSync(directory)) return [];
	return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const absolute = path.join(directory, entry.name);
		return entry.isDirectory() ? filesBelow(absolute) : [absolute];
	});
}

function combinedSource(files) {
	return files
		.map((file) => `\n--- ${path.relative(root, file)} ---\n${fs.readFileSync(file, 'utf8')}`)
		.join('\n');
}

function clone(value) {
	return JSON.parse(JSON.stringify(value));
}

function assertFiniteRange(value, minimum, maximum, label) {
	assert.ok(Number.isFinite(value), `${label} must be finite`);
	assert.ok(value >= minimum, `${label} fell below ${minimum}`);
	assert.ok(value <= maximum, `${label} exceeded ${maximum}`);
}

const vite = await createServer({
	configFile: false,
	root,
	appType: 'custom',
	server: { middlewareMode: true, hmr: false },
	optimizeDeps: { noDiscovery: true }
});

const [colors, pointer, random, project, presetsModule, types, engineModule] = await Promise.all([
	vite.ssrLoadModule('/src/lib/visualizations/living-pigment/colors.ts'),
	vite.ssrLoadModule('/src/lib/visualizations/living-pigment/pointer.ts'),
	vite.ssrLoadModule('/src/lib/visualizations/living-pigment/random.ts'),
	vite.ssrLoadModule('/src/lib/visualizations/living-pigment/project.ts'),
	vite.ssrLoadModule('/src/lib/visualizations/living-pigment/presets.ts'),
	vite.ssrLoadModule('/src/lib/visualizations/living-pigment/types.ts'),
	vite.ssrLoadModule('/src/lib/visualizations/living-pigment/engine.ts')
]);

after(async () => {
	await vite.close();
});

function looksLikeSettings(value) {
	return (
		value != null &&
		typeof value === 'object' &&
		typeof value.mode === 'string' &&
		typeof value.brush === 'string' &&
		typeof value.brushSize === 'number' &&
		value.background != null
	);
}

function defaultSettings() {
	const named =
		presetsModule.DEFAULT_SETTINGS ??
		presetsModule.DEFAULT_SIMULATION_SETTINGS ??
		presetsModule.INITIAL_SETTINGS;
	const discovered = Object.entries(presetsModule).find(
		([name, value]) => /default|initial/i.test(name) && looksLikeSettings(value)
	)?.[1];
	const settings = named ?? discovered;
	assert.ok(
		settings && looksLikeSettings(settings),
		'presets.ts must export complete default settings'
	);
	return clone(settings);
}

function studioPresets() {
	const named =
		presetsModule.PRESETS ?? presetsModule.STUDIO_PRESETS ?? presetsModule.LIVING_PIGMENT_PRESETS;
	const discovered = Object.values(presetsModule).find(
		(value) =>
			Array.isArray(value) &&
			value.length > 0 &&
			value.every(
				(entry) =>
					entry &&
					typeof entry === 'object' &&
					typeof entry.name === 'string' &&
					entry.settings &&
					typeof entry.settings === 'object'
			)
	);
	const entries = named ?? discovered;
	assert.ok(Array.isArray(entries), 'presets.ts must export the studio preset list');
	return entries;
}

function applyPreset(base, preset) {
	return {
		...clone(base),
		...clone(preset.settings),
		background: {
			...clone(base.background),
			...clone(preset.settings.background ?? {})
		}
	};
}

function assertValidSettings(settings, label) {
	assert.ok(types.ART_MODES.includes(settings.mode), `${label}.mode is invalid`);
	assert.ok(types.BRUSH_TYPES.includes(settings.brush), `${label}.brush is invalid`);
	assert.ok(
		types.BACKGROUND_MODES.includes(settings.background.mode),
		`${label}.background.mode is invalid`
	);
	assert.ok(types.COLOR_MODES.includes(settings.colorMode), `${label}.colorMode is invalid`);
	assert.ok(types.QUALITY_LEVELS.includes(settings.quality), `${label}.quality is invalid`);
	assert.ok(types.PHYSICS_OVERLAYS.includes(settings.overlay), `${label}.overlay is invalid`);

	assertFiniteRange(settings.brushSize, 4, 180, `${label}.brushSize`);
	for (const key of [
		'pigmentAmount',
		'transparency',
		'waterAmount',
		'diffusion',
		'surfaceMoisture',
		'dryingSpeed',
		'viscosity',
		'flowStrength',
		'turbulence',
		'granulation',
		'edgeDarkening',
		'mixingStrength',
		'textureStrength',
		'eraserStrength',
		'eraserSoftness'
	]) {
		assertFiniteRange(settings[key], 0, 1, `${label}.${key}`);
	}
	assertFiniteRange(settings.simulationSpeed, 0, 4, `${label}.simulationSpeed`);
	assert.equal(typeof settings.wetLifting, 'boolean', `${label}.wetLifting must be boolean`);

	assert.ok(
		Number.isInteger(settings.background.seed),
		`${label}.background.seed must be an integer`
	);
	assert.ok(
		Number.isInteger(settings.background.regions),
		`${label}.background.regions must be an integer`
	);
	assertFiniteRange(settings.background.regions, 1, 16, `${label}.background.regions`);
	for (const key of ['moisture', 'turbulence', 'symmetry', 'intensity']) {
		assertFiniteRange(settings.background[key], 0, 1, `${label}.background.${key}`);
	}
	assertFiniteRange(settings.background.scale, 0.1, 4, `${label}.background.scale`);
	assert.match(
		settings.background.customColor,
		/^#[0-9a-f]{6}$/i,
		`${label}.background.customColor`
	);

	const pigmentIds = new Set(colors.PIGMENTS.map((entry) => entry.id));
	assert.ok(pigmentIds.has(settings.primaryPigmentId), `${label}.primaryPigmentId is unknown`);
	assert.ok(pigmentIds.has(settings.secondaryPigmentId), `${label}.secondaryPigmentId is unknown`);
	assert.ok(settings.paletteIds.length >= 2, `${label}.paletteIds needs at least two pigments`);
	assert.equal(
		new Set(settings.paletteIds).size,
		settings.paletteIds.length,
		`${label}.paletteIds repeats a pigment`
	);
	for (const id of settings.paletteIds) {
		assert.ok(pigmentIds.has(id), `${label}.paletteIds contains unknown pigment ${id}`);
	}
}

test('curated pigment definitions and colour conversions stay finite and bounded', () => {
	assert.ok(colors.PIGMENTS.length >= 14);
	assert.equal(new Set(colors.PIGMENTS.map((pigment) => pigment.id)).size, colors.PIGMENTS.length);

	for (const pigment of colors.PIGMENTS) {
		assert.match(pigment.hex, /^#[0-9a-f]{6}$/i);
		assert.equal(pigment.absorption.length, 3);
		for (const channel of pigment.absorption) assertFiniteRange(channel, 0.025, 4, pigment.name);
		for (const key of ['diffusion', 'granulation', 'staining', 'density']) {
			assert.ok(Number.isFinite(pigment[key]), `${pigment.name}.${key} must be finite`);
		}
	}

	for (const input of [Number.NEGATIVE_INFINITY, Number.NaN, -2, 0, 0.04045, 0.5, 1, 3, Infinity]) {
		assertFiniteRange(colors.srgbToLinear(input), 0, 1, `srgbToLinear(${input})`);
	}

	for (const input of ['#000000', '#fff', '#315a96', 'not-a-colour', '', '#12345678']) {
		for (const channel of colors.hexToRgb(input))
			assertFiniteRange(channel, 0, 1, `hexToRgb(${input})`);
		for (const channel of colors.colorToAbsorption(input)) {
			assertFiniteRange(channel, 0.025, 4, `colorToAbsorption(${input})`);
		}
	}

	for (const amount of [Number.NaN, -1, 0, 0.5, 1, 2, Infinity]) {
		const mixed = colors.mixAbsorption([0.2, 0.5, 1], [3, 2, 0.25], amount);
		assert.equal(mixed.length, 3);
		assert.ok(mixed.every(Number.isFinite));
		assert.ok(mixed.every((channel) => channel >= 0.2 && channel <= 3));
	}
});

test('pointer interpolation sanitizes hostile samples without gaps, NaN coordinates, or runaway work', () => {
	const hostile = {
		x: Number.NaN,
		y: Infinity,
		pressure: Number.NEGATIVE_INFINITY,
		tiltX: 900,
		tiltY: -900,
		time: -5
	};
	const sanitized = pointer.sanitizeStrokePoint(hostile);
	assert.deepEqual(sanitized, { x: 0.5, y: 0.5, pressure: 0.5, tiltX: 90, tiltY: -90, time: 0 });

	const samples = pointer.interpolateStroke(
		hostile,
		{ x: 4, y: -3, pressure: 2, tiltX: -200, tiltY: 200, time: 40 },
		Number.NaN
	);
	assert.ok(samples.length > 1 && samples.length <= 128);
	for (const [index, sample] of samples.entries()) {
		for (const value of Object.values(sample))
			assert.ok(Number.isFinite(value), `sample ${index} contains NaN`);
		assertFiniteRange(sample.x, 0, 1, `sample ${index}.x`);
		assertFiniteRange(sample.y, 0, 1, `sample ${index}.y`);
		assertFiniteRange(sample.pressure, 0.05, 1, `sample ${index}.pressure`);
		assertFiniteRange(sample.tiltX, -90, 90, `sample ${index}.tiltX`);
		assertFiniteRange(sample.tiltY, -90, 90, `sample ${index}.tiltY`);
		assert.ok(sample.time >= 0);
	}
	assert.deepEqual(samples.at(-1), {
		x: 1,
		y: 0,
		pressure: 1,
		tiltX: -90,
		tiltY: 90,
		time: 40
	});

	const stationary = { x: 0.25, y: 0.75, pressure: 0.4, tiltX: 0, tiltY: 0, time: 12 };
	assert.deepEqual(pointer.interpolateStroke(stationary, stationary, 0), [stationary]);
	for (const speed of [Number.NaN, -1, 0, 0.5, 5, Infinity]) {
		assertFiniteRange(pointer.inferredPressure(speed), 0.32, 0.72, `pressure at speed ${speed}`);
	}
});

test('presets are complete, named, unique, and valid after merging with defaults', () => {
	const defaults = defaultSettings();
	assertValidSettings(defaults, 'defaults');
	assert.deepEqual(
		new Set(presetsModule.BRUSHES.map((brush) => brush.id)),
		new Set(types.BRUSH_TYPES),
		'every declared brush type needs a rendered brush definition'
	);
	for (const brush of presetsModule.BRUSHES) {
		assert.ok(brush.name.trim().length > 0);
		assert.ok(brush.description.trim().length >= 12, `${brush.name} needs a useful description`);
		for (const key of ['pigmentScale', 'waterScale', 'flowScale']) {
			assertFiniteRange(brush[key], 0, 2, `${brush.name}.${key}`);
		}
	}
	const entries = studioPresets();
	const requiredNames = [
		'Morning Wash',
		'Monsoon Paper',
		'Dry Earth',
		'Ultramarine Bloom',
		'Oil and Ash',
		'Vermilion Current',
		'Moss on Stone',
		'Calcutta Rain',
		'Burnt Sienna Study',
		'Quiet Turbulence'
	];
	const names = new Set(entries.map((preset) => preset.name));
	const ids = new Set(entries.map((preset) => preset.id));
	assert.equal(names.size, entries.length, 'preset names must be unique');
	assert.equal(ids.size, entries.length, 'preset ids must be unique');
	for (const name of requiredNames) assert.ok(names.has(name), `missing preset: ${name}`);

	for (const preset of entries) {
		assert.match(preset.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
		assert.ok(preset.description.trim().length >= 12, `${preset.name} needs a useful description`);
		assert.equal(
			presetsModule.validatePreset(preset),
			true,
			`${preset.name} failed validatePreset()`
		);
		assertValidSettings(applyPreset(defaults, preset), `preset ${preset.name}`);
	}
});

test('seeded palette and Surprise me randomization are deterministic, coherent, and bounded', () => {
	const first = new random.SeededRandom('repeatable-studio');
	const second = new random.SeededRandom('repeatable-studio');
	const firstSequence = Array.from({ length: 80 }, () => first.next());
	assert.deepEqual(
		firstSequence,
		Array.from({ length: 80 }, () => second.next())
	);
	assert.ok(firstSequence.every((value) => value >= 0 && value < 1));

	const pigmentIds = new Set(colors.PIGMENTS.map((pigment) => pigment.id));
	for (const harmony of ['analogous', 'earth', 'monsoon', 'complementary', 'quiet']) {
		const palette = random.paletteForHarmony(harmony, 20260722, 5);
		assert.deepEqual(palette, random.paletteForHarmony(harmony, 20260722, 5));
		assert.equal(new Set(palette).size, palette.length);
		assert.ok(palette.length >= 2 && palette.length <= 5);
		assert.ok(palette.every((id) => pigmentIds.has(id)));
	}

	const defaults = defaultSettings();
	const repeat = random.surpriseSettings(defaults, 39191);
	assert.deepEqual(repeat, random.surpriseSettings(defaults, 39191));
	assert.notDeepEqual(repeat, random.surpriseSettings(defaults, 39192));

	for (let seed = 0; seed < 128; seed += 1) {
		const settings = random.surpriseSettings(defaults, seed);
		assert.equal(settings.background.seed, seed);
		assert.ok(random.isSafeRandomSettings(settings), `seed ${seed} failed the safe-range guard`);
		assertValidSettings(settings, `random seed ${seed}`);
		assertFiniteRange(settings.brushSize, 22, 72, `random seed ${seed}.brushSize`);
		assertFiniteRange(settings.background.regions, 3, 8, `random seed ${seed}.regions`);
	}
});

test('export filenames, preferences, and project serialization round-trip safely', async () => {
	const fixedDate = new Date(2026, 6, 22, 15, 30, 45);
	for (const extension of ['png', 'jpeg', 'webp', 'livingpigment']) {
		const filename = project.createArtworkFilename(extension, fixedDate);
		assert.equal(filename, `living-pigment-art-2026-07-22-153045.${extension}`);
		assert.match(
			filename,
			/^living-pigment-art-\d{4}-\d{2}-\d{2}-\d{6}\.(?:png|jpeg|webp|livingpigment)$/
		);
		assert.doesNotMatch(filename, /[<>:"/\\|?*]/);
	}

	const settings = defaultSettings();
	assert.deepEqual(project.preferenceSubset(settings), {
		brush: settings.brush,
		primaryPigmentId: settings.primaryPigmentId,
		quality: settings.quality,
		colorMode: settings.colorMode
	});

	const width = 32;
	const height = 32;
	const fieldLength = width * height * 4;
	const fields = {
		state: Uint8Array.from({ length: fieldLength }, (_, index) => index % 251),
		deposit: Uint8Array.from({ length: fieldLength }, (_, index) => (index * 3) % 253),
		flow: Uint8Array.from({ length: fieldLength }, (_, index) => (index * 7) % 255)
	};
	const metadata = {
		version: 1,
		width,
		height,
		createdAt: '2026-07-22T10:00:00.000Z',
		settings
	};
	const encoded = project.encodeProject(metadata, fields);
	const decoded = project.decodeProject(encoded);
	assert.deepEqual(decoded.metadata, metadata);
	for (const key of ['state', 'deposit', 'flow']) {
		assert.deepEqual(decoded.fields[key], fields[key], `${key} changed during round-trip`);
	}
	const compressed = await project.compressProject(encoded);
	const decompressed = await project.decompressProject(compressed);
	assert.deepEqual(decompressed, encoded, 'compressed project bytes changed during round-trip');
	await assert.rejects(
		() => project.decompressProject({ size: project.MAX_PROJECT_BYTES + 1 }),
		/size limit/i
	);

	assert.throws(
		() => project.encodeProject(metadata, { ...fields, flow: fields.flow.slice(1) }),
		/field does not match/i
	);
	const wrongMagic = encoded.slice();
	wrongMagic[0] ^= 0xff;
	assert.throws(() => project.decodeProject(wrongMagic), /not a Living Pigment Studio project/i);
	assert.throws(() => project.decodeProject(encoded.slice(0, -1)), /incomplete|altered/i);
	assert.throws(
		() => project.decodeProject(project.encodeProject({ ...metadata, version: 2 }, fields)),
		/unsupported values/i
	);
	assert.throws(
		() =>
			project.decodeProject(
				project.encodeProject(
					{ ...metadata, settings: { ...settings, brushSize: Number.NaN } },
					fields
				)
			),
		/unsupported values/i
	);
	assert.throws(
		() =>
			project.decodeProject(
				project.encodeProject(
					{ ...metadata, settings: { ...settings, primaryPigmentId: 'not-a-pigment' } },
					fields
				)
			),
		/unsupported values/i
	);
	assert.throws(
		() =>
			project.decodeProject(
				project.encodeProject({ ...metadata, settings: { ...settings, background: null } }, fields)
			),
		/unsupported values/i
	);
	const corruptHeaderLength = encoded.slice();
	new DataView(corruptHeaderLength.buffer).setUint32(
		new TextEncoder().encode('LPIGv1\n').length,
		0x7fffffff,
		true
	);
	assert.throws(() => project.decodeProject(corruptHeaderLength), /header is corrupt/i);
});

test('keyboard painting shortcuts stay inactive inside editable and interactive controls without a DOM', () => {
	for (const tagName of ['INPUT', 'textarea', 'Select', 'button', 'summary']) {
		assert.equal(
			project.isShortcutInput({ tagName }),
			true,
			`${tagName} should suppress shortcuts`
		);
	}
	assert.equal(project.isShortcutInput({ tagName: 'DIV', isContentEditable: true }), true);
	assert.equal(project.isShortcutInput({ tagName: 'CANVAS' }), false);
	assert.equal(project.isShortcutInput({ tagName: 'BODY' }), false);
	assert.equal(project.isShortcutInput({}), false);
	assert.equal(project.isShortcutInput(null), false);
});

test('the post and dynamic publishing pipeline expose the canonical visualization route', () => {
	const post = read('src', 'lib', 'posts', 'create-art-living-pigment-studio.md');
	const postRoute = read('src', 'routes', 'blog', '[category]', '[slug]', '+page.ts');
	const postServer = read('src', 'routes', 'blog', '[category]', '[slug]', '+page.server.ts');
	const visualizationListing = read('src', 'routes', 'blog', 'visualizations', '+page.server.ts');
	const sitemap = read('src', 'routes', 'sitemap.xml', '+server.ts');
	const rss = read('src', 'routes', 'rss.xml', '+server.ts');

	assert.match(post, /^---[\s\S]*?title:\s*["']Create Art: A Living Pigment Studio["']/m);
	assert.match(
		post,
		/^description:\s*["']Paint with digital pigments that spread, mix, dry, granulate,/m
	);
	assert.match(post, /^date:\s*["']?2026-07-22["']?\s*$/m);
	assert.match(post, /^thumbnail:\s*["']\/images\/create-art-living-pigment-studio\.webp["']/m);
	assert.match(post, /^thumbnailAlt:\s*["'].+["']/m);
	assert.match(post, /^category:\s*["']Visualizations["']/m);
	assert.match(post, /^published:\s*true\s*$/m);
	assert.match(post, /^color:\s*["']#[0-9a-f]{6}["']/im);
	for (const tag of ['Shaders', 'WebGL', 'Watercolor', 'Simulation', 'Interactive Art']) {
		assert.match(post, new RegExp(`["']${tag}["']`));
	}
	assert.match(
		post,
		/import\s+LivingPigmentStudio\s+from\s+['"][^'"]+LivingPigmentStudio\.svelte['"]/
	);
	assert.match(post, /<LivingPigmentStudio\s*\/>/);
	assert.match(post, /<TTS\s*\/>/);
	assert.match(post, /<Pi[\s\S]*create-art-living-pigment-studio\.webp/);
	assert.match(post, /field_new\(x\)|field_\{?new\}?|field.*velocity.*time/is);
	assert.match(post, /not a complete|does not solve|simplif(?:y|ies|ied)|artistic model/i);

	assert.match(postRoute, /import\.meta\.glob<[^>]+>\(['"]\/src\/lib\/posts\/\*\.md['"]\)/);
	assert.match(postRoute, /params\.slug/);
	assert.match(postServer, /getPublishedPost\(slug\)/);
	assert.match(postServer, /postPath\(\{\s*category:/);
	assert.match(visualizationListing, /getPublishedPostsByCategory\(['"]visualizations['"]\)/);
	assert.match(sitemap, /getPublishedPosts|isIndexablePost/);
	assert.match(rss, /getPublishedPosts|isIndexablePost/);

	const thumbnail = path.join(root, 'static', 'images', 'create-art-living-pigment-studio.webp');
	assert.ok(fs.existsSync(thumbnail), 'the living-pigment thumbnail is missing');
	assert.ok(fs.statSync(thumbnail).size > 0, 'the living-pigment thumbnail is empty');
});

test('studio controls expose meaningful painting, evolution, correction, and local-save actions', () => {
	const componentDirectory = path.join(
		root,
		'src',
		'lib',
		'components',
		'visualizations',
		'living-pigment'
	);
	const componentFiles = filesBelow(componentDirectory).filter((file) => file.endsWith('.svelte'));
	assert.ok(
		componentFiles.length >= 2,
		'expected the studio to be split into maintainable Svelte components'
	);
	const source = combinedSource([...componentFiles, path.join(featureDirectory, 'presets.ts')]);

	for (const label of [
		'Watercolor',
		'Oil',
		'Hybrid|Living pigment',
		'Brush size',
		'Pigment amount|Pigment load',
		'Water|Solvent',
		'Diffusion',
		'Drying',
		'Viscosity',
		'Granulation',
		'Edge darkening',
		'Simulation speed'
	]) {
		assert.match(source, new RegExp(label, 'i'), `missing control label: ${label}`);
	}
	for (const action of [
		'Pause|Resume',
		'Step',
		'Dry artwork',
		'Clear',
		'Undo',
		'Redo',
		'New evolving background|Random(?:ize)? background',
		'Reset controls',
		'Export PNG',
		'Save project',
		'Load project',
		'Fullscreen'
	]) {
		assert.match(source, new RegExp(action, 'i'), `missing studio action: ${action}`);
	}
	for (const brush of [
		'Round',
		'Soft wash|Wash',
		'Flat',
		'Dry brush',
		'Dropper',
		'Palette knife',
		'Water-only',
		'Lifter',
		'True clear'
	]) {
		assert.match(source, new RegExp(brush, 'i'), `missing brush behavior: ${brush}`);
	}

	assert.match(source, /<label|aria-label=/i);
	assert.match(source, /aria-live=["']polite["']/i);
	assert.match(source, /focus-visible/i);
	assert.match(source, /pointer(?:down|move|up|cancel)|addEventListener\(['"]pointer/i);
	assert.match(source, /setPointerCapture/);
	assert.match(source, /touch-action:\s*none|touch-action-none/i);
	assert.match(source, /prefers-reduced-motion|matchMedia\(['"]\(prefers-reduced-motion/i);
	assert.match(source, /Preparing the pigment surface/i);
	assert.match(source, /remains local|stored locally|never uploaded|does not leave/i);
});

test('WebGL2 shaders update living fields through ping-pong framebuffers rather than a static filter', () => {
	const featureFiles = filesBelow(featureDirectory);
	const engineFiles = featureFiles.filter(
		(file) => /engine|webgl/i.test(path.basename(file)) && file.endsWith('.ts')
	);
	const shaderFiles = featureFiles.filter(
		(file) =>
			/\.(?:glsl|frag|vert|vs|fs)$/i.test(file) || (/shaders?/i.test(file) && file.endsWith('.ts'))
	);
	assert.ok(engineFiles.length > 0, 'the living-pigment WebGL engine file is missing');
	assert.ok(shaderFiles.length > 0, 'the living-pigment shader source is missing');
	const engine = combinedSource(engineFiles);
	const shaders = combinedSource(shaderFiles);

	assert.match(engine, /getContext\(\s*['"]webgl2['"]/);
	assert.match(engine, /createTexture\(/);
	assert.match(engine, /createFramebuffer\(/);
	assert.match(engine, /framebufferTexture2D\(/);
	assert.match(engine, /RGBA16F|HALF_FLOAT/);
	assert.match(engine, /RGBA8|UNSIGNED_BYTE/);
	assert.match(engine, /EXT_color_buffer_float|getExtension/);
	assert.match(engine, /ping|pong|swap|readIndex|front.*back|current.*next|next.*current/is);
	assert.match(engine, /webglcontextlost/);
	assert.match(engine, /webglcontextrestored/);

	assert.match(shaders, /#version\s+300\s+es/);
	assert.match(shaders, /uniform\s+sampler2D/);
	assert.match(shaders, /simulation|simulate/i);
	assert.match(shaders, /inject|brush/i);
	assert.match(shaders, /render|display/i);
	assert.match(shaders, /advect|backtrace|velocity|flow/i);
	assert.match(shaders, /laplacian|neighbou?r|north|south|east|west/i);
	assert.match(shaders, /diffus/i);
	assert.match(shaders, /moisture|wetness|water/i);
	assert.match(shaders, /dry|evapor/i);
	assert.match(shaders, /deposit/i);
	assert.match(shaders, /granul|grain|paper/i);
	assert.match(shaders, /viscos/i);
	assert.match(shaders, /absorption|subtractive|Kubelka|mix/i);
	assert.match(shaders, /sample_field\(u_deposit,\s*uv\)/);
	assert.doesNotMatch(shaders, /gl_FragColor\s*=\s*texture\([^;]+\)\s*;/i);
});

test('engine teardown unregisters context listeners and explicitly releases the WebGL context', () => {
	const added = [];
	const removed = [];
	let contextReleased = false;
	const gl = {
		MAX_DRAW_BUFFERS: 1,
		MAX_COLOR_ATTACHMENTS: 2,
		RGBA16F: 3,
		HALF_FLOAT: 4,
		RGBA8: 5,
		UNSIGNED_BYTE: 6,
		getParameter: () => 3,
		getExtension: (name) => {
			if (name === 'EXT_color_buffer_float') return null;
			if (name === 'WEBGL_lose_context') {
				return { loseContext: () => (contextReleased = true) };
			}
			return null;
		}
	};
	const canvas = {
		getContext: (kind) => (kind === 'webgl2' ? gl : null),
		addEventListener: (name, listener) => added.push([name, listener]),
		removeEventListener: (name, listener) => removed.push([name, listener])
	};
	const previousWindow = globalThis.window;
	globalThis.window = { location: { search: '' } };
	try {
		const engine = new engineModule.LivingPigmentEngine(canvas, defaultSettings());
		engine.destroy();
	} finally {
		if (previousWindow === undefined) delete globalThis.window;
		else globalThis.window = previousWindow;
	}
	assert.deepEqual(
		added.map(([name]) => name),
		['webglcontextlost', 'webglcontextrestored']
	);
	assert.deepEqual(removed, added);
	assert.equal(contextReleased, true);
});

test('component destruction stops animation and releases observers, listeners, and GPU resources', () => {
	const componentDirectory = path.join(
		root,
		'src',
		'lib',
		'components',
		'visualizations',
		'living-pigment'
	);
	const componentFiles = filesBelow(componentDirectory).filter((file) => file.endsWith('.svelte'));
	const featureFiles = filesBelow(featureDirectory);
	const engineFiles = featureFiles.filter(
		(file) => /engine|webgl/i.test(path.basename(file)) && file.endsWith('.ts')
	);
	const components = combinedSource(componentFiles);
	const engine = combinedSource(engineFiles);
	const runtime = `${components}\n${engine}`;

	assert.match(runtime, /requestAnimationFrame/);
	assert.match(runtime, /cancelAnimationFrame/);
	assert.match(components, /new\s+ResizeObserver/);
	assert.match(components, /new\s+IntersectionObserver/);
	assert.match(components, /\.disconnect\(\)/);
	assert.match(components, /visibilitychange/);
	assert.match(components, /removeEventListener\(\s*['"]visibilitychange['"]/);
	assert.match(components, /\.destroy\(\)/);

	assert.match(engine, /destroy\s*\(\)/);
	for (const [allocation, cleanup] of [
		['createTexture', 'deleteTexture'],
		['createFramebuffer', 'deleteFramebuffer'],
		['createProgram', 'deleteProgram'],
		['createBuffer', 'deleteBuffer'],
		['createVertexArray', 'deleteVertexArray']
	]) {
		if (new RegExp(`${allocation}\\s*\\(`).test(engine)) {
			assert.match(
				engine,
				new RegExp(`${cleanup}\\s*\\(`),
				`${allocation} resources need ${cleanup}`
			);
		}
	}
	assert.match(engine, /removeEventListener\s*\(|AbortController|\.abort\(\)/);
	assert.match(engine, /webglcontextlost/);
	assert.match(engine, /webglcontextrestored/);
});
