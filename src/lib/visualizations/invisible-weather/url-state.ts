import { DEFAULT_INVISIBLE_WEATHER_STATE } from './defaults';
import { PALETTE_FAMILIES } from './palettes';
import { PRESETS } from './presets';
import { FRAME_FAMILIES, normalizeGalleryState, stateForPreset } from './recipes';
import type {
	AngleMode,
	InvisibleWeatherState,
	LayoutId,
	MotionMode,
	NoiseMode,
	OrientationPreference,
	ParsedInvisibleWeatherState,
	ThresholdMode,
	UrlStateIssue
} from './types';

export const INVISIBLE_WEATHER_QUERY_PREFIX = 'iw_';
export const MAX_INVISIBLE_WEATHER_QUERY_LENGTH = 4_096;

const KNOWN_KEYS = [
	'iw_v',
	'iw_seed',
	'iw_preset',
	'iw_layout',
	'iw_count',
	'iw_palette',
	'iw_noise',
	'iw_depth',
	'iw_freq',
	'iw_warp',
	'iw_angle',
	'iw_soft',
	'iw_threshold',
	'iw_band',
	'iw_motion',
	'iw_phase',
	'iw_frozen',
	'iw_selected',
	'iw_density',
	'iw_length',
	'iw_multiplier',
	'iw_turns',
	'iw_stroke',
	'iw_dual',
	'iw_grain',
	'iw_shadow',
	'iw_frame',
	'iw_orientation',
	'iw_speed'
] as const;

function paramsFrom(source?: string | URL | URLSearchParams | null): URLSearchParams {
	if (!source) return new URLSearchParams();
	if (source instanceof URLSearchParams) return new URLSearchParams(source);
	if (source instanceof URL) return new URLSearchParams(source.searchParams);
	const text = String(source).trim();
	if (text.length > MAX_INVISIBLE_WEATHER_QUERY_LENGTH) return new URLSearchParams();
	if (/^[a-z][a-z\d+.-]*:\/\//iu.test(text)) {
		try {
			return new URLSearchParams(new URL(text).searchParams);
		} catch {
			return new URLSearchParams();
		}
	}
	return new URLSearchParams(text.startsWith('?') ? text.slice(1) : text);
}

function enumValue<T extends string>(
	params: URLSearchParams,
	key: string,
	values: ReadonlySet<T>,
	fallback: T,
	issues: UrlStateIssue[]
): T {
	const value = params.get(key);
	if (value === null || value === '') return fallback;
	if (values.has(value as T)) return value as T;
	issues.push({ parameter: key, value, message: `Unknown value; restored ${fallback}.` });
	return fallback;
}

function numberValue(
	params: URLSearchParams,
	key: string,
	fallback: number,
	minimum: number,
	maximum: number,
	issues: UrlStateIssue[],
	integer = false
): number {
	const text = params.get(key);
	if (text === null || text === '') return fallback;
	const parsed = Number(text);
	if (!Number.isFinite(parsed)) {
		issues.push({
			parameter: key,
			value: text,
			message: `Not a finite number; restored ${fallback}.`
		});
		return fallback;
	}
	const rounded = integer ? Math.round(parsed) : parsed;
	const bounded = Math.max(minimum, Math.min(maximum, rounded));
	if (bounded !== rounded) {
		issues.push({
			parameter: key,
			value: text,
			message: `Clamped to the safe range ${minimum}–${maximum}.`
		});
	}
	return bounded;
}

function booleanValue(
	params: URLSearchParams,
	key: string,
	fallback: boolean,
	issues: UrlStateIssue[]
): boolean {
	const value = params.get(key);
	if (value === null || value === '') return fallback;
	if (value === '1' || value === 'true') return true;
	if (value === '0' || value === 'false') return false;
	issues.push({ parameter: key, value, message: `Expected 0 or 1; restored ${fallback}.` });
	return fallback;
}

const layoutIds = new Set<LayoutId>([
	'quiet-grid',
	'salon-wall',
	'cabinet',
	'triptych',
	'procession'
]);
const noiseModes = new Set<NoiseMode>(['value', 'gradient']);
const angleModes = new Set<AngleMode>([
	'free',
	'orthogonal',
	'diagonal',
	'hexagonal',
	'alternating',
	'soft'
]);
const thresholdModes = new Set<ThresholdMode>(['off', 'river', 'islands', 'delta']);
const motionModes = new Set<MotionMode>(['still', 'breathe', 'migrate']);
const orientations = new Set<OrientationPreference>(['auto', 'portrait', 'landscape']);
const paletteIds = new Set(PALETTE_FAMILIES.map((palette) => palette.id));
const presetIds = new Set(PRESETS.map((preset) => preset.id));
const frameFamilies = new Set<string>(FRAME_FAMILIES);

export function parseInvisibleWeatherState(
	source?: string | URL | URLSearchParams | null
): ParsedInvisibleWeatherState {
	const rawText = source == null ? '' : String(source);
	if (rawText.length > MAX_INVISIBLE_WEATHER_QUERY_LENGTH) {
		return {
			state: { ...DEFAULT_INVISIBLE_WEATHER_STATE },
			issues: [
				{
					parameter: 'query',
					message: `State exceeded the ${MAX_INVISIBLE_WEATHER_QUERY_LENGTH}-character safety limit.`
				}
			],
			unsupportedVersion: false
		};
	}
	const params = paramsFrom(source);
	const issues: UrlStateIssue[] = [];
	const version = params.get('iw_v');
	if (version !== null && version !== '1') {
		return {
			state: { ...DEFAULT_INVISIBLE_WEATHER_STATE },
			issues: [
				{
					parameter: 'iw_v',
					value: version,
					message: 'Unsupported Invisible Weather state version; restored safe defaults.'
				}
			],
			unsupportedVersion: true
		};
	}
	const presetId = enumValue(
		params,
		'iw_preset',
		presetIds,
		DEFAULT_INVISIBLE_WEATHER_STATE.presetId,
		issues
	);
	const baseline = stateForPreset(presetId);
	const seed = (params.get('iw_seed') ?? baseline.seed).trim().slice(0, 96) || baseline.seed;
	const frozenText = params.get('iw_frozen');
	const frozenPhase =
		frozenText === null ? null : numberValue(params, 'iw_frozen', 0, 0, 1_000_000, issues);
	if (frozenText === null && params.has('iw_phase')) {
		issues.push({
			parameter: 'iw_phase',
			value: params.get('iw_phase') ?? undefined,
			message: 'A phase is restored only for a frozen share; ignored the live phase.'
		});
	}
	const phase =
		frozenPhase === null
			? baseline.phase
			: numberValue(params, 'iw_phase', frozenPhase, 0, 1_000_000, issues);
	const candidate: InvisibleWeatherState = {
		...baseline,
		seed,
		presetId,
		layout: enumValue(params, 'iw_layout', layoutIds, baseline.layout, issues),
		artworkCount: numberValue(params, 'iw_count', baseline.artworkCount, 3, 15, issues, true),
		paletteId: enumValue(params, 'iw_palette', paletteIds, baseline.paletteId, issues),
		noiseMode: enumValue(params, 'iw_noise', noiseModes, baseline.noiseMode, issues),
		depth: numberValue(params, 'iw_depth', baseline.depth, 1, 4, issues, true) as 1 | 2 | 3 | 4,
		frequency: numberValue(params, 'iw_freq', baseline.frequency, 0.05, 12, issues),
		warpStrength: numberValue(params, 'iw_warp', baseline.warpStrength, 0, 2, issues),
		angleMode: enumValue(params, 'iw_angle', angleModes, baseline.angleMode, issues),
		softness: numberValue(params, 'iw_soft', baseline.softness, 0, 1, issues),
		thresholdMode: enumValue(
			params,
			'iw_threshold',
			thresholdModes,
			baseline.thresholdMode,
			issues
		),
		thresholdWidth: numberValue(params, 'iw_band', baseline.thresholdWidth, 0.005, 0.35, issues),
		motion: enumValue(params, 'iw_motion', motionModes, baseline.motion, issues),
		phase,
		frozenPhase,
		selectedArtwork: numberValue(
			params,
			'iw_selected',
			baseline.selectedArtwork,
			0,
			14,
			issues,
			true
		),
		pathDensity: numberValue(params, 'iw_density', baseline.pathDensity, 0.2, 2, issues),
		pathLength: numberValue(params, 'iw_length', baseline.pathLength, 8, 96, issues, true),
		multiplier: numberValue(params, 'iw_multiplier', baseline.multiplier, 0.25, 4, issues),
		turns: numberValue(params, 'iw_turns', baseline.turns, 0.1, 8, issues),
		strokeWidth: numberValue(params, 'iw_stroke', baseline.strokeWidth, 0.25, 4, issues),
		dualInk: booleanValue(params, 'iw_dual', baseline.dualInk, issues),
		grain: numberValue(params, 'iw_grain', baseline.grain, 0, 1, issues),
		shadow: numberValue(params, 'iw_shadow', baseline.shadow, 0, 1, issues),
		frameFamily: enumValue(params, 'iw_frame', frameFamilies, baseline.frameFamily, issues),
		orientation: enumValue(params, 'iw_orientation', orientations, baseline.orientation, issues),
		speed: numberValue(params, 'iw_speed', baseline.speed, 0, 4, issues)
	};
	return { state: normalizeGalleryState(candidate), issues, unsupportedVersion: false };
}

function sameNumber(left: number, right: number): boolean {
	return Math.abs(left - right) <= 1e-9;
}

function formatNumber(value: number): string {
	return Number(value.toFixed(6)).toString();
}

export function serializeInvisibleWeatherState(
	input: InvisibleWeatherState,
	source?: string | URL | URLSearchParams | null
): URLSearchParams {
	const state = normalizeGalleryState(input);
	const params = paramsFrom(source);
	for (const key of KNOWN_KEYS) params.delete(key);
	const baseline = stateForPreset(state.presetId);
	params.set('iw_v', '1');
	params.set('iw_seed', state.seed);
	params.set('iw_preset', state.presetId);
	const setEnum = <T extends string>(key: string, value: T, expected: T) => {
		if (value !== expected) params.set(key, value);
	};
	const setNumber = (key: string, value: number, expected: number) => {
		if (!sameNumber(value, expected)) params.set(key, formatNumber(value));
	};
	setEnum('iw_layout', state.layout, baseline.layout);
	setNumber('iw_count', state.artworkCount, baseline.artworkCount);
	setEnum('iw_palette', state.paletteId, baseline.paletteId);
	setEnum('iw_noise', state.noiseMode, baseline.noiseMode);
	setNumber('iw_depth', state.depth, baseline.depth);
	setNumber('iw_freq', state.frequency, baseline.frequency);
	setNumber('iw_warp', state.warpStrength, baseline.warpStrength);
	setEnum('iw_angle', state.angleMode, baseline.angleMode);
	setNumber('iw_soft', state.softness, baseline.softness);
	setEnum('iw_threshold', state.thresholdMode, baseline.thresholdMode);
	setNumber('iw_band', state.thresholdWidth, baseline.thresholdWidth);
	setEnum('iw_motion', state.motion, baseline.motion);
	if (state.frozenPhase !== null) {
		params.set('iw_frozen', formatNumber(state.frozenPhase));
		params.set('iw_phase', formatNumber(state.frozenPhase));
	}
	setNumber('iw_selected', state.selectedArtwork, baseline.selectedArtwork);
	setNumber('iw_density', state.pathDensity, baseline.pathDensity);
	setNumber('iw_length', state.pathLength, baseline.pathLength);
	setNumber('iw_multiplier', state.multiplier, baseline.multiplier);
	setNumber('iw_turns', state.turns, baseline.turns);
	setNumber('iw_stroke', state.strokeWidth, baseline.strokeWidth);
	if (state.dualInk !== baseline.dualInk) params.set('iw_dual', state.dualInk ? '1' : '0');
	setNumber('iw_grain', state.grain, baseline.grain);
	setNumber('iw_shadow', state.shadow, baseline.shadow);
	setEnum('iw_frame', state.frameFamily, baseline.frameFamily);
	setEnum('iw_orientation', state.orientation, baseline.orientation);
	setNumber('iw_speed', state.speed, baseline.speed);
	return params;
}

export function buildInvisibleWeatherShareUrl(
	baseUrl: string | URL,
	state: InvisibleWeatherState
): string {
	const url = baseUrl instanceof URL ? new URL(baseUrl.href) : new URL(baseUrl);
	url.search = serializeInvisibleWeatherState(state, url.searchParams).toString();
	return url.href;
}

export const parseInvisibleWeatherUrl = parseInvisibleWeatherState;
export const serializeInvisibleWeatherUrl = serializeInvisibleWeatherState;
export const parseUrlState = parseInvisibleWeatherState;
export const serializeUrlState = serializeInvisibleWeatherState;
