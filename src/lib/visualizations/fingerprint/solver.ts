import {
	BASE_TIME_STEP,
	END_TIME,
	KINETICS,
	LENGTH,
	NOISE_LENGTH,
	RADIUS,
	RAMP_DURATION,
	creaseOnset,
	meshDimensions,
	nailOnset,
	normalizeSettings,
	type Mesh,
	type Settings
} from './config.ts';
import { surfaceRows } from './geometry.ts';

const { a, K, r, mu, nu, D } = KINETICS;

export function equilibrium() {
	let low = 0;
	let high = (r * (a + nu)) / mu;
	for (let i = 0; i < 54; i++) {
		const midpoint = (low + high) / 2;
		if (r * (a + nu / (1 + K * midpoint ** 2)) > mu * midpoint) low = midpoint;
		else high = midpoint;
	}
	const u = (low + high) / 2;
	return { u, v: (u * u) / nu };
}

const STEADY = equilibrium();

export function reactionJacobian() {
	const { u, v } = STEADY;
	return {
		fu: (2 * r * u) / (v * (1 + K * u * u) ** 2) - mu,
		fv: (-r * u * u) / (v * v * (1 + K * u * u)),
		gu: 2 * u,
		gv: -nu
	};
}

export function instability() {
	const { fu, fv, gu, gv } = reactionJacobian();
	const trace = fu + gv;
	const determinant = fu * gv - fv * gu;
	const centre = D * fu + gv;
	const discriminant = Math.sqrt(centre ** 2 - 4 * D * determinant);
	return {
		trace,
		determinant,
		unstableEigenvalueRange: [(centre - discriminant) / (2 * D), (centre + discriminant) / (2 * D)]
	};
}

export function boundaryActivation(time: number, onset: number) {
	return Math.min(1, Math.max(0, (time - onset) / RAMP_DURATION));
}

/** Eliminate the face value with its centre-to-face outward derivative in Eq. 13. */
export function boundaryLoss(activation: number, cellWidth: number) {
	return activation / (cellWidth * (1 - activation + 0.5 * cellWidth * activation));
}

function seedValue(seed: number, x: number, y: number, z: number) {
	let h = seed ^ Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791);
	h = Math.imul(h ^ (h >>> 16), 0x21f0aaad);
	h = Math.imul(h ^ (h >>> 15), 0x735a2d97);
	return ((h ^ (h >>> 15)) >>> 0) / 2147483648 - 1;
}

function smooth(t: number) {
	return t * t * t * (t * (6 * t - 15) + 10);
}

function smoothNoise(seed: number, x: number, y: number, z: number) {
	const i = Math.floor(x);
	const j = Math.floor(y);
	const k = Math.floor(z);
	const wx = smooth(x - i);
	const wy = smooth(y - j);
	const wz = smooth(z - k);
	const bilinear = (plane: number) =>
		(1 - wy) * ((1 - wx) * seedValue(seed, i, j, plane) + wx * seedValue(seed, i + 1, j, plane)) +
		wy * ((1 - wx) * seedValue(seed, i, j + 1, plane) + wx * seedValue(seed, i + 1, j + 1, plane));
	return (1 - wz) * bilinear(k) + wz * bilinear(k + 1);
}

function bump(squaredArgument: number) {
	return squaredArgument < 1 ? Math.exp(1 - 1 / (1 - squaredArgument)) : 0;
}

export interface SolverOptions {
	meshScale?: number;
	dt?: number;
	noDiffusion?: boolean;
	homogeneous?: boolean;
}

export class FingerprintSolver {
	readonly mesh: Mesh;
	readonly dt: number;
	readonly settings: Settings;
	private readonly endStep: number;
	private stepCount = 0;
	private readonly u: Float64Array;
	private readonly v: Float64Array;
	private readonly du: Float64Array;
	private readonly dv: Float64Array;
	private readonly rowWidth: Float64Array;
	private readonly isNail: Uint8Array;
	private readonly ux: Float64Array;
	private readonly vx: Float64Array;
	private readonly uyNorth: Float64Array;
	private readonly uySouth: Float64Array;
	private readonly vyNorth: Float64Array;
	private readonly vySouth: Float64Array;
	private readonly uRowUpper: Float64Array;
	private readonly vRowUpper: Float64Array;
	private readonly vRowInverse: Float64Array;
	private readonly uColUpper: Float64Array;
	private readonly vColUpper: Float64Array;
	private readonly uColInverse: Float64Array;
	private readonly vColInverse: Float64Array;
	private readonly uReactionStep: number;
	private readonly vReactionStep: number;
	private readonly uDiffusionStep: number;
	private readonly creaseTime: number;
	private readonly nailTime: number;
	private readonly bottomWidth: number;
	private readonly homogeneous: boolean;

	constructor(input: Settings, options: SolverOptions = {}) {
		this.settings = normalizeSettings(input);
		this.dt = options.dt ?? BASE_TIME_STEP;
		if (!(this.dt >= 0.0625 && this.dt <= 1) || !Number.isInteger(END_TIME / this.dt)) {
			throw new Error('Invalid numerical time step.');
		}
		this.endStep = END_TIME / this.dt;
		const meshScale = options.meshScale ?? 1;
		if (!(meshScale >= 0.5 && meshScale <= 1.5)) throw new Error('Invalid mesh scale.');
		this.mesh = meshDimensions(RADIUS * this.settings.width, meshScale);
		const { rows, columns, capRows, length } = this.mesh;
		const size = rows * columns;
		this.u = new Float64Array(size);
		this.v = new Float64Array(size).fill(STEADY.v);
		this.du = new Float64Array(size);
		this.dv = new Float64Array(size);
		this.rowWidth = new Float64Array(rows);
		this.isNail = new Uint8Array(rows);
		this.ux = new Float64Array(rows);
		this.vx = new Float64Array(rows);
		this.uyNorth = new Float64Array(rows);
		this.uySouth = new Float64Array(rows);
		this.vyNorth = new Float64Array(rows);
		this.vySouth = new Float64Array(rows);
		this.uColUpper = new Float64Array(rows);
		this.vColUpper = new Float64Array(rows);
		this.uColInverse = new Float64Array(rows);
		this.vColInverse = new Float64Array(rows);
		this.uRowUpper = new Float64Array(columns);
		this.vRowUpper = new Float64Array(size);
		this.vRowInverse = new Float64Array(size);
		this.uReactionStep = this.dt / (1 + this.dt * mu);
		this.vReactionStep = this.dt / (1 + this.dt * nu);
		const spacingSquared = options.noDiffusion ? 0 : this.settings.spacing ** 2;
		this.uDiffusionStep = this.uReactionStep * spacingSquared;
		const vDiffusionStep = this.vReactionStep * spacingSquared * D;
		this.creaseTime = creaseOnset(this.settings);
		this.nailTime = nailOnset(this.settings);
		this.homogeneous = options.homogeneous ?? false;

		const dTheta = Math.PI / columns;
		const cylinderWidth = length / (rows - capRows);
		this.bottomWidth = cylinderWidth;
		const cosTheta = Float64Array.from({ length: columns }, (_, column) =>
			Math.cos((column + 0.5) * dTheta - Math.PI / 2)
		);
		const sinTheta = Float64Array.from({ length: columns }, (_, column) =>
			Math.sin((column + 0.5) * dTheta - Math.PI / 2)
		);

		const geometry = surfaceRows(this.mesh);
		for (let row = 0; row < rows; row++) {
			const {
				onCap,
				z,
				crossRadius,
				cellAreaPerRadian,
				dx,
				northFace,
				southFace,
				northWidth,
				southWidth
			} = geometry[row];
			this.rowWidth[row] = dx;
			this.isNail[row] = Number(onCap || (this.settings.preset !== 'arch' && z >= length / 2));
			this.ux[row] = this.uDiffusionStep / (dx * dx);
			this.vx[row] = vDiffusionStep / (dx * dx);
			this.uyNorth[row] = (this.uDiffusionStep * northFace) / (cellAreaPerRadian * northWidth);
			this.uySouth[row] = (this.uDiffusionStep * southFace) / (cellAreaPerRadian * southWidth);
			this.vyNorth[row] = (vDiffusionStep * northFace) / (cellAreaPerRadian * northWidth);
			this.vySouth[row] = (vDiffusionStep * southFace) / (cellAreaPerRadian * southWidth);
			const uyN = this.uyNorth[row];
			const uyS = this.uySouth[row];
			const vyN = this.vyNorth[row];
			const vyS = this.vySouth[row];
			this.uColInverse[row] = 1 / (1 + uyN + uyS - uyN * (this.uColUpper[row - 1] || 0));
			this.vColInverse[row] = 1 / (1 + vyN + vyS - vyN * (this.vColUpper[row - 1] || 0));
			this.uColUpper[row] = uyS * this.uColInverse[row];
			this.vColUpper[row] = vyS * this.vColInverse[row];

			const lateralV = this.vx[row];
			const offset = row * columns;
			let upperV = 0;
			for (let col = 0; col < columns; col++) {
				const left = col === 0 ? 0 : lateralV;
				const right = col === columns - 1 ? 0 : lateralV;
				const index = offset + col;
				this.vRowInverse[index] = 1 / (1 + left + right - left * upperV);
				upperV = right * this.vRowInverse[index];
				this.vRowUpper[index] = upperV;
				this.u[index] = this.initialActivator(crossRadius, cosTheta[col], sinTheta[col], z);
			}
		}
	}

	private initialActivator(crossRadius: number, cosTheta: number, sinTheta: number, z: number) {
		const { preset, position, seed, noise } = this.settings;
		if (this.homogeneous) return STEADY.u * (1 + noise);
		const radius = this.mesh.radius;
		const x = -crossRadius * cosTheta;
		const y = crossRadius * sinTheta;
		const profileTheta = preset === 'loop' ? Math.PI / 2 - (1.5 * z) / LENGTH + position : position;
		const dx = (x + radius * Math.cos(profileTheta)) / radius;
		const dy = (y - radius * Math.sin(profileTheta)) / radius;
		const dz = preset === 'whorl' ? (z - 0.8 * LENGTH) / radius : 0;
		const patch = preset === 'arch' ? 0 : bump(100 * (dx * dx + dy * dy + dz * dz));
		// Seeded differences stay close to existing initiation regions. The reference
		// initial profile is recovered exactly at amplitude zero.
		const perturbationRegion = preset === 'arch' ? bump((z / NOISE_LENGTH) ** 2) : patch;
		const perturbation =
			perturbationRegion *
			noise *
			smoothNoise(seed, x / NOISE_LENGTH, y / NOISE_LENGTH, z / NOISE_LENGTH);
		return STEADY.u * (1 + 0.1 * patch + perturbation);
	}

	get time() {
		return Math.min(END_TIME, this.stepCount * this.dt);
	}

	frame() {
		return new Float32Array(this.u);
	}

	advance(steps: number) {
		for (let n = 0; n < steps && this.stepCount < this.endStep; n++) {
			this.integrate();
			this.stepCount++;
		}
	}

	private integrate() {
		const { rows, columns } = this.mesh;
		const { u, v, du, dv } = this;
		const time = (this.stepCount + 0.5) * this.dt;
		const nail = this.homogeneous ? 0 : boundaryActivation(time, this.nailTime);
		const crease = this.homogeneous ? 0 : boundaryActivation(time, this.creaseTime);
		const bottom = this.uDiffusionStep * boundaryLoss(crease, this.bottomWidth);

		// Douglas factorization for the IMEX Euler increment:
		// (I - ax Lx)(I - ay Ly) δ = dt (reaction + diffusion) / (1 + dt decay).
		// Both diffusion directions and linear decay are implicit. Solving for the
		// increment keeps fixed points of the unsplit discretization fixed.
		for (let row = 0; row < rows; row++) {
			const ux = this.ux[row];
			const vx = this.vx[row];
			const uyN = this.uyNorth[row];
			const uyS = this.uySouth[row];
			const vyN = this.vyNorth[row];
			const vyS = this.vySouth[row];
			const sideLoss = this.isNail[row]
				? this.uDiffusionStep * boundaryLoss(nail, this.rowWidth[row])
				: 0;
			const bottomLoss = row === rows - 1 ? bottom : 0;
			const offset = row * columns;
			const end = offset + columns - 1;
			const north = row === 0 ? 0 : columns;
			const south = row === rows - 1 ? 0 : columns;
			let upperU = 0;
			let lastU = 0;
			let lastV = 0;
			for (let i = offset; i <= end; i++) {
				const left = i === offset ? i : i - 1;
				const right = i === end ? i : i + 1;
				const leftU = i === offset ? 0 : ux;
				const rightU = i === end ? 0 : ux;
				const loss = left === i || right === i ? sideLoss : 0;
				const ui = u[i];
				const vi = v[i];
				const u2 = ui * ui;
				const rhsU =
					this.uReactionStep * (r * (a + u2 / (vi * (1 + K * u2))) - mu * ui) +
					ux * (u[left] + u[right] - 2 * ui) +
					uyN * (u[i - north] - ui) +
					uyS * (u[i + south] - ui) -
					(bottomLoss + loss) * ui;
				const rhsV =
					this.vReactionStep * (u2 - nu * vi) +
					vx * (v[left] + v[right] - 2 * vi) +
					vyN * (v[i - north] - vi) +
					vyS * (v[i + south] - vi);
				const inverseU = 1 / (1 + leftU + rightU + loss - leftU * upperU);
				upperU = rightU * inverseU;
				this.uRowUpper[i - offset] = upperU;
				lastU = (rhsU + leftU * lastU) * inverseU;
				lastV = (rhsV + (i === offset ? 0 : vx * lastV)) * this.vRowInverse[i];
				du[i] = lastU;
				dv[i] = lastV;
			}
			for (let i = end - 1; i >= offset; i--) {
				lastU = du[i] + this.uRowUpper[i - offset] * lastU;
				lastV = dv[i] + this.vRowUpper[i] * lastV;
				du[i] = lastU;
				dv[i] = lastV;
			}
		}
		for (let row = 0; row < rows; row++) {
			const offset = row * columns;
			const end = offset + columns;
			const uyN = this.uyNorth[row];
			const vyN = this.vyNorth[row];
			const uInverse =
				row === rows - 1 && bottom > 0
					? 1 / (1 / this.uColInverse[row] + bottom)
					: this.uColInverse[row];
			const vInverse = this.vColInverse[row];
			const north = row === 0 ? 0 : columns;
			for (let i = offset; i < end; i++) {
				du[i] = (du[i] + uyN * du[i - north]) * uInverse;
				dv[i] = (dv[i] + vyN * dv[i - north]) * vInverse;
			}
		}
		for (let row = rows - 1; row >= 0; row--) {
			const offset = row * columns;
			const end = offset + columns;
			const uUpper = this.uColUpper[row];
			const vUpper = this.vColUpper[row];
			const south = row === rows - 1 ? 0 : columns;
			for (let i = offset; i < end; i++) {
				du[i] += uUpper * du[i + south];
				dv[i] += vUpper * dv[i + south];
				u[i] += du[i];
				v[i] += dv[i];
				if (!(u[i] > 0 && v[i] > 0 && u[i] < 1e4 && v[i] < 1e6)) {
					throw new Error('The numerical calculation became unstable.');
				}
			}
		}
	}
}
