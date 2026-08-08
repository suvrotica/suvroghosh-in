import {
	BZ_SAFE_LIMITS,
	DEFAULT_BZ_SETUP,
	DEFAULT_OREGONATOR_SETUP,
	DEFAULT_SCHNAKENBERG_SETUP
} from './constants';
import {
	OREGONATOR_EQUATIONS_ID,
	OREGONATOR_MODEL_VERSION,
	SCHNAKENBERG_EQUATIONS_ID,
	SCHNAKENBERG_MODEL_VERSION
} from './types';
import type {
	BZBoundary,
	BZGeometry,
	BZInitialCondition,
	BZMaskPreset,
	BZSetup,
	OregonatorSetup,
	SchnakenbergSetup
} from './types';

const BOUNDARIES = new Set<BZBoundary>(['no-flux', 'periodic']);
const GEOMETRIES = new Set<BZGeometry>(['circular-dish', 'square']);
const MASK_PRESETS = new Set<BZMaskPreset>(['none', 'central-obstacle', 'seeded-obstacles']);
const INITIAL_CONDITIONS = new Set<BZInitialCondition>([
	'uniform-equilibrium',
	'uniform-clock',
	'central-pulse',
	'periodic-source',
	'plane-wave',
	'cut-plane-wave',
	'phase-quadrants',
	'spiral-seed',
	'multi-spiral-seed',
	'target-wave',
	'broken-front',
	'paired-fronts',
	'heterogeneity',
	'pacemaker',
	'turing-noise'
]);

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function finite(value: number, name: string): void {
	if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite.`);
}

export function cloneBZSetup(setup: Readonly<BZSetup>): BZSetup {
	if (setup.model === 'oregonator') {
		return { ...setup, parameters: { ...setup.parameters } };
	}
	return { ...setup, parameters: { ...setup.parameters } };
}

export function assertValidBZSetup(setup: Readonly<BZSetup>): void {
	const limits = BZ_SAFE_LIMITS;
	for (const [name, value] of [
		['Diffusion U', setup.diffusionU],
		['Diffusion V', setup.diffusionV],
		['Timestep', setup.timestep],
		['Grid size', setup.gridSize],
		['Domain size', setup.domainSize],
		['Active radius', setup.activeRadius]
	] as const) {
		finite(value, name);
	}
	if (
		setup.diffusionU < 0 ||
		setup.diffusionV < 0 ||
		setup.diffusionU > limits.diffusionMaximum ||
		setup.diffusionV > limits.diffusionMaximum
	) {
		throw new RangeError('Diffusion coefficients must be non-negative and safely bounded.');
	}
	if (setup.timestep < limits.timestepMinimum || setup.timestep > limits.timestepMaximum) {
		throw new RangeError('Timestep lies outside the supported interval.');
	}
	if (
		!Number.isInteger(setup.gridSize) ||
		setup.gridSize < limits.gridMinimum ||
		setup.gridSize > limits.gridMaximum
	) {
		throw new RangeError('Grid size must be a supported integer.');
	}
	if (setup.domainSize < limits.domainMinimum || setup.domainSize > limits.domainMaximum) {
		throw new RangeError('Domain size lies outside the supported interval.');
	}
	if (setup.activeRadius <= 0 || setup.activeRadius > setup.domainSize / 2) {
		throw new RangeError('Active radius must fit inside half the square domain.');
	}
	if (
		setup.geometry === 'circular-dish' &&
		setup.activeRadius < setup.domainSize / (setup.gridSize * Math.SQRT2)
	) {
		throw new RangeError('Active radius is too small to contain a cell at this grid resolution.');
	}
	if (!BOUNDARIES.has(setup.boundary)) throw new RangeError('Boundary is not recognised.');
	if (!GEOMETRIES.has(setup.geometry)) throw new RangeError('Domain geometry is not recognised.');
	if (setup.boundary === 'periodic' && setup.geometry !== 'square') {
		throw new RangeError('Periodic boundaries are supported only on the explicit square domain.');
	}
	if (!MASK_PRESETS.has(setup.maskPreset)) throw new RangeError('Mask preset is not recognised.');
	if (!INITIAL_CONDITIONS.has(setup.initialCondition)) {
		throw new RangeError('Initial condition is not recognised.');
	}
	if (typeof setup.seed !== 'string' || setup.seed.length > limits.seedMaximumLength) {
		throw new RangeError('Seed must be a short string.');
	}
	if (setup.model === 'oregonator') {
		if (
			setup.modelVersion !== OREGONATOR_MODEL_VERSION ||
			setup.equationsId !== OREGONATOR_EQUATIONS_ID
		) {
			throw new RangeError('Oregonator model identity is inconsistent.');
		}
		const { epsilon, q, f } = setup.parameters;
		finite(epsilon, 'Epsilon');
		finite(q, 'q');
		finite(f, 'f');
		if (epsilon < limits.epsilonMinimum || epsilon > limits.epsilonMaximum) {
			throw new RangeError('Epsilon lies outside the supported interval.');
		}
		if (q < limits.qMinimum || q > limits.qMaximum) {
			throw new RangeError('q lies outside the supported interval.');
		}
		if (f < limits.fMinimum || f > limits.fMaximum) {
			throw new RangeError('f lies outside the supported interval.');
		}
	} else {
		if (
			setup.modelVersion !== SCHNAKENBERG_MODEL_VERSION ||
			setup.equationsId !== SCHNAKENBERG_EQUATIONS_ID
		) {
			throw new RangeError('Schnakenberg model identity is inconsistent.');
		}
		const { a, b, gamma } = setup.parameters;
		finite(a, 'a');
		finite(b, 'b');
		finite(gamma, 'Gamma');
		if (a < limits.aMinimum || a > limits.aMaximum) {
			throw new RangeError('a lies outside the supported interval.');
		}
		if (b < limits.bMinimum || b > limits.bMaximum) {
			throw new RangeError('b lies outside the supported interval.');
		}
		if (a + b <= 0) throw new RangeError('a + b must be positive.');
		if (gamma < limits.gammaMinimum || gamma > limits.gammaMaximum) {
			throw new RangeError('Gamma lies outside the supported interval.');
		}
	}
}

function readNumber(
	value: unknown,
	fallback: number,
	minimum: number,
	maximum: number,
	name: string,
	issues: string[],
	integer = false
): number {
	if (value === undefined) return fallback;
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		issues.push(`${name} was not finite; its safe default was restored.`);
		return fallback;
	}
	let result = Math.min(maximum, Math.max(minimum, value));
	if (integer) result = Math.round(result);
	if (result !== value) issues.push(`${name} was adjusted to its supported interval.`);
	return result;
}

function readEnum<T extends string>(
	value: unknown,
	fallback: T,
	allowed: ReadonlySet<T>,
	name: string,
	issues: string[]
): T {
	if (value === undefined) return fallback;
	if (typeof value === 'string' && allowed.has(value as T)) return value as T;
	issues.push(`${name} was not recognised; its safe default was restored.`);
	return fallback;
}

export interface NormalizedBZSetup {
	readonly setup: BZSetup;
	readonly issues: readonly string[];
}

export function normalizeBZSetup(
	input: unknown,
	fallback: Readonly<BZSetup> = DEFAULT_BZ_SETUP
): NormalizedBZSetup {
	const issues: string[] = [];
	if (!isRecord(input)) {
		if (input !== undefined) issues.push('Setup was not an object; safe defaults were restored.');
		return { setup: cloneBZSetup(fallback), issues };
	}
	let base: Readonly<BZSetup>;
	if (input.model === 'oregonator') {
		base = fallback.model === 'oregonator' ? fallback : DEFAULT_OREGONATOR_SETUP;
	} else if (input.model === 'schnakenberg') {
		base = fallback.model === 'schnakenberg' ? fallback : DEFAULT_SCHNAKENBERG_SETUP;
	} else {
		base = fallback;
		if (input.model !== undefined)
			issues.push('Model was not recognised; the safe model was restored.');
	}
	const limits = BZ_SAFE_LIMITS;
	const domainSize = readNumber(
		input.domainSize,
		base.domainSize,
		limits.domainMinimum,
		limits.domainMaximum,
		'Domain size',
		issues
	);
	const gridSize = readNumber(
		input.gridSize,
		base.gridSize,
		limits.gridMinimum,
		limits.gridMaximum,
		'Grid size',
		issues,
		true
	);
	let geometry = readEnum(input.geometry, base.geometry, GEOMETRIES, 'Geometry', issues);
	const boundary = readEnum(input.boundary, base.boundary, BOUNDARIES, 'Boundary', issues);
	if (boundary === 'periodic' && geometry !== 'square') {
		geometry = 'square';
		issues.push('Periodic boundaries require an explicit square domain; square geometry was used.');
	}
	const common = {
		diffusionU: readNumber(
			input.diffusionU,
			base.diffusionU,
			0,
			limits.diffusionMaximum,
			'Diffusion U',
			issues
		),
		diffusionV: readNumber(
			input.diffusionV,
			base.diffusionV,
			0,
			limits.diffusionMaximum,
			'Diffusion V',
			issues
		),
		timestep: readNumber(
			input.timestep,
			base.timestep,
			limits.timestepMinimum,
			limits.timestepMaximum,
			'Timestep',
			issues
		),
		gridSize,
		domainSize,
		activeRadius: readNumber(
			input.activeRadius,
			Math.min(base.activeRadius, domainSize / 2),
			domainSize / (gridSize * Math.SQRT2),
			domainSize / 2,
			'Active radius',
			issues
		),
		boundary,
		geometry,
		maskPreset: readEnum(input.maskPreset, base.maskPreset, MASK_PRESETS, 'Mask preset', issues),
		initialCondition: readEnum(
			input.initialCondition,
			base.initialCondition,
			INITIAL_CONDITIONS,
			'Initial condition',
			issues
		),
		seed:
			typeof input.seed === 'string' && input.seed.length <= limits.seedMaximumLength
				? input.seed
				: base.seed
	};
	if (input.seed !== undefined && common.seed !== input.seed) {
		issues.push('Seed was not a supported string; its safe default was restored.');
	}
	const rawParameters = isRecord(input.parameters) ? input.parameters : {};
	if (input.parameters !== undefined && !isRecord(input.parameters)) {
		issues.push('Model parameters were not an object; safe defaults were restored.');
	}
	if (base.model === 'oregonator') {
		const setup: OregonatorSetup = {
			...common,
			model: 'oregonator',
			modelVersion: OREGONATOR_MODEL_VERSION,
			equationsId: OREGONATOR_EQUATIONS_ID,
			parameters: {
				epsilon: readNumber(
					rawParameters.epsilon,
					base.parameters.epsilon,
					limits.epsilonMinimum,
					limits.epsilonMaximum,
					'Epsilon',
					issues
				),
				q: readNumber(
					rawParameters.q,
					base.parameters.q,
					limits.qMinimum,
					limits.qMaximum,
					'q',
					issues
				),
				f: readNumber(
					rawParameters.f,
					base.parameters.f,
					limits.fMinimum,
					limits.fMaximum,
					'f',
					issues
				)
			}
		};
		return { setup, issues };
	}
	const setup: SchnakenbergSetup = {
		...common,
		model: 'schnakenberg',
		modelVersion: SCHNAKENBERG_MODEL_VERSION,
		equationsId: SCHNAKENBERG_EQUATIONS_ID,
		parameters: {
			a: readNumber(
				rawParameters.a,
				base.parameters.a,
				limits.aMinimum,
				limits.aMaximum,
				'a',
				issues
			),
			b: readNumber(
				rawParameters.b,
				base.parameters.b,
				limits.bMinimum,
				limits.bMaximum,
				'b',
				issues
			),
			gamma: readNumber(
				rawParameters.gamma,
				base.parameters.gamma,
				limits.gammaMinimum,
				limits.gammaMaximum,
				'Gamma',
				issues
			)
		}
	};
	if (setup.parameters.a + setup.parameters.b <= 0) {
		issues.push('a + b must be positive; Schnakenberg defaults were restored.');
		return { setup: cloneBZSetup(DEFAULT_SCHNAKENBERG_SETUP), issues };
	}
	return { setup, issues };
}

export function isValidBZSetup(value: unknown): value is BZSetup {
	try {
		assertValidBZSetup(value as BZSetup);
		return true;
	} catch {
		return false;
	}
}
