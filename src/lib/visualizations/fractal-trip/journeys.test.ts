import { describe, expect, it } from 'vitest';
import { FAMILIES, PRESETS, defaultForFamily, normalizeState, regularRoots } from './model';
import {
	JOURNEY_DURATION_SECONDS,
	createJourney,
	inspectJourneyView,
	sampleJourney
} from './journeys';

describe('Fractal Trip guided journeys', () => {
	it('starts at the exact current view and returns smoothly to it', () => {
		for (const family of FAMILIES) {
			const state = normalizeState({ ...defaultForFamily(family.id), rotation: 0.45, yaw: 1.2 });
			const plan = createJourney(state, 16 / 9);
			expect(sampleJourney(plan, 0, state)).toEqual(state);
			expect(sampleJourney(plan, JOURNEY_DURATION_SECONDS, state)).toEqual(state);
			const initial = sampleJourney(plan, 0.001, state);
			expect(initial.centerRe).toBeCloseTo(state.centerRe, 6);
			expect(initial.span).toBeCloseTo(state.span, 6);
			expect(plan.samples).toBeLessThanOrEqual(398);
		}
	});

	it('chooses independently sampled detail for every planar default and preset', () => {
		for (const preset of PRESETS.filter(
			({ family }) => !['mandelbulb', 'mandelbox'].includes(family)
		)) {
			const plan = createJourney(preset.state, 16 / 9);
			const closest = sampleJourney(plan, JOURNEY_DURATION_SECONDS / 2, preset.state);
			expect(plan.detail?.interesting, preset.name).toBe(true);
			expect(inspectJourneyView(closest, 16 / 9).interesting, preset.name).toBe(true);
			expect(plan.detail?.unresolvedFraction, preset.name).toBeLessThan(1);
		}
	});

	it('can leave an empty user view through an overview without snapping', () => {
		const state = normalizeState({
			...defaultForFamily('julia'),
			centerRe: 3.8,
			centerIm: 3.8,
			span: 0.001
		});
		const plan = createJourney(state, 1.5);
		expect(plan.overview).not.toBeNull();
		expect(sampleJourney(plan, 0, state)).toEqual(state);
		expect(plan.detail?.interesting).toBe(true);
		expect(inspectJourneyView(sampleJourney(plan, 48, state), 1.5).interesting).toBe(true);
		expect(plan.samples).toBeLessThanOrEqual(398);
	});

	it('finds detail after meaningful equation changes', () => {
		const examples = [
			{ ...defaultForFamily('mandelbrot'), power: 5 },
			{ ...defaultForFamily('julia'), seedRe: 0.285, seedIm: 0.01 },
			{ ...defaultForFamily('burning-ship'), power: 3 },
			{ ...defaultForFamily('tricorn'), power: 4 },
			{ ...defaultForFamily('newton'), roots: regularRoots(5), relaxation: 0.6 }
		];
		for (const state of examples) {
			const plan = createJourney(state, 1);
			expect(plan.detail?.interesting, state.family).toBe(true);
			expect(inspectJourneyView(sampleJourney(plan, 48, state), 1).interesting, state.family).toBe(
				true
			);
		}
	});

	it('is deterministic and preserves live material controls', () => {
		const state = defaultForFamily('newton');
		const plan = createJourney(state, 1.5);
		expect(createJourney(state, 1.5)).toEqual(plan);
		const controls = { ...state, palette: 'ember' as const, glow: 0.75, roughness: 0.9 };
		const result = sampleJourney(plan, 18, controls);
		expect(result.palette).toBe('ember');
		expect(result.glow).toBe(0.75);
		expect(result.roughness).toBe(0.9);
		expect(sampleJourney(plan, 18, controls)).toEqual(result);
		expect(sampleJourney(plan, 18 + JOURNEY_DURATION_SECONDS, controls)).toEqual(result);
	});

	it('keeps 3D defaults outside the object and moves their cameras', () => {
		for (const family of ['mandelbulb', 'mandelbox'] as const) {
			const state = defaultForFamily(family);
			const plan = createJourney(state, 16 / 9);
			const halfway = sampleJourney(plan, 48, state);
			expect(plan.samples).toBe(0);
			expect(halfway.yaw).not.toBe(state.yaw);
			expect(halfway.distance).toBeGreaterThanOrEqual(family === 'mandelbox' ? 4.6 : 3.1);
			expect(halfway).toEqual(normalizeState(halfway));
		}
	});

	it('handles invalid clocks and rejects a plan from another family', () => {
		const state = defaultForFamily('julia');
		const plan = createJourney(state, NaN);
		expect(sampleJourney(plan, NaN, state)).toEqual(state);
		expect(sampleJourney(plan, -20, state)).toEqual(state);
		const other = defaultForFamily('mandelbulb');
		expect(sampleJourney(plan, 10, other)).toEqual(other);
	});
});
