import { describe, expect, it } from 'vitest';
import { SeededRandom } from '$lib/utils/seeded-random';
import {
	ActiveBrownianModel,
	activeBrownianTheory,
	AnisotropicDiffusionModel,
	anisotropicDiffusionTheory,
	BrownianBridgeModel,
	BrownianSimulation,
	DriftDiffusionModel,
	FirstPassageModel,
	firstPassageSurvival,
	GeometricBrownianModel,
	geometricBrownianTheory,
	LevyFlightModel,
	levyFlightTheory,
	MODEL_PRESETS,
	MODEL_REGISTRY,
	OrnsteinUhlenbeckModel,
	PotentialDiffusionModel,
	potentialAndGradient,
	RandomWalkModel,
	randomWalkTheory,
	resolveCircularObstacleMove,
	sampleSymmetricStable,
	UnderdampedLangevinModel,
	type BoundaryCondition,
	type InitialCondition,
	type ProcessId,
	type ProcessModel
} from '.';

const unbounded: BoundaryCondition = { mode: 'unbounded' };
const defaultInitial: InitialCondition = { x: 0, y: 0, spread: 0 };

function run(
	model: ProcessModel<object>,
	particleCount: number,
	timestep: number,
	seed: string,
	initialCondition: InitialCondition = defaultInitial,
	boundary: BoundaryCondition = unbounded
): BrownianSimulation {
	return new BrownianSimulation({
		seed,
		particleCount,
		timestep,
		model,
		initialCondition,
		boundary,
		trajectory: {
			capacity: 1,
			sampleEverySteps: Number.MAX_SAFE_INTEGER,
			trackedParticleCount: 1
		}
	});
}

function relativeError(measured: number, expected: number): number {
	return Math.abs(measured - expected) / Math.abs(expected);
}

describe('discrete random walk', () => {
	it('recovers D = l²/(2 d tau) and its ensemble MSD', () => {
		const parameters = {
			dimensions: 2 as const,
			geometry: 'lattice' as const,
			stepLength: 0.5,
			timePerStep: 0.05,
			coarseGraining: 1
		};
		const simulation = run(
			new RandomWalkModel(parameters),
			20_000,
			parameters.timePerStep,
			'random-walk-msd'
		);
		simulation.step(20);
		const measured = simulation.metrics().meanSquareDisplacement;
		const expected = randomWalkTheory(parameters, 1).msd;
		expect(measured).not.toBeNull();
		expect(relativeError(measured ?? 0, expected)).toBeLessThan(0.025);
	});

	it('coarse-graining preserves completed block endpoints and random streams', () => {
		const common = {
			dimensions: 2 as const,
			geometry: 'isotropic' as const,
			stepLength: 0.2,
			timePerStep: 0.01
		};
		const microscopic = run(
			new RandomWalkModel({ ...common, coarseGraining: 1 }),
			128,
			0.01,
			'coarse-stream'
		);
		const grouped = run(
			new RandomWalkModel({ ...common, coarseGraining: 4 }),
			128,
			0.01,
			'coarse-stream'
		);
		microscopic.step(12);
		grouped.step(12);
		for (let index = 0; index < grouped.state.count; index += 1) {
			expect(Math.abs(grouped.state.x[index] - microscopic.state.x[index])).toBeLessThan(1e-12);
			expect(Math.abs(grouped.state.y[index] - microscopic.state.y[index])).toBeLessThan(1e-12);
		}
	});
});

describe('Gaussian diffusion families', () => {
	it('drift moves the mean without changing 2Dt variance', () => {
		const parameters = { diffusion: 0.7, driftX: 1.2, driftY: -0.4 };
		const simulation = run(new DriftDiffusionModel(parameters), 16_000, 0.01, 'drift-statistics');
		simulation.step(100);
		const metrics = simulation.metrics();
		expect(metrics.mean?.x).toBeCloseTo(1.2, 1);
		expect(metrics.mean?.y).toBeCloseTo(-0.4, 1);
		expect(relativeError(metrics.variance?.x ?? 0, 1.4)).toBeLessThan(0.035);
		expect(relativeError(metrics.variance?.y ?? 0, 1.4)).toBeLessThan(0.035);
	});

	it('produces the rotated anisotropic covariance tensor', () => {
		const parameters = {
			majorDiffusion: 1.2,
			minorDiffusion: 0.2,
			angle: Math.PI / 4
		};
		const simulation = run(
			new AnisotropicDiffusionModel(parameters),
			24_000,
			0.01,
			'anisotropic-covariance'
		);
		simulation.step(100);
		const measured = simulation.metrics();
		const expected = anisotropicDiffusionTheory(parameters, 1);
		expect(relativeError(measured.variance?.x ?? 0, expected.covarianceXX)).toBeLessThan(0.035);
		expect(relativeError(measured.variance?.y ?? 0, expected.covarianceYY)).toBeLessThan(0.035);
		expect(relativeError(measured.covarianceXY ?? 0, expected.covarianceXY)).toBeLessThan(0.045);
		expect(
			() =>
				new AnisotropicDiffusionModel({
					majorDiffusion: 0,
					minorDiffusion: 0.2,
					angle: 0
				})
		).toThrow();
	});

	it('uses the exact OU transition and approaches stationary variance D/lambda', () => {
		const simulation = run(
			new OrnsteinUhlenbeckModel({
				restoringRate: 2,
				diffusion: 1,
				equilibriumX: 0,
				equilibriumY: 0
			}),
			20_000,
			0.05,
			'ou-stationary'
		);
		simulation.step(60);
		const metrics = simulation.metrics();
		expect(relativeError(metrics.variance?.x ?? 0, 0.5)).toBeLessThan(0.035);
		expect(relativeError(metrics.variance?.y ?? 0, 0.5)).toBeLessThan(0.035);
	});
});

describe('underdamped Langevin dynamics', () => {
	it('crosses from a ballistic slope near two to long-time diffusion', () => {
		const parameters = {
			mass: 0.1,
			drag: 1,
			thermalEnergy: 1,
			forceX: 0,
			forceY: 0,
			initialVelocity: 'equilibrium' as const
		};
		const simulation = run(
			new UnderdampedLangevinModel(parameters),
			8_000,
			0.002,
			'underdamped-crossover'
		);
		simulation.step(2);
		const shortOne = simulation.metrics().meanSquareDisplacement ?? 0;
		simulation.step(2);
		const shortTwo = simulation.metrics().meanSquareDisplacement ?? 0;
		const shortSlope = Math.log(shortTwo / shortOne) / Math.log(2);
		simulation.step(496);
		const longOne = simulation.metrics().meanSquareDisplacement ?? 0;
		simulation.step(500);
		const longTwo = simulation.metrics().meanSquareDisplacement ?? 0;
		const longSlope = Math.log(longTwo / longOne) / Math.log(2);
		expect(shortSlope).toBeGreaterThan(1.8);
		expect(shortSlope).toBeLessThan(2.08);
		expect(longSlope).toBeGreaterThan(0.95);
		expect(longSlope).toBeLessThan(1.18);
		expect(relativeError(longTwo / (4 * 2), 1)).toBeLessThan(0.1);
	});
});

describe('energy landscapes and excluded regions', () => {
	const doubleWell = {
		landscape: 'double-well' as const,
		mobility: 1,
		thermalEnergy: 0,
		centerX: 0,
		centerY: 0,
		stiffness: 1,
		transverseStiffness: 2,
		barrierHeight: 3,
		wellSeparation: 2,
		period: 2,
		tilt: 0,
		obstacles: []
	};

	it('places double-well minima and barrier at the documented locations', () => {
		const left = potentialAndGradient(doubleWell, -2, 0);
		const centre = potentialAndGradient(doubleWell, 0, 0);
		const right = potentialAndGradient(doubleWell, 2, 0);
		expect(left.potential).toBe(0);
		expect(right.potential).toBe(0);
		expect(left.gradient.x).toBeCloseTo(0, 14);
		expect(right.gradient.x).toBeCloseTo(0, 14);
		expect(centre.potential).toBe(3);
	});

	it('reflects a long segment at the first circle instead of tunnelling through it', () => {
		const resolved = resolveCircularObstacleMove(-2, 0, 4, 0, [{ x: 0, y: 0, radius: 1 }]);
		const finalX = -2 + resolved.deltaX;
		const finalY = resolved.deltaY;
		expect(resolved.collided).toBe(true);
		expect(Math.hypot(finalX, finalY)).toBeGreaterThanOrEqual(1);
		expect(finalX).toBeLessThan(-1);
	});

	it('applies the deterministic harmonic drift at zero temperature', () => {
		const simulation = run(
			new PotentialDiffusionModel({
				...doubleWell,
				landscape: 'harmonic',
				stiffness: 1
			}),
			1,
			0.1,
			'potential-drift',
			{ x: 2, y: 0, spread: 0 }
		);
		simulation.step();
		expect(simulation.state.x[0]).toBeCloseTo(1.8, 12);
	});
});

describe('active and conditioned paths', () => {
	it('approaches the active-particle long-time effective diffusion', () => {
		const parameters = {
			propulsionSpeed: 1,
			translationalDiffusion: 0.2,
			rotationalDiffusion: 2,
			obstacles: []
		};
		const simulation = run(
			new ActiveBrownianModel(parameters),
			12_000,
			0.01,
			'active-effective-diffusion'
		);
		simulation.step(800);
		const measuredMsd = simulation.metrics().meanSquareDisplacement ?? 0;
		const theory = activeBrownianTheory(parameters, 8);
		expect(relativeError(measuredMsd, theory.msd)).toBeLessThan(0.055);
		expect(relativeError(measuredMsd / (4 * 8), theory.effectiveDiffusion ?? 0)).toBeLessThan(0.09);
	});

	it('has exact bridge endpoints and the conditional midpoint variance DT/2', () => {
		const diffusion = 0.8;
		const duration = 2;
		const simulation = run(
			new BrownianBridgeModel({
				diffusion,
				startX: -1,
				startY: 0.5,
				endX: 2,
				endY: -0.5,
				duration
			}),
			20_000,
			0.01,
			'bridge-midpoint'
		);
		expect(simulation.state.x[0]).toBe(-1);
		expect(simulation.state.y[0]).toBe(0.5);
		simulation.step(100);
		const midpoint = simulation.metrics();
		expect(relativeError(midpoint.variance?.x ?? 0, (diffusion * duration) / 2)).toBeLessThan(
			0.035
		);
		expect(relativeError(midpoint.variance?.y ?? 0, (diffusion * duration) / 2)).toBeLessThan(
			0.035
		);
		simulation.step(100);
		for (let index = 0; index < simulation.state.count; index += 1) {
			expect(simulation.state.x[index]).toBe(2);
			expect(simulation.state.y[index]).toBe(-0.5);
		}
	});
});

describe('mathematical cousins', () => {
	it('keeps geometric Brownian paths positive and recovers their exact mean', () => {
		const parameters = { initialValue: 2, growthRate: 0.1, volatility: 0.5 };
		const simulation = run(
			new GeometricBrownianModel(parameters),
			14_000,
			0.01,
			'geometric-positive'
		);
		simulation.step(100);
		let minimum = Number.POSITIVE_INFINITY;
		for (const value of simulation.state.x) minimum = Math.min(minimum, value);
		expect(minimum).toBeGreaterThan(0);
		const expected = geometricBrownianTheory(parameters, 1).mean;
		expect(relativeError(simulation.metrics().mean?.x ?? 0, expected)).toBeLessThan(0.02);
	});

	it('samples the alpha=2 CMS stable law with variance two and labels divergent MSD', () => {
		const random = new SeededRandom('cms-alpha-two');
		let mean = 0;
		let sumSquares = 0;
		const count = 60_000;
		for (let index = 1; index <= count; index += 1) {
			const sample = sampleSymmetricStable(2, random.next(), random.next());
			const delta = sample - mean;
			mean += delta / index;
			sumSquares += delta * (sample - mean);
		}
		expect(Math.abs(mean)).toBeLessThan(0.02);
		expect(relativeError(sumSquares / count, 2)).toBeLessThan(0.025);
		expect(levyFlightTheory({ dimensions: 2, stability: 1.5, scale: 1 })).toMatchObject({
			finiteVariance: false,
			gaussianMsdRate: null
		});
	});

	it('replays Lévy paths exactly with a fixed number of per-particle draws', () => {
		const model = new LevyFlightModel({ dimensions: 2, stability: 1.35, scale: 0.4 });
		const first = run(model, 256, 0.01, 'levy-replay');
		const second = run(
			new LevyFlightModel({ dimensions: 2, stability: 1.35, scale: 0.4 }),
			256,
			0.01,
			'levy-replay'
		);
		first.step(40);
		second.step(40);
		expect(first.state.x).toEqual(second.state.x);
		expect(first.state.y).toEqual(second.state.y);
	});
});

describe('first passage', () => {
	it('matches half-line survival theory with Brownian-bridge crossing correction', () => {
		const parameters = {
			diffusion: 1,
			wallX: 0,
			startDistance: 1,
			bridgeCorrection: true
		};
		const simulation = run(
			new FirstPassageModel(parameters),
			30_000,
			0.02,
			'first-passage-survival'
		);
		simulation.step(50);
		const measured = simulation.metrics().survivalFraction;
		const theory = firstPassageSurvival(parameters, 1);
		expect(Math.abs(measured - theory)).toBeLessThan(0.012);
		for (let index = 0; index < simulation.state.count; index += 1) {
			if (simulation.state.alive[index] === 0) {
				expect(Number.isFinite(simulation.state.firstPassageTime[index])).toBe(true);
				expect(simulation.state.x[index]).toBe(0);
			} else {
				expect(Number.isNaN(simulation.state.firstPassageTime[index])).toBe(true);
			}
		}
	});
});

describe('typed model catalogue', () => {
	it('is exhaustive, validates defaults, and provides curated stories', () => {
		const ids = Object.keys(MODEL_REGISTRY) as ProcessId[];
		expect(ids).toHaveLength(13);
		for (const id of ids) {
			const definition = MODEL_REGISTRY[id];
			const validate = definition.validate as (
				parameters: object,
				timestep?: number
			) => readonly { readonly severity: 'error' | 'caution'; readonly message: string }[];
			expect(definition.label.length).toBeGreaterThan(3);
			expect(definition.equation.plain.length).toBeGreaterThan(5);
			expect(definition.compatibleDiagnostics.length).toBeGreaterThan(0);
			expect(MODEL_PRESETS[id].length).toBeGreaterThanOrEqual(2);
			expect(validate(definition.defaultParameters)).toEqual([]);
			for (const preset of MODEL_PRESETS[id]) expect(validate(preset.parameters)).toEqual([]);
		}
		expect(MODEL_REGISTRY['fractional-brownian'].trajectoryGenerator).toBe(true);
		expect('create' in MODEL_REGISTRY['fractional-brownian']).toBe(false);
		expect(MODEL_REGISTRY['free-brownian'].validate({ diffusion: -1 })[0]?.severity).toBe('error');
		const freeTheory = MODEL_REGISTRY['free-brownian'].theory?.(
			{ diffusion: 1 },
			{ time: 2, initialCondition: { x: 0, y: 0, spread: 0.5 } }
		);
		expect(freeTheory?.variance?.x).toBe(4.25);
		const gaussianStableTheory = MODEL_REGISTRY['levy-flight'].theory?.(
			{ dimensions: 2, stability: 2, scale: 1 },
			{ time: 3 }
		);
		expect(gaussianStableTheory?.meanSquareDisplacement).toBe(12);
	});
});
