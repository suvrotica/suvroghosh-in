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
	assert.ok(
		component.indexOf('<div class="control-column">') <
			component.indexOf('<div class="workbench">'),
		'transport controls should precede the workbench on narrow layouts'
	);
	assert.match(controls, /acquiredProjectionCount/);
	assert.match(acquisition, /angleRad \+ Math\.PI \/ 2/);
	assert.match(sinogram, /<button[\s\S]*type="button"[\s\S]*class="plot"/);
	assert.doesNotMatch(sinogram, /role="grid"/);
});

test('the mdsvex post uses the normal publishing and visible FAQ pipeline', () => {
	const post = read(
		'src',
		'lib',
		'posts',
		'how-a-scanner-sees-reconstructing-a-body-from-shadows.md'
	);
	assert.match(post, /category: "Visualizations"/);
	assert.match(post, /published: true/);
	assert.match(post, /date: "2026-07-26"/);
	assert.match(post, /thumbnailAlt:/);
	assert.match(post, /<TTS \/>/);
	assert.match(post, /<CTReconstructionLab \/>/);
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
