import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, test } from 'node:test';
import { createServer } from 'vite';

const vite = await createServer({
	configFile: false,
	root: process.cwd(),
	appType: 'custom',
	server: { middlewareMode: true }
});

const { MonteCarloExperiment } = await vite.ssrLoadModule(
	'/src/lib/visualizations/monte-carlo/experiment.ts'
);
const { HaltonSampler, Mulberry32, PseudorandomSampler, StratifiedSampler, halton } =
	await vite.ssrLoadModule('/src/lib/visualizations/monte-carlo/samplers.ts');
const { calculateStatistics, checkpointCounts, classifyPoint } = await vite.ssrLoadModule(
	'/src/lib/visualizations/monte-carlo/statistics.ts'
);

after(async () => {
	await vite.close();
});

test('Mulberry32 reproduces exactly from the same numerical seed', () => {
	const first = new Mulberry32(20260721);
	const second = new Mulberry32(20260721);
	assert.deepEqual(
		Array.from({ length: 20 }, () => first.next()),
		Array.from({ length: 20 }, () => second.next())
	);
});

test('different seeds produce different ordinary pseudorandom sequences', () => {
	const first = new PseudorandomSampler(11);
	const second = new PseudorandomSampler(12);
	assert.notDeepEqual(
		Array.from({ length: 8 }, () => first.next()),
		Array.from({ length: 8 }, () => second.next())
	);
});

test('every sampler keeps coordinates inside the square domain', () => {
	const samplers = [
		new PseudorandomSampler(42),
		new StratifiedSampler(42, 10_000),
		new HaltonSampler(42)
	];
	for (const sampler of samplers) {
		for (let index = 0; index < 2_000; index += 1) {
			const point = sampler.next();
			assert.ok(point.x >= -1 && point.x < 1);
			assert.ok(point.y >= -1 && point.y < 1);
		}
	}
});

test('Halton radical inverses remain in the half-open unit interval', () => {
	for (let index = 0; index < 10_000; index += 1) {
		for (const base of [2, 3]) {
			const value = halton(index, base);
			assert.ok(value >= 0 && value < 1);
		}
	}
});

test('stratified sampling visits every intended stratum before repeating', () => {
	const sampler = new StratifiedSampler(7, 4);
	const cells = new Set();
	for (let index = 0; index < 4; index += 1) {
		const point = sampler.next();
		const column = Math.min(1, Math.floor((point.x + 1) / 1));
		const row = Math.min(1, Math.floor((point.y + 1) / 1));
		cells.add(`${column},${row}`);
	}
	assert.deepEqual([...cells].sort(), ['0,0', '0,1', '1,0', '1,1']);
});

test('point classification includes the circle boundary and rejects outside coordinates', () => {
	assert.equal(classifyPoint(0, 0), true);
	assert.equal(classifyPoint(1, 0), true);
	assert.equal(classifyPoint(0.6, 0.8), true);
	assert.equal(classifyPoint(0.8, 0.8), false);
	assert.equal(classifyPoint(1, 1), false);
});

test('the pi estimate, standard error, and confidence interval use the declared formulae', () => {
	const statistics = calculateStatistics(100, 80);
	const expectedEstimate = 3.2;
	const expectedStandardError = 4 * Math.sqrt((0.8 * 0.2) / 100);
	assert.equal(statistics.estimate, expectedEstimate);
	assert.equal(statistics.absoluteError, Math.abs(expectedEstimate - Math.PI));
	assert.equal(statistics.standardError, expectedStandardError);
	assert.deepEqual(statistics.confidenceInterval, {
		lower: expectedEstimate - 1.96 * expectedStandardError,
		upper: expectedEstimate + 1.96 * expectedStandardError
	});
	assert.equal(calculateStatistics(29, 20).confidenceInterval, null);
});

test('resetting identical experiment settings reproduces samples and statistics', () => {
	const settings = {
		seed: 104729,
		method: 'pseudorandom',
		targetSamples: 1_000,
		visiblePointCap: 1_000
	};
	const first = new MonteCarloExperiment(settings);
	const reset = new MonteCarloExperiment(settings);
	first.generate(1_000);
	reset.generate(1_000);
	assert.deepEqual(first.statistics(), reset.statistics());
	assert.deepEqual(first.observations, reset.observations);
	assert.deepEqual(first.visiblePoints, reset.visiblePoints);
});

test('a larger fixed-seed run gives a sensible estimate without a flaky random assertion', () => {
	const experiment = new MonteCarloExperiment({
		seed: 20260721,
		method: 'pseudorandom',
		targetSamples: 100_000,
		visiblePointCap: 10_000
	});
	experiment.generate(100_000);
	const estimate = experiment.statistics().estimate;
	assert.ok(estimate !== null && estimate > 3.12 && estimate < 3.17);
	assert.equal(experiment.statistics().displayedSamples, 10_000);
});

test('logarithmic checkpoint recording remains bounded at one million samples', () => {
	const checkpoints = checkpointCounts(1_000_000);
	assert.ok(checkpoints.length <= 20);
	assert.equal(checkpoints[0], 10);
	assert.equal(checkpoints.at(-1), 1_000_000);
	assert.deepEqual(
		checkpoints,
		[...new Set(checkpoints)].sort((first, second) => first - second)
	);

	const experiment = new MonteCarloExperiment({
		seed: 5,
		method: 'halton',
		targetSamples: 1_000_000,
		visiblePointCap: 10
	});
	experiment.generate(1_000_000);
	assert.equal(experiment.observations.length, checkpoints.length);
});

test('the published laboratory uses the normal post pipeline and meaningful WebGL2 shaders', () => {
	const root = process.cwd();
	const read = (...segments) => fs.readFileSync(path.join(root, ...segments), 'utf8');
	const post = read('src', 'lib', 'posts', 'monte-carlo-laboratory.md');
	const shaders = read('src', 'lib', 'visualizations', 'monte-carlo', 'shaders.ts');
	const component = read(
		'src',
		'lib',
		'components',
		'visualizations',
		'monte-carlo',
		'MonteCarloLab.svelte'
	);
	const thumbnail = path.join(root, 'static', 'images', 'monte-carlo-laboratory.svg');

	assert.match(post, /category: "Visualizations"/);
	assert.match(post, /<TTS \/>/);
	assert.match(post, /<MonteCarloLab \/>/);
	assert.match(shaders, /#version 300 es/);
	assert.match(shaders, /gl_PointCoord/);
	assert.match(shaders, /smoothstep/);
	assert.match(component, /IntersectionObserver/);
	assert.match(component, /visibilitychange/);
	assert.match(component, /aria-live="polite"/);
	assert.ok(fs.existsSync(thumbnail));
	assert.doesNotMatch(fs.readFileSync(thumbnail, 'utf8'), /<script/i);
});
