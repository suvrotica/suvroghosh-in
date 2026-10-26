import { describe, expect, it } from 'vitest';
import {
	DEFAULT_STATE,
	PALETTES,
	PRESETS,
	WORLDS,
	decodeState,
	encodeState,
	exportDimensions,
	framingRatio,
	normalizeState,
	seededRandom,
	surpriseState
} from './model';

describe('shared artwork admission', () => {
	it('round trips geometry, controls, camera, framing and animation phase', () => {
		const original = normalizeState({
			...PRESETS[5].state,
			framing: 'portrait',
			view: { yaw: -1.2039, pitch: 0.3921, distance: 8.752 },
			time: 124.537
		});
		const query = new URLSearchParams({ art: encodeState(original) });
		expect(decodeState(new URLSearchParams(query.toString()).get('art'))).toEqual(original);
		expect(query.toString().length).toBeLessThan(220);
	});
	it('recovers malformed, oversized, and unsupported-version links', () => {
		for (const value of [
			null,
			'',
			'garbage',
			'{}',
			'1:0:NaN:2',
			'2:0:5su3:58:38:62:48:28:0:0:0:0.12:5.8:0',
			'0'.repeat(513)
		]) {
			expect(decodeState(value)).toEqual(DEFAULT_STATE);
		}
		const valid = encodeState(DEFAULT_STATE).split(':');
		valid[3] = 'Infinity';
		expect(decodeState(valid.join(':'))).toEqual(DEFAULT_STATE);
		valid[3] = '';
		expect(decodeState(valid.join(':'))).toEqual(DEFAULT_STATE);
	});
	it('bounds hostile numeric settings without accepting arbitrary IDs or string coercion', () => {
		const safe = normalizeState({
			world: '../x',
			palette: '<script>',
			framing: 'cinema',
			seed: -1,
			shape: 1e12,
			energy: -20,
			detail: NaN,
			glow: '88',
			speed: Infinity,
			view: { yaw: -300, pitch: 100, distance: 0 },
			time: -20
		});
		expect(safe.world).toBe('liquid');
		expect(safe.palette).toBe('opal');
		expect(safe.framing).toBe('landscape');
		expect(safe.seed).toBe(1);
		expect(safe.shape).toBe(100);
		expect(safe.energy).toBe(0);
		expect(safe.detail).toBe(DEFAULT_STATE.detail);
		expect(safe.glow).toBe(DEFAULT_STATE.glow);
		expect(safe.speed).toBe(DEFAULT_STATE.speed);
		expect(safe.view.pitch).toBe(1.3);
		expect(safe.view.distance).toBe(2.6);
		expect(safe.time).toBe(0);
	});
	it('returns independent camera objects and sanitizes non-object input', () => {
		const first = normalizeState(null);
		first.view.distance = 10;
		expect(normalizeState([])).toEqual(DEFAULT_STATE);
		expect(decodeState(null).view.distance).toBe(5.8);
	});
});

describe('curated seeded generation', () => {
	it('produces a repeatable random stream in [0,1)', () => {
		const first = seededRandom(38129);
		const second = seededRandom(38129);
		const other = seededRandom(38130);
		const a = Array.from({ length: 1000 }, first);
		expect(Array.from({ length: 1000 }, second)).toEqual(a);
		expect(Array.from({ length: 1000 }, other)).not.toEqual(a);
		expect(a.every((value) => value >= 0 && value < 1)).toBe(true);
	});
	it('keeps exploration within its selected world and a safe attractive envelope', () => {
		const current = normalizeState({ ...DEFAULT_STATE, world: 'bloom', framing: 'square' });
		for (let seed = 1; seed <= 200; seed++) {
			const next = surpriseState(current, seed);
			expect(next).toEqual(surpriseState(current, seed));
			expect(next).toEqual(normalizeState(next));
			expect(next.world).toBe('bloom');
			expect(next.framing).toBe('square');
			expect(next.shape).toBeGreaterThanOrEqual(22);
			expect(next.shape).toBeLessThanOrEqual(86);
			expect(next.glow).toBeLessThanOrEqual(62);
			expect(next.time).toBe(0);
		}
		expect(surpriseState(current).seed).not.toBe(current.seed);
	});
	it('supplies two distinct valid presets for every world with known palettes', () => {
		for (const world of WORLDS) {
			const states = PRESETS.filter((preset) => preset.state.world === world.id);
			expect(states).toHaveLength(2);
			expect(states[0].state.seed).not.toBe(states[1].state.seed);
		}
		for (const preset of PRESETS) {
			expect(normalizeState(preset.state)).toEqual(preset.state);
			expect(PALETTES.some((palette) => palette.id === preset.state.palette)).toBe(true);
		}
	});
});

it('keeps exported dimensions faithful to the selected frame and bounds memory use', () => {
	for (const frame of ['landscape', 'square', 'portrait'] as const) {
		const { width, height } = exportDimensions(frame);
		expect(width / height).toBeCloseTo(framingRatio(frame), 4);
		expect(Math.max(width, height)).toBe(2400);
		const large = exportDimensions(frame, 100_000);
		expect(Math.max(large.width, large.height)).toBe(3840);
	}
	expect(exportDimensions('square', NaN)).toEqual({ width: 2400, height: 2400 });
});
