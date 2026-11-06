import {
	DOMAIN_SHAPES,
	FIXED_ACTIVATOR_DIFFUSION,
	normalizeSpotStripeConfig
} from './presets.ts';
import type {
	ComparisonSnapshot,
	DomainModeAnalysis,
	DomainShapeId,
	FieldSummary,
	SimulationSnapshot,
	SpotStripeConfig,
	StabilityAssessment,
	VariationSample
} from './types.ts';

const DIVERGENCE_MAGNITUDE_LIMIT = 50;

/**
 * Solves for the unique real homogeneous equilibrium u = v = s of:
 *   du/dt = u - u^3 - 1.2v + k = 0
 *   dv/dt = 1.5(u - v) = 0
 * which reduces to the depressed cubic:
 *   s^3 + 0.2s = k
 */
export function solveUniformEquilibrium(k: number): number {
	if (!Number.isFinite(k)) return 0;
	const halfK = k / 2;
	const pThird = 0.2 / 3;
	const radicand = Math.sqrt(halfK * halfK + pThird * pThird * pThird);
	let s = Math.cbrt(halfK + radicand) + Math.cbrt(halfK - radicand);
	for (let iter = 0; iter < 8; iter += 1) {
		const f = s * s * s + 0.2 * s - k;
		const df = 3 * s * s + 0.2;
		s -= f / df;
	}
	return Object.is(s, -0) ? 0 : s;
}

/**
 * Deterministic 32-bit PRNG (Mulberry32) used to produce reproducible small disturbances.
 */
export function createSeededRandom(seed: number): () => number {
	let state = (Math.round(seed) >>> 0) || 1;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = Math.imul(state ^ (state >>> 15), 1 | state);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/**
 * Generates deterministic zero-centred disturbance arrays around the uniform equilibrium.
 * Reusing these arrays guarantees identical initial disturbances across parameter and
 * equal-spreading comparisons.
 */
export function createSeededDisturbance(
	nx: number,
	ny: number,
	seed: number,
	amplitude: number
): { du: Float64Array; dv: Float64Array } {
	const count = nx * ny;
	const du = new Float64Array(count);
	const dv = new Float64Array(count);
	const rng = createSeededRandom(seed);
	for (let i = 0; i < count; i += 1) {
		du[i] = (rng() * 2 - 1) * amplitude;
		dv[i] = (rng() * 2 - 1) * amplitude;
	}
	return { du, dv };
}

/**
 * Builds the flat 2D domain mask (1 inside the domain, 0 outside).
 */
export function createDomainMask(
	shape: DomainShapeId,
	nxOverride?: number,
	nyOverride?: number
): Uint8Array {
	const spec = DOMAIN_SHAPES[shape];
	const nx = nxOverride ?? spec.nx;
	const ny = nyOverride ?? spec.ny;
	const mask = new Uint8Array(nx * ny);

	if (shape === 'broad-sheet' || shape === 'narrow-strip') {
		mask.fill(1);
		return mask;
	}

	const cy = (ny - 1) / 2;
	const baseHalfHeight = (ny - 6) / 2; // 21 cells at ny = 48 (42 active cells high = 33.6 units)
	const tipHalfHeight = Math.max(3.5, ny * 0.1); // 4.8 cells at ny = 48 (10 active cells high = 8.0 units)
	for (let y = 0; y < ny; y += 1) {
		for (let x = 0; x < nx; x += 1) {
			const frac = nx > 1 ? x / (nx - 1) : 0;
			const halfHeight = baseHalfHeight * (1 - frac) + tipHalfHeight * frac;
			if (Math.abs(y - cy) <= halfHeight) {
				mask[y * nx + x] = 1;
			}
		}
	}
	return mask;
}

function maxEigenvalueRealPart(
	fu: number,
	fv: number,
	gu: number,
	gv: number,
	du: number,
	dv: number,
	mu: number
): number {
	const a11 = fu - du * mu;
	const a22 = gv - dv * mu;
	const trace = a11 + a22;
	const det = a11 * a22 - fv * gu;
	const disc = trace * trace - 4 * det;
	if (disc >= 0) {
		return 0.5 * (trace + Math.sqrt(disc));
	}
	return 0.5 * trace;
}

/**
 * Evaluates linear stability of the homogeneous equilibrium u = v = s across all
 * discrete Neumann modes on the simulated domain.
 */
export function analyzeDomainModes(
	input: Pick<SpotStripeConfig, 'patternBalance' | 'inhibitorRatio' | 'shape'>
): DomainModeAnalysis {
	const spec = DOMAIN_SHAPES[input.shape];
	const s = solveUniformEquilibrium(input.patternBalance);
	const fu = 1 - 3 * s * s;
	const fv = -1.2;
	const gu = 1.5;
	const gv = -1.5;
	const du = FIXED_ACTIVATOR_DIFFUSION;
	const dv = FIXED_ACTIVATOR_DIFFUSION * input.inhibitorRatio;

	const uniformTrace = fu + gv; // -0.5 - 3s^2 < 0
	const uniformDet = fu * gv - fv * gu; // 0.3 + 4.5s^2 > 0
	const uniformStable = uniformTrace < 0 && uniformDet > 0;

	const h = spec.gridSpacing;
	const factor = 4 / (h * h);
	let growingModeCount = 0;
	let maxGrowthRate = -Infinity;
	let bestMx = 0;
	let bestMy = 0;
	let bestMu = 0;
	let equalSpreadingMaxGrowthRate = -Infinity;

	for (let my = 0; my < spec.ny; my += 1) {
		const sinY = Math.sin((Math.PI * my) / (2 * spec.ny));
		const muY = sinY * sinY;
		for (let mx = 0; mx < spec.nx; mx += 1) {
			if (mx === 0 && my === 0) continue;
			if (input.shape === 'tapered-patch' && my > Math.floor(spec.ny * 0.7)) continue;
			const sinX = Math.sin((Math.PI * mx) / (2 * spec.nx));
			const mu = factor * (sinX * sinX + muY);
			const growth = maxEigenvalueRealPart(fu, fv, gu, gv, du, dv, mu);
			const equalGrowth = maxEigenvalueRealPart(fu, fv, gu, gv, du, du, mu);
			if (equalGrowth > equalSpreadingMaxGrowthRate) {
				equalSpreadingMaxGrowthRate = equalGrowth;
			}
			if (growth > 0) {
				growingModeCount += 1;
			}
			if (growth > maxGrowthRate) {
				maxGrowthRate = growth;
				bestMx = mx;
				bestMy = my;
				bestMu = mu;
			}
		}
	}

	const wavenumber = bestMu > 0 ? Math.sqrt(bestMu) : 0;
	const wavelength = wavenumber > 1e-8 ? (2 * Math.PI) / wavenumber : null;

	return {
		equilibrium: s,
		uniformTrace,
		uniformDet,
		uniformStable,
		growingModeCount,
		maxGrowthRate,
		dominantMode: {
			mx: bestMx,
			my: bestMy,
			wavenumber,
			wavelength
		},
		equalSpreadingMaxGrowthRate
	};
}

/**
 * Computes the explicit five-point diffusion stability bound and reaction bound.
 */
export function assessStability(
	input: Pick<SpotStripeConfig, 'inhibitorRatio' | 'timestep'> & { gridSpacing?: number }
): StabilityAssessment {
	const gridSpacing = input.gridSpacing ?? 0.8;
	const diffusionU = FIXED_ACTIVATOR_DIFFUSION;
	const diffusionV = FIXED_ACTIVATOR_DIFFUSION * input.inhibitorRatio;
	const maxDiffusion = Math.max(diffusionU, diffusionV);
	const eulerDiffusionLimit = (gridSpacing * gridSpacing) / (4 * maxDiffusion);
	// Across bounded patterns (|u| <= 1), |df/du| <= 2, |df/dv| = 1.2, |dg/du| = 1.5, |dg/dv| = 1.5
	const reactionJacobianNorm = 3.2;
	const combinedConservativeLimit =
		1 / (4 * maxDiffusion / (gridSpacing * gridSpacing) + reactionJacobianNorm);
	const safetyFactor = eulerDiffusionLimit / input.timestep;
	const safe = input.timestep <= eulerDiffusionLimit && safetyFactor >= 1.1;

	return {
		gridSpacing,
		diffusionU,
		diffusionV,
		maxDiffusion,
		eulerDiffusionLimit,
		reactionJacobianNorm,
		combinedConservativeLimit,
		timestep: input.timestep,
		safetyFactor,
		safe
	};
}

function countThresholdComponents(
	u: Float64Array,
	mask: Uint8Array,
	nx: number,
	ny: number,
	aboveZero: boolean
): number {
	const visited = new Uint8Array(nx * ny);
	const queue = new Int32Array(nx * ny);
	let components = 0;

	for (let idx = 0; idx < nx * ny; idx += 1) {
		if (!mask[idx] || visited[idx]) continue;
		const matches = aboveZero ? u[idx] > 0 : u[idx] <= 0;
		if (!matches) continue;

		components += 1;
		visited[idx] = 1;
		let head = 0;
		let tail = 0;
		queue[tail++] = idx;

		while (head < tail) {
			const cur = queue[head++];
			const x = cur % nx;
			const y = (cur / nx) | 0;

			if (x > 0) {
				const left = cur - 1;
				if (mask[left] && !visited[left] && (aboveZero ? u[left] > 0 : u[left] <= 0)) {
					visited[left] = 1;
					queue[tail++] = left;
				}
			}
			if (x < nx - 1) {
				const right = cur + 1;
				if (mask[right] && !visited[right] && (aboveZero ? u[right] > 0 : u[right] <= 0)) {
					visited[right] = 1;
					queue[tail++] = right;
				}
			}
			if (y > 0) {
				const up = cur - nx;
				if (mask[up] && !visited[up] && (aboveZero ? u[up] > 0 : u[up] <= 0)) {
					visited[up] = 1;
					queue[tail++] = up;
				}
			}
			if (y < ny - 1) {
				const down = cur + nx;
				if (mask[down] && !visited[down] && (aboveZero ? u[down] > 0 : u[down] <= 0)) {
					visited[down] = 1;
					queue[tail++] = down;
				}
			}
		}
	}

	return components;
}

/**
 * Computes summary statistics and no-flux conservation diagnostics over active domain cells.
 */
export function summarizeField(
	u: Float64Array,
	v: Float64Array,
	mask: Uint8Array,
	nx: number,
	ny: number,
	gridSpacing: number,
	equilibrium: number
): FieldSummary {
	let activeCellCount = 0;
	let sumU = 0;
	let sumV = 0;
	let minU = Infinity;
	let maxU = -Infinity;
	let minV = Infinity;
	let maxV = -Infinity;
	let aboveZero = 0;
	let aboveEq = 0;
	let laplacianSumU = 0;
	let laplacianSumV = 0;
	let finite = true;
	let errorReason: string | null = null;
	const invH2 = 1 / (gridSpacing * gridSpacing);

	for (let y = 0; y < ny; y += 1) {
		for (let x = 0; x < nx; x += 1) {
			const idx = y * nx + x;
			if (!mask[idx]) continue;
			activeCellCount += 1;
			const uc = u[idx];
			const vc = v[idx];
			if (
				!Number.isFinite(uc) ||
				!Number.isFinite(vc) ||
				Math.abs(uc) > DIVERGENCE_MAGNITUDE_LIMIT ||
				Math.abs(vc) > DIVERGENCE_MAGNITUDE_LIMIT
			) {
				finite = false;
				if (!errorReason) {
					errorReason =
						!Number.isFinite(uc) || !Number.isFinite(vc)
							? 'The numerical state became non-finite (NaN or Infinity). Press Restart to reset the experiment.'
							: `The signal magnitude exceeded ${DIVERGENCE_MAGNITUDE_LIMIT}, indicating numerical divergence. Press Restart to reset the experiment.`;
				}
				continue;
			}

			sumU += uc;
			sumV += vc;
			if (uc < minU) minU = uc;
			if (uc > maxU) maxU = uc;
			if (vc < minV) minV = vc;
			if (vc > maxV) maxV = vc;
			if (uc > 0) aboveZero += 1;
			if (uc > equilibrium) aboveEq += 1;

			const iL = x > 0 && mask[idx - 1] ? idx - 1 : idx;
			const iR = x < nx - 1 && mask[idx + 1] ? idx + 1 : idx;
			const iU = y > 0 && mask[idx - nx] ? idx - nx : idx;
			const iD = y < ny - 1 && mask[idx + nx] ? idx + nx : idx;
			laplacianSumU += (u[iL] + u[iR] + u[iU] + u[iD] - 4 * uc) * invH2;
			laplacianSumV += (v[iL] + v[iR] + v[iU] + v[iD] - 4 * vc) * invH2;
		}
	}

	if (!finite || activeCellCount === 0) {
		return {
			meanU: NaN,
			stdU: NaN,
			minU: NaN,
			maxU: NaN,
			skewU: NaN,
			fractionAboveZero: 0,
			fractionAboveEquilibrium: 0,
			meanV: NaN,
			stdV: NaN,
			minV: NaN,
			maxV: NaN,
			activeCellCount,
			laplacianSumU: NaN,
			laplacianSumV: NaN,
			positiveComponents: 0,
			negativeComponents: 0,
			finite: false,
			errorReason:
				errorReason ?? 'No active domain cells were available for calculation.'
		};
	}

	const meanU = sumU / activeCellCount;
	const meanV = sumV / activeCellCount;
	let varSumU = 0;
	let varSumV = 0;
	let thirdMomentU = 0;

	for (let idx = 0; idx < nx * ny; idx += 1) {
		if (!mask[idx]) continue;
		const du = u[idx] - meanU;
		const dv = v[idx] - meanV;
		varSumU += du * du;
		varSumV += dv * dv;
		thirdMomentU += du * du * du;
	}

	const stdU = Math.sqrt(varSumU / activeCellCount);
	const stdV = Math.sqrt(varSumV / activeCellCount);
	const skewU = stdU > 1e-8 ? thirdMomentU / activeCellCount / (stdU * stdU * stdU) : 0;
	const positiveComponents = countThresholdComponents(u, mask, nx, ny, true);
	const negativeComponents = countThresholdComponents(u, mask, nx, ny, false);

	return {
		meanU,
		stdU,
		minU,
		maxU,
		skewU,
		fractionAboveZero: aboveZero / activeCellCount,
		fractionAboveEquilibrium: aboveEq / activeCellCount,
		meanV,
		stdV,
		minV,
		maxV,
		activeCellCount,
		laplacianSumU,
		laplacianSumV,
		positiveComponents,
		negativeComponents,
		finite: true,
		errorReason: null
	};
}

/**
 * Pure five-point no-flux right-hand-side evaluator for:
 *   du/dt = 0.6 * laplacian(u) + u - u^3 - 1.2v + k
 *   dv/dt = Dv  * laplacian(v) + 1.5(u - v)
 */
export function evaluateRightHandSide(
	u: Float64Array,
	v: Float64Array,
	mask: Uint8Array,
	nx: number,
	ny: number,
	gridSpacing: number,
	patternBalance: number,
	diffusionU: number,
	diffusionV: number,
	duOut: Float64Array,
	dvOut: Float64Array
): void {
	const invH2 = 1 / (gridSpacing * gridSpacing);
	for (let y = 0; y < ny; y += 1) {
		const rowOffset = y * nx;
		for (let x = 0; x < nx; x += 1) {
			const idx = rowOffset + x;
			if (!mask[idx]) {
				duOut[idx] = 0;
				dvOut[idx] = 0;
				continue;
			}
			const uc = u[idx];
			const vc = v[idx];
			const iL = x > 0 && mask[idx - 1] ? idx - 1 : idx;
			const iR = x < nx - 1 && mask[idx + 1] ? idx + 1 : idx;
			const iU = y > 0 && mask[idx - nx] ? idx - nx : idx;
			const iD = y < ny - 1 && mask[idx + nx] ? idx + nx : idx;
			const lapU = (u[iL] + u[iR] + u[iU] + u[iD] - 4 * uc) * invH2;
			const lapV = (v[iL] + v[iR] + v[iU] + v[iD] - 4 * vc) * invH2;
			duOut[idx] = diffusionU * lapU + uc - uc * uc * uc - 1.2 * vc + patternBalance;
			dvOut[idx] = diffusionV * lapV + 1.5 * (uc - vc);
		}
	}
}

export interface SolverInitOptions {
	disturbance?: { du: Float64Array; dv: Float64Array };
	initialFields?: { u: Float64Array; v: Float64Array };
}

/**
 * Framework-independent numerical engine for the cubic activator–inhibitor PDE.
 */
export class SpotStripeSolver {
	readonly config: SpotStripeConfig;
	readonly nx: number;
	readonly ny: number;
	readonly gridSpacing: number;
	readonly physicalWidth: number;
	readonly physicalHeight: number;
	readonly equilibrium: number;
	readonly diffusionU: number;
	readonly diffusionV: number;
	readonly mask: Uint8Array;
	readonly u: Float64Array;
	readonly v: Float64Array;

	private readonly du1: Float64Array;
	private readonly dv1: Float64Array;
	private readonly uPred: Float64Array;
	private readonly vPred: Float64Array;
	private readonly du2: Float64Array;
	private readonly dv2: Float64Array;

	stepIndex = 0;
	modelTime = 0;
	diverged = false;
	errorReason: string | null = null;

	constructor(configInput: Partial<SpotStripeConfig>, options: SolverInitOptions = {}) {
		this.config = normalizeSpotStripeConfig(configInput);
		const shapeSpec = DOMAIN_SHAPES[this.config.shape];
		this.nx = shapeSpec.nx;
		this.ny = shapeSpec.ny;
		this.gridSpacing = shapeSpec.gridSpacing;
		this.physicalWidth = shapeSpec.physicalWidth;
		this.physicalHeight = shapeSpec.physicalHeight;
		this.equilibrium = solveUniformEquilibrium(this.config.patternBalance);
		this.diffusionU = FIXED_ACTIVATOR_DIFFUSION;
		this.diffusionV = FIXED_ACTIVATOR_DIFFUSION * this.config.inhibitorRatio;

		const total = this.nx * this.ny;
		this.mask = createDomainMask(this.config.shape, this.nx, this.ny);
		this.u = new Float64Array(total);
		this.v = new Float64Array(total);
		this.du1 = new Float64Array(total);
		this.dv1 = new Float64Array(total);
		this.uPred = new Float64Array(total);
		this.vPred = new Float64Array(total);
		this.du2 = new Float64Array(total);
		this.dv2 = new Float64Array(total);

		if (options.initialFields) {
			this.u.set(options.initialFields.u);
			this.v.set(options.initialFields.v);
		} else {
			const disturbance =
				options.disturbance ??
				createSeededDisturbance(
					this.nx,
					this.ny,
					this.config.seed,
					this.config.disturbanceAmplitude
				);
			for (let idx = 0; idx < total; idx += 1) {
				if (this.mask[idx]) {
					this.u[idx] = this.equilibrium + disturbance.du[idx];
					this.v[idx] = this.equilibrium + disturbance.dv[idx];
				} else {
					this.u[idx] = this.equilibrium;
					this.v[idx] = this.equilibrium;
				}
			}
		}
	}

	/**
	 * Advances the solver by `count` fixed Heun (RK2) steps without clamping signed fields.
	 */
	step(count = 1): boolean {
		if (this.diverged) return false;
		const dt = this.config.timestep;
		const halfDt = 0.5 * dt;
		const total = this.nx * this.ny;

		for (let s = 0; s < count; s += 1) {
			evaluateRightHandSide(
				this.u,
				this.v,
				this.mask,
				this.nx,
				this.ny,
				this.gridSpacing,
				this.config.patternBalance,
				this.diffusionU,
				this.diffusionV,
				this.du1,
				this.dv1
			);

			for (let idx = 0; idx < total; idx += 1) {
				if (!this.mask[idx]) continue;
				this.uPred[idx] = this.u[idx] + dt * this.du1[idx];
				this.vPred[idx] = this.v[idx] + dt * this.dv1[idx];
			}

			evaluateRightHandSide(
				this.uPred,
				this.vPred,
				this.mask,
				this.nx,
				this.ny,
				this.gridSpacing,
				this.config.patternBalance,
				this.diffusionU,
				this.diffusionV,
				this.du2,
				this.dv2
			);

			for (let idx = 0; idx < total; idx += 1) {
				if (!this.mask[idx]) continue;
				const nextU = this.u[idx] + halfDt * (this.du1[idx] + this.du2[idx]);
				const nextV = this.v[idx] + halfDt * (this.dv1[idx] + this.dv2[idx]);
				this.u[idx] = nextU;
				this.v[idx] = nextV;
				if (
					!Number.isFinite(nextU) ||
					!Number.isFinite(nextV) ||
					Math.abs(nextU) > DIVERGENCE_MAGNITUDE_LIMIT ||
					Math.abs(nextV) > DIVERGENCE_MAGNITUDE_LIMIT
				) {
					this.diverged = true;
					this.errorReason =
						!Number.isFinite(nextU) || !Number.isFinite(nextV)
							? 'The numerical state became non-finite (NaN or Infinity). Press Restart to reset the experiment.'
							: `The signal magnitude exceeded ${DIVERGENCE_MAGNITUDE_LIMIT}, indicating numerical divergence. Press Restart to reset the experiment.`;
				}
			}

			this.stepIndex += 1;
			this.modelTime = Number((this.stepIndex * dt).toFixed(6));
			if (this.diverged) return false;
		}
		return true;
	}

	snapshot(): SimulationSnapshot {
		const summary = summarizeField(
			this.u,
			this.v,
			this.mask,
			this.nx,
			this.ny,
			this.gridSpacing,
			this.equilibrium
		);
		if (this.diverged && summary.finite) {
			summary.finite = false;
			summary.errorReason = this.errorReason;
		}
		return {
			config: { ...this.config },
			nx: this.nx,
			ny: this.ny,
			gridSpacing: this.gridSpacing,
			physicalWidth: this.physicalWidth,
			physicalHeight: this.physicalHeight,
			stepIndex: this.stepIndex,
			modelTime: this.modelTime,
			equilibrium: this.equilibrium,
			u: new Float64Array(this.u),
			v: new Float64Array(this.v),
			mask: new Uint8Array(this.mask),
			summary,
			modeAnalysis: analyzeDomainModes(this.config),
			stability: assessStability(this.config)
		};
	}
}

export function describeComparisonVerdict(
	different: SimulationSnapshot,
	equal: SimulationSnapshot
): string {
	if (!different.summary.finite || !equal.summary.finite) {
		return (
			different.summary.errorReason ??
			equal.summary.errorReason ??
			'Calculation stopped because of a numerical error.'
		);
	}
	const diffRatio = different.config.inhibitorRatio;
	const stdDiff = different.summary.stdU;
	const stdEqual = equal.summary.stdU;
	const t = different.modelTime.toFixed(1);

	if (diffRatio <= 1.001) {
		return `At t = ${t}, both fields use equal spreading rates (1×, Dv = Du = 0.6). Spatial variation fades in both (σu = ${stdDiff.toFixed(4)}).`;
	}

	if (different.modeAnalysis.growingModeCount === 0) {
		return `At t = ${t}, even with ${diffRatio}× inhibitor spreading, no spatial mode on this domain has a positive growth rate (λmax = ${different.modeAnalysis.maxGrowthRate.toFixed(3)}). Both fields smooth toward equilibrium (σu = ${stdDiff.toFixed(4)} vs ${stdEqual.toFixed(4)}).`;
	}

	if (stdDiff > stdEqual * 3 && stdDiff > 0.05) {
		return `At t = ${t}, faster inhibitor spreading (${diffRatio}×) amplified the disturbance to σu = ${stdDiff.toFixed(3)}, while equal spreading (1×) smoothed the same initial disturbance down to σu = ${stdEqual.toFixed(4)}.`;
	}

	return `At t = ${t}, spatial variation is growing under ${diffRatio}× inhibitor spreading (σu = ${stdDiff.toFixed(4)}) while decaying under equal 1× spreading (σu = ${stdEqual.toFixed(4)}).`;
}

/**
 * Runs two synchronised fields from identical initial arrays:
 *   1. Different spreading rates (selected inhibitorRatio)
 *   2. Equal spreading rates (1×, Dv = Du = 0.6)
 */
export class SynchronisedComparisonEngine {
	readonly differentSolver: SpotStripeSolver;
	readonly equalSolver: SpotStripeSolver;
	readonly history: VariationSample[] = [];
	private lastSampleTime = -Infinity;

	constructor(configInput: Partial<SpotStripeConfig>) {
		const config = normalizeSpotStripeConfig(configInput);
		const shapeSpec = DOMAIN_SHAPES[config.shape];
		const sharedDisturbance = createSeededDisturbance(
			shapeSpec.nx,
			shapeSpec.ny,
			config.seed,
			config.disturbanceAmplitude
		);

		this.differentSolver = new SpotStripeSolver(config, { disturbance: sharedDisturbance });
		this.equalSolver = new SpotStripeSolver(
			{ ...config, inhibitorRatio: 1 },
			{ disturbance: sharedDisturbance }
		);
		this.recordSample();
	}

	step(count = 1, sampleInterval = 0.5): boolean {
		const dt = this.differentSolver.config.timestep;
		const chunk = Math.max(1, Math.round(sampleInterval / dt));
		let remaining = count;

		while (remaining > 0) {
			const n = Math.min(remaining, chunk);
			const okDiff = this.differentSolver.step(n);
			const okEq = this.equalSolver.step(n);
			remaining -= n;
			if (this.differentSolver.modelTime - this.lastSampleTime >= sampleInterval - 1e-9 || remaining === 0) {
				this.recordSample();
			}
			if (!okDiff || !okEq) return false;
		}
		return true;
	}

	private recordSample(): void {
		const diffSnap = this.differentSolver.snapshot();
		const eqSnap = this.equalSolver.snapshot();
		this.lastSampleTime = diffSnap.modelTime;
		this.history.push({
			modelTime: diffSnap.modelTime,
			differentStdU: diffSnap.summary.stdU,
			equalStdU: eqSnap.summary.stdU
		});
	}

	snapshot(): ComparisonSnapshot {
		const different = this.differentSolver.snapshot();
		const equal = this.equalSolver.snapshot();
		return {
			different,
			equal,
			history: [...this.history],
			verdict: describeComparisonVerdict(different, equal)
		};
	}
}
