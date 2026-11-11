import { BASE_TIME_STEP, KINETICS, type Mesh } from './config.ts';
import { surfaceRows } from './geometry.ts';
import { reactionJacobian } from './solver.ts';

/** Search the spectrum of the all-Neumann finite-volume surface operator.
 * The azimuthal direction is an exact discrete cosine mode. Its row-dependent
 * eigenvalue leaves a symmetric tridiagonal meridional operator after area weighting.
 */
export function surfaceEigenvalueBelow(mesh: Mesh, azimuthalMode: number, target: number) {
	const rows = surfaceRows(mesh);
	const cosineEigenvalue = 4 * Math.sin((azimuthalMode * Math.PI) / (2 * mesh.columns)) ** 2;
	const north = rows.map(
		({ northFace, northWidth, cellAreaPerRadian }) => northFace / (cellAreaPerRadian * northWidth)
	);
	const south = rows.map(
		({ southFace, southWidth, cellAreaPerRadian }) => southFace / (cellAreaPerRadian * southWidth)
	);
	const diagonal = rows.map(
		({ dx }, row) => north[row] + south[row] + cosineEigenvalue / (dx * dx)
	);
	const offDiagonalSquared = rows.slice(0, -1).map((_, row) => south[row] * north[row + 1]);

	function countBelow(value: number) {
		let pivot = diagonal[0] - value;
		let count = Number(pivot < 0);
		for (let row = 1; row < rows.length; row++) {
			if (Math.abs(pivot) < 1e-20) pivot = pivot < 0 ? -1e-20 : 1e-20;
			pivot = diagonal[row] - value - offDiagonalSquared[row - 1] / pivot;
			count += Number(pivot < 0);
		}
		return count;
	}

	const modeCount = countBelow(target);
	if (!modeCount) return null;
	let low = 0;
	let high = target;
	for (let i = 0; i < 45; i++) {
		const midpoint = (low + high) / 2;
		if (countBelow(midpoint) < modeCount) low = midpoint;
		else high = midpoint;
	}
	return { eigenvalue: (low + high) / 2, meridionalMode: modeCount - 1, azimuthalMode };
}

/** Exact one-step amplification of an axisymmetric linearized discrete mode.
 * Its lateral increment is zero, so the two implicit factors reduce to one.
 */
export function axisymmetricStepGain(eigenvalue: number, dt = BASE_TIME_STEP) {
	const { fu, fv, gu, gv } = reactionJacobian();
	const u = dt / (1 + dt * (KINETICS.mu + eigenvalue));
	const v = dt / (1 + dt * (KINETICS.nu + KINETICS.D * eigenvalue));
	const aa = 1 + u * (fu - eigenvalue);
	const bb = u * fv;
	const cc = v * gu;
	const dd = 1 + v * (gv - KINETICS.D * eigenvalue);
	const trace = aa + dd;
	const determinant = aa * dd - bb * cc;
	const discriminant = trace ** 2 - 4 * determinant;
	return discriminant < 0
		? Math.sqrt(determinant)
		: (Math.abs(trace) + Math.sqrt(discriminant)) / 2;
}

/** Median crest spacing along the crease-initiated front in the lower pad.
 * Use parabolic interpolation around each sampled maximum.
 */
export function creaseRidgeSpacing(mesh: Mesh, field: Float32Array) {
	const dy = mesh.length / (mesh.rows - mesh.capRows);
	const distances = [];
	for (
		let column = 0.22 * mesh.columns;
		column <= 0.43 * mesh.columns;
		column += mesh.columns / 90
	) {
		const c = Math.round(column);
		let previous: number | null = null;
		for (let row = mesh.rows - 2; row > mesh.rows - 145 / dy; row--) {
			const value = field[row * mesh.columns + c];
			const above = field[(row - 1) * mesh.columns + c];
			const below = field[(row + 1) * mesh.columns + c];
			if (value < 12 || value <= above || value <= below) continue;
			const z = (mesh.rows - row - 0.5 - (above - below) / (2 * (above - 2 * value + below))) * dy;
			if (previous !== null) distances.push(z - previous);
			previous = z;
		}
	}
	distances.sort((a, b) => a - b);
	return distances.length ? distances[Math.floor(distances.length / 2)] : null;
}
