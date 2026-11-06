import { describe, expect, it } from 'vitest';
import {
	DOMAIN_SHAPES,
	FIXED_ACTIVATOR_DIFFUSION,
	PRESET_ORDER,
	SPOT_STRIPE_PRESETS,
	SpotStripeSolver,
	SpotStripeWorkerClient,
	SynchronisedComparisonEngine,
	analyzeDomainModes,
	assessStability,
	configFromPreset,
	createDomainMask,
	createSeededDisturbance,
	renderFieldToRgba,
	solveUniformEquilibrium,
	type WorkerLike,
	type WorkerRequestMessage,
	type WorkerResponseMessage
} from './index.ts';

describe('How spots and stripes form — numerical engine', () => {
	it('solves the uniform equilibrium s^3 + 0.2s = k accurately across the parameter range', () => {
		for (const k of [-0.1, -0.075, -0.04, 0, 0.04, 0.075, 0.1]) {
			const s = solveUniformEquilibrium(k);
			const residual = s * s * s + 0.2 * s - k;
			expect(Math.abs(residual)).toBeLessThan(1e-14);
			if (k === 0) {
				expect(s).toBe(0);
			} else {
				expect(Math.sign(s)).toBe(Math.sign(k));
			}
		}

		// Symmetry: s(-k) === -s(k)
		expect(solveUniformEquilibrium(-0.075)).toBeCloseTo(-solveUniformEquilibrium(0.075), 14);
	});

	it('preserves a constant equilibrium field exactly under stepping', () => {
		for (const shape of ['broad-sheet', 'narrow-strip', 'tapered-patch'] as const) {
			const config = configFromPreset('spots', { shape, disturbanceAmplitude: 0 });
			const mask = createDomainMask(shape);
			const zeroDisturbance = {
				du: new Float64Array(mask.length),
				dv: new Float64Array(mask.length)
			};
			const solver = new SpotStripeSolver(config, { disturbance: zeroDisturbance });
			solver.step(250);
			const snap = solver.snapshot();

			expect(snap.summary.finite).toBe(true);
			expect(snap.summary.stdU).toBeLessThan(1e-14);
			expect(snap.summary.stdV).toBeLessThan(1e-14);
			expect(snap.summary.meanU).toBeCloseTo(snap.equilibrium, 13);
			expect(snap.summary.meanV).toBeCloseTo(snap.equilibrium, 13);
		}
	});

	it('produces bit-identical seeded disturbances and trajectories from the same seed', () => {
		const config = configFromPreset('spots', { seed: 1952 });
		const solverA = new SpotStripeSolver(config);
		const solverB = new SpotStripeSolver(config);
		const solverDifferentSeed = new SpotStripeSolver({ ...config, seed: 2026 });

		solverA.step(400);
		solverB.step(400);
		solverDifferentSeed.step(400);

		expect(Array.from(solverA.u)).toEqual(Array.from(solverB.u));
		expect(Array.from(solverA.v)).toEqual(Array.from(solverB.v));
		expect(Array.from(solverA.u)).not.toEqual(Array.from(solverDifferentSeed.u));
	});

	it('enforces zero normal flux across domain boundaries for all three flat geometries', () => {
		for (const shape of ['broad-sheet', 'narrow-strip', 'tapered-patch'] as const) {
			const spec = DOMAIN_SHAPES[shape];
			expect(spec.gridSpacing).toBe(0.8);
			const solver = new SpotStripeSolver(configFromPreset('stripes', { shape }));
			solver.step(300);
			const snap = solver.snapshot();

			// Integrated discrete Laplacian over all active cells must cancel to floating-point noise
			expect(Math.abs(snap.summary.laplacianSumU)).toBeLessThan(1e-10);
			expect(Math.abs(snap.summary.laplacianSumV)).toBeLessThan(1e-10);
		}
	});

	it('decays small disturbances when activator and inhibitor spread at the same rate (1×, Dv = Du = 0.6)', () => {
		const engine = new SynchronisedComparisonEngine(configFromPreset('spots'));
		const initialSnap = engine.snapshot();

		// Identical starting arrays at t = 0
		expect(Array.from(initialSnap.different.u)).toEqual(Array.from(initialSnap.equal.u));
		expect(Array.from(initialSnap.different.v)).toEqual(Array.from(initialSnap.equal.v));
		const initialStdU = initialSnap.equal.summary.stdU;
		expect(initialStdU).toBeGreaterThan(0.01);

		// Evolve to t = 30 (3000 steps)
		engine.step(3000);
		const midSnap = engine.snapshot();

		expect(midSnap.equal.config.inhibitorRatio).toBe(1);
		expect(midSnap.equal.stability.diffusionV).toBeCloseTo(FIXED_ACTIVATOR_DIFFUSION, 12);
		expect(midSnap.equal.modeAnalysis.maxGrowthRate).toBeLessThan(0);

		// Equal spreading decays toward 0 variation while faster inhibitor grows strongly
		expect(midSnap.equal.summary.stdU).toBeLessThan(1e-4);
		expect(midSnap.different.summary.stdU).toBeGreaterThan(0.35);
		expect(midSnap.history.length).toBeGreaterThan(10);
	});

	it('verifies growing spatial modes and calibrated distinct outputs for Spots, Stripes, and Inverse spots', () => {
		const results = new Map<string, ReturnType<SpotStripeSolver['snapshot']>>();

		for (const presetId of PRESET_ORDER) {
			const preset = SPOT_STRIPE_PRESETS[presetId];
			const config = configFromPreset(presetId);
			const modes = analyzeDomainModes(config);
			const stability = assessStability(config);

			expect(modes.uniformStable).toBe(true);
			expect(modes.growingModeCount).toBeGreaterThan(50);
			expect(modes.maxGrowthRate).toBeGreaterThan(0.1);
			expect(modes.equalSpreadingMaxGrowthRate).toBeLessThan(0);
			expect(stability.safe).toBe(true);
			expect(stability.safetyFactor).toBeGreaterThan(1.5);

			const solver = new SpotStripeSolver(config);
			const totalSteps = Math.round(preset.observationTime / preset.timestep);
			expect(solver.step(totalSteps)).toBe(true);
			const snap = solver.snapshot();
			expect(snap.summary.finite).toBe(true);
			expect(snap.summary.stdU).toBeGreaterThan(0.45);
			results.set(presetId, snap);
		}

		const spots = results.get('spots')!;
		const stripes = results.get('stripes')!;
		const inverseSpots = results.get('inverse-spots')!;

		// Spots: negative mean, positive skewness, many isolated positive islands on 1 connected negative background
		expect(spots.summary.meanU).toBeLessThan(-0.1);
		expect(spots.summary.skewU).toBeGreaterThan(0.35);
		expect(spots.summary.fractionAboveZero).toBeLessThan(0.42);
		expect(spots.summary.positiveComponents).toBeGreaterThan(35);
		expect(spots.summary.negativeComponents).toBe(1);

		// Stripes: near-zero mean and skewness, balanced area fraction, elongated connected bands
		expect(Math.abs(stripes.summary.meanU)).toBeLessThan(0.03);
		expect(Math.abs(stripes.summary.skewU)).toBeLessThan(0.1);
		expect(stripes.summary.fractionAboveZero).toBeGreaterThan(0.46);
		expect(stripes.summary.fractionAboveZero).toBeLessThan(0.54);
		expect(stripes.summary.positiveComponents).toBeLessThan(20);

		// Inverse spots: positive mean, negative skewness, many isolated negative pockets in 1 connected positive background
		expect(inverseSpots.summary.meanU).toBeGreaterThan(0.1);
		expect(inverseSpots.summary.skewU).toBeLessThan(-0.35);
		expect(inverseSpots.summary.fractionAboveZero).toBeGreaterThan(0.58);
		expect(inverseSpots.summary.positiveComponents).toBe(1);
		expect(inverseSpots.summary.negativeComponents).toBeGreaterThan(35);
	});

	it('survives timestep refinement between dt = 0.01 and dt = 0.005 at equal model time', () => {
		const baseConfig = configFromPreset('spots', { observationTime: 30 });
		const disturbance = createSeededDisturbance(96, 96, baseConfig.seed, baseConfig.disturbanceAmplitude);

		const coarse = new SpotStripeSolver({ ...baseConfig, timestep: 0.01 }, { disturbance });
		const fine = new SpotStripeSolver({ ...baseConfig, timestep: 0.005 }, { disturbance });

		coarse.step(3000);
		fine.step(6000);

		expect(coarse.modelTime).toBeCloseTo(30, 8);
		expect(fine.modelTime).toBeCloseTo(30, 8);

		let sumSq = 0;
		for (let i = 0; i < coarse.u.length; i += 1) {
			const diff = coarse.u[i] - fine.u[i];
			sumSq += diff * diff;
		}
		const rmsDiff = Math.sqrt(sumSq / coarse.u.length);
		expect(rmsDiff).toBeLessThan(1e-5);
	});

	it('keeps view switching and pigment threshold adjustments strictly display-only', () => {
		const solver = new SpotStripeSolver(configFromPreset('spots'));
		solver.step(1000);
		const snap = solver.snapshot();
		const uBefore = Array.from(snap.u);
		const vBefore = Array.from(snap.v);
		const timeBefore = snap.modelTime;
		const stepBefore = snap.stepIndex;

		const activatorPixels = renderFieldToRgba(snap, { viewMode: 'activator' });
		const inhibitorPixels = renderFieldToRgba(snap, { viewMode: 'inhibitor' });
		const pigmentLow = renderFieldToRgba(snap, { viewMode: 'pigment', pigmentThreshold: -0.35 });
		const pigmentHigh = renderFieldToRgba(snap, { viewMode: 'pigment', pigmentThreshold: 0.35 });

		// Underlying arrays and clock are untouched
		expect(Array.from(snap.u)).toEqual(uBefore);
		expect(Array.from(snap.v)).toEqual(vBefore);
		expect(snap.modelTime).toBe(timeBefore);
		expect(snap.stepIndex).toBe(stepBefore);

		// Display outputs differ as expected
		expect(Array.from(activatorPixels)).not.toEqual(Array.from(inhibitorPixels));
		expect(Array.from(pigmentLow)).not.toEqual(Array.from(pigmentHigh));
	});

	it('detects non-finite or divergent states without clamping signed fields', () => {
		const config = configFromPreset('spots');
		const total = 96 * 96;
		const initialU = new Float64Array(total);
		const initialV = new Float64Array(total);
		initialU.fill(120); // Exceeds divergence limit on first step
		const solver = new SpotStripeSolver(config, {
			initialFields: { u: initialU, v: initialV }
		});

		const ok = solver.step(1);
		const snap = solver.snapshot();
		expect(ok).toBe(false);
		expect(snap.summary.finite).toBe(false);
		expect(snap.summary.errorReason).toMatch(/divergence|non-finite/i);
	});

	it('ignores stale worker messages after a restart or dispose', () => {
		let messageListener = null as ((event: MessageEvent<WorkerResponseMessage>) => void) | null;
		const posted: WorkerRequestMessage[] = [];
		let terminated = false;

		const fakeWorker: WorkerLike = {
			postMessage(msg) {
				posted.push(msg);
			},
			addEventListener(_type, listener) {
				messageListener = listener;
			},
			removeEventListener() {
				messageListener = null;
			},
			terminate() {
				terminated = true;
			}
		};

		const client = new SpotStripeWorkerClient(() => fakeWorker);
		const receivedGenerations: number[] = [];
		client.subscribe((res) => {
			receivedGenerations.push(res.generationId);
		});

		const gen1 = client.init({
			config: configFromPreset('spots'),
			compareEqualSpreading: false,
			evolveToObservationTime: false
		});
		const gen2 = client.init({
			config: configFromPreset('stripes'),
			compareEqualSpreading: false,
			evolveToObservationTime: false
		});

		expect(gen1).toBe(1);
		expect(gen2).toBe(2);
		expect(posted).toHaveLength(2);

		const dummySnap = new SpotStripeSolver(configFromPreset('spots')).snapshot();

		// Deliver stale gen1 message after gen2 has started: must be ignored
		messageListener?.({
			data: {
				type: 'SNAPSHOT',
				generationId: gen1,
				compareEqualSpreading: false,
				primary: dummySnap,
				comparison: null
			}
		} as MessageEvent<WorkerResponseMessage>);
		expect(receivedGenerations).toEqual([]);

		// Deliver current gen2 message: accepted
		messageListener?.({
			data: {
				type: 'SNAPSHOT',
				generationId: gen2,
				compareEqualSpreading: false,
				primary: dummySnap,
				comparison: null
			}
		} as MessageEvent<WorkerResponseMessage>);
		expect(receivedGenerations).toEqual([2]);

		// Dispose client: worker terminated and subsequent messages ignored
		client.dispose();
		expect(terminated).toBe(true);
	});
});
