import { describe, expect, it } from 'vitest';
import {
	COMPARISON_A_VALUES,
	COMPARISON_K_VALUES,
	DEFAULT_INITIAL_STATE,
	DEFAULT_LOOM_PARAMETERS,
	WORKED_SETTINGS,
	analyzeEquilibrium,
	buildPhaseRibbonPaths,
	computeComparisonGrid,
	evaluateDerivatives,
	sampleTrajectoryAtTime,
	simulatePredatorPreyLoom
} from './index';

describe('Rosenzweig–MacArthur Predator–Prey Loom model', () => {
	it('verifies the analytical Hopf bifurcation threshold K = 7/3 for the starting configuration', () => {
		const analysisAtThreshold = analyzeEquilibrium({
			...DEFAULT_LOOM_PARAMETERS,
			K: 7 / 3
		});

		expect(analysisAtThreshold.kCritical).toBeCloseTo(7 / 3, 10);
		expect(analysisAtThreshold.equilibriumPrey).toBeCloseTo(2 / 3, 10);
		expect(analysisAtThreshold.jacobianTrace).toBeCloseTo(0, 10);
		expect(analysisAtThreshold.jacobianDeterminant).toBeGreaterThan(0);
		expect(analysisAtThreshold.regime).toBe('hopf-neutral');

		const belowThreshold = analyzeEquilibrium({
			...DEFAULT_LOOM_PARAMETERS,
			K: 1.5
		});
		expect(belowThreshold.isEquilibriumStable).toBe(true);
		expect(belowThreshold.jacobianTrace).toBeLessThan(0);

		const aboveThreshold = analyzeEquilibrium({
			...DEFAULT_LOOM_PARAMETERS,
			K: 3.0
		});
		expect(aboveThreshold.isEquilibriumStable).toBe(false);
		expect(aboveThreshold.jacobianTrace).toBeGreaterThan(0);
	});

	it('produces zero derivatives at the analytical coexistence equilibrium (N*, P*)', () => {
		for (const K of [1.5, 7 / 3, 3.0, 4.0]) {
			const params = { ...DEFAULT_LOOM_PARAMETERS, K };
			const eq = analyzeEquilibrium(params);
			const deriv = evaluateDerivatives(eq.equilibriumPrey, eq.equilibriumPredator, params);
			expect(deriv.dPreyDt).toBeCloseTo(0, 12);
			expect(deriv.dPredatorDt).toBeCloseTo(0, 12);
		}
	});

	it('simulates the three worked settings (K = 1.5, 3.0, 4.0) with positive finite densities and accurate step convergence', () => {
		const run15 = simulatePredatorPreyLoom({
			parameters: { ...DEFAULT_LOOM_PARAMETERS, K: WORKED_SETTINGS['k-1.5'].K }
		});
		const run30 = simulatePredatorPreyLoom({
			parameters: { ...DEFAULT_LOOM_PARAMETERS, K: WORKED_SETTINGS['k-3.0'].K }
		});
		const run40 = simulatePredatorPreyLoom({
			parameters: { ...DEFAULT_LOOM_PARAMETERS, K: WORKED_SETTINGS['k-4.0'].K }
		});

		expect(run15.numericalValid).toBe(true);
		expect(run30.numericalValid).toBe(true);
		expect(run40.numericalValid).toBe(true);

		expect(run15.behaviourClass).toBe('settles');
		expect(run15.computedHeadline).toBe('These swings are shrinking towards steady populations.');

		expect(run30.behaviourClass).toBe('persistent-cycle');
		expect(run30.computedHeadline).toBe('The populations are approaching a repeating cycle.');

		expect(run40.behaviourClass).toBe('persistent-cycle');
		expect(run40.computedHeadline).toBe('The prey population now falls much lower between peaks.');
		expect(run40.lateMinPrey).toBeLessThan(run30.lateMinPrey);
		expect(run40.lateMaxPrey).toBeGreaterThan(run30.lateMaxPrey);

		// Verify RK4 accuracy against halved time step (dt = 0.01 vs dt = 0.02)
		const run30Fine = simulatePredatorPreyLoom({
			parameters: { ...DEFAULT_LOOM_PARAMETERS, K: 3.0 },
			dt: 0.01
		});
		const coarseEnd = run30.samples[run30.samples.length - 1];
		const fineEnd = run30Fine.samples[run30Fine.samples.length - 1];
		expect(Math.abs(coarseEnd.prey - fineEnd.prey)).toBeLessThan(1e-5);
		expect(Math.abs(coarseEnd.predator - fineEnd.predator)).toBeCloseTo(0, 5);
	});

	it('measures a genuine positive lag where predator peaks follow prey peaks in all three worked settings', () => {
		for (const K of [1.5, 3.0, 4.0]) {
			const run = simulatePredatorPreyLoom({
				parameters: { ...DEFAULT_LOOM_PARAMETERS, K }
			});
			expect(run.measuredLag).not.toBeNull();
			expect(run.measuredLag!.lagTime).toBeGreaterThan(2.0);
			expect(run.measuredLag!.predatorPeak.time).toBeGreaterThan(run.measuredLag!.preyPeak.time);
			expect(run.measuredLag!.caption).toBe('Predators peak later.');
		}
	});

	it('evolves continuously through a +50% food pulse of 10 time units and computes the Without this change baseline', () => {
		const pulseStart = 20;
		const run = simulatePredatorPreyLoom({
			parameters: { ...DEFAULT_LOOM_PARAMETERS, K: 1.5 },
			interventions: [
				{
					kind: 'food-pulse',
					time: pulseStart,
					duration: 10,
					kMultiplier: 1.5
				}
			]
		});

		expect(run.numericalValid).toBe(true);
		expect(run.segments.length).toBe(1); // Continuous: no jump break
		expect(run.eventMarkers.length).toBe(2); // Start and end of pulse
		expect(run.eventMarkers[0].time).toBe(20);
		expect(run.eventMarkers[1].time).toBe(30);
		expect(run.baselineComparisonSamples).not.toBeNull();
		expect(run.baselineStartTime).toBe(20);

		const atStart = sampleTrajectoryAtTime(run.samples, 20);
		const duringPulse = sampleTrajectoryAtTime(run.samples, 25);
		const afterPulse = sampleTrajectoryAtTime(run.samples, 31);
		expect(duringPulse.activeK).toBeCloseTo(2.25, 5);
		expect(afterPulse.activeK).toBeCloseTo(1.5, 5);
		expect(atStart.prey).toBeCloseTo(run.baselineComparisonSamples![0].prey, 6);
	});

	it('represents the 25% predator removal as an explicit discontinuous jump and computes the undisturbed comparison', () => {
		const removalTime = 24;
		const run = simulatePredatorPreyLoom({
			parameters: { ...DEFAULT_LOOM_PARAMETERS, K: 3.0 },
			interventions: [
				{
					kind: 'predator-removal',
					time: removalTime,
					removalFraction: 0.25
				}
			]
		});

		expect(run.numericalValid).toBe(true);
		expect(run.segments.length).toBe(2);
		expect(run.jumpMarkers.length).toBe(1);

		const jump = run.jumpMarkers[0];
		expect(jump.time).toBe(removalTime);
		expect(jump.toPredator).toBeCloseTo(jump.fromPredator * 0.75, 8);
		expect(jump.toPrey).toBeCloseTo(jump.fromPrey, 8);
		expect(run.baselineComparisonSamples).not.toBeNull();
	});

	it('restores earlier conditions while retaining the current populations', () => {
		const run = simulatePredatorPreyLoom({
			parameters: { ...DEFAULT_LOOM_PARAMETERS, K: 1.5, a: 1.0 },
			interventions: [
				{
					kind: 'sustained-food',
					time: 20,
					targetK: 4.0,
					previousK: 1.5
				},
				{
					kind: 'restore-conditions',
					time: 45,
					targetK: 1.5,
					targetA: 1.0
				}
			]
		});

		expect(run.numericalValid).toBe(true);
		expect(run.segments.length).toBe(1); // Continuous across parameter change and restore
		const beforeRestore = sampleTrajectoryAtTime(run.samples, 44.98);
		const atRestore = sampleTrajectoryAtTime(run.samples, 45.0);
		const afterRestore = sampleTrajectoryAtTime(run.samples, 45.02);

		expect(beforeRestore.activeK).toBeCloseTo(4.0, 5);
		expect(afterRestore.activeK).toBeCloseTo(1.5, 5);
		// Population continuity at restore boundary
		expect(Math.abs(afterRestore.prey - beforeRestore.prey)).toBeLessThan(0.05);
		expect(Math.abs(atRestore.predator - beforeRestore.predator)).toBeLessThan(0.05);
	});

	it('classifies the 3x3 comparison grid accurately, distinguishing slow settling near the boundary (a=0.75, K=3) from persistent cycles', () => {
		const grid = computeComparisonGrid();
		expect(grid.length).toBe(3);
		expect(grid[0].length).toBe(3);

		// Row 0: a = 0.75 (K_crit = 28/9 ≈ 3.111)
		expect(grid[0][0].a).toBe(0.75);
		expect(grid[0][0].K).toBe(1.5);
		expect(grid[0][0].behaviourClass).toBe('settles');

		// (a = 0.75, K = 3.0) has K < K_crit (3.0 < 3.111), so it is analytically stable but still settling!
		expect(grid[0][1].a).toBe(0.75);
		expect(grid[0][1].K).toBe(3.0);
		expect(grid[0][1].run.analysis.isEquilibriumStable).toBe(true);
		expect(grid[0][1].behaviourClass).toBe('still-settling');
		expect(grid[0][1].stabilityNote).toContain('still settling');

		expect(grid[0][2].a).toBe(0.75);
		expect(grid[0][2].K).toBe(4.0);
		expect(grid[0][2].behaviourClass).toBe('persistent-cycle');

		// Row 1: a = 1.0 (K_crit = 7/3 ≈ 2.333)
		expect(grid[1][0].behaviourClass).toBe('settles');
		expect(grid[1][1].behaviourClass).toBe('persistent-cycle');
		expect(grid[1][2].behaviourClass).toBe('persistent-cycle');

		// Row 2: a = 1.25 (K_crit = 28/15 ≈ 1.867)
		expect(grid[2][0].behaviourClass).toBe('settles');
		expect(grid[2][1].behaviourClass).toBe('persistent-cycle');
		expect(grid[2][2].behaviourClass).toBe('persistent-cycle');

		// Every cell shares identical initial populations and simulation duration
		for (let r = 0; r < COMPARISON_A_VALUES.length; r++) {
			for (let c = 0; c < COMPARISON_K_VALUES.length; c++) {
				const cell = grid[r][c];
				expect(cell.run.initialState).toEqual(DEFAULT_INITIAL_STATE);
				expect(cell.run.duration).toBe(120);
			}
		}
	});

	it('builds constant-width phase ribbon paths and sparse direction arrows', () => {
		const run = simulatePredatorPreyLoom({
			parameters: { ...DEFAULT_LOOM_PARAMETERS, K: 3.0 }
		});
		const ribbon = buildPhaseRibbonPaths(
			run.samples,
			{ x: 50, y: 20, width: 500, height: 360 },
			{ maxPrey: 3.6, maxPredator: 2.4 }
		);
		expect(ribbon.centrePath.startsWith('M ')).toBe(true);
		expect(ribbon.preyEdgePath.startsWith('M ')).toBe(true);
		expect(ribbon.predatorEdgePath.startsWith('M ')).toBe(true);
		expect(ribbon.arrows.length).toBeGreaterThanOrEqual(3);
	});
});
