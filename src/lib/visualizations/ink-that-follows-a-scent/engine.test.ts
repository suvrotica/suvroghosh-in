import { describe, expect, it } from 'vitest';
import {
	DEFAULT_SEED,
	FIXED_TIMESTEP,
	InkFollowsScentEngine,
	LOGICAL_HEIGHT,
	LOGICAL_WIDTH,
	reflectCoordinate,
	renderRunToRgba,
	sampleStandardNormal,
	type SimulationEditEvent
} from './index';

describe('Ink That Follows a Scent — biased random walk & chemotaxis engine', () => {
	it('generates deterministic standard normal samples keyed by (seed, particleId, simulationStep, component)', () => {
		const n = 20000;
		let sumX = 0;
		let sumY = 0;
		let sumSqX = 0;
		let sumSqY = 0;
		let crossXY = 0;

		for (let i = 0; i < n; i += 1) {
			const zx = sampleStandardNormal(DEFAULT_SEED, i, 42, 0);
			const zy = sampleStandardNormal(DEFAULT_SEED, i, 42, 1);
			// Calling in reverse order or again must return the exact same value
			expect(sampleStandardNormal(DEFAULT_SEED, i, 42, 1)).toBe(zy);
			expect(sampleStandardNormal(DEFAULT_SEED, i, 42, 0)).toBe(zx);

			sumX += zx;
			sumY += zy;
			sumSqX += zx * zx;
			sumSqY += zy * zy;
			crossXY += zx * zy;
		}

		const meanX = sumX / n;
		const meanY = sumY / n;
		const varX = sumSqX / n - meanX * meanX;
		const varY = sumSqY / n - meanY * meanY;
		const covXY = crossXY / n - meanX * meanY;

		expect(Math.abs(meanX)).toBeLessThan(0.025);
		expect(Math.abs(meanY)).toBeLessThan(0.025);
		expect(varX).toBeGreaterThan(0.95);
		expect(varX).toBeLessThan(1.05);
		expect(varY).toBeGreaterThan(0.95);
		expect(varY).toBeLessThan(1.05);
		expect(Math.abs(covXY)).toBeLessThan(0.03);
	});

	it('produces identical paired positions when both runs use equal sensitivity values', () => {
		const engine = new InkFollowsScentEngine({
			presetId: 'one-source',
			seed: 2026,
			particleCount: 1200
		});
		engine.controlSensitivity = engine.settings.sensitivity;
		engine.restart();
		engine.step(240);

		expect(Array.from(engine.sensingOnRun.px)).toEqual(Array.from(engine.sensingOffRun.px));
		expect(Array.from(engine.sensingOnRun.py)).toEqual(Array.from(engine.sensingOffRun.py));
		expect(Array.from(engine.sensingOnRun.trailBuffer)).toEqual(
			Array.from(engine.sensingOffRun.trailBuffer)
		);
		expect(engine.sensingOnRun.averageChemical).toBe(engine.sensingOffRun.averageChemical);
	});

	it('produces identical paired paths on a zero or spatially uniform chemical field', () => {
		// 1. Zero field
		const zeroEngine = new InkFollowsScentEngine({
			presetId: 'one-source',
			seed: 2026,
			particleCount: 1000
		});
		zeroEngine.clearChemical();
		zeroEngine.step(180);

		expect(Array.from(zeroEngine.sensingOnRun.px)).toEqual(Array.from(zeroEngine.sensingOffRun.px));
		expect(Array.from(zeroEngine.sensingOnRun.py)).toEqual(Array.from(zeroEngine.sensingOffRun.py));
		expect(zeroEngine.sensingOnRun.averageChemical).toBe(0);
		expect(zeroEngine.sensingOffRun.averageChemical).toBe(0);

		// 2. Spatially uniform nonzero field (C = 0.65 everywhere -> grad C = 0 everywhere)
		const uniformEngine = new InkFollowsScentEngine({
			presetId: 'one-source',
			seed: 2026,
			particleCount: 1000
		});
		uniformEngine.field.setUniformConcentration(0.65);
		uniformEngine.sensingOnRun.recomputeAverageChemical(uniformEngine.field);
		uniformEngine.sensingOffRun.recomputeAverageChemical(uniformEngine.field);
		uniformEngine.step(180);

		expect(Array.from(uniformEngine.sensingOnRun.px)).toEqual(
			Array.from(uniformEngine.sensingOffRun.px)
		);
		expect(Array.from(uniformEngine.sensingOnRun.py)).toEqual(
			Array.from(uniformEngine.sensingOffRun.py)
		);
		expect(uniformEngine.sensingOnRun.averageChemical).toBeCloseTo(0.65, 5);
		expect(uniformEngine.sensingOffRun.averageChemical).toBeCloseTo(0.65, 5);
	});

	it('reproduces identical trajectories from the same initial state, seed, settings, and tick-stamped input history', () => {
		const schedule: SimulationEditEvent[] = [
			{ step: 30, type: 'move-source', x: 84, y: 120 },
			{ step: 60, type: 'paint', x0: 40, y0: 40, x1: 180, y1: 90, radius: 20 },
			{ step: 90, type: 'erase', x0: 80, y0: 55, x1: 110, y1: 75, radius: 16 },
			{
				step: 110,
				type: 'set-settings',
				settings: { sensitivity: 1.6, randomWandering: 0.8, trailDuration: 18 }
			},
			{ step: 140, type: 'set-sensing', enabled: false }
		];

		const runA = new InkFollowsScentEngine({
			presetId: 'one-source',
			seed: 7741,
			particleCount: 900
		});
		const runB = new InkFollowsScentEngine({
			presetId: 'one-source',
			seed: 7741,
			particleCount: 900
		});

		runA.runWithSchedule(180, schedule);
		runB.runWithSchedule(180, schedule);

		expect(runA.stepCount).toBe(180);
		expect(runB.stepCount).toBe(180);
		expect(Array.from(runA.sensingOnRun.px)).toEqual(Array.from(runB.sensingOnRun.px));
		expect(Array.from(runA.sensingOnRun.py)).toEqual(Array.from(runB.sensingOnRun.py));
		expect(Array.from(runA.sensingOffRun.px)).toEqual(Array.from(runB.sensingOffRun.px));
		expect(Array.from(runA.sensingOffRun.py)).toEqual(Array.from(runB.sensingOffRun.py));
		expect(Array.from(runA.field.combinedGrid)).toEqual(Array.from(runB.field.combinedGrid));
		expect(Array.from(runA.sensingOnRun.trailBuffer)).toEqual(
			Array.from(runB.sensingOnRun.trailBuffer)
		);
	});

	it('freezes simulation time and trail fading while paused, and preserves trails/particles across display renders and resizes', () => {
		const engine = new InkFollowsScentEngine({
			presetId: 'one-source',
			seed: 2026,
			particleCount: 800
		});
		engine.step(90);

		const frozenTime = engine.simulationTime;
		const frozenStep = engine.stepCount;
		const frozenPx = new Float32Array(engine.sensingOnRun.px);
		const frozenPy = new Float32Array(engine.sensingOnRun.py);
		const frozenTrails = new Float32Array(engine.sensingOnRun.trailBuffer);

		// Render multiple times while paused and with different display options (field visibility toggle)
		const frameHidden = renderRunToRgba(engine.sensingOnRun, engine.field, {
			showChemical: false
		});
		const frameVisible = renderRunToRgba(engine.sensingOnRun, engine.field, {
			showChemical: true
		});

		expect(frameHidden.length).toBe(frameVisible.length);
		expect(engine.simulationTime).toBe(frozenTime);
		expect(engine.stepCount).toBe(frozenStep);
		expect(Array.from(engine.sensingOnRun.px)).toEqual(Array.from(frozenPx));
		expect(Array.from(engine.sensingOnRun.py)).toEqual(Array.from(frozenPy));
		expect(Array.from(engine.sensingOnRun.trailBuffer)).toEqual(Array.from(frozenTrails));
	});

	it('separates chemical concentration, particle positions, and visible trail history across clearTrails, clearChemical, and moveSource', () => {
		const engine = new InkFollowsScentEngine({
			presetId: 'one-source',
			seed: 2026,
			particleCount: 800
		});
		engine.step(120);

		const pxBeforeClearTrails = new Float32Array(engine.sensingOnRun.px);
		const pyBeforeClearTrails = new Float32Array(engine.sensingOnRun.py);
		const fieldBeforeClearTrails = new Float32Array(engine.field.combinedGrid);
		const avgChemBefore = engine.sensingOnRun.averageChemical;

		engine.sensingOnRun.updateTrailStats();
		expect(engine.sensingOnRun.maxTrailIntensity).toBeGreaterThan(0.02);

		// 1. Clearing trails removes drawing but preserves particle positions and chemical
		engine.clearTrails();
		engine.sensingOnRun.updateTrailStats();
		expect(engine.sensingOnRun.maxTrailIntensity).toBe(0);
		expect(Array.from(engine.sensingOnRun.px)).toEqual(Array.from(pxBeforeClearTrails));
		expect(Array.from(engine.sensingOnRun.py)).toEqual(Array.from(pyBeforeClearTrails));
		expect(Array.from(engine.field.combinedGrid)).toEqual(Array.from(fieldBeforeClearTrails));
		expect(engine.sensingOnRun.averageChemical).toBe(avgChemBefore);

		// Build fresh trails again
		engine.step(60);
		const trailsBeforeMove = new Float32Array(engine.sensingOnRun.trailBuffer);
		const pxBeforeMove = new Float32Array(engine.sensingOnRun.px);
		const pyBeforeMove = new Float32Array(engine.sensingOnRun.py);

		// 2. Moving a source updates the field immediately without teleporting particles or leaving a wake
		engine.moveSource(48, 48);
		expect(Array.from(engine.sensingOnRun.px)).toEqual(Array.from(pxBeforeMove));
		expect(Array.from(engine.sensingOnRun.py)).toEqual(Array.from(pyBeforeMove));
		expect(Array.from(engine.sensingOnRun.trailBuffer)).toEqual(Array.from(trailsBeforeMove));
		expect(engine.field.sampleConcentration(48, 48)).toBeGreaterThan(0.85);
		expect(engine.field.sampleConcentration(158, 96)).toBeLessThan(0.15);

		// 3. Clearing chemical zeros field and current measurements without erasing existing trails
		engine.clearChemical();
		engine.sensingOnRun.updateTrailStats();
		expect(engine.field.maxConcentration).toBe(0);
		expect(engine.sensingOnRun.averageChemical).toBe(0);
		expect(engine.sensingOffRun.averageChemical).toBe(0);
		expect(engine.sensingOnRun.maxTrailIntensity).toBeGreaterThan(0.01);
	});

	it('demonstrates clear chemotactic gathering within 10–20 seconds on default presets without forcing every step uphill', () => {
		const engine = new InkFollowsScentEngine({
			presetId: 'one-source',
			seed: 2026,
			particleCount: 2400
		});

		const initialOn = engine.sensingOnRun.averageChemical;
		const initialOff = engine.sensingOffRun.averageChemical;
		expect(initialOn).toBeCloseTo(initialOff, 6);

		// Advance 12 seconds (720 steps at dt = 1/60 s)
		const steps12s = Math.round(12 / FIXED_TIMESTEP);
		engine.step(steps12s);

		const onAt12s = engine.sensingOnRun.averageChemical;
		const offAt12s = engine.sensingOffRun.averageChemical;

		expect(onAt12s).toBeGreaterThan(offAt12s * 1.65);
		expect(onAt12s - offAt12s).toBeGreaterThan(0.08);
		// Because random wandering dominates single-step motion, many individual steps still move downhill
		expect(engine.sensingOnRun.uphillStepFraction).toBeGreaterThan(0.5);
		expect(engine.sensingOnRun.uphillStepFraction).toBeLessThan(0.62);

		// Also verify the Curved line preset
		const curvedEngine = new InkFollowsScentEngine({
			presetId: 'curved-line',
			seed: 2026,
			particleCount: 2400
		});
		curvedEngine.step(steps12s);
		expect(curvedEngine.sensingOnRun.averageChemical).toBeGreaterThan(
			curvedEngine.sensingOffRun.averageChemical * 1.45
		);
	});

	it('reflects particles cleanly inside the logical domain boundaries', () => {
		expect(reflectCoordinate(-3.5, LOGICAL_WIDTH)).toBeCloseTo(3.5, 6);
		expect(reflectCoordinate(LOGICAL_WIDTH + 4.25, LOGICAL_WIDTH)).toBeCloseTo(
			LOGICAL_WIDTH - 4.25,
			6
		);
		expect(reflectCoordinate(-10, LOGICAL_HEIGHT)).toBeCloseTo(10, 6);
	});
});
