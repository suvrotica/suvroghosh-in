import { describe, expect, it } from 'vitest';
import {
	DOPPLER_RATE_RANGE,
	MAX_SPATIAL_ONE_SHOTS_PER_FRAME,
	OMNIDIRECTIONAL_CONE,
	acousticZoneMix,
	continuousSourcePriority,
	distanceFilterFrequency,
	dopplerRateForRadialVelocity,
	selectSpatialOneShotsForFrame,
	type MovingAudioSource,
	type SpatialOneShotCandidate
} from './spatial-audio';

describe('spatial-audio physics helpers', () => {
	it('raises pitch for approach, lowers it for recession and leaves stationary sources unchanged', () => {
		expect(dopplerRateForRadialVelocity(-14)).toBeGreaterThan(1);
		expect(dopplerRateForRadialVelocity(14)).toBeLessThan(1);
		expect(dopplerRateForRadialVelocity(0)).toBe(1);
	});

	it('clamps even implausible radial speeds to the conservative urban range', () => {
		expect(dopplerRateForRadialVelocity(-1_000)).toBe(DOPPLER_RATE_RANGE.maximum);
		expect(dopplerRateForRadialVelocity(1_000)).toBe(DOPPLER_RATE_RANGE.minimum);
		expect(dopplerRateForRadialVelocity(Number.NaN)).toBe(1);
	});

	it('rolls off distant high frequencies and applies a stronger occlusion ceiling', () => {
		expect(distanceFilterFrequency(4, false)).toBeGreaterThan(distanceFilterFrequency(60, false));
		expect(distanceFilterFrequency(4, true)).toBeLessThan(distanceFilterFrequency(4, false));
		expect(distanceFilterFrequency(4, true)).toBeLessThanOrEqual(1_050);
	});

	it('uses an omnidirectional cone for continuous street emitters', () => {
		expect(OMNIDIRECTIONAL_CONE).toEqual({
			innerAngle: 360,
			outerAngle: 360,
			outerGain: 1
		});
	});
});

describe('acoustic zone mapping', () => {
	it('darkens and gently lowers ambience and rain in enclosed lanes', () => {
		const openStreet = acousticZoneMix(0, true);
		const narrowLane = acousticZoneMix(1, true);

		expect(narrowLane.ambienceLowpassHz).toBeLessThan(openStreet.ambienceLowpassHz);
		expect(narrowLane.weatherLowpassHz).toBeLessThan(openStreet.weatherLowpassHz);
		expect(narrowLane.ambienceGain).toBeLessThan(openStreet.ambienceGain);
		expect(narrowLane.weatherGain).toBeLessThan(openStreet.weatherGain);
		expect(narrowLane.rainLayerGain).toBeLessThan(openStreet.rainLayerGain);
		expect(narrowLane.ambienceGain).toBeGreaterThanOrEqual(0.2);
		expect(openStreet.ambienceGain).toBeLessThanOrEqual(0.25);
	});

	it('clamps enclosure inputs and fully silences the rain layer in dry weather', () => {
		expect(acousticZoneMix(-5, false).enclosure).toBe(0);
		expect(acousticZoneMix(5, false).enclosure).toBe(1);
		expect(acousticZoneMix(Number.NaN, false).enclosure).toBe(0.5);
		expect(acousticZoneMix(0.35, false).rainLayerGain).toBe(0);
	});
});

describe('spatial source budgeting', () => {
	const listener = { x: 0, z: 0, vx: 0, vz: 0 };

	function source(overrides: Partial<MovingAudioSource> = {}): MovingAudioSource {
		return {
			id: 'source',
			kind: 'motorbike',
			x: 20,
			z: 0,
			vx: 0,
			vz: 0,
			active: true,
			occluded: false,
			...overrides
		};
	}

	it('favours closing traffic over the same receding source', () => {
		const approaching = continuousSourcePriority(source({ vx: -6 }), listener);
		const receding = continuousSourcePriority(source({ vx: 6 }), listener);

		expect(approaching).toBeGreaterThan(receding);
	});

	it('lets an approaching threat survive ahead of less important nearby ambience', () => {
		const threat = continuousSourcePriority(source({ x: 45, vx: -6 }), listener);
		const nearbyCrowd = continuousSourcePriority(source({ kind: 'crowd', x: 1 }), listener);

		expect(threat).toBeGreaterThan(nearbyCrowd);
		expect(continuousSourcePriority(source({ active: false }), listener)).toBe(
			Number.NEGATIVE_INFINITY
		);
	});
});

describe('one-shot frame selection', () => {
	function event(
		id: string,
		kind: SpatialOneShotCandidate['kind'],
		priority: SpatialOneShotCandidate['priority'],
		category: SpatialOneShotCandidate['category']
	): SpatialOneShotCandidate {
		return { id, kind, priority, category };
	}

	it('caps a busy frame and keeps immediate safety cues ahead of reactions and footsteps', () => {
		const selected = selectSpatialOneShotsForFrame(
			[
				event('footstep', 'footstep', 'ambient', 'people'),
				event('reaction', 'reaction', 'important', 'people'),
				event('horn', 'horn', 'normal', 'traffic'),
				event('bell', 'bell', 'normal', 'traffic'),
				event('stumble', 'stumble', 'normal', 'interaction')
			],
			3
		);

		expect(selected.map(({ id }) => id)).toEqual(['horn', 'bell', 'stumble']);
		expect(selected).toHaveLength(3);
	});

	it('honours explicit priority, then category, while preserving stable ties', () => {
		const selected = selectSpatialOneShotsForFrame([
			event('people-first', 'reaction', 'normal', 'people'),
			event('traffic', 'reaction', 'normal', 'traffic'),
			event('important', 'reaction', 'important', 'people'),
			event('people-second', 'reaction', 'normal', 'people'),
			event('weather', 'reaction', 'normal', 'weather')
		]);

		expect(selected.map(({ id }) => id)).toEqual([
			'important',
			'traffic',
			'weather',
			'people-first'
		]);
		expect(selected).toHaveLength(MAX_SPATIAL_ONE_SHOTS_PER_FRAME);
	});

	it('handles empty and invalid budgets without exceeding the default cap', () => {
		const events = Array.from({ length: 8 }, (_, index) =>
			event(String(index), 'footstep', 'ambient', 'people')
		);

		expect(selectSpatialOneShotsForFrame(events, 0)).toEqual([]);
		expect(selectSpatialOneShotsForFrame(events, Number.NaN)).toHaveLength(
			MAX_SPATIAL_ONE_SHOTS_PER_FRAME
		);
	});
});
