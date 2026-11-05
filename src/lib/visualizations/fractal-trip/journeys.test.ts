import { describe, expect, it } from 'vitest';
import {
	FAMILIES,
	PRESETS,
	SCENES_3D,
	checkCameraClearance,
	defaultForFamily,
	normalizeState,
	regularRoots,
	sceneToState
} from './model';
import {
	JOURNEY_DURATION_SECONDS,
	createJourney,
	inspectJourneyView,
	nextTourSceneId,
	sampleJourney,
	validateJourney3D
} from './journeys';

describe('Fractal Trip guided journeys', () => {
	it('starts at the exact current view and returns smoothly to it', () => {
		for (const family of FAMILIES) {
			const state = normalizeState({ ...defaultForFamily(family.id), rotation: 0.45, yaw: 1.2 });
			const plan = createJourney(state, 16 / 9);
			expect(sampleJourney(plan, 0, state)).toEqual(state);
			expect(sampleJourney(plan, plan.duration, state)).toEqual(state);
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
		expect(sampleJourney(plan, 18 + plan.duration, controls)).toEqual(result);
	});

	it('validates all four 3D scene journeys for spatial travel, clearance and parallax', () => {
		for (const scene of SCENES_3D) {
			const state = sceneToState(scene.id);
			const plan = createJourney(state, 16 / 9);
			expect(plan.samples).toBe(0);
			expect(plan.duration).toBeGreaterThanOrEqual(60);
			expect(plan.duration).toBeLessThanOrEqual(120);

			const quarter = sampleJourney(plan, plan.duration * 0.25, state);
			const halfway = sampleJourney(plan, plan.duration * 0.5, state);
			expect(quarter.cameraPos).not.toEqual(state.cameraPos);
			expect(halfway.cameraPos).not.toEqual(quarter.cameraPos);
			expect(halfway.yaw).not.toBe(state.yaw);
			expect(checkCameraClearance(quarter, 16 / 9).clear, `${scene.name} 25% clearance`).toBe(true);
			expect(checkCameraClearance(halfway, 16 / 9).clear, `${scene.name} 50% clearance`).toBe(true);

			const report = validateJourney3D(scene.id, 32, 16 / 9);
			expect(report.valid, `${scene.name} full path validation`).toBe(true);
			expect(report.minClearance).toBeGreaterThanOrEqual(0.035);
			expect(report.minHitFraction).toBeGreaterThanOrEqual(0.5);
			expect(report.depthSpread).toBeGreaterThanOrEqual(0.4);
		}
		expect(nextTourSceneId('copper-reef', 1)).toBe('folded-cathedral');
		expect(nextTourSceneId('copper-reef', -1)).toBe('fractal-canyon');
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
