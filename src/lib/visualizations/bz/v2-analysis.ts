import { cellCoordinate } from './mask';
import type { BZFieldState, BZSetup } from './types';
import type { BZV2PhaseCoordinate } from './v2-types';

const TAU = 2 * Math.PI;

export interface BZPhaseCore {
	readonly x: number;
	readonly y: number;
	readonly charge: -1 | 1;
	readonly winding: number;
	readonly plaquettes: number;
}

export interface BZRadialBin {
	readonly radius: number;
	readonly mean: number;
	readonly count: number;
}

export interface BZRadialPeak {
	readonly bin: number;
	readonly radius: number;
	readonly value: number;
	readonly prominence: number;
}

export interface BZCoreTrackPoint extends BZPhaseCore {
	readonly step: number;
	readonly modelTime: number;
}

export function bzPhaseAt(u: number, v: number, coordinate: Readonly<BZV2PhaseCoordinate>): number {
	if (
		![u, v, coordinate.centreU, coordinate.centreV, coordinate.scaleU, coordinate.scaleV].every(
			Number.isFinite
		)
	) {
		throw new RangeError('Phase coordinate inputs must be finite.');
	}
	if (!(coordinate.scaleU > 0) || !(coordinate.scaleV > 0)) {
		throw new RangeError('Phase coordinate scales must be positive.');
	}
	return Math.atan2(
		(v - coordinate.centreV) / coordinate.scaleV,
		(u - coordinate.centreU) / coordinate.scaleU
	);
}

export function createBZPhaseField(
	state: Readonly<BZFieldState>,
	coordinate: Readonly<BZV2PhaseCoordinate>
): Float64Array {
	const phase = new Float64Array(state.u.length);
	phase.fill(Number.NaN);
	for (let index = 0; index < phase.length; index += 1) {
		if (state.mask[index]) phase[index] = bzPhaseAt(state.u[index], state.v[index], coordinate);
	}
	return phase;
}

export function wrappedPhaseDifference(to: number, from: number): number {
	let difference = to - from;
	while (difference <= -Math.PI) difference += TAU;
	while (difference > Math.PI) difference -= TAU;
	return difference;
}

export function unwrapAngle(previousUnwrapped: number, nextWrapped: number): number {
	const previousWrapped = ((((previousUnwrapped + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
	return previousUnwrapped + wrappedPhaseDifference(nextWrapped, previousWrapped);
}

export function detectBZPhaseCores(
	state: Readonly<BZFieldState>,
	setup: Readonly<BZSetup>,
	coordinate: Readonly<BZV2PhaseCoordinate>,
	minimumWinding = Math.PI,
	minimumMeanAmplitude = 0
): readonly BZPhaseCore[] {
	if (state.size !== setup.gridSize)
		throw new RangeError('Phase-core state and setup grids differ.');
	if (!(minimumMeanAmplitude >= 0) || !Number.isFinite(minimumMeanAmplitude)) {
		throw new RangeError('Minimum phase amplitude must be finite and non-negative.');
	}
	const phase = createBZPhaseField(state, coordinate);
	const candidates: Array<{ row: number; column: number; winding: number; charge: -1 | 1 }> = [];
	for (let row = 0; row < state.size - 1; row += 1) {
		for (let column = 0; column < state.size - 1; column += 1) {
			const a = row * state.size + column;
			const b = a + 1;
			const c = a + state.size + 1;
			const d = a + state.size;
			if (!state.mask[a] || !state.mask[b] || !state.mask[c] || !state.mask[d]) continue;
			if (minimumMeanAmplitude > 0) {
				let amplitude = 0;
				for (const index of [a, b, c, d]) {
					amplitude += Math.hypot(
						(state.u[index] - coordinate.centreU) / coordinate.scaleU,
						(state.v[index] - coordinate.centreV) / coordinate.scaleV
					);
				}
				if (amplitude / 4 < minimumMeanAmplitude) continue;
			}
			const winding =
				wrappedPhaseDifference(phase[b], phase[a]) +
				wrappedPhaseDifference(phase[c], phase[b]) +
				wrappedPhaseDifference(phase[d], phase[c]) +
				wrappedPhaseDifference(phase[a], phase[d]);
			if (Math.abs(winding) >= minimumWinding) {
				candidates.push({ row, column, winding, charge: winding > 0 ? 1 : -1 });
			}
		}
	}

	const visited = new Uint8Array(candidates.length);
	const candidateAt = new Map<string, number>();
	for (let index = 0; index < candidates.length; index += 1) {
		candidateAt.set(
			`${candidates[index].row}:${candidates[index].column}:${candidates[index].charge}`,
			index
		);
	}
	const cores: BZPhaseCore[] = [];
	for (let start = 0; start < candidates.length; start += 1) {
		if (visited[start]) continue;
		visited[start] = 1;
		const queue = [start];
		let weight = 0;
		let x = 0;
		let y = 0;
		let winding = 0;
		let plaquettes = 0;
		const charge = candidates[start].charge;
		while (queue.length > 0) {
			const currentIndex = queue.pop()!;
			const current = candidates[currentIndex];
			const currentWeight = Math.abs(current.winding);
			weight += currentWeight;
			x += cellCoordinate(current.column + 0.5, state.size, setup.domainSize) * currentWeight;
			y += cellCoordinate(current.row + 0.5, state.size, setup.domainSize) * currentWeight;
			winding += current.winding;
			plaquettes += 1;
			for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
				for (let columnOffset = -1; columnOffset <= 1; columnOffset += 1) {
					const candidateIndex = candidateAt.get(
						`${current.row + rowOffset}:${current.column + columnOffset}:${charge}`
					);
					if (candidateIndex === undefined || visited[candidateIndex]) continue;
					visited[candidateIndex] = 1;
					queue.push(candidateIndex);
				}
			}
		}
		cores.push({ x: x / weight, y: y / weight, charge, winding, plaquettes });
	}
	return cores.sort((left, right) => Math.hypot(left.x, left.y) - Math.hypot(right.x, right.y));
}

export function annularBZOrientation(
	state: Readonly<BZFieldState>,
	setup: Readonly<BZSetup>,
	coordinate: Readonly<BZV2PhaseCoordinate>,
	core: readonly [number, number],
	radius: number,
	width: number
): number | null {
	if (!(radius > 0) || !(width > 0))
		throw new RangeError('Annulus radius and width must be positive.');
	let real = 0;
	let imaginary = 0;
	let count = 0;
	for (let row = 0; row < state.size; row += 1) {
		const y = cellCoordinate(row, state.size, setup.domainSize);
		for (let column = 0; column < state.size; column += 1) {
			const index = row * state.size + column;
			if (!state.mask[index]) continue;
			const x = cellCoordinate(column, state.size, setup.domainSize);
			const dx = x - core[0];
			const dy = y - core[1];
			const distance = Math.hypot(dx, dy);
			if (Math.abs(distance - radius) > width / 2) continue;
			const phase = bzPhaseAt(state.u[index], state.v[index], coordinate);
			const polar = Math.atan2(dy, dx);
			const aligned = phase - polar;
			real += Math.cos(aligned);
			imaginary += Math.sin(aligned);
			count += 1;
		}
	}
	return count >= 8 && Math.hypot(real, imaginary) > count * 0.02
		? Math.atan2(imaginary, real)
		: null;
}

export function bzRadialProfile(
	state: Readonly<BZFieldState>,
	setup: Readonly<BZSetup>,
	field: 'u' | 'v' = 'u',
	bins = Math.max(16, Math.floor(state.size / 2)),
	centre: readonly [number, number] = [0, 0],
	maximumRadius = setup.activeRadius
): readonly BZRadialBin[] {
	if (!Number.isInteger(bins) || bins < 4)
		throw new RangeError('Radial bin count must be at least four.');
	const sums = new Float64Array(bins);
	const counts = new Uint32Array(bins);
	const values = field === 'u' ? state.u : state.v;
	for (let row = 0; row < state.size; row += 1) {
		const y = cellCoordinate(row, state.size, setup.domainSize);
		for (let column = 0; column < state.size; column += 1) {
			const index = row * state.size + column;
			if (!state.mask[index]) continue;
			const x = cellCoordinate(column, state.size, setup.domainSize);
			const radius = Math.hypot(x - centre[0], y - centre[1]);
			if (radius >= maximumRadius) continue;
			const bin = Math.min(bins - 1, Math.floor((radius / maximumRadius) * bins));
			sums[bin] += values[index];
			counts[bin] += 1;
		}
	}
	return Array.from({ length: bins }, (_, bin) => ({
		radius: ((bin + 0.5) / bins) * maximumRadius,
		mean: counts[bin] > 0 ? sums[bin] / counts[bin] : Number.NaN,
		count: counts[bin]
	}));
}

export function findBZRadialPeaks(
	profile: readonly BZRadialBin[],
	minimumProminence = 0.04,
	minimumSeparationBins = 2
): readonly BZRadialPeak[] {
	const peaks: BZRadialPeak[] = [];
	for (let index = 1; index < profile.length - 1; index += 1) {
		const value = profile[index].mean;
		if (
			!Number.isFinite(value) ||
			value < profile[index - 1].mean ||
			value <= profile[index + 1].mean
		)
			continue;
		let leftMinimum = value;
		let rightMinimum = value;
		for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
			if (!Number.isFinite(profile[cursor].mean)) continue;
			leftMinimum = Math.min(leftMinimum, profile[cursor].mean);
			if (profile[cursor].mean > value) break;
		}
		for (let cursor = index + 1; cursor < profile.length; cursor += 1) {
			if (!Number.isFinite(profile[cursor].mean)) continue;
			rightMinimum = Math.min(rightMinimum, profile[cursor].mean);
			if (profile[cursor].mean > value) break;
		}
		const prominence = value - Math.max(leftMinimum, rightMinimum);
		if (prominence < minimumProminence) continue;
		const previous = peaks.at(-1);
		if (previous && index - previous.bin < minimumSeparationBins) {
			if (value > previous.value)
				peaks[peaks.length - 1] = { bin: index, radius: profile[index].radius, value, prominence };
		} else {
			peaks.push({ bin: index, radius: profile[index].radius, value, prominence });
		}
	}
	return peaks;
}

export function matchBZCore(
	previous: Readonly<BZCoreTrackPoint>,
	candidates: readonly BZPhaseCore[],
	maximumDistance: number
): BZPhaseCore | null {
	let best: BZPhaseCore | null = null;
	let bestDistance = maximumDistance;
	for (const candidate of candidates) {
		if (candidate.charge !== previous.charge) continue;
		const distance = Math.hypot(candidate.x - previous.x, candidate.y - previous.y);
		if (distance < bestDistance) {
			best = candidate;
			bestDistance = distance;
		}
	}
	return best;
}

export function coefficientOfVariation(values: readonly number[]): number {
	if (values.length === 0 || values.some((value) => !Number.isFinite(value))) return Number.NaN;
	const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
	if (Math.abs(mean) < Number.EPSILON) return Number.POSITIVE_INFINITY;
	const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
	return Math.sqrt(variance) / Math.abs(mean);
}

export function circularDishWallDistance(
	point: readonly [number, number],
	setup: Pick<BZSetup, 'activeRadius'>
): number {
	return setup.activeRadius - Math.hypot(point[0], point[1]);
}
