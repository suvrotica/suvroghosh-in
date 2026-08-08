import { describe, expect, it } from 'vitest';
import { DEFAULT_OREGONATOR_SETUP } from './constants';
import { createInitialBZField } from './initial-conditions';
import type { BZFieldState, BZSetup } from './types';
import {
	BZ_DISPLAY_PROFILES_V2,
	BZ_DISPLAY_RANGE_KEYS_V2,
	BZ_LUMINOUS_REFERENCE_PROFILE_V2,
	BZ_OREGONATOR_REFERENCE_RANGES_V2,
	BZ_SCIENTIFIC_REFERENCE_PROFILE_V2,
	createBZFrontFieldV2,
	createBZPhaseLutV2,
	createBZScalarDisplayFieldV2,
	linearChannelToSrgbV2,
	renderBZPixelBufferV2,
	resolveBZDisplayRangeV2,
	sampleBZFieldMaskAwareV2,
	srgbChannelToLinearV2,
	type BZDisplayViewV2
} from './v2-display';

function squareSetup(size: number): BZSetup {
	return {
		...DEFAULT_OREGONATOR_SETUP,
		gridSize: size,
		domainSize: size,
		activeRadius: size * 0.47,
		geometry: 'square',
		maskPreset: 'none',
		initialCondition: 'uniform-equilibrium'
	};
}

function field(
	size: number,
	u: readonly number[],
	v: readonly number[],
	domainMask?: readonly number[],
	mask?: readonly number[]
): BZFieldState {
	const length = size * size;
	return {
		size,
		u: Float64Array.from(u),
		v: Float64Array.from(v),
		domainMask: Uint8Array.from(domainMask ?? Array.from({ length }, () => 1)),
		mask: Uint8Array.from(mask ?? Array.from({ length }, () => 1))
	};
}

function stateSnapshot(state: Readonly<BZFieldState>) {
	return {
		u: new Uint8Array(state.u.buffer.slice(0)),
		v: new Uint8Array(state.v.buffer.slice(0)),
		domainMask: new Uint8Array(state.domainMask),
		mask: new Uint8Array(state.mask)
	};
}

describe('BZ V2 display profiles and fields', () => {
	it('publishes immutable, fixed, disclosed ranges for every scientific quantity', () => {
		expect(BZ_DISPLAY_PROFILES_V2.length).toBeGreaterThanOrEqual(4);
		for (const profile of BZ_DISPLAY_PROFILES_V2) {
			expect(profile.rangeMode).toBe('fixed');
			expect(profile.interpolation).toBe('mask-aware-manual-bilinear');
			expect(profile.toneMap).toBe('aces-fitted');
			expect(profile.outputTransfer).toBe('srgb');
			expect(profile.disclosure.length).toBeGreaterThan(20);
			expect(Object.isFrozen(profile)).toBe(true);
			for (const key of BZ_DISPLAY_RANGE_KEYS_V2) {
				const range = profile.ranges[key];
				expect(range, `${profile.id}:${key}`).toBeDefined();
				expect(range!.maximum).toBeGreaterThan(range!.minimum);
			}
		}
	});

	it('extracts every scientific view without changing the state', () => {
		const setup = { ...DEFAULT_OREGONATOR_SETUP, gridSize: 24 };
		const state = createInitialBZField(setup);
		const before = stateSnapshot(state);
		for (const view of [
			'u',
			'v',
			'reaction-u',
			'diffusion-u',
			'net-u',
			'phase',
			'front',
			'refractory',
			'mask',
			'difference-from-mean'
		] as const) {
			const extracted = createBZScalarDisplayFieldV2(
				state,
				setup,
				view,
				BZ_SCIENTIFIC_REFERENCE_PROFILE_V2
			);
			expect(extracted.values).toHaveLength(state.size * state.size);
			for (let index = 0; index < extracted.values.length; index += 1) {
				if (state.mask[index]) expect(Number.isFinite(extracted.values[index]), view).toBe(true);
			}
		}
		expect(stateSnapshot(state)).toEqual(before);
	});

	it('computes the physical-space front gradient with no-flux edge neighbours', () => {
		const setup = squareSetup(4);
		const values = Array.from({ length: 16 }, (_, index) => index % 4);
		const state = field(
			4,
			values,
			Array.from({ length: 16 }, () => 0.01)
		);
		const gradient = createBZFrontFieldV2(state, setup);
		expect(gradient[1 * 4 + 1]).toBeCloseTo(1, 12);
		expect(gradient[1 * 4]).toBeCloseTo(0.5, 12);
	});

	it('keeps calibrated ranges fixed and makes frame-local auto range explicit', () => {
		const setup = squareSetup(3);
		const state = field(
			3,
			[0.1, 0.2, 0.3, 0.2, 0.3, 0.4, 0.3, 0.4, 0.5],
			Array.from({ length: 9 }, () => 0.02)
		);
		const fixed = resolveBZDisplayRangeV2('u', state, setup, BZ_LUMINOUS_REFERENCE_PROFILE_V2);
		const automatic = resolveBZDisplayRangeV2('u', state, setup, BZ_LUMINOUS_REFERENCE_PROFILE_V2, {
			rangeMode: 'auto'
		});
		expect(fixed).toBe(BZ_LUMINOUS_REFERENCE_PROFILE_V2.ranges.u);
		expect(fixed).toEqual(BZ_OREGONATOR_REFERENCE_RANGES_V2.u);
		expect(automatic).toMatchObject({ minimum: 0.1, maximum: 0.5 });
		expect(() =>
			resolveBZDisplayRangeV2('u', state, setup, BZ_LUMINOUS_REFERENCE_PROFILE_V2, {
				rangeMode: 'global'
			})
		).toThrow(/was not supplied/i);
	});
});

describe('BZ V2 mask-aware display interpolation', () => {
	it('renormalises active weights and never samples through an obstacle', () => {
		const state = field(
			3,
			[1, 2, 3, 4, 999, 6, 7, 8, 9],
			Array.from({ length: 9 }, () => 0),
			undefined,
			[1, 1, 1, 1, 0, 1, 1, 1, 1]
		);
		const activeSide = sampleBZFieldMaskAwareV2(state.u, state, 0.4, 0.4);
		const inObstacle = sampleBZFieldMaskAwareV2(state.u, state, 1, 1);
		expect(activeSide.classification).toBe('active');
		expect(activeSide.activeWeight).toBeCloseTo(0.84, 12);
		expect(activeSide.value).toBeCloseTo(1.8 / 0.84, 12);
		expect(activeSide.value).toBeLessThan(10);
		expect(inObstacle).toEqual({ classification: 'obstacle', value: null, activeWeight: 0 });
	});

	it('does not leak an active edge cell across the discrete dish wall', () => {
		const state = field(
			3,
			[0, 0, 0, 0, 5, 0, 0, 0, 0],
			Array.from({ length: 9 }, () => 0),
			[0, 0, 0, 0, 1, 0, 0, 0, 0],
			[0, 0, 0, 0, 1, 0, 0, 0, 0]
		);
		const outside = sampleBZFieldMaskAwareV2(state.u, state, 0.4, 0.4);
		expect(outside).toEqual({ classification: 'outside', value: null, activeWeight: 0 });
	});

	it('reduces to ordinary bilinear interpolation when all four texels are active', () => {
		const state = field(2, [0, 2, 4, 6], [0, 0, 0, 0]);
		const sample = sampleBZFieldMaskAwareV2(state.u, state, 0.5, 0.5);
		expect(sample.classification).toBe('active');
		expect(sample.activeWeight).toBe(1);
		expect(sample.value).toBe(3);
	});
});

describe('BZ V2 deterministic linear-light rendering', () => {
	it('uses reversible standard sRGB transfer functions over the unit interval', () => {
		for (const sample of [0, 0.003, 0.02, 0.18, 0.5, 0.9, 1]) {
			expect(linearChannelToSrgbV2(srgbChannelToLinearV2(sample))).toBeCloseTo(sample, 12);
		}
	});

	it('generates a deterministic cyclic linear-light LUT for a future GPU texture', () => {
		const first = createBZPhaseLutV2(64);
		const second = createBZPhaseLutV2(64);
		expect(first).toEqual(second);
		expect(Array.from(first.slice(0, 3))).toEqual(Array.from(first.slice(-3)));
		expect(Array.from(first).every((value) => Number.isFinite(value) && value >= 0)).toBe(true);
	});

	it('renders every display switch from the same bytes without mutating numerical state', () => {
		const setup = { ...DEFAULT_OREGONATOR_SETUP, gridSize: 20 };
		const state = createInitialBZField(setup);
		const before = stateSnapshot(state);
		const views: readonly BZDisplayViewV2[] = [
			'dish',
			'ferroin-proxy',
			'luminous-composite',
			'u',
			'v',
			'reaction-u',
			'diffusion-u',
			'net-u',
			'phase',
			'front',
			'refractory',
			'mask',
			'difference-from-mean'
		];
		for (const view of views) {
			const first = renderBZPixelBufferV2(state, setup, { view, width: 37, height: 31 });
			const second = renderBZPixelBufferV2(state, setup, { view, width: 37, height: 31 });
			expect(first.data, view).toEqual(second.data);
			expect(first.data.every((value, index) => index % 4 !== 3 || value === 255)).toBe(true);
			expect(stateSnapshot(state), view).toEqual(before);
		}
	});

	it('keeps exact raw cells as a diagnostic alternative to smooth display interpolation', () => {
		const setup = squareSetup(4);
		const state = field(
			4,
			Array.from({ length: 16 }, (_, index) => (index % 2 === 0 ? 0.02 : 0.7)),
			Array.from({ length: 16 }, (_, index) => (Math.floor(index / 4) % 2 === 0 ? 0.02 : 0.25))
		);
		const smooth = renderBZPixelBufferV2(state, setup, {
			view: 'u',
			width: 29,
			height: 29,
			interpolation: 'mask-aware-bilinear',
			glass: false,
			bloom: false
		});
		const raw = renderBZPixelBufferV2(state, setup, {
			view: 'u',
			width: 29,
			height: 29,
			interpolation: 'raw-cell',
			glass: false,
			bloom: false
		});
		expect(smooth.data).not.toEqual(raw.data);
	});
});
