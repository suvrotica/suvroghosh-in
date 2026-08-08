import {
	BZ_MAX_JSON_LENGTH,
	BZ_REPRODUCIBILITY_CAVEAT,
	DEFAULT_OREGONATOR_SETUP,
	DEFAULT_SCHNAKENBERG_SETUP,
	gridDimensions
} from './constants';
import { orderedBZInterventions, parseBZInterventions } from './interventions';
import { assertValidBZSetup, normalizeBZSetup } from './validation';
import { BZ_ENGINE_VERSION, BZ_SCHEMA_VERSION } from './types';
import type {
	ActiveTerms,
	BZDisplayState,
	BZExperimentRecord,
	BZIntervention,
	BZPalette,
	BZSetup,
	BZViewMode
} from './types';

const PALETTES = new Set<BZPalette>([
	'ferroin',
	'cerium',
	'phase-spectrum',
	'scientific',
	'high-contrast'
]);
const VIEWS = new Set<BZViewMode>([
	'dish',
	'u',
	'v',
	'reaction-u',
	'diffusion-u',
	'net-u',
	'mask',
	'difference-from-mean'
]);

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertDisplay(value: unknown): asserts value is BZDisplayState {
	if (
		!isRecord(value) ||
		!PALETTES.has(value.palette as BZPalette) ||
		!VIEWS.has(value.view as BZViewMode)
	) {
		throw new TypeError('Experiment display state is invalid.');
	}
}

export interface CreateBZExperimentRecordOptions {
	readonly title: string;
	readonly setup: Readonly<BZSetup>;
	readonly step: number;
	readonly interventions?: readonly Readonly<BZIntervention>[];
	readonly activeTerms?: Readonly<ActiveTerms>;
	readonly display?: Readonly<BZDisplayState>;
	readonly numericalWarnings?: readonly string[];
	readonly exportedAt?: string;
}

export function createBZExperimentRecord(
	options: Readonly<CreateBZExperimentRecordOptions>
): BZExperimentRecord {
	if (typeof options.title !== 'string' || options.title.length < 1 || options.title.length > 256) {
		throw new RangeError('Experiment title must contain 1–256 characters.');
	}
	assertValidBZSetup(options.setup);
	const fallback =
		options.setup.model === 'oregonator' ? DEFAULT_OREGONATOR_SETUP : DEFAULT_SCHNAKENBERG_SETUP;
	const normalized = normalizeBZSetup(options.setup, fallback);
	if (normalized.issues.length > 0) throw new RangeError('Experiment setup is invalid.');
	if (!Number.isSafeInteger(options.step) || options.step < 0) {
		throw new RangeError('Experiment step must be a non-negative safe integer.');
	}
	const exportedAt = options.exportedAt ?? new Date().toISOString();
	if (typeof exportedAt !== 'string' || !Number.isFinite(Date.parse(exportedAt))) {
		throw new RangeError('Experiment export timestamp is invalid.');
	}
	const display: BZDisplayState = options.display
		? { ...options.display }
		: { palette: normalized.setup.model === 'oregonator' ? 'ferroin' : 'scientific', view: 'dish' };
	assertDisplay(display);
	const activeTerms: ActiveTerms = options.activeTerms
		? { reaction: options.activeTerms.reaction, diffusion: options.activeTerms.diffusion }
		: { reaction: true, diffusion: true };
	if (
		typeof activeTerms.reaction !== 'boolean' ||
		typeof activeTerms.diffusion !== 'boolean' ||
		(!activeTerms.reaction && !activeTerms.diffusion)
	) {
		throw new RangeError('Experiment active terms are invalid.');
	}
	const warnings = [...(options.numericalWarnings ?? [])];
	if (
		warnings.length > 256 ||
		warnings.some((warning) => typeof warning !== 'string' || warning.length > 1_000)
	) {
		throw new RangeError('Experiment numerical warnings are invalid.');
	}
	const setup = normalized.setup;
	return {
		schemaVersion: BZ_SCHEMA_VERSION,
		engineVersion: BZ_ENGINE_VERSION,
		title: options.title,
		exportedAt,
		model: setup.model,
		modelVersion: setup.modelVersion,
		equationsId: setup.equationsId,
		setup,
		grid: gridDimensions(setup),
		domain: {
			size: setup.domainSize,
			activeRadius: setup.activeRadius,
			geometry: setup.geometry
		},
		timestep: setup.timestep,
		boundary: setup.boundary,
		seed: setup.seed,
		initialCondition: setup.initialCondition,
		step: options.step,
		modelTime: options.step * setup.timestep,
		interventions: orderedBZInterventions(options.interventions ?? []),
		activeTerms,
		display,
		numericalWarnings: warnings,
		reproducibilityCaveat: BZ_REPRODUCIBILITY_CAVEAT
	};
}

export function serializeBZExperiment(record: Readonly<BZExperimentRecord>): string {
	const canonical = createBZExperimentRecord({
		title: record.title,
		setup: record.setup,
		step: record.step,
		interventions: record.interventions,
		activeTerms: record.activeTerms,
		display: record.display,
		numericalWarnings: record.numericalWarnings,
		exportedAt: record.exportedAt
	});
	return JSON.stringify(canonical, null, 2);
}

function sameNumber(left: unknown, right: number): boolean {
	return typeof left === 'number' && Number.isFinite(left) && Object.is(left, right);
}

export function parseBZExperiment(text: string): BZExperimentRecord {
	if (text.length > BZ_MAX_JSON_LENGTH) throw new RangeError('Experiment JSON is too large.');
	const parsed: unknown = JSON.parse(text);
	if (!isRecord(parsed)) throw new TypeError('Experiment JSON must contain an object.');
	if (parsed.schemaVersion !== BZ_SCHEMA_VERSION) {
		throw new RangeError('Experiment schema version is unsupported.');
	}
	if (parsed.engineVersion !== BZ_ENGINE_VERSION) {
		throw new RangeError('Experiment engine version is unsupported for exact replay.');
	}
	if (!isRecord(parsed.setup)) throw new TypeError('Experiment setup is missing.');
	const fallback =
		parsed.setup.model === 'schnakenberg'
			? DEFAULT_SCHNAKENBERG_SETUP
			: parsed.setup.model === 'oregonator'
				? DEFAULT_OREGONATOR_SETUP
				: null;
	if (fallback === null) throw new RangeError('Experiment model is unsupported.');
	const normalized = normalizeBZSetup(parsed.setup, fallback);
	if (normalized.issues.length > 0) {
		throw new RangeError(`Experiment setup is invalid: ${normalized.issues.join(' ')}`);
	}
	const setup = normalized.setup;
	if (
		parsed.model !== setup.model ||
		parsed.modelVersion !== setup.modelVersion ||
		parsed.equationsId !== setup.equationsId
	) {
		throw new RangeError('Experiment model identity does not match its setup.');
	}
	if (!Number.isSafeInteger(parsed.step) || (parsed.step as number) < 0) {
		throw new RangeError('Experiment step is invalid.');
	}
	const step = parsed.step as number;
	if (!sameNumber(parsed.modelTime, step * setup.timestep)) {
		throw new RangeError('Experiment model time is inconsistent with step × timestep.');
	}
	if (
		!sameNumber(parsed.timestep, setup.timestep) ||
		parsed.boundary !== setup.boundary ||
		parsed.seed !== setup.seed ||
		parsed.initialCondition !== setup.initialCondition
	) {
		throw new RangeError('Experiment summary fields do not match its setup.');
	}
	if (
		!isRecord(parsed.grid) ||
		parsed.grid.width !== setup.gridSize ||
		parsed.grid.height !== setup.gridSize ||
		!isRecord(parsed.domain) ||
		!sameNumber(parsed.domain.size, setup.domainSize) ||
		!sameNumber(parsed.domain.activeRadius, setup.activeRadius) ||
		parsed.domain.geometry !== setup.geometry
	) {
		throw new RangeError('Experiment grid or domain summary is inconsistent.');
	}
	if (typeof parsed.title !== 'string' || parsed.title.length < 1 || parsed.title.length > 256) {
		throw new RangeError('Experiment title is invalid.');
	}
	if (typeof parsed.exportedAt !== 'string' || !Number.isFinite(Date.parse(parsed.exportedAt))) {
		throw new RangeError('Experiment export timestamp is invalid.');
	}
	assertDisplay(parsed.display);
	let activeTerms: ActiveTerms = { reaction: true, diffusion: true };
	if (parsed.activeTerms !== undefined) {
		if (!isRecord(parsed.activeTerms)) {
			throw new RangeError('Experiment active terms are invalid.');
		}
		const reaction = parsed.activeTerms.reaction;
		const diffusion = parsed.activeTerms.diffusion;
		if (
			typeof reaction !== 'boolean' ||
			typeof diffusion !== 'boolean' ||
			(!reaction && !diffusion)
		) {
			throw new RangeError('Experiment active terms are invalid.');
		}
		activeTerms = { reaction, diffusion };
	}
	if (
		!Array.isArray(parsed.numericalWarnings) ||
		parsed.numericalWarnings.length > 256 ||
		parsed.numericalWarnings.some(
			(warning) => typeof warning !== 'string' || warning.length > 1_000
		)
	) {
		throw new RangeError('Experiment numerical warnings are invalid.');
	}
	if (parsed.reproducibilityCaveat !== BZ_REPRODUCIBILITY_CAVEAT) {
		throw new RangeError('Experiment reproducibility caveat is missing or altered.');
	}
	const interventions = parseBZInterventions(JSON.stringify(parsed.interventions));
	return createBZExperimentRecord({
		title: parsed.title,
		setup,
		step,
		interventions,
		activeTerms,
		display: parsed.display,
		numericalWarnings: parsed.numericalWarnings as string[],
		exportedAt: parsed.exportedAt
	});
}

export const encodeBZExperimentJSON = serializeBZExperiment;
export const decodeBZExperimentJSON = parseBZExperiment;
