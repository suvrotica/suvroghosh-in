import { describe, expect, it } from 'vitest';
import { buildVoicePlan } from './audio/mapping';
import { soundWorldPatch } from './audio/patches';
import { generateCoreExperience } from './core';
import {
	calculateRecurrenceAndDensity,
	extractFeatureStream,
	recurrenceTheilerWindow
} from './model/features';
import { ATTRACTOR_REGISTRY } from './model/registry';
import { generateTrajectory } from './model/trajectory';
import { createNoiseField } from './noise/noise-fields';
import { applyNoiseLens } from './noise/noise-transform';
import {
	createSeededRandom,
	createSubseed,
	deriveOrchestraSubseeds,
	ORCHESTRA_SUBSEED_LABELS
} from './seeded-random';
import { buildScore, stableScoreHash } from './score/score-builder';
import { SOUND_WORLD_PATCHES } from './score/musical-worlds';
import type { FeatureStreamData, OrchestraSnapshot } from './types';
import { DEFAULT_ORCHESTRA_SNAPSHOT } from './url-state';

function syntheticFeatures(count = 64): FeatureStreamData {
	const simulationSteps = new Uint32Array(count);
	const simulationTimes = new Float64Array(count);
	const position01 = new Float64Array(count * 3);
	const warpedPosition01 = new Float64Array(count * 3);
	const speed01 = new Float64Array(count);
	const curvature01 = new Float64Array(count);
	const stretching01 = new Float64Array(count);
	const recurrence01 = new Float64Array(count);
	const density01 = new Float64Array(count);
	const region = new Uint8Array(count);
	const sectionDirection = new Int8Array(count);
	const returnInterval01 = new Float64Array(count);
	const noiseValue01 = new Float64Array(count);
	const noiseGradient01 = new Float64Array(count);
	const noiseCurlAngle01 = new Float64Array(count);
	const noiseCellBoundary01 = new Float64Array(count);
	for (let index = 0; index < count; index += 1) {
		simulationSteps[index] = 10_000 + index;
		simulationTimes[index] = index * 0.1;
		const offset = index * 3;
		position01[offset] = index / count;
		position01[offset + 1] = 0.5;
		position01[offset + 2] = 0.6;
		warpedPosition01.set(position01.subarray(offset, offset + 3), offset);
		speed01[index] = 0.4;
		noiseValue01[index] = 0.5;
		noiseCurlAngle01[index] = 0.5;
	}
	return {
		pointCount: count,
		simulationSteps,
		simulationTimes,
		position01,
		warpedPosition01,
		speed01,
		curvature01,
		stretching01,
		recurrence01,
		density01,
		region,
		sectionDirection,
		returnInterval01,
		noiseValue01,
		noiseGradient01,
		noiseCurlAngle01,
		noiseCellBoundary01
	};
}

describe('seed streams and curated noise fields', () => {
	it('replays a seed exactly and deterministically separates all four sub-seeds', () => {
		const first = createSeededRandom('orchestra-seed');
		const second = createSeededRandom('orchestra-seed');
		expect(Array.from({ length: 20 }, () => first.nextUint32())).toEqual(
			Array.from({ length: 20 }, () => second.nextUint32())
		);
		const subseeds = deriveOrchestraSubseeds('orchestra-seed');
		expect(Object.keys(subseeds)).toEqual(ORCHESTRA_SUBSEED_LABELS);
		expect(new Set(Object.values(subseeds)).size).toBe(4);
		expect(createSubseed('orchestra-seed', 'noise-field')).not.toBe(
			createSubseed('orchestra-seed', 'visual-decoration')
		);
	});

	it.each(['smooth', 'curl', 'cellular', 'ridged'] as const)(
		'%s is coordinate/seed deterministic, bounded, and decorrelates another seed',
		(family) => {
			const first = createNoiseField(family, 12345);
			const repeat = createNoiseField(family, 12345);
			const other = createNoiseField(family, 54321);
			const coordinates = [0.271, -0.343, 0.817, 1.125] as const;
			const sample = first.sample(...coordinates);
			expect(repeat.sample(...coordinates)).toEqual(sample);
			expect(other.sample(...coordinates)).not.toEqual(sample);
			for (const value of [
				sample.value01,
				sample.gradient01,
				sample.curlAngle01,
				sample.cellBoundary01
			]) {
				expect(value).toBeGreaterThanOrEqual(0);
				expect(value).toBeLessThanOrEqual(1);
			}
			expect(Math.hypot(...sample.displacement)).toBeLessThanOrEqual(1 + 1e-12);
		}
	);

	it('makes influence zero an exact unwarped identity for every noise family and lens', () => {
		const trajectory = generateTrajectory('lorenz-63', { pointCount: 64 });
		for (const family of ['smooth', 'curl', 'cellular', 'ridged'] as const) {
			for (const lens of ['dye', 'warp', 'wake'] as const) {
				const weather = applyNoiseLens(trajectory, {
					family,
					lens,
					influence: 0,
					masterSeed: 'identity'
				});
				expect([...weather.warpedPositions]).toEqual([...trajectory.normalizedPositions]);
				expect(weather.gradient01.every((value) => value === 0)).toBe(true);
				expect(weather.cellBoundary01.every((value) => value === 0)).toBe(true);
			}
		}
	});

	it('keeps Dye and Wake geometry canonical while Warp visibly changes the observation', () => {
		const trajectory = generateTrajectory('lorenz-63', { pointCount: 128 });
		const make = (lens: 'dye' | 'warp' | 'wake') =>
			applyNoiseLens(trajectory, {
				family: 'curl',
				lens,
				influence: 0.7,
				masterSeed: 'lens-test'
			});
		expect([...make('dye').warpedPositions]).toEqual([...trajectory.normalizedPositions]);
		expect([...make('wake').warpedPositions]).toEqual([...trajectory.normalizedPositions]);
		expect([...make('warp').warpedPositions]).not.toEqual([...trajectory.normalizedPositions]);
	});

	it('uses a Theiler window so local persistence is not recurrence but a nonlocal return is', () => {
		const pointCount = 96;
		const positions = new Float64Array(pointCount * 3);
		for (let index = 0; index < pointCount; index += 1) {
			const offset = index * 3;
			positions[offset] = index === 0 || index === 64 ? 0.08 : 0.75 + index * 0.0002;
			positions[offset + 1] = index === 0 || index === 64 ? 0.08 : 0.76;
			positions[offset + 2] = index === 0 || index === 64 ? 0.08 : 0.77;
		}
		// The most recent eligible occupant shares the old point's cell but is farther away;
		// retaining the full typed cell chain must still recover the exact older return.
		positions.set([0.106, 0.106, 0.106], 31 * 3);
		const theilerWindow = recurrenceTheilerWindow(pointCount);
		const { recurrence01 } = calculateRecurrenceAndDensity(positions, theilerWindow);
		expect(theilerWindow).toBeGreaterThanOrEqual(32);
		expect(recurrence01.slice(0, theilerWindow).every((value) => value === 0)).toBe(true);
		expect(recurrence01[1]).toBe(0);
		expect(recurrence01[64]).toBeCloseTo(1, 12);
	});
});

describe('shared features and deterministic causal score', () => {
	const snapshot: OrchestraSnapshot = {
		...DEFAULT_ORCHESTRA_SNAPSHOT,
		attractorId: 'lorenz-63',
		stableStepSize: 0.005,
		masterSeed: 'score-regression'
	};

	it('feeds one bounded typed feature stream to both views and score events', () => {
		const trajectory = generateTrajectory('lorenz-63', { pointCount: 2_048 });
		const weather = applyNoiseLens(trajectory, {
			family: 'curl',
			lens: 'warp',
			influence: 0.55,
			masterSeed: snapshot.masterSeed
		});
		const features = extractFeatureStream(trajectory, weather);
		expect(features.position01).toBeInstanceOf(Float64Array);
		expect(features.region).toBeInstanceOf(Uint8Array);
		for (const values of [
			features.speed01,
			features.curvature01,
			features.stretching01,
			features.recurrence01,
			features.density01,
			features.noiseValue01,
			features.noiseGradient01,
			features.noiseCurlAngle01,
			features.noiseCellBoundary01
		]) {
			expect(values.every((value) => value >= 0 && value <= 1)).toBe(true);
		}
		const crossingIndices = [...features.sectionDirection.keys()].filter(
			(index) => features.sectionDirection[index] !== 0
		);
		for (let index = 1; index < crossingIndices.length; index += 1) {
			expect(crossingIndices[index] - crossingIndices[index - 1]).toBeGreaterThanOrEqual(8);
		}
		const score = buildScore(snapshot, features);
		expect(score.length).toBeGreaterThan(2);
		expect(new Set(score.map(({ id }) => id)).size).toBe(score.length);
		for (let index = 0; index < score.length; index += 1) {
			const event = score[index];
			expect(event.sourceFeature.length).toBeGreaterThan(0);
			expect(event.explanation.length).toBeGreaterThan(0);
			expect(event.pitchHz).toBeGreaterThanOrEqual(20);
			expect(event.pitchHz).toBeLessThanOrEqual(20_000);
			expect(event.velocity01).toBeGreaterThanOrEqual(0);
			expect(event.velocity01).toBeLessThanOrEqual(1);
			expect(event.pan).toBeGreaterThanOrEqual(-0.65);
			expect(event.pan).toBeLessThanOrEqual(0.65);
			if (index > 0) {
				expect(event.time).toBeGreaterThan(score[index - 1].time);
				expect(event.time - score[index - 1].time).toBeGreaterThanOrEqual(0.1 - 1e-9);
			}
		}
		expect(Math.max(...features.curvature01)).toBeCloseTo(1, 12);
		expect(score.some(({ type }) => type === 'fold')).toBe(true);
		for (const feature of [
			'height',
			'curvature',
			'stretching',
			'recurrence',
			'density',
			'noise'
		] as const) {
			expect(score.every((event) => event[feature] >= 0 && event[feature] <= 1)).toBe(true);
		}
		expect(new Set(score.map(({ height }) => height.toFixed(6))).size).toBeGreaterThan(1);
		expect(new Set(score.map(({ curvature }) => curvature.toFixed(6))).size).toBeGreaterThan(1);
		expect(new Set(score.map(({ stretching }) => stretching.toFixed(6))).size).toBeGreaterThan(1);
		expect(new Set(score.map(({ density }) => density.toFixed(6))).size).toBeGreaterThan(1);
		expect(new Set(score.map(({ noise }) => noise.toFixed(6))).size).toBeGreaterThan(1);

		const measured = score.find(
			(event) => event.curvature > 0.2 || event.recurrence > 0.2 || event.density > 0.2
		)!;
		const patch = soundWorldPatch('glass');
		const measuredPlan = buildVoicePlan(measured, patch, snapshot.masterSeed);
		const defaultedPlan = buildVoicePlan(
			{
				...measured,
				height: undefined,
				curvature: undefined,
				stretching: undefined,
				recurrence: undefined,
				density: undefined,
				noise: undefined
			},
			patch,
			snapshot.masterSeed
		);
		expect(measuredPlan).not.toEqual(defaultedPlan);
	});

	it('keeps recurrence nonlocal and folds reachable across every registered preset', () => {
		const distribution: Record<string, Record<string, number>> = {};
		for (const definition of ATTRACTOR_REGISTRY) {
			const presetSnapshot: OrchestraSnapshot = {
				...DEFAULT_ORCHESTRA_SNAPSHOT,
				attractorId: definition.id,
				stableStepSize: definition.stepSize ?? 1,
				masterSeed: `distribution-${definition.id}`
			};
			const result = generateCoreExperience(presetSnapshot);
			const counts: Record<string, number> = {};
			for (const event of result.score) counts[event.type] = (counts[event.type] ?? 0) + 1;
			distribution[definition.id] = counts;
			expect(result.score.length).toBeGreaterThan(1);
			expect(counts.fold ?? 0).toBeGreaterThan(0);
			expect(Object.keys(counts).length).toBeGreaterThanOrEqual(2);
			expect(counts.recurrence ?? 0).toBeLessThan(result.score.length / 2);
		}
		expect(distribution).toEqual({
			'lorenz-63': {
				fold: 77,
				recurrence: 7,
				'region-transition': 23,
				'section-crossing': 3
			},
			rossler: {
				fold: 26,
				recurrence: 3,
				'region-transition': 53,
				'section-crossing': 13
			},
			thomas: {
				fold: 8,
				recurrence: 2,
				'region-transition': 8,
				'section-crossing': 6
			},
			'sprott-b': {
				fold: 51,
				recurrence: 7,
				'region-transition': 35,
				'section-crossing': 5
			},
			langford: {
				fold: 35,
				recurrence: 2,
				'region-transition': 113,
				'section-crossing': 22
			},
			rucklidge: { fold: 15, recurrence: 1, 'region-transition': 7 },
			chua: { fold: 48, recurrence: 3, 'region-transition': 11 },
			henon: {
				fold: 330,
				recurrence: 3,
				'region-transition': 1_680,
				'section-crossing': 370
			},
			'mackey-glass': {
				fold: 11,
				recurrence: 11,
				'region-transition': 39,
				'section-crossing': 13
			},
			'rabinovich-fabrikant': {
				fold: 18,
				recurrence: 2,
				'region-transition': 12,
				'section-crossing': 6
			}
		});
	}, 30_000);

	it('gives cellular boundaries hysteresis instead of machine-gun retriggering', () => {
		const features = syntheticFeatures();
		features.noiseCellBoundary01[10] = 0.9;
		features.noiseCellBoundary01[11] = 0.92;
		features.noiseCellBoundary01[12] = 0.88;
		features.noiseCellBoundary01[25] = 0.5;
		features.noiseCellBoundary01[30] = 0.91;
		const score = buildScore(snapshot, features);
		const boundaries = score.filter(({ type }) => type === 'cell-boundary');
		expect(boundaries.map(({ simulationStep }) => simulationStep)).toEqual([10_010, 10_030]);
	});

	it('repeats the exact quantized score hash and ignores visual-decoration sub-seeds', () => {
		const first = generateCoreExperience(snapshot, { pointCount: 768 });
		const second = generateCoreExperience(snapshot, { pointCount: 768 });
		expect(first.scoreHash).toBe(second.scoreHash);
		expect(first.scoreHash).toBe('3ceefb3e');
		expect(first.score).toEqual(second.score);
		expect(stableScoreHash(first.score)).toMatch(/^[0-9a-f]{8}$/u);
		createSeededRandom(createSubseed(snapshot.masterSeed, 'visual-decoration')).nextUint32();
		expect(stableScoreHash(buildScore(snapshot, first.features))).toBe(first.scoreHash);
	});

	it('preserves event identity/order across sound worlds and raw/composed timing', () => {
		const generated = generateCoreExperience(snapshot, { pointCount: 1_024 });
		const worldScores = Object.keys(SOUND_WORLD_PATCHES).map((soundWorld) =>
			buildScore(
				{ ...snapshot, soundWorld: soundWorld as keyof typeof SOUND_WORLD_PATCHES },
				generated.features
			)
		);
		const identities = worldScores[0].map(({ id, simulationStep, time }) => ({
			id,
			simulationStep,
			time
		}));
		for (const score of worldScores.slice(1)) {
			expect(score.map(({ id, simulationStep, time }) => ({ id, simulationStep, time }))).toEqual(
				identities
			);
		}
		const raw = buildScore({ ...snapshot, timingMode: 'raw' }, generated.features);
		const composed = buildScore({ ...snapshot, timingMode: 'composed' }, generated.features);
		expect(composed.map(({ simulationStep }) => simulationStep)).toEqual(
			raw.map(({ simulationStep }) => simulationStep)
		);
		expect(composed.map(({ time }) => time)).not.toEqual(raw.map(({ time }) => time));
	});

	it('defines four bounded, hearing-safe typed orchestration patches', () => {
		expect(Object.keys(SOUND_WORLD_PATCHES)).toEqual(['glass', 'magnetic', 'swarm', 'radio']);
		for (const patch of Object.values(SOUND_WORLD_PATCHES)) {
			expect(patch.envelope.attack).toBeGreaterThanOrEqual(0.005);
			expect(patch.envelope.attack).toBeLessThanOrEqual(0.02);
			expect(patch.eventDensityCeiling).toBeLessThanOrEqual(12);
			expect(patch.filterHz[0]).toBeGreaterThanOrEqual(20);
			expect(patch.filterHz[1]).toBeLessThanOrEqual(20_000);
			expect(Math.max(...Object.values(patch.busGains))).toBeLessThan(0.5);
			expect(patch.mobile.maximumVoices).toBeLessThanOrEqual(3);
		}
	});
});
