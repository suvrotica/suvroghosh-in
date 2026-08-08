import {
	BZ_MAX_URL_INTERVENTIONS,
	BZ_MAX_URL_LENGTH,
	BZ_QUERY_PREFIX,
	DEFAULT_BZ_SETUP,
	DEFAULT_OREGONATOR_SETUP,
	DEFAULT_SCHNAKENBERG_SETUP
} from './constants';
import {
	orderedBZInterventions,
	parseBZInterventions,
	serializeBZInterventions
} from './interventions';
import { assertValidBZSetup, cloneBZSetup, normalizeBZSetup } from './validation';
import { BZ_SCHEMA_VERSION } from './types';
import type {
	ActiveTerms,
	BZDisplayState,
	BZPalette,
	BZSetup,
	BZUrlDecodeResult,
	BZUrlState,
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

const OWNED_KEYS = [
	'v',
	'model',
	'modelVersion',
	'equations',
	'epsilon',
	'q',
	'f',
	'a',
	'b',
	'gamma',
	'du',
	'dv',
	'dt',
	'n',
	'L',
	'radius',
	'boundary',
	'geometry',
	'mask',
	'initial',
	'seed',
	'preset',
	'step',
	'palette',
	'view',
	'terms',
	'events',
	'log'
] as const;

function key(name: (typeof OWNED_KEYS)[number]): string {
	return `${BZ_QUERY_PREFIX}${name}`;
}

function sourceParams(source?: string | URL | URLSearchParams): URLSearchParams {
	if (source === undefined) return new URLSearchParams();
	if (source instanceof URLSearchParams) return new URLSearchParams(source);
	if (source instanceof URL) return new URLSearchParams(source.search);
	const question = source.indexOf('?');
	let query = question >= 0 ? source.slice(question + 1) : source.replace(/^\?/u, '');
	const hash = query.indexOf('#');
	if (hash >= 0) query = query.slice(0, hash);
	return new URLSearchParams(query);
}

function numberText(value: number): string {
	return Object.is(value, -0) ? '0' : value.toString();
}

function numericText(value: string | null): number | string | undefined {
	if (value === null) return undefined;
	if (value.length > 64 || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/iu.test(value)) {
		return value;
	}
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : value;
}

function defaultState(fallback: Readonly<BZSetup> = DEFAULT_BZ_SETUP): BZUrlState {
	return {
		setup: cloneBZSetup(fallback),
		presetId: fallback.model === 'oregonator' ? 'zhabotinsky-dish' : 'diffusion-driven-spots',
		step: 0,
		interventions: [],
		activeTerms: { reaction: true, diffusion: true },
		display: { palette: fallback.model === 'oregonator' ? 'ferroin' : 'scientific', view: 'dish' }
	};
}

function validateState(state: Readonly<BZUrlState>): void {
	assertValidBZSetup(state.setup);
	if (!Number.isSafeInteger(state.step) || state.step < 0) {
		throw new RangeError('URL state step must be a non-negative safe integer.');
	}
	if (typeof state.presetId !== 'string' || state.presetId.length > 128) {
		throw new RangeError('URL preset identifier is invalid.');
	}
	if (!PALETTES.has(state.display.palette) || !VIEWS.has(state.display.view)) {
		throw new RangeError('URL display state is invalid.');
	}
	if (
		typeof state.activeTerms.reaction !== 'boolean' ||
		typeof state.activeTerms.diffusion !== 'boolean' ||
		(!state.activeTerms.reaction && !state.activeTerms.diffusion)
	) {
		throw new RangeError('URL active terms are invalid.');
	}
}

export function clearBZUrlState(source?: string | URL | URLSearchParams): URLSearchParams {
	const params = sourceParams(source);
	for (const owned of OWNED_KEYS) params.delete(key(owned));
	return params;
}

export interface BZUrlEncodeResult {
	readonly params: URLSearchParams;
	readonly interventionsOmitted: boolean;
	readonly issues: readonly string[];
}

export function encodeBZUrlStateDetailed(
	state: Readonly<BZUrlState>,
	source?: string | URL | URLSearchParams
): BZUrlEncodeResult {
	validateState(state);
	const setup = normalizeBZSetup(state.setup, state.setup).setup;
	const params = clearBZUrlState(source);
	params.set(key('v'), String(BZ_SCHEMA_VERSION));
	params.set(key('model'), setup.model);
	params.set(key('modelVersion'), setup.modelVersion);
	params.set(key('equations'), setup.equationsId);
	if (setup.model === 'oregonator') {
		params.set(key('epsilon'), numberText(setup.parameters.epsilon));
		params.set(key('q'), numberText(setup.parameters.q));
		params.set(key('f'), numberText(setup.parameters.f));
	} else {
		params.set(key('a'), numberText(setup.parameters.a));
		params.set(key('b'), numberText(setup.parameters.b));
		params.set(key('gamma'), numberText(setup.parameters.gamma));
	}
	params.set(key('du'), numberText(setup.diffusionU));
	params.set(key('dv'), numberText(setup.diffusionV));
	params.set(key('dt'), numberText(setup.timestep));
	params.set(key('n'), String(setup.gridSize));
	params.set(key('L'), numberText(setup.domainSize));
	params.set(key('radius'), numberText(setup.activeRadius));
	params.set(key('boundary'), setup.boundary);
	params.set(key('geometry'), setup.geometry);
	params.set(key('mask'), setup.maskPreset);
	params.set(key('initial'), setup.initialCondition);
	params.set(key('seed'), setup.seed);
	params.set(key('preset'), state.presetId);
	params.set(key('step'), String(state.step));
	params.set(key('palette'), state.display.palette);
	params.set(key('view'), state.display.view);
	params.set(
		key('terms'),
		state.activeTerms.reaction && state.activeTerms.diffusion
			? 'both'
			: state.activeTerms.reaction
				? 'reaction'
				: 'diffusion'
	);
	const issues: string[] = [];
	let interventionsOmitted = state.interventions.length > BZ_MAX_URL_INTERVENTIONS;
	if (!interventionsOmitted) {
		params.set(key('events'), serializeBZInterventions(state.interventions));
	} else {
		params.set(key('log'), 'omitted');
		issues.push(
			`The intervention log exceeded ${BZ_MAX_URL_INTERVENTIONS} URL events and was omitted; use experiment JSON for exact replay.`
		);
	}
	if (params.toString().length > BZ_MAX_URL_LENGTH && params.has(key('events'))) {
		params.delete(key('events'));
		params.set(key('log'), 'omitted');
		interventionsOmitted = true;
		issues.push('The intervention log was omitted to keep the share URL within its safety limit.');
	}
	if (params.toString().length > BZ_MAX_URL_LENGTH) {
		throw new RangeError(
			`BZ URL state exceeds ${BZ_MAX_URL_LENGTH} characters without its event log.`
		);
	}
	return { params, interventionsOmitted, issues };
}

export function encodeBZUrlState(
	state: Readonly<BZUrlState>,
	source?: string | URL | URLSearchParams
): URLSearchParams {
	return encodeBZUrlStateDetailed(state, source).params;
}

function readDisplay(params: URLSearchParams, issues: string[]): BZDisplayState {
	const paletteValue = params.get(key('palette'));
	const viewValue = params.get(key('view'));
	const palette = PALETTES.has(paletteValue as BZPalette) ? (paletteValue as BZPalette) : 'ferroin';
	const view = VIEWS.has(viewValue as BZViewMode) ? (viewValue as BZViewMode) : 'dish';
	if (paletteValue !== null && palette !== paletteValue) {
		issues.push('Shared palette was not recognised; ferroin was restored.');
	}
	if (viewValue !== null && view !== viewValue) {
		issues.push('Shared field view was not recognised; dish view was restored.');
	}
	return { palette, view };
}

function readActiveTerms(params: URLSearchParams, issues: string[]): ActiveTerms {
	const value = params.get(key('terms'));
	if (value === null || value === 'both') return { reaction: true, diffusion: true };
	if (value === 'reaction') return { reaction: true, diffusion: false };
	if (value === 'diffusion') return { reaction: false, diffusion: true };
	issues.push(
		'Shared active-term selection was not recognised; reaction and diffusion were restored.'
	);
	return { reaction: true, diffusion: true };
}

export function decodeBZUrlState(
	source: string | URL | URLSearchParams,
	fallback: Readonly<BZSetup> = DEFAULT_BZ_SETUP
): BZUrlDecodeResult {
	const raw = sourceParams(source).toString();
	if (raw.length > BZ_MAX_URL_LENGTH) {
		return {
			state: defaultState(fallback),
			issues: [`Shared BZ setup exceeds the ${BZ_MAX_URL_LENGTH}-character safety limit.`],
			unsupportedVersion: false,
			interventionsOmitted: true
		};
	}
	const params = sourceParams(source);
	const rawVersion = params.get(key('v'));
	if (rawVersion !== null && Number(rawVersion) !== BZ_SCHEMA_VERSION) {
		return {
			state: defaultState(fallback),
			issues: [
				`Shared BZ schema ${rawVersion} is unsupported; version ${BZ_SCHEMA_VERSION} defaults were restored.`
			],
			unsupportedVersion: true,
			interventionsOmitted: true
		};
	}
	const requestedModel = params.get(key('model'));
	const modelFallback =
		requestedModel === 'schnakenberg'
			? DEFAULT_SCHNAKENBERG_SETUP
			: requestedModel === 'oregonator'
				? DEFAULT_OREGONATOR_SETUP
				: fallback;
	const normalized = normalizeBZSetup(
		{
			model: requestedModel ?? undefined,
			parameters:
				requestedModel === 'schnakenberg'
					? {
							a: numericText(params.get(key('a'))),
							b: numericText(params.get(key('b'))),
							gamma: numericText(params.get(key('gamma')))
						}
					: {
							epsilon: numericText(params.get(key('epsilon'))),
							q: numericText(params.get(key('q'))),
							f: numericText(params.get(key('f')))
						},
			diffusionU: numericText(params.get(key('du'))),
			diffusionV: numericText(params.get(key('dv'))),
			timestep: numericText(params.get(key('dt'))),
			gridSize: numericText(params.get(key('n'))),
			domainSize: numericText(params.get(key('L'))),
			activeRadius: numericText(params.get(key('radius'))),
			boundary: params.get(key('boundary')) ?? undefined,
			geometry: params.get(key('geometry')) ?? undefined,
			maskPreset: params.get(key('mask')) ?? undefined,
			initialCondition: params.get(key('initial')) ?? undefined,
			seed: params.get(key('seed')) ?? undefined
		},
		modelFallback
	);
	const issues = [...normalized.issues];
	const presetValue = params.get(key('preset'));
	const presetId =
		typeof presetValue === 'string' && presetValue.length <= 128
			? presetValue
			: normalized.setup.model === 'oregonator'
				? 'zhabotinsky-dish'
				: 'diffusion-driven-spots';
	if (presetValue !== null && presetValue !== presetId) {
		issues.push('Shared preset identifier was invalid; the model default was restored.');
	}
	const rawStep = numericText(params.get(key('step')));
	const step =
		typeof rawStep === 'number' && Number.isSafeInteger(rawStep) && rawStep >= 0 ? rawStep : 0;
	if (rawStep !== undefined && step !== rawStep)
		issues.push('Shared model step was invalid; step zero was restored.');
	let interventions = [] as ReturnType<typeof orderedBZInterventions>;
	let interventionsOmitted = params.get(key('log')) === 'omitted';
	const eventText = params.get(key('events'));
	if (eventText !== null && !interventionsOmitted) {
		try {
			interventions = parseBZInterventions(eventText);
			if (interventions.length > BZ_MAX_URL_INTERVENTIONS) {
				interventions = [];
				interventionsOmitted = true;
				issues.push('Shared intervention log exceeded the URL event limit and was ignored.');
			}
		} catch {
			issues.push('Shared intervention log was invalid and was ignored.');
			interventions = [];
			interventionsOmitted = true;
		}
	}
	if (interventionsOmitted) {
		issues.push(
			'This share URL omitted its intervention log; experiment JSON is needed for exact replay.'
		);
	}
	return {
		state: {
			setup: normalized.setup,
			presetId,
			step,
			interventions,
			activeTerms: readActiveTerms(params, issues),
			display: readDisplay(params, issues)
		},
		issues,
		unsupportedVersion: false,
		interventionsOmitted
	};
}

export function buildBZShareUrl(baseUrl: string | URL, state: Readonly<BZUrlState>): string {
	const url = new URL(baseUrl.toString());
	url.search = encodeBZUrlState(state, url.searchParams).toString();
	return url.toString();
}
