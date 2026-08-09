import type {
	AttractorId,
	NoiseFamily,
	NoiseLens,
	OrchestraSnapshot,
	SoundWorldId,
	TimingMode
} from './types';
import {
	ORCHESTRA_INTEGRATOR_VERSION,
	ORCHESTRA_MAPPING_VERSION,
	ORCHESTRA_URL_VERSION
} from './versions';
import { getAttractorDefinition, isAttractorId } from './model/registry';
import { isNoiseFamily } from './noise/noise-fields';
import { isNoiseLens } from './noise/noise-transform';
import { isSoundWorldId } from './score/musical-worlds';

export const MAX_ORCHESTRA_QUERY_LENGTH = 2_048;

export interface OrchestraUrlIssue {
	readonly key: string;
	readonly value: string | null;
	readonly message: string;
}

export interface OrchestraUrlParseResult {
	readonly state: OrchestraSnapshot;
	readonly issues: readonly OrchestraUrlIssue[];
	readonly unsupportedVersion: boolean;
}

const DEFAULT_DEFINITION = getAttractorDefinition('langford');

export const DEFAULT_ORCHESTRA_SNAPSHOT: OrchestraSnapshot = Object.freeze({
	masterSeed: 'langford-1847',
	attractorId: 'langford',
	parameterPreset: 'canonical',
	initialConditionPreset: 'canonical',
	integratorVersion: ORCHESTRA_INTEGRATOR_VERSION,
	mappingVersion: ORCHESTRA_MAPPING_VERSION,
	noiseFamily: 'curl',
	noiseLens: 'warp',
	noiseInfluence: 0.55,
	soundWorld: 'glass',
	timingMode: 'composed',
	simulationRate: 1,
	stableStepSize: DEFAULT_DEFINITION.stepSize ?? 1
});

const OWNED_KEYS = [
	'sa_v',
	'sa_seed',
	'sa_attractor',
	'sa_preset',
	'sa_initial',
	'sa_integrator',
	'sa_mapping',
	'sa_noise',
	'sa_lens',
	'sa_influence',
	'sa_sound',
	'sa_timing',
	'sa_rate',
	'sa_step'
] as const;

function queryText(source: string): string {
	const question = source.indexOf('?');
	let query = question >= 0 ? source.slice(question + 1) : source.replace(/^\?/u, '');
	const hash = query.indexOf('#');
	if (hash >= 0) query = query.slice(0, hash);
	return query;
}

function toParams(source: string | URL | URLSearchParams): URLSearchParams {
	if (source instanceof URLSearchParams) return new URLSearchParams(source);
	if (source instanceof URL) return new URLSearchParams(source.search);
	return new URLSearchParams(queryText(source));
}

function validSeed(value: string | null, fallback: string, issues: OrchestraUrlIssue[]): string {
	if (value === null) return fallback;
	if (/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/u.test(value)) return value;
	issues.push({
		key: 'sa_seed',
		value,
		message:
			'Seed must use 1–64 letters, digits, underscores, or hyphens; the default was restored.'
	});
	return fallback;
}

function boundedNumber(
	params: URLSearchParams,
	key: string,
	fallback: number,
	minimum: number,
	maximum: number,
	issues: OrchestraUrlIssue[]
): number {
	const raw = params.get(key);
	if (raw === null) return fallback;
	if (raw.trim() === '' || raw.length > 64 || !Number.isFinite(Number(raw))) {
		issues.push({
			key,
			value: raw,
			message: 'Expected a finite number; the default was restored.'
		});
		return fallback;
	}
	const value = Number(raw);
	if (value < minimum || value > maximum) {
		issues.push({
			key,
			value: raw,
			message: `Value is outside the safe range ${minimum}–${maximum}; the default was restored.`
		});
		return fallback;
	}
	return value;
}

function enumValue<Value extends string>(
	params: URLSearchParams,
	key: string,
	fallback: Value,
	guard: (value: unknown) => value is Value,
	issues: OrchestraUrlIssue[]
): Value {
	const raw = params.get(key);
	if (raw === null) return fallback;
	if (guard(raw)) return raw;
	issues.push({ key, value: raw, message: 'Unknown option; the documented default was restored.' });
	return fallback;
}

function isTimingMode(value: unknown): value is TimingMode {
	return value === 'raw' || value === 'composed';
}

function canonicalOnly(
	params: URLSearchParams,
	key: 'sa_preset' | 'sa_initial',
	issues: OrchestraUrlIssue[]
): 'canonical' {
	const raw = params.get(key);
	if (raw !== null && raw !== 'canonical') {
		issues.push({
			key,
			value: raw,
			message: 'Only the validated canonical preset is available; it was restored.'
		});
	}
	return 'canonical';
}

export function parseOrchestraUrlState(
	source: string | URL | URLSearchParams,
	fallback: OrchestraSnapshot = DEFAULT_ORCHESTRA_SNAPSHOT
): OrchestraUrlParseResult {
	const rawQuery =
		typeof source === 'string'
			? queryText(source)
			: source instanceof URL
				? source.search.slice(1)
				: source.toString();
	if (rawQuery.length > MAX_ORCHESTRA_QUERY_LENGTH) {
		return {
			state: { ...fallback },
			issues: [
				{
					key: '',
					value: `${rawQuery.length} characters`,
					message: `Query exceeds the ${MAX_ORCHESTRA_QUERY_LENGTH}-character safety limit.`
				}
			],
			unsupportedVersion: false
		};
	}
	const params = toParams(source);
	const versionRaw = params.get('sa_v');
	const version = versionRaw === null ? ORCHESTRA_URL_VERSION : Number(versionRaw);
	if (version !== ORCHESTRA_URL_VERSION) {
		return {
			state: { ...fallback },
			issues: [
				{
					key: 'sa_v',
					value: versionRaw,
					message: `Unsupported state version; version ${ORCHESTRA_URL_VERSION} defaults were restored.`
				}
			],
			unsupportedVersion: true
		};
	}
	const issues: OrchestraUrlIssue[] = [];
	const integratorRaw = params.get('sa_integrator');
	const mappingRaw = params.get('sa_mapping');
	if (
		(integratorRaw !== null && integratorRaw !== ORCHESTRA_INTEGRATOR_VERSION) ||
		(mappingRaw !== null && mappingRaw !== ORCHESTRA_MAPPING_VERSION)
	) {
		if (integratorRaw !== null && integratorRaw !== ORCHESTRA_INTEGRATOR_VERSION) {
			issues.push({
				key: 'sa_integrator',
				value: integratorRaw,
				message: 'Unsupported integrator version; current safe defaults were restored.'
			});
		}
		if (mappingRaw !== null && mappingRaw !== ORCHESTRA_MAPPING_VERSION) {
			issues.push({
				key: 'sa_mapping',
				value: mappingRaw,
				message: 'Unsupported mapping version; current safe defaults were restored.'
			});
		}
		return { state: { ...fallback }, issues, unsupportedVersion: false };
	}
	const fallbackAttractor = fallback.attractorId;
	const attractorId = enumValue<AttractorId>(
		params,
		'sa_attractor',
		fallbackAttractor,
		isAttractorId,
		issues
	);
	const definition = getAttractorDefinition(attractorId);
	const expectedStep = definition.stepSize ?? 1;
	const requestedStep = boundedNumber(
		params,
		'sa_step',
		expectedStep,
		Math.min(expectedStep, 0.00001),
		Math.max(expectedStep, 1),
		issues
	);
	let stableStepSize = requestedStep;
	if (Math.abs(requestedStep - expectedStep) > Math.max(1e-12, expectedStep * 1e-9)) {
		issues.push({
			key: 'sa_step',
			value: String(requestedStep),
			message: `This preset requires its validated stable step ${expectedStep}; it was restored.`
		});
		stableStepSize = expectedStep;
	}
	return {
		state: {
			masterSeed: validSeed(params.get('sa_seed'), fallback.masterSeed, issues),
			attractorId,
			parameterPreset: canonicalOnly(params, 'sa_preset', issues),
			initialConditionPreset: canonicalOnly(params, 'sa_initial', issues),
			integratorVersion: ORCHESTRA_INTEGRATOR_VERSION,
			mappingVersion: ORCHESTRA_MAPPING_VERSION,
			noiseFamily: enumValue<NoiseFamily>(
				params,
				'sa_noise',
				fallback.noiseFamily,
				isNoiseFamily,
				issues
			),
			noiseLens: enumValue<NoiseLens>(params, 'sa_lens', fallback.noiseLens, isNoiseLens, issues),
			noiseInfluence: boundedNumber(params, 'sa_influence', fallback.noiseInfluence, 0, 1, issues),
			soundWorld: enumValue<SoundWorldId>(
				params,
				'sa_sound',
				fallback.soundWorld,
				isSoundWorldId,
				issues
			),
			timingMode: enumValue<TimingMode>(
				params,
				'sa_timing',
				fallback.timingMode,
				isTimingMode,
				issues
			),
			simulationRate: boundedNumber(params, 'sa_rate', fallback.simulationRate, 0.25, 4, issues),
			stableStepSize
		},
		issues,
		unsupportedVersion: false
	};
}

function numberText(value: number): string {
	return String(Object.is(value, -0) ? 0 : Number(value.toPrecision(12)));
}

export function serializeOrchestraUrlState(
	state: OrchestraSnapshot,
	base: URLSearchParams = new URLSearchParams()
): URLSearchParams {
	const parsed = parseOrchestraUrlState(
		new URLSearchParams({
			sa_v: String(ORCHESTRA_URL_VERSION),
			sa_seed: state.masterSeed,
			sa_attractor: state.attractorId,
			sa_preset: state.parameterPreset,
			sa_initial: state.initialConditionPreset,
			sa_integrator: state.integratorVersion,
			sa_mapping: state.mappingVersion,
			sa_noise: state.noiseFamily,
			sa_lens: state.noiseLens,
			sa_influence: String(state.noiseInfluence),
			sa_sound: state.soundWorld,
			sa_timing: state.timingMode,
			sa_rate: String(state.simulationRate),
			sa_step: String(state.stableStepSize)
		})
	).state;
	const params = new URLSearchParams(base);
	for (const key of OWNED_KEYS) params.delete(key);
	params.set('sa_v', String(ORCHESTRA_URL_VERSION));
	params.set('sa_seed', parsed.masterSeed);
	params.set('sa_attractor', parsed.attractorId);
	params.set('sa_preset', parsed.parameterPreset);
	params.set('sa_initial', parsed.initialConditionPreset);
	params.set('sa_integrator', parsed.integratorVersion);
	params.set('sa_mapping', parsed.mappingVersion);
	params.set('sa_noise', parsed.noiseFamily);
	params.set('sa_lens', parsed.noiseLens);
	params.set('sa_influence', numberText(parsed.noiseInfluence));
	params.set('sa_sound', parsed.soundWorld);
	params.set('sa_timing', parsed.timingMode);
	params.set('sa_rate', numberText(parsed.simulationRate));
	params.set('sa_step', numberText(parsed.stableStepSize));
	return params;
}
