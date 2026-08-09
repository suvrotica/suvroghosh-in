import { describe, expect, it } from 'vitest';
import type { AttractorDefinition } from '../types';
import { ATTRACTOR_REGISTRY, getAttractorDefinition } from './registry';
import { generateTrajectory, TrajectoryComputationError } from './trajectory';

function axisMoments(positions: Float64Array, axis: number): { mean: number; deviation: number } {
	const count = positions.length / 3;
	let mean = 0;
	for (let index = 0; index < count; index += 1) mean += positions[index * 3 + axis];
	mean /= count;
	let variance = 0;
	for (let index = 0; index < count; index += 1) {
		variance += (positions[index * 3 + axis] - mean) ** 2;
	}
	return { mean, deviation: Math.sqrt(variance / count) };
}

function occupancy(positions: Float64Array, resolution = 8): Float64Array {
	const bins = new Float64Array(resolution ** 3);
	const count = positions.length / 3;
	for (let index = 0; index < count; index += 1) {
		const offset = index * 3;
		const coordinates = [0, 1, 2].map((axis) =>
			Math.max(
				0,
				Math.min(resolution - 1, Math.floor(((positions[offset + axis] + 1) / 2) * resolution))
			)
		);
		bins[(coordinates[2] * resolution + coordinates[1]) * resolution + coordinates[0]] += 1 / count;
	}
	return bins;
}

describe('trajectory generation and frozen observation normalization', () => {
	it.each(ATTRACTOR_REGISTRY)(
		'generates a finite post-transient $name preset without silent repair',
		(definition) => {
			const result = generateTrajectory(definition, { pointCount: 192 });
			expect(result.attractorId).toBe(definition.id);
			expect(result.pointCount).toBe(192);
			expect(result.rawPositions).toHaveLength(192 * 3);
			expect(result.normalizedPositions).toHaveLength(192 * 3);
			expect(result.rawPositions.every(Number.isFinite)).toBe(true);
			expect(result.normalizedPositions.every(Number.isFinite)).toBe(true);
			expect(result.normalizedPositions.every((value) => Math.abs(value) <= 1)).toBe(true);
			expect(result.normalization.frozenAtStep).toBe(
				definition.burnInSteps + definition.calibrationSteps * (definition.sampleStride ?? 1)
			);
			expect(result.firstOutputStep).toBe(
				definition.burnInSteps +
					definition.calibrationSteps * (definition.sampleStride ?? 1) +
					(definition.sampleStride ?? 1)
			);
			expect(result.simulationSteps[0]).toBe(result.firstOutputStep);
			expect(result.simulationTimes[1]).toBeGreaterThan(result.simulationTimes[0]);
		},
		30_000
	);

	it('renders Hénon as a two-dimensional point observation and Mackey–Glass as a delay embedding', () => {
		const henon = generateTrajectory('henon', { pointCount: 256 });
		for (let index = 2; index < henon.rawPositions.length; index += 3) {
			expect(henon.rawPositions[index]).toBe(0);
		}
		const mackey = generateTrajectory('mackey-glass', { pointCount: 256 });
		expect(mackey.rawPositions[0]).not.toBe(mackey.rawPositions[1]);
		expect(mackey.rawPositions[1]).not.toBe(mackey.rawPositions[2]);
	});

	it('samples Rabinovich–Fabrikant only after its long sensitive transient', () => {
		const definition = getAttractorDefinition('rabinovich-fabrikant');
		const result = generateTrajectory(definition, { pointCount: 6_144 });
		const metrics = {
			burnTime: definition.burnInSteps * (definition.stepSize ?? 0),
			strideTime: result.sampleStride * result.stepSize,
			spanTime: result.simulationTimes.at(-1)! - result.simulationTimes[0],
			ranges: [0, 1, 2].map((axis) => {
				const values = Array.from(
					{ length: result.pointCount },
					(_, index) => result.rawPositions[index * 3 + axis]
				);
				return Math.max(...values) - Math.min(...values);
			})
		};
		expect(definition.burnInSteps).toBe(1_000_000);
		expect(definition.sampleStride).toBe(50);
		expect(metrics.burnTime).toBeGreaterThanOrEqual(100);
		expect(metrics.strideTime).toBeCloseTo(0.005, 12);
		expect(metrics.spanTime).toBeGreaterThan(30);
		expect(metrics.ranges[0]).toBeGreaterThan(2);
		expect(metrics.ranges[1]).toBeGreaterThan(2);
		expect(metrics.ranges[2]).toBeGreaterThan(0.5);
		const midpoint = result.pointCount / 2;
		for (let axis = 0; axis < 3; axis += 1) {
			const early = axisMoments(result.normalizedPositions.slice(0, midpoint * 3), axis);
			const late = axisMoments(result.normalizedPositions.slice(midpoint * 3), axis);
			expect(Math.abs(early.mean - late.mean)).toBeLessThan(0.25);
			expect(late.deviation / early.deviation).toBeGreaterThan(0.7);
			expect(late.deviation / early.deviation).toBeLessThan(1.4);
		}
	});

	it('is exactly deterministic and never derives simulation time from a render clock', () => {
		const first = generateTrajectory('lorenz-63', { pointCount: 512 });
		const second = generateTrajectory('lorenz-63', { pointCount: 512 });
		expect([...first.rawPositions]).toEqual([...second.rawPositions]);
		expect([...first.normalizedPositions]).toEqual([...second.normalizedPositions]);
		expect([...first.simulationTimes]).toEqual([...second.simulationTimes]);
		for (let index = 1; index < first.pointCount; index += 1) {
			expect(first.simulationTimes[index] - first.simulationTimes[index - 1]).toBeCloseTo(
				0.005,
				12
			);
		}
	});

	it('compares h and h/2 through post-transient distributions rather than late point equality', () => {
		const canonical = getAttractorDefinition('lorenz-63');
		const halfStep: AttractorDefinition = {
			...canonical,
			stepSize: (canonical.stepSize ?? 0.005) / 2,
			burnInSteps: canonical.burnInSteps * 2,
			calibrationSteps: canonical.calibrationSteps * 2
		};
		const h = generateTrajectory(canonical, { pointCount: 8_192 });
		const h2 = generateTrajectory(halfStep, { pointCount: 16_384 });
		for (let axis = 0; axis < 3; axis += 1) {
			const coarse = axisMoments(h.normalizedPositions, axis);
			const fine = axisMoments(h2.normalizedPositions, axis);
			expect(Math.abs(coarse.mean - fine.mean)).toBeLessThan(0.35);
			expect(fine.deviation / coarse.deviation).toBeGreaterThan(0.45);
			expect(fine.deviation / coarse.deviation).toBeLessThan(2.2);
		}
		const coarseOccupancy = occupancy(h.normalizedPositions);
		const fineOccupancy = occupancy(h2.normalizedPositions);
		let totalVariation = 0;
		for (let index = 0; index < coarseOccupancy.length; index += 1) {
			totalVariation += Math.abs(coarseOccupancy[index] - fineOccupancy[index]);
		}
		expect(totalVariation / 2).toBeLessThan(0.8);
		expect(h.rawPositions.slice(-12)).not.toEqual(h2.rawPositions.slice(-12));
	}, 30_000);

	it('rejects escaped and non-finite trajectories rather than clamping or wrapping', () => {
		const lorenz = getAttractorDefinition('lorenz-63');
		const escaped: AttractorDefinition = { ...lorenz, escapeRadius: 0.5, burnInSteps: 1 };
		expect(() => generateTrajectory(escaped, { pointCount: 16 })).toThrowError(
			expect.objectContaining({ code: 'TRAJECTORY_ESCAPED' })
		);
		const nonFinite: AttractorDefinition = {
			...lorenz,
			initialState: [Number.NaN, 1, 1],
			burnInSteps: 1
		};
		expect(() => generateTrajectory(nonFinite, { pointCount: 16 })).toThrowError(
			expect.objectContaining({ code: 'NUMERICAL_FAILURE' })
		);
		expect(() =>
			generateTrajectory({ ...lorenz, sampleStride: 0 }, { pointCount: 16 })
		).toThrowError(/Sample stride/u);
	});

	it('reports phase progress in burn-in → calibration → output order and honours aborts', () => {
		const phases: string[] = [];
		generateTrajectory('lorenz-63', {
			pointCount: 32,
			onProgress: ({ phase }) => phases.push(phase)
		});
		expect(phases.indexOf('burn-in')).toBeLessThan(phases.indexOf('calibration'));
		expect(phases.indexOf('calibration')).toBeLessThan(phases.indexOf('trajectory'));
		const controller = new AbortController();
		controller.abort();
		expect(() =>
			generateTrajectory('lorenz-63', { pointCount: 16, signal: controller.signal })
		).toThrowError(TrajectoryComputationError);
	});
});
