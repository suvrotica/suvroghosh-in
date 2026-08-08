import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { checkpointStateToBZFieldState, decodeBZCheckpointV1 } from './checkpoints/codec';
import { cellCoordinate, createBZMasks } from './mask';
import {
	annularBZOrientation,
	bzPhaseAt,
	bzRadialProfile,
	circularDishWallDistance,
	coefficientOfVariation,
	createBZPhaseField,
	detectBZPhaseCores,
	findBZRadialPeaks,
	matchBZCore,
	unwrapAngle,
	wrappedPhaseDifference,
	type BZCoreTrackPoint
} from './v2-analysis';
import {
	OREGONATOR_EQUATIONS_ID,
	OREGONATOR_MODEL_VERSION,
	type BZFieldState,
	type BZSetup
} from './types';
import type { BZV2PhaseCoordinate } from './v2-types';

const phaseCoordinate: BZV2PhaseCoordinate = {
	centreU: 0,
	centreV: 0,
	scaleU: 1,
	scaleV: 1
};

function squareSetup(size: number, domainSize = 12): BZSetup {
	return {
		model: 'oregonator',
		modelVersion: OREGONATOR_MODEL_VERSION,
		equationsId: OREGONATOR_EQUATIONS_ID,
		parameters: { epsilon: 0.05, q: 0.002, f: 1.4 },
		diffusionU: 1,
		diffusionV: 0,
		timestep: 0.0005,
		gridSize: size,
		domainSize,
		activeRadius: domainSize / 2,
		boundary: 'no-flux',
		geometry: 'square',
		maskPreset: 'none',
		initialCondition: 'uniform-equilibrium',
		seed: 'v2-analysis-test'
	};
}

function syntheticState(
	setup: Readonly<BZSetup>,
	valueAt: (x: number, y: number) => readonly [number, number]
): BZFieldState {
	const { domainMask, mask } = createBZMasks(setup);
	const u = new Float64Array(setup.gridSize * setup.gridSize);
	const v = new Float64Array(u.length);
	for (let row = 0; row < setup.gridSize; row += 1) {
		const y = cellCoordinate(row, setup.gridSize, setup.domainSize);
		for (let column = 0; column < setup.gridSize; column += 1) {
			const x = cellCoordinate(column, setup.gridSize, setup.domainSize);
			const index = row * setup.gridSize + column;
			[u[index], v[index]] = valueAt(x, y);
		}
	}
	return { size: setup.gridSize, u, v, domainMask, mask };
}

async function loadCheckpoint(name: string) {
	const path = resolve(process.cwd(), 'static', 'data', 'bz-v2', 'checkpoints', name);
	return decodeBZCheckpointV1(new Uint8Array(await readFile(path)));
}

describe('BZ V2 phase and core analysis', () => {
	it('wraps and unwraps phase continuously across the branch cut', () => {
		expect(wrappedPhaseDifference(-Math.PI + 0.1, Math.PI - 0.1)).toBeCloseTo(0.2, 12);
		expect(wrappedPhaseDifference(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(-0.2, 12);
		expect(unwrapAngle(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(Math.PI + 0.1, 12);
	});

	it('detects one signed vortex and recovers its annular orientation', () => {
		const setup = squareSetup(65);
		const offset = 0.63;
		const state = syntheticState(setup, (x, y) => {
			const phase = Math.atan2(y, x) + offset;
			return [Math.cos(phase), Math.sin(phase)];
		});
		const cores = detectBZPhaseCores(state, setup, phaseCoordinate, Math.PI, 0.5);
		expect(cores).toHaveLength(1);
		expect(Math.hypot(cores[0].x, cores[0].y)).toBeLessThan(setup.domainSize / setup.gridSize);
		expect(Math.abs(cores[0].winding) / cores[0].plaquettes).toBeCloseTo(2 * Math.PI, 8);
		expect(annularBZOrientation(state, setup, phaseCoordinate, [0, 0], 3, 0.5)).toBeCloseTo(
			offset,
			2
		);
	});

	it('returns no fabricated core or orientation for a spatially uniform field', () => {
		const setup = squareSetup(33);
		const state = syntheticState(setup, () => [1, 0]);
		expect(detectBZPhaseCores(state, setup, phaseCoordinate)).toEqual([]);
		expect(annularBZOrientation(state, setup, phaseCoordinate, [0, 0], 3, 0.5)).toBeNull();
	});

	it('rejects invalid phase coordinates and mismatched grids', () => {
		expect(() => bzPhaseAt(0, 0, { ...phaseCoordinate, scaleU: 0 })).toThrow(/positive/iu);
		const setup = squareSetup(8);
		const state = syntheticState(setup, () => [1, 0]);
		expect(() => createBZPhaseField(state, { ...phaseCoordinate, centreU: Number.NaN })).toThrow(
			/finite/iu
		);
		expect(() => detectBZPhaseCores(state, { ...setup, gridSize: 9 }, phaseCoordinate)).toThrow(
			/grids differ/iu
		);
	});
});

describe('BZ V2 radial and tracking analysis', () => {
	it('finds three separated fronts in a deterministic radial field', () => {
		const setup = squareSetup(97);
		const radii = [1.4, 3.0, 4.55] as const;
		const state = syntheticState(setup, (x, y) => {
			const radius = Math.hypot(x, y);
			const u = radii.reduce(
				(sum, centre) => sum + 0.8 * Math.exp(-((radius - centre) ** 2) / (2 * 0.11 ** 2)),
				0.02
			);
			return [u, 0];
		});
		const profile = bzRadialProfile(state, setup, 'u', 72, [0, 0], 5.5);
		const peaks = findBZRadialPeaks(profile, 0.2, 8);
		expect(peaks).toHaveLength(3);
		for (let index = 0; index < radii.length; index += 1) {
			expect(peaks[index].radius).toBeCloseTo(radii[index], 1);
			expect(peaks[index].prominence).toBeGreaterThan(0.5);
		}
	});

	it('matches only a nearby same-charge core and handles summary edge cases', () => {
		const previous: BZCoreTrackPoint = {
			x: 1,
			y: 1,
			charge: 1,
			winding: 2 * Math.PI,
			plaquettes: 1,
			step: 10,
			modelTime: 0.5
		};
		const match = matchBZCore(
			previous,
			[
				{ x: 1.2, y: 1.1, charge: -1, winding: -2 * Math.PI, plaquettes: 1 },
				{ x: 1.1, y: 1.1, charge: 1, winding: 2 * Math.PI, plaquettes: 1 },
				{ x: 4, y: 4, charge: 1, winding: 2 * Math.PI, plaquettes: 1 }
			],
			0.5
		);
		expect(match?.x).toBe(1.1);
		expect(matchBZCore(previous, [], 1)).toBeNull();
		expect(coefficientOfVariation([2, 2, 2])).toBe(0);
		expect(coefficientOfVariation([1, Number.NaN])).toBeNaN();
		expect(coefficientOfVariation([0, 0])).toBe(Number.POSITIVE_INFINITY);
		expect(circularDishWallDistance([3, 4], { activeRadius: 7 })).toBe(2);
	});
});

describe('committed V2 checkpoint scientific fixtures', () => {
	it('retains three significant target fronts in the promoted 256² snapshot', async () => {
		const decoded = await loadCheckpoint('classic-target-rings-256-v2.bzcp');
		const state = checkpointStateToBZFieldState(decoded.state);
		const setup = decoded.metadata.setup;
		const bins = Math.floor(setup.gridSize / 2);
		const separation = Math.max(2, Math.ceil(1.5 / (setup.activeRadius / bins)));
		const peaks = findBZRadialPeaks(
			bzRadialProfile(state, setup, 'u', bins),
			0.035,
			separation
		).filter((peak) => peak.radius > 4.5 && peak.radius < setup.activeRadius - 1.5);
		expect(peaks).toHaveLength(3);
		expect(peaks[1].radius - peaks[0].radius).toBeGreaterThan(12);
		expect(peaks[2].radius - peaks[1].radius).toBeGreaterThan(12);
	});

	it.each([
		['persistent-single-spiral-256-v2.bzcp', 1],
		['spiral-garden-256-v2.bzcp', 3]
	] as const)('retains %i persistent interior phase core(s) in %s', async (name, expected) => {
		const decoded = await loadCheckpoint(name);
		const state = checkpointStateToBZFieldState(decoded.state);
		const cores = detectBZPhaseCores(
			state,
			decoded.metadata.setup,
			{ centreU: 0.1, centreV: 0.1, scaleU: 0.42, scaleV: 0.12 },
			Math.PI,
			0.025
		).filter((core) => circularDishWallDistance([core.x, core.y], decoded.metadata.setup) > 1.25);
		expect(cores).toHaveLength(expected);
	});
});
