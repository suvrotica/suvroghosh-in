import { DEFAULT_MODEL_PARAMETERS, HIGH_CONTACT_SILENT_SEED, MODEL_VERSION } from './model';

export const NUCLEUS_URL_VERSION = 1 as const;
export const NUCLEUS_URL_MODEL_VERSION = MODEL_VERSION;
export const MAX_NUCLEUS_QUERY_LENGTH = 4_096;

export const NUCLEUS_SCENARIOS = [
	'baseline',
	'blocked',
	'lengthened',
	'mutated',
	'contact'
] as const;
export const NUCLEUS_VIEWS = ['cell', 'nucleus', 'territory', 'locus'] as const;
export const NUCLEUS_RENDERERS = ['2d', '3d'] as const;

export type NucleusScenario = (typeof NUCLEUS_SCENARIOS)[number];
export type NucleusView = (typeof NUCLEUS_VIEWS)[number];
export type NucleusRendererChoice = (typeof NUCLEUS_RENDERERS)[number];

export type NucleusUrlState = Readonly<{
	scenario: NucleusScenario;
	seed: number;
	signal: number;
	duration: number;
	block: number;
	affinity: number;
	contact: number;
	view: NucleusView;
	time: number;
	renderer?: NucleusRendererChoice;
	hypothesis?: 'signal-contact';
}>;

export type NucleusUrlIssue = Readonly<{
	key: string;
	value: string | null;
	message: string;
}>;

export type NucleusUrlParseResult = Readonly<{
	state: NucleusUrlState;
	issues: readonly NucleusUrlIssue[];
	unsupportedVersion: boolean;
}>;

export const DEFAULT_NUCLEUS_URL_STATE: NucleusUrlState = Object.freeze({
	scenario: 'baseline',
	seed: HIGH_CONTACT_SILENT_SEED,
	signal: DEFAULT_MODEL_PARAMETERS.egfAmplitude,
	duration: DEFAULT_MODEL_PARAMETERS.egfDuration,
	block: DEFAULT_MODEL_PARAMETERS.receptorBlockade,
	affinity: DEFAULT_MODEL_PARAMETERS.bindingAffinity,
	contact: DEFAULT_MODEL_PARAMETERS.geometryBias,
	view: 'cell',
	time: 0
});

const OWNED_KEYS = [
	'nucleus_v',
	'nucleus_model',
	'scenario',
	'seed',
	'signal',
	'duration',
	'block',
	'affinity',
	'contact',
	'view',
	'time',
	'renderer',
	'hypothesis'
] as const;

function round(value: number, digits = 3): number {
	const factor = 10 ** digits;
	return Math.round(value * factor) / factor;
}

function numberText(value: number): string {
	return String(Object.is(value, -0) ? 0 : round(value));
}

function queryText(source: string): string {
	const question = source.indexOf('?');
	let query = question >= 0 ? source.slice(question + 1) : source.replace(/^\?/u, '');
	const hash = query.indexOf('#');
	if (hash >= 0) query = query.slice(0, hash);
	return query;
}

function enumValue<const Value extends string>(
	params: URLSearchParams,
	key: string,
	values: readonly Value[],
	fallback: Value,
	issues: NucleusUrlIssue[]
): Value {
	const raw = params.get(key);
	if (raw === null) return fallback;
	if ((values as readonly string[]).includes(raw)) return raw as Value;
	issues.push({ key, value: raw, message: 'Unknown option; the documented default was restored.' });
	return fallback;
}

function boundedNumber(
	params: URLSearchParams,
	key: string,
	fallback: number,
	minimum: number,
	maximum: number,
	issues: NucleusUrlIssue[],
	integer = false
): number {
	const raw = params.get(key);
	if (raw === null) return fallback;
	if (raw.trim() === '' || raw.length > 64) {
		issues.push({
			key,
			value: raw,
			message: 'Expected a finite number; the default was restored.'
		});
		return fallback;
	}
	const parsed = Number(raw);
	if (!Number.isFinite(parsed)) {
		issues.push({
			key,
			value: raw,
			message: 'Expected a finite number; the default was restored.'
		});
		return fallback;
	}
	const normalized = integer ? Math.round(parsed) : parsed;
	const clamped = Math.min(maximum, Math.max(minimum, normalized));
	if (clamped !== parsed) {
		issues.push({ key, value: raw, message: `Clamped to the safe range ${minimum}–${maximum}.` });
	}
	return round(clamped);
}

function toParams(source: string | URL | URLSearchParams): URLSearchParams {
	if (source instanceof URLSearchParams) return new URLSearchParams(source);
	if (source instanceof URL) return new URLSearchParams(source.search);
	return new URLSearchParams(queryText(source));
}

export function parseNucleusUrlState(
	source: string | URL | URLSearchParams,
	fallback: NucleusUrlState = DEFAULT_NUCLEUS_URL_STATE
): NucleusUrlParseResult {
	const rawQuery =
		typeof source === 'string'
			? queryText(source)
			: source instanceof URL
				? source.search.slice(1)
				: source.toString();
	if (rawQuery.length > MAX_NUCLEUS_QUERY_LENGTH) {
		return {
			state: { ...fallback },
			issues: [
				{
					key: '',
					value: `${rawQuery.length} characters`,
					message: `Query exceeds the ${MAX_NUCLEUS_QUERY_LENGTH}-character safety limit.`
				}
			],
			unsupportedVersion: false
		};
	}

	const params = toParams(source);
	const issues: NucleusUrlIssue[] = [];
	const versionText = params.get('nucleus_v');
	const version = versionText === null ? NUCLEUS_URL_VERSION : Number(versionText);
	if (version !== NUCLEUS_URL_VERSION) {
		return {
			state: { ...fallback },
			issues: [
				{
					key: 'nucleus_v',
					value: versionText,
					message: `Unsupported state version; version ${NUCLEUS_URL_VERSION} defaults were restored.`
				}
			],
			unsupportedVersion: true
		};
	}

	const suppliedModel = params.get('nucleus_model');
	if (suppliedModel !== null && suppliedModel !== NUCLEUS_URL_MODEL_VERSION) {
		issues.push({
			key: 'nucleus_model',
			value: suppliedModel,
			message:
				'The link names an older model; safe current defaults were restored before applying state.'
		});
		return {
			state: { ...fallback },
			issues,
			unsupportedVersion: false
		};
	}

	const rendererText = params.get('renderer');
	let renderer: NucleusRendererChoice | undefined;
	if (rendererText !== null) {
		if ((NUCLEUS_RENDERERS as readonly string[]).includes(rendererText)) {
			renderer = rendererText as NucleusRendererChoice;
		} else {
			issues.push({
				key: 'renderer',
				value: rendererText,
				message: 'Unknown renderer choice; automatic selection was restored.'
			});
		}
	}

	const hypothesisText = params.get('hypothesis');
	let hypothesis: 'signal-contact' | undefined;
	if (hypothesisText === 'signal-contact') hypothesis = hypothesisText;
	else if (hypothesisText !== null) {
		issues.push({
			key: 'hypothesis',
			value: hypothesisText,
			message: 'Unknown hypothesis mode; the default independent-input model was restored.'
		});
	}

	return {
		state: {
			scenario: enumValue(params, 'scenario', NUCLEUS_SCENARIOS, fallback.scenario, issues),
			seed: boundedNumber(params, 'seed', fallback.seed, 0, 0xffffffff, issues, true),
			signal: boundedNumber(params, 'signal', fallback.signal, 0, 1, issues),
			duration: boundedNumber(params, 'duration', fallback.duration, 1, 60, issues),
			block: boundedNumber(params, 'block', fallback.block, 0, 1, issues),
			affinity: boundedNumber(params, 'affinity', fallback.affinity, 0.05, 1, issues),
			contact: boundedNumber(params, 'contact', fallback.contact, 0, 1, issues),
			view: enumValue(params, 'view', NUCLEUS_VIEWS, fallback.view, issues),
			time: boundedNumber(params, 'time', fallback.time, 0, 60, issues),
			...(renderer ? { renderer } : {}),
			...(hypothesis ? { hypothesis } : {})
		},
		issues,
		unsupportedVersion: false
	};
}

export function serializeNucleusUrlState(
	state: NucleusUrlState,
	base: URLSearchParams = new URLSearchParams()
): URLSearchParams {
	const normalized = parseNucleusUrlState(
		new URLSearchParams({
			nucleus_v: String(NUCLEUS_URL_VERSION),
			scenario: state.scenario,
			seed: String(state.seed),
			signal: String(state.signal),
			duration: String(state.duration),
			block: String(state.block),
			affinity: String(state.affinity),
			contact: String(state.contact),
			view: state.view,
			time: String(state.time),
			...(state.renderer ? { renderer: state.renderer } : {}),
			...(state.hypothesis ? { hypothesis: state.hypothesis } : {})
		})
	).state;
	const params = new URLSearchParams(base);
	for (const key of OWNED_KEYS) params.delete(key);
	params.set('nucleus_v', String(NUCLEUS_URL_VERSION));
	params.set('nucleus_model', NUCLEUS_URL_MODEL_VERSION);
	params.set('seed', String(normalized.seed >>> 0));
	if (normalized.scenario !== DEFAULT_NUCLEUS_URL_STATE.scenario) {
		params.set('scenario', normalized.scenario);
	}
	if (normalized.signal !== DEFAULT_NUCLEUS_URL_STATE.signal) {
		params.set('signal', numberText(normalized.signal));
	}
	if (normalized.duration !== DEFAULT_NUCLEUS_URL_STATE.duration) {
		params.set('duration', numberText(normalized.duration));
	}
	if (normalized.block !== DEFAULT_NUCLEUS_URL_STATE.block) {
		params.set('block', numberText(normalized.block));
	}
	if (normalized.affinity !== DEFAULT_NUCLEUS_URL_STATE.affinity) {
		params.set('affinity', numberText(normalized.affinity));
	}
	if (normalized.contact !== DEFAULT_NUCLEUS_URL_STATE.contact) {
		params.set('contact', numberText(normalized.contact));
	}
	if (normalized.view !== DEFAULT_NUCLEUS_URL_STATE.view) params.set('view', normalized.view);
	if (normalized.time !== DEFAULT_NUCLEUS_URL_STATE.time) {
		params.set('time', numberText(normalized.time));
	}
	if (normalized.renderer) params.set('renderer', normalized.renderer);
	if (normalized.hypothesis) params.set('hypothesis', normalized.hypothesis);
	return params;
}
