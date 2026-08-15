import { describe, expect, it } from 'vitest';
import { createRayMarchingState } from './state';
import {
	MAX_RAY_MARCHING_SHARE_QUERY_LENGTH,
	buildRayMarchingShareUrl,
	parseRayMarchingShareState,
	quantizeRayMarchingCamera,
	serializeRayMarchingShareState
} from './url-state';

describe('ray-marching share state', () => {
	it('round-trips only the discrete scene and a coarsely quantised bounded camera', () => {
		const experience = createRayMarchingState({
			stage: 6,
			debugView: 'march-cost',
			palette: 'amber-archive',
			camera: { yaw: 0.327, pitch: -0.123 },
			quality: 'high',
			fogAmount: 0.31,
			pulseSpeed: 1.7,
			focalLength: 2.1
		});
		const serialised = serializeRayMarchingShareState(experience);
		expect([...serialised.keys()]).toEqual(['scene', 'stage', 'debug', 'palette', 'yaw', 'pitch']);
		expect(serialised.has('quality')).toBe(false);
		expect(serialised.has('fog')).toBe(false);
		expect(serialised.get('yaw')).toBe('0.35');
		expect(serialised.get('pitch')).toBe('-0.10');

		const parsed = parseRayMarchingShareState(serialised);
		expect(parsed.issues).toEqual([]);
		expect(parsed.state).toEqual({
			scene: 'cathedral',
			stage: 6,
			debugView: 'march-cost',
			palette: 'amber-archive',
			yaw: 0.35,
			pitch: -0.1
		});
	});

	it('clamps hostile numeric fields and repairs unknown enums', () => {
		const parsed = parseRayMarchingShareState(
			'?scene=warehouse&stage=900&debug=infrared&palette=banana&yaw=99&pitch=-99'
		);
		expect(parsed.state).toEqual({
			scene: 'cathedral',
			stage: 8,
			debugView: 'beauty',
			palette: 'cathedral',
			yaw: 0.7,
			pitch: -0.3
		});
		expect(parsed.issues.length).toBeGreaterThanOrEqual(6);
	});

	it('ignores capture, quality, pulse age, timing, and unrelated query state', () => {
		const parsed = parseRayMarchingShareState(
			'?scene=cathedral&stage=4&debug=normals&palette=blue-hour&yaw=.11&pitch=.11&capture=1&quality=high&pulseAge=9&frameMs=2&utm_source=test'
		);
		expect(parsed.state).toEqual({
			scene: 'cathedral',
			stage: 4,
			debugView: 'normals',
			palette: 'blue-hour',
			yaw: 0.1,
			pitch: 0.1
		});
		expect(parsed.issues).toEqual([]);
		expect(serializeRayMarchingShareState(parsed.state).has('capture')).toBe(false);
		expect(serializeRayMarchingShareState(parsed.state).has('quality')).toBe(false);
	});

	it('accepts a full URL but builds a clean scene link with no stale query or fragment', () => {
		const parsed = parseRayMarchingShareState(
			'https://example.test/blog/visualizations/ray?scene=cathedral&stage=3&debug=distance-bands&palette=cathedral&yaw=-.22&pitch=.08#section'
		);
		expect(parsed.state).toMatchObject({
			stage: 3,
			debugView: 'distance-bands',
			yaw: -0.2,
			pitch: 0.1
		});
		const link = new URL(
			buildRayMarchingShareUrl(
				'https://example.test/blog/visualizations/ray?capture=1&quality=high#old',
				parsed.state
			)
		);
		expect(link.hash).toBe('');
		expect([...link.searchParams.keys()]).toEqual([
			'scene',
			'stage',
			'debug',
			'palette',
			'yaw',
			'pitch'
		]);
	});

	it('falls back safely from malformed, non-finite, or oversized state', () => {
		expect(
			parseRayMarchingShareState('?scene=cathedral&stage=NaN&yaw=Infinity&pitch=nope').state
		).toMatchObject({ stage: 8, yaw: 0, pitch: 0 });
		const oversized = parseRayMarchingShareState(
			`?scene=cathedral&junk=${'x'.repeat(MAX_RAY_MARCHING_SHARE_QUERY_LENGTH + 1)}`
		);
		expect(oversized.state).toMatchObject({
			scene: 'cathedral',
			stage: 8,
			debugView: 'beauty',
			palette: 'cathedral'
		});
		expect(oversized.issues).toHaveLength(1);
	});

	it('quantises camera angles in 0.05-radian steps', () => {
		expect(quantizeRayMarchingCamera(0.024, -0.024)).toEqual({ yaw: 0, pitch: 0 });
		expect(quantizeRayMarchingCamera(0.026, -0.026)).toEqual({ yaw: 0.05, pitch: -0.05 });
	});
});
