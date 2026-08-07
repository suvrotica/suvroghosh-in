import { DEFAULT_REACTION_DIFFUSION_SETUP } from './constants';
import type {
	BoundaryCondition,
	GrayScottSetup,
	InitialConditionRecipe,
	IntegratorKind,
	MaskPreset
} from './types';

const BOUNDARIES = new Set<BoundaryCondition>(['periodic', 'no-flux', 'reservoir']);
const MASKS = new Set<MaskPreset>([
	'open-square',
	'circular-vessel',
	'narrow-channel',
	'annulus',
	'two-chambers',
	'obstacle-field'
]);
const INITIAL_CONDITIONS = new Set<InitialConditionRecipe>([
	'central-soft-disk',
	'central-square',
	'ring',
	'horizontal-front',
	'two-spots',
	'noise-patch',
	'sparse-points',
	'blank-feed',
	'hand-painted'
]);
const INTEGRATORS = new Set<IntegratorKind>(['heun', 'euler']);

export const REACTION_DIFFUSION_SAFE_LIMITS = Object.freeze({
	feedMaximum: 0.2,
	killMaximum: 0.2,
	diffusionMaximum: 10,
	timestepMaximum: 20,
	gridMinimum: 2,
	gridMaximum: 1_024,
	domainWidthMinimum: 1e-6,
	domainWidthMaximum: 1e6,
	seedMaximumLength: 256
});

export function cloneSetup(setup: Readonly<GrayScottSetup>): GrayScottSetup {
	return { ...setup };
}

export function assertValidSetup(setup: Readonly<GrayScottSetup>): void {
	const finite = [
		setup.feed,
		setup.kill,
		setup.diffusionU,
		setup.diffusionV,
		setup.timestep,
		setup.gridSize,
		setup.domainWidth
	];
	if (!finite.every(Number.isFinite))
		throw new RangeError('Gray–Scott setup values must be finite.');
	if (setup.feed < 0 || setup.feed > REACTION_DIFFUSION_SAFE_LIMITS.feedMaximum) {
		throw new RangeError('Feed must be inside the supported interval.');
	}
	if (setup.kill < 0 || setup.kill > REACTION_DIFFUSION_SAFE_LIMITS.killMaximum) {
		throw new RangeError('Kill must be inside the supported interval.');
	}
	if (
		setup.diffusionU < 0 ||
		setup.diffusionV < 0 ||
		setup.diffusionU > REACTION_DIFFUSION_SAFE_LIMITS.diffusionMaximum ||
		setup.diffusionV > REACTION_DIFFUSION_SAFE_LIMITS.diffusionMaximum
	) {
		throw new RangeError('Diffusion coefficients must be non-negative and safely bounded.');
	}
	if (setup.timestep <= 0 || setup.timestep > REACTION_DIFFUSION_SAFE_LIMITS.timestepMaximum) {
		throw new RangeError('Timestep must be positive and safely bounded.');
	}
	if (
		!Number.isInteger(setup.gridSize) ||
		setup.gridSize < REACTION_DIFFUSION_SAFE_LIMITS.gridMinimum ||
		setup.gridSize > REACTION_DIFFUSION_SAFE_LIMITS.gridMaximum
	) {
		throw new RangeError('Grid size must be a supported integer.');
	}
	if (
		setup.domainWidth < REACTION_DIFFUSION_SAFE_LIMITS.domainWidthMinimum ||
		setup.domainWidth > REACTION_DIFFUSION_SAFE_LIMITS.domainWidthMaximum
	) {
		throw new RangeError('Domain width must be positive and safely bounded.');
	}
	if (!BOUNDARIES.has(setup.boundary)) throw new RangeError('Unknown boundary condition.');
	if (!MASKS.has(setup.maskPreset)) throw new RangeError('Unknown mask preset.');
	if (!INITIAL_CONDITIONS.has(setup.initialCondition)) {
		throw new RangeError('Unknown initial-condition recipe.');
	}
	if (!INTEGRATORS.has(setup.integrator)) throw new RangeError('Unknown integrator.');
	if (
		typeof setup.seed !== 'string' ||
		setup.seed.length > REACTION_DIFFUSION_SAFE_LIMITS.seedMaximumLength
	) {
		throw new RangeError('Seed must be a short string.');
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
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
		issues.push(`${name} was not finite; the default was restored.`);
		return fallback;
	}
	let result = Math.min(maximum, Math.max(minimum, value));
	if (integer) result = Math.round(result);
	if (result !== value) issues.push(`${name} was adjusted to its safe range.`);
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
	issues.push(`${name} was not recognised; the default was restored.`);
	return fallback;
}

export interface NormalizedSetup {
	readonly setup: GrayScottSetup;
	readonly issues: readonly string[];
}

export function normalizeSetup(
	input: unknown,
	fallback: Readonly<GrayScottSetup> = DEFAULT_REACTION_DIFFUSION_SETUP
): NormalizedSetup {
	const issues: string[] = [];
	if (!isRecord(input)) {
		if (input !== undefined) issues.push('Setup was not an object; defaults were restored.');
		return { setup: cloneSetup(fallback), issues };
	}
	const limits = REACTION_DIFFUSION_SAFE_LIMITS;
	const seed =
		typeof input.seed === 'string' && input.seed.length <= limits.seedMaximumLength
			? input.seed
			: fallback.seed;
	if (input.seed !== undefined && seed !== input.seed) {
		issues.push('Seed was not a supported string; the default was restored.');
	}
	return {
		setup: {
			feed: readNumber(input.feed, fallback.feed, 0, limits.feedMaximum, 'Feed', issues),
			kill: readNumber(input.kill, fallback.kill, 0, limits.killMaximum, 'Kill', issues),
			diffusionU: readNumber(
				input.diffusionU,
				fallback.diffusionU,
				0,
				limits.diffusionMaximum,
				'Diffusion U',
				issues
			),
			diffusionV: readNumber(
				input.diffusionV,
				fallback.diffusionV,
				0,
				limits.diffusionMaximum,
				'Diffusion V',
				issues
			),
			timestep: readNumber(
				input.timestep,
				fallback.timestep,
				Number.MIN_VALUE,
				limits.timestepMaximum,
				'Timestep',
				issues
			),
			gridSize: readNumber(
				input.gridSize,
				fallback.gridSize,
				limits.gridMinimum,
				limits.gridMaximum,
				'Grid size',
				issues,
				true
			),
			domainWidth: readNumber(
				input.domainWidth,
				fallback.domainWidth,
				limits.domainWidthMinimum,
				limits.domainWidthMaximum,
				'Domain width',
				issues
			),
			boundary: readEnum(input.boundary, fallback.boundary, BOUNDARIES, 'Boundary', issues),
			maskPreset: readEnum(input.maskPreset, fallback.maskPreset, MASKS, 'Mask', issues),
			initialCondition: readEnum(
				input.initialCondition,
				fallback.initialCondition,
				INITIAL_CONDITIONS,
				'Initial condition',
				issues
			),
			seed,
			integrator: readEnum(input.integrator, fallback.integrator, INTEGRATORS, 'Integrator', issues)
		},
		issues
	};
}
