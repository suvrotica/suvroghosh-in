import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const read = (...segments) => fs.readFileSync(path.join(root, ...segments), 'utf8');

test('CT numerical and Worker layers remain separated from the Svelte interface', () => {
	const coreDirectory = path.join(root, 'src/lib/visualizations/ct-reconstruction');
	const workerDirectory = path.join(coreDirectory, 'worker');
	for (const file of [
		'types.ts',
		'materials.ts',
		'phantom.ts',
		'geometry.ts',
		'prng.ts',
		'beer-lambert.ts',
		'projector.ts',
		'fft.ts',
		'filters.ts',
		'backprojection.ts',
		'metrics.ts',
		'numerical.test.ts'
	]) {
		assert.ok(fs.existsSync(path.join(coreDirectory, file)), `missing ${file}`);
	}
	for (const file of [
		'protocol.ts',
		'client.ts',
		'handler.ts',
		'ctReconstruction.worker.ts',
		'worker.test.ts'
	]) {
		assert.ok(fs.existsSync(path.join(workerDirectory, file)), `missing Worker ${file}`);
	}

	const client = read('src', 'lib', 'visualizations', 'ct-reconstruction', 'worker', 'client.ts');
	const handler = read('src', 'lib', 'visualizations', 'ct-reconstruction', 'worker', 'handler.ts');
	assert.match(client, /new Worker\(new URL\('\.\/ctReconstruction\.worker\.ts'/);
	assert.match(client, /message\.data\.jobId !== this\.jobId/);
	assert.match(client, /addEventListener\('error'/);
	assert.match(client, /addEventListener\('messageerror'/);
	assert.match(handler, /type: 'RECONSTRUCTED'/);
	assert.match(handler, /filterProjection/);
	assert.match(handler, /requireState\(request\.jobId\)/);
	assert.match(handler, /includePreview \|\| complete/);
	assert.match(handler, /acquiredProjectionCount/);
});

test('the laboratory exposes the complete transport, experiment, and accessibility surface', () => {
	const component = read(
		'src',
		'lib',
		'components',
		'visualizations',
		'ct-reconstruction',
		'CTReconstructionLab.svelte'
	);
	const controls = read(
		'src',
		'lib',
		'components',
		'visualizations',
		'ct-reconstruction',
		'CTControls.svelte'
	);
	const editor = read(
		'src',
		'lib',
		'components',
		'visualizations',
		'ct-reconstruction',
		'PhantomEditor.svelte'
	);
	const acquisition = read(
		'src',
		'lib',
		'components',
		'visualizations',
		'ct-reconstruction',
		'AcquisitionView.svelte'
	);
	const sinogram = read(
		'src',
		'lib',
		'components',
		'visualizations',
		'ct-reconstruction',
		'SinogramView.svelte'
	);
	for (const child of [
		'PhantomEditor',
		'AcquisitionView',
		'SinogramView',
		'ReconstructionComparison',
		'CTControls',
		'ExperimentGuides'
	]) {
		assert.match(component, new RegExp(`<${child}\\b`), `missing ${child} integration`);
	}
	for (const control of [
		'Start scan',
		'Pause',
		'Step',
		'Restart',
		'Reset',
		'Projection angles',
		'Detector bins',
		'Relative dose proxy',
		'Missing-angle width',
		'Frequency filter',
		'Filter cutoff',
		'New noise realisation'
	]) {
		assert.match(controls, new RegExp(control.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
	}
	assert.match(editor, /onpointerdown/);
	assert.match(editor, /onkeydown/);
	assert.match(editor, /Undo/);
	assert.match(editor, /Metal/);
	assert.match(component, /prefers-reduced-motion/);
	assert.match(component, /fullscreenchange/);
	assert.match(component, /aria-live="polite"/);
	assert.match(component, /transform: translateX\(-50%\)/);
	assert.match(component, /cancelPendingInitialization/);
	assert.doesNotMatch(component, /<main\b/);
	assert.match(component, /class="transport-region"[\s\S]*mode="transport"/);
	assert.match(component, /class="advanced-region"[\s\S]*mode="settings"/);
	assert.match(component, /@container ct-lab \(max-width: 80rem\)/);
	assert.match(component, /\.transport-region\s*\{[\s\S]*order:\s*1/);
	assert.match(component, /\.workbench\s*\{[\s\S]*order:\s*10/);
	assert.match(component, /\.advanced-region\s*\{[\s\S]*order:\s*20/);
	assert.ok(
		component.indexOf('class="transport-region"') < component.indexOf('class="workbench"') &&
			component.indexOf('class="workbench"') < component.indexOf('id="ct-fullscreen-settings"'),
		'collapsed visual and DOM order should both be transport, workbench, then settings'
	);
	assert.match(
		component,
		/grid-template-columns:\s*minmax\(0,\s*1\.55fr\)\s*minmax\(16rem,\s*1fr\)/
	);
	assert.match(component, /data-tts-exclude/);
	assert.match(component, /class="fullscreen-toolbar"/);
	assert.match(component, /aria-controls="ct-fullscreen-settings"/);
	assert.match(component, /inert=\{fullscreen && fullscreenSettingsOpen\}/);
	assert.match(component, /fullscreenNeedsRecovery \? 'Reconnect' : 'Restart'/);
	assert.match(component, />\s*Exit\s*</);
	assert.match(controls, /acquiredProjectionCount/);
	assert.match(acquisition, /angleRad \+ Math\.PI \/ 2/);
	assert.match(sinogram, /<button[\s\S]*type="button"[\s\S]*class="plot"/);
	assert.doesNotMatch(sinogram, /role="grid"/);
});

test('responsive CT controls, touch ownership, and reconstruction modes remain explicit', () => {
	const controls = read(
		'src',
		'lib',
		'components',
		'visualizations',
		'ct-reconstruction',
		'CTControls.svelte'
	);
	const editor = read(
		'src',
		'lib',
		'components',
		'visualizations',
		'ct-reconstruction',
		'PhantomEditor.svelte'
	);
	const comparison = read(
		'src',
		'lib',
		'components',
		'visualizations',
		'ct-reconstruction',
		'ReconstructionComparison.svelte'
	);
	const reconstruction = read(
		'src',
		'lib',
		'components',
		'visualizations',
		'ct-reconstruction',
		'ReconstructionView.svelte'
	);

	assert.match(controls, /type ControlMode = 'all' \| 'transport' \| 'settings'/);
	assert.match(controls, /mode !== 'settings'/);
	assert.match(controls, /mode !== 'transport'/);
	assert.doesNotMatch(controls, /Open laboratory fullscreen/);
	assert.doesNotMatch(controls, /class="boundary"/);
	assert.match(controls, /@container \(min-width: 42rem\)/);

	assert.match(editor, /const TAP_MOVE_THRESHOLD_PX = 10/);
	assert.match(editor, /data-tool=\{tool\}/);
	assert.match(editor, /canvas\[data-tool='inspect'\][\s\S]*touch-action:\s*pan-y/);
	assert.match(editor, /canvas\[data-tool='brush'\][\s\S]*touch-action:\s*none/);
	assert.match(editor, /if \(!tapMovementExceeded\)/);
	assert.match(editor, /@media \(max-width: 600px\)/);
	assert.match(editor, /\.tool-strip button:nth-last-child\(-n \+ 2\)/);
	assert.match(
		editor,
		/@media \(forced-colors: active\)[\s\S]*\.canvas-frame:focus-visible[\s\S]*outline: 3px solid Highlight/
	);

	assert.match(comparison, /role="tablist"/);
	assert.match(comparison, /role="tab"/);
	assert.doesNotMatch(comparison, /ArrowUp|ArrowDown/);
	assert.match(comparison, /let activeView = \$state<ViewMode>\('filtered'\)/);
	assert.match(comparison, /nextLayout === 'tablet' \? 'compare' : 'filtered'/);
	assert.match(comparison, /responsiveThresholds/);
	assert.match(comparison, /comparisonHeading\.focus/);
	assert.match(comparison, /Compare BP ↔ FBP/);
	assert.match(comparison, /<dl>/);
	assert.doesNotMatch(comparison, /min-width:\s*30rem/);
	assert.match(comparison, /\.image-grid\[data-view='filtered'\] \.stage-filtered/);
	assert.match(reconstruction, /<div class:scale-difference[\s\S]*class="scale"/);
	assert.ok(
		reconstruction.indexOf('class="canvas-frame"') < reconstruction.indexOf('class="scale"'),
		'intensity scale should follow the canvas instead of covering it'
	);
});

test('the mdsvex post uses the normal publishing and visible FAQ pipeline', () => {
	const post = read(
		'src',
		'lib',
		'posts',
		'how-a-scanner-sees-reconstructing-a-body-from-shadows.md'
	);
	const contentValidator = read('scripts', 'validate-content.mjs');
	assert.match(post, /category: "Visualizations"/);
	assert.match(post, /published: true/);
	assert.match(post, /date: "2026-07-26"/);
	assert.match(post, /dateModified: "2026-07-28"/);
	assert.match(post, /interactiveFirst: true/);
	assert.match(contentValidator, /'interactiveFirst'/);
	assert.match(contentValidator, /typeof metadata\.interactiveFirst !== 'boolean'/);
	assert.match(post, /thumbnailAlt:/);
	assert.match(post, /<TTS \/>/);
	assert.match(post, /<CTReconstructionLab \/>/);
	assert.ok(
		post.indexOf('<CTReconstructionLab />') < post.indexOf('<TTS />'),
		'the interactive laboratory should precede article audio and long-form material'
	);
	assert.doesNotMatch(post, /<Pi\b/);
	assert.match(post, /p_\\theta\(s\)=\\int/);
	assert.match(post, /f_\{\\mathrm\{FBP\}\}/);
	assert.match(post, /What most explanations miss/);
	assert.match(post, /Educational and scientific boundary/);
	assert.match(post, /Photon starvation/);
	assert.equal((post.match(/ {2}- question:/g) ?? []).length, 8);
});

test('the finished CT thumbnail exists within the repository media budget', () => {
	const thumbnail = path.join(
		root,
		'static/images/visualizations/how-a-scanner-sees-ct-reconstruction.webp'
	);
	assert.ok(fs.existsSync(thumbnail), 'missing CT laboratory thumbnail');
	assert.ok(fs.statSync(thumbnail).size < 750 * 1024, 'CT thumbnail must remain below 750 KiB');
});

test('the CT implementation contains no unfinished placeholders', () => {
	const files = [
		...fs
			.readdirSync(path.join(root, 'src/lib/visualizations/ct-reconstruction'), {
				recursive: true,
				withFileTypes: true
			})
			.filter((entry) => entry.isFile())
			.map((entry) => path.join(entry.parentPath, entry.name)),
		...fs
			.readdirSync(path.join(root, 'src/lib/components/visualizations/ct-reconstruction'), {
				recursive: true,
				withFileTypes: true
			})
			.filter((entry) => entry.isFile())
			.map((entry) => path.join(entry.parentPath, entry.name))
	];
	for (const file of files) {
		const source = fs.readFileSync(file, 'utf8');
		assert.doesNotMatch(source, /\b(?:TODO|FIXME|PLACEHOLDER)\b/i, path.relative(root, file));
	}
});
