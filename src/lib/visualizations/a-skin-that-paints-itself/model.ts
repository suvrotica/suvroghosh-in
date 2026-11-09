import {
	createSeededDisturbance,
	evaluateRightHandSide,
	solveUniformEquilibrium
} from '../how-spots-and-stripes-form/engine.ts';
import { SPOT_STRIPE_PRESETS } from '../how-spots-and-stripes-form/presets.ts';
import {
	LENGTH,
	OBSERVATION_TIME,
	REFERENCE_WIDTH,
	SEED_MAX,
	SHAPE_PRESETS,
	TAPER_TIP_WIDTH,
	WIDTH_MAX,
	WIDTH_MIN,
	WIDTH_STEP,
	type SkinSettings
} from './settings.ts';

export * from './settings.ts';

export const MODEL_ID = 'signed-cubic-activator-inhibitor';
export const MODEL_VERSION = '1.0.0';
export const GRID_SPACING = 0.8;
export const TIMESTEP = 0.01;
export const DISTURBANCE_AMPLITUDE = 0.03;

export interface SkinConfig extends Readonly<SkinSettings> {
	readonly model: typeof MODEL_ID;
	readonly version: typeof MODEL_VERSION;
	readonly length: number;
	readonly referenceWidth: number;
	readonly taperTipWidth: number;
	readonly gridSpacing: number;
	readonly timestep: number;
	readonly observationTime: number;
	readonly patternBalance: number;
	readonly diffusionU: number;
	readonly diffusionV: number;
	readonly disturbance: 'bilinear-mulberry32-knots-v1';
	readonly disturbanceSpacing: number;
	readonly disturbanceAmplitude: number;
}

export interface SkinDomain {
	readonly nx: number;
	readonly ny: number;
	readonly gridSpacing: number;
	readonly length: number;
	readonly referenceWidth: number;
	readonly width: number;
	readonly tipWidth: number;
	readonly mask: Uint8Array;
	readonly columnWidths: Float64Array;
}

export interface SkinFields {
	readonly u: Float64Array;
	readonly v: Float64Array;
}

export interface SkinSnapshot extends SkinFields {
	readonly config: SkinConfig;
	readonly domain: SkinDomain;
	readonly modelTime: number;
}

interface Resolution {
	gridSpacing: number;
	timestep: number;
}

export function createSkinConfig(
	settings: Readonly<SkinSettings>,
	resolution: Partial<Resolution> = {}
): SkinConfig {
	const { shape, widthPercent, appearance, seed } = settings;
	if (
		(shape !== 'straight' && shape !== 'tapered') ||
		!Number.isInteger(widthPercent) ||
		widthPercent < WIDTH_MIN ||
		widthPercent > WIDTH_MAX ||
		widthPercent % WIDTH_STEP !== 0 ||
		!Object.hasOwn(SPOT_STRIPE_PRESETS, appearance) ||
		!Number.isSafeInteger(seed) ||
		seed < 1 ||
		seed > SEED_MAX
	) {
		throw new Error('Invalid surface settings.');
	}
	const gridSpacing = resolution.gridSpacing ?? GRID_SPACING;
	const timestep = resolution.timestep ?? TIMESTEP;
	const preset = SPOT_STRIPE_PRESETS[appearance];
	if (
		(gridSpacing !== GRID_SPACING && gridSpacing !== GRID_SPACING / 2) ||
		(timestep !== TIMESTEP && timestep !== TIMESTEP / 2 && timestep !== TIMESTEP / 4) ||
		timestep >= gridSpacing ** 2 / (4 * preset.diffusionV)
	) {
		throw new Error('Unsupported lattice spacing or time step.');
	}
	return Object.freeze({
		shape,
		widthPercent,
		appearance,
		seed,
		model: MODEL_ID,
		version: MODEL_VERSION,
		length: LENGTH,
		referenceWidth: REFERENCE_WIDTH,
		taperTipWidth: TAPER_TIP_WIDTH,
		gridSpacing,
		timestep,
		observationTime: OBSERVATION_TIME,
		patternBalance: preset.patternBalance,
		diffusionU: preset.diffusionU,
		diffusionV: preset.diffusionV,
		disturbance: 'bilinear-mulberry32-knots-v1',
		disturbanceSpacing: GRID_SPACING,
		disturbanceAmplitude: DISTURBANCE_AMPLITUDE
	});
}

export function createReferenceConfig(config: SkinConfig): SkinConfig {
	return Object.freeze({ ...config, ...SHAPE_PRESETS.broad });
}

export function referenceKey(config: SkinConfig): string {
	// Include the whole reference configuration, excluding only target geometry by replacement.
	return JSON.stringify(createReferenceConfig(config));
}

export function createDomain(config: SkinConfig): SkinDomain {
	const { gridSpacing, length, referenceWidth, shape, taperTipWidth } = config;
	const nx = Math.round(length / gridSpacing);
	const ny = Math.round(referenceWidth / gridSpacing);
	const width = (referenceWidth * config.widthPercent) / 100;
	const tipWidth = shape === 'tapered' ? taperTipWidth : width;
	const mask = new Uint8Array(nx * ny);
	const columnWidths = new Float64Array(nx);
	for (let x = 0; x < nx; x++) {
		const localWidth = width + (tipWidth - width) * ((x + 0.5) / nx);
		// A centered union of whole cells. The fitted field uses these same physical widths.
		const halfRows = Math.round(localWidth / (2 * gridSpacing));
		columnWidths[x] = 2 * halfRows * gridSpacing;
		for (let y = ny / 2 - halfRows; y < ny / 2 + halfRows; y++) {
			mask[y * nx + x] = 1;
		}
	}
	return { nx, ny, gridSpacing, length, referenceWidth, width, tipWidth, mask, columnWidths };
}

/** Samples a rectangular cell-centred array, extending the edge cell to the boundary. */
function sampleRectangle(
	field: Float64Array,
	nx: number,
	ny: number,
	column: number,
	row: number
): number {
	const x = Math.max(0, Math.min(nx - 1, column));
	const y = Math.max(0, Math.min(ny - 1, row));
	const x0 = Math.floor(x);
	const x1 = Math.min(x0 + 1, nx - 1);
	const y0 = Math.floor(y);
	const y1 = Math.min(y0 + 1, ny - 1);
	const fx = x - x0;
	const fy = y - y0;
	const top = field[y0 * nx + x0] * (1 - fx) + field[y0 * nx + x1] * fx;
	const bottom = field[y1 * nx + x0] * (1 - fx) + field[y1 * nx + x1] * fx;
	return top * (1 - fy) + bottom * fy;
}

/** Samples the same physical disturbance field at either resolution. */
export function initialSkinFields(config: SkinConfig, domain: SkinDomain): SkinFields {
	const { length, referenceWidth, disturbanceSpacing, disturbanceAmplitude, seed } = config;
	const knotNx = Math.round(length / disturbanceSpacing);
	const knotNy = Math.round(referenceWidth / disturbanceSpacing);
	const knots = createSeededDisturbance(knotNx, knotNy, seed, disturbanceAmplitude);
	const spacingRatio = domain.gridSpacing / disturbanceSpacing;
	const equilibrium = solveUniformEquilibrium(config.patternBalance);
	const u = new Float64Array(domain.mask.length);
	const v = new Float64Array(domain.mask.length);
	for (let y = 0; y < domain.ny; y++) {
		for (let x = 0; x < domain.nx; x++) {
			const index = y * domain.nx + x;
			if (!domain.mask[index]) continue;
			const column = (x + 0.5) * spacingRatio - 0.5;
			const row = (y + 0.5) * spacingRatio - 0.5;
			u[index] = equilibrium + sampleRectangle(knots.du, knotNx, knotNy, column, row);
			v[index] = equilibrium + sampleRectangle(knots.dv, knotNx, knotNy, column, row);
		}
	}
	return { u, v };
}

export class SkinSolver {
	readonly config: SkinConfig;
	readonly domain: SkinDomain;
	readonly totalSteps: number;
	private readonly fields: SkinFields;
	private readonly predictor: SkinFields;
	private readonly first: SkinFields;
	private readonly second: SkinFields;
	private completedSteps = 0;
	private failed = false;

	constructor(config: SkinConfig, initialFields?: SkinFields) {
		this.config = config;
		this.domain = createDomain(config);
		this.totalSteps = Math.round(config.observationTime / config.timestep);
		const size = this.domain.mask.length;
		const empty = (): SkinFields => ({ u: new Float64Array(size), v: new Float64Array(size) });
		if (initialFields && (initialFields.u.length !== size || initialFields.v.length !== size)) {
			throw new Error('Initial fields do not match the lattice.');
		}
		this.fields = initialFields
			? { u: initialFields.u.slice(), v: initialFields.v.slice() }
			: initialSkinFields(config, this.domain);
		this.predictor = empty();
		this.first = empty();
		this.second = empty();
	}

	get stepIndex(): number {
		return this.completedSteps;
	}

	get modelTime(): number {
		return this.completedSteps * this.config.timestep;
	}

	step(count: number): void {
		if (this.failed) throw new Error('The calculation failed. Start a new run.');
		if (!Number.isSafeInteger(count) || count < 0) throw new Error('Invalid step count.');
		const { mask, nx, ny, gridSpacing } = this.domain;
		const { timestep, patternBalance, diffusionU, diffusionV } = this.config;
		const { u, v } = this.fields;
		const end = Math.min(this.totalSteps, this.completedSteps + count);
		for (; this.completedSteps < end; this.completedSteps++) {
			evaluateRightHandSide(
				u,
				v,
				mask,
				nx,
				ny,
				gridSpacing,
				patternBalance,
				diffusionU,
				diffusionV,
				this.first.u,
				this.first.v
			);
			for (let i = 0; i < mask.length; i++) {
				if (!mask[i]) continue;
				this.predictor.u[i] = u[i] + timestep * this.first.u[i];
				this.predictor.v[i] = v[i] + timestep * this.first.v[i];
			}
			evaluateRightHandSide(
				this.predictor.u,
				this.predictor.v,
				mask,
				nx,
				ny,
				gridSpacing,
				patternBalance,
				diffusionU,
				diffusionV,
				this.second.u,
				this.second.v
			);
			for (let i = 0; i < mask.length; i++) {
				if (!mask[i]) continue;
				const nextU = u[i] + 0.5 * timestep * (this.first.u[i] + this.second.u[i]);
				const nextV = v[i] + 0.5 * timestep * (this.first.v[i] + this.second.v[i]);
				if (
					!Number.isFinite(nextU) ||
					!Number.isFinite(nextV) ||
					Math.abs(nextU) > 50 ||
					Math.abs(nextV) > 50
				) {
					this.failed = true;
					throw new Error('The calculated signals went out of numerical bounds.');
				}
				u[i] = nextU;
				v[i] = nextV;
			}
		}
	}

	snapshot(): SkinSnapshot {
		if (this.failed) throw new Error('The calculation failed. Start a new run.');
		return {
			config: this.config,
			domain: {
				...this.domain,
				mask: this.domain.mask.slice(),
				columnWidths: this.domain.columnWidths.slice()
			},
			u: this.fields.u.slice(),
			v: this.fields.v.slice(),
			modelTime: this.modelTime
		};
	}
}

export function solveSkin(config: SkinConfig): SkinSnapshot {
	const solver = new SkinSolver(config);
	solver.step(solver.totalSteps);
	return solver.snapshot();
}

/** Maps a completed broad field into the actual stepped target, without evolving it. */
export function fitReference(reference: SkinSnapshot, target: SkinDomain): SkinFields {
	const source = reference.domain;
	if (
		reference.modelTime !== reference.config.observationTime ||
		reference.config.shape !== 'straight' ||
		reference.config.widthPercent !== WIDTH_MAX ||
		source.nx !== target.nx ||
		source.ny !== target.ny ||
		source.gridSpacing !== target.gridSpacing
	) {
		throw new Error('Fitting needs a completed broad reference on the same lattice.');
	}
	const { nx, ny, mask, columnWidths, referenceWidth } = target;
	const u = new Float64Array(mask.length);
	const v = new Float64Array(mask.length);
	const centre = (ny - 1) / 2;
	for (let y = 0; y < ny; y++) {
		for (let x = 0; x < nx; x++) {
			const index = y * nx + x;
			if (!mask[index]) continue;
			const row = centre + (y - centre) * (referenceWidth / columnWidths[x]);
			u[index] = sampleRectangle(reference.u, nx, ny, x, row);
			v[index] = sampleRectangle(reference.v, nx, ny, x, row);
		}
	}
	return { u, v };
}
