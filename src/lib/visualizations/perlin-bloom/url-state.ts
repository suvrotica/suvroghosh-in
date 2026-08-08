import {
	BLOOM_VIEWS,
	CONFIG_RANGES,
	DEFAULT_FLOWER_CONFIG,
	PRESET_IDS,
	QUALITY_LEVELS,
	TIP_STYLES,
	normalizeFlowerConfig
} from './config';
import { stateForPreset } from './presets';
import { MAX_SEED_LENGTH, normalizeSeedText } from './seed';
import type {
	BloomView,
	ConfigRange,
	FlowerConfig,
	NumericConfigKey,
	ParsedPerlinBloomState,
	PresetId,
	QualityLevel,
	TipStyle,
	UrlStateIssue
} from './types';

export const PERLIN_BLOOM_QUERY_PREFIX = 'pb_';
export const MAX_PERLIN_BLOOM_QUERY_LENGTH = 4_096;

const KNOWN_KEYS = Object.freeze([
	'pb_v',
	'pb_seed',
	'pb_preset',
	'pb_palette',
	'pb_view',
	'pb_p',
	'pb_w',
	'pb_scale',
	'pb_len',
	'pb_width',
	'pb_profile',
	'pb_curl',
	'pb_sym',
	'pb_asym',
	'pb_tip',
	'pb_noise',
	'pb_ns',
	'pb_warp',
	'pb_oct',
	'pb_fall',
	'pb_drift',
	'pb_breath',
	'pb_rot',
	'pb_pointer',
	'pb_trails',
	'pb_box',
	'pb_constraint',
	'pb_rupture',
	'pb_break',
	'pb_box_opacity',
	'pb_physics',
	'pb_visible',
	'pb_membrane',
	'pb_veins',
	'pb_glow',
	'pb_grain',
	'pb_pollen',
	'pb_quality',
	'pb_motion'
] as const);

const NUMERIC_PARAMETERS = Object.freeze({
	petals: 'pb_p',
	whorls: 'pb_w',
	bloomScale: 'pb_scale',
	petalLength: 'pb_len',
	petalWidth: 'pb_width',
	widthProfile: 'pb_profile',
	curl: 'pb_curl',
	symmetry: 'pb_sym',
	asymmetry: 'pb_asym',
	noiseStrength: 'pb_noise',
	noiseScale: 'pb_ns',
	domainWarp: 'pb_warp',
	octaves: 'pb_oct',
	falloff: 'pb_fall',
	noiseDrift: 'pb_drift',
	breath: 'pb_breath',
	rotation: 'pb_rot',
	pointerInfluence: 'pb_pointer',
	trails: 'pb_trails',
	boxSize: 'pb_box',
	constraint: 'pb_constraint',
	ruptureThreshold: 'pb_rupture',
	breakout: 'pb_break',
	boxOpacity: 'pb_box_opacity',
	membraneOpacity: 'pb_membrane',
	veinBrightness: 'pb_veins',
	glow: 'pb_glow',
	grain: 'pb_grain',
	pollen: 'pb_pollen'
} satisfies Readonly<Record<NumericConfigKey, string>>);

const presetIds = new Set<PresetId>(PRESET_IDS);
const bloomViews = new Set<BloomView>(BLOOM_VIEWS);
const tipStyles = new Set<TipStyle>(TIP_STYLES);
const qualityLevels = new Set<QualityLevel>(QUALITY_LEVELS);

function queryText(source?: string | URL | URLSearchParams | null): string {
	if (!source) return '';
	if (source instanceof URLSearchParams) return source.toString();
	if (source instanceof URL) return source.search.slice(1);
	const text = String(source).trim();
	if (/^[a-z][a-z\d+.-]*:\/\//iu.test(text)) {
		try {
			return new URL(text).search.slice(1);
		} catch {
			return '';
		}
	}
	const queryStart = text.indexOf('?');
	const raw = queryStart >= 0 ? text.slice(queryStart + 1) : text.replace(/^\?/u, '');
	return raw.split('#', 1)[0];
}

function paramsFrom(source?: string | URL | URLSearchParams | null): URLSearchParams {
	const text = queryText(source);
	return text.length <= MAX_PERLIN_BLOOM_QUERY_LENGTH
		? new URLSearchParams(text)
		: new URLSearchParams();
}

function enumValue<T extends string>(
	params: URLSearchParams,
	parameter: string,
	allowed: ReadonlySet<T>,
	fallback: T,
	issues: UrlStateIssue[]
): T {
	const raw = params.get(parameter);
	if (raw === null || raw === '') return fallback;
	if (allowed.has(raw as T)) return raw as T;
	issues.push({
		parameter,
		value: raw,
		message: `Unknown value; restored ${fallback}.`
	});
	return fallback;
}

function numberValue(
	params: URLSearchParams,
	key: NumericConfigKey,
	fallback: number,
	issues: UrlStateIssue[]
): number {
	const parameter = NUMERIC_PARAMETERS[key];
	const raw = params.get(parameter);
	if (raw === null || raw === '') return fallback;
	const parsed = Number(raw);
	if (!Number.isFinite(parsed)) {
		issues.push({
			parameter,
			value: raw,
			message: `Not a finite number; restored ${fallback}.`
		});
		return fallback;
	}
	const range: ConfigRange = CONFIG_RANGES[key];
	const rounded = range.integer ? Math.round(parsed) : parsed;
	const bounded = Math.max(range.min, Math.min(range.max, rounded));
	if (bounded !== parsed) {
		issues.push({
			parameter,
			value: raw,
			message: range.integer
				? `Rounded and clamped to ${bounded}.`
				: `Clamped to the safe range ${range.min}–${range.max}.`
		});
	}
	return bounded;
}

function booleanValue(
	params: URLSearchParams,
	parameter: string,
	fallback: boolean,
	issues: UrlStateIssue[]
): boolean {
	const raw = params.get(parameter);
	if (raw === null || raw === '') return fallback;
	if (raw === '1' || raw === 'true') return true;
	if (raw === '0' || raw === 'false') return false;
	issues.push({
		parameter,
		value: raw,
		message: `Expected 0 or 1; restored ${String(fallback)}.`
	});
	return fallback;
}

function seedValue(params: URLSearchParams, fallback: string, issues: UrlStateIssue[]): string {
	const raw = params.get('pb_seed');
	if (raw === null) return fallback;
	const normalized = normalizeSeedText(raw, fallback);
	if (!raw.trim() || Array.from(raw.trim()).length > MAX_SEED_LENGTH || normalized !== raw.trim()) {
		issues.push({
			parameter: 'pb_seed',
			value: raw,
			message: `Seed text was cleaned and limited to ${MAX_SEED_LENGTH} characters.`
		});
	}
	return normalized;
}

export function parsePerlinBloomState(
	source?: string | URL | URLSearchParams | null,
	fallback: Readonly<FlowerConfig> = DEFAULT_FLOWER_CONFIG
): ParsedPerlinBloomState {
	const safeFallback = normalizeFlowerConfig(fallback);
	const rawQuery = queryText(source);
	if (rawQuery.length > MAX_PERLIN_BLOOM_QUERY_LENGTH) {
		return {
			config: { ...safeFallback },
			issues: [
				{
					parameter: 'query',
					message: `State exceeded the ${MAX_PERLIN_BLOOM_QUERY_LENGTH}-character safety limit.`
				}
			],
			unsupportedVersion: false
		};
	}
	const params = paramsFrom(source);
	const version = params.get('pb_v');
	if (version !== null && version !== '1') {
		return {
			config: { ...safeFallback },
			issues: [
				{
					parameter: 'pb_v',
					value: version,
					message: 'Unsupported Perlin Bloom state version; restored safe defaults.'
				}
			],
			unsupportedVersion: true
		};
	}

	const issues: UrlStateIssue[] = [];
	const preset = enumValue(params, 'pb_preset', presetIds, safeFallback.preset, issues);
	const baseline = stateForPreset(preset, safeFallback.seed);
	const config: FlowerConfig = {
		...baseline,
		seed: seedValue(params, baseline.seed, issues),
		preset,
		palette: enumValue(params, 'pb_palette', presetIds, baseline.palette, issues),
		view: enumValue(params, 'pb_view', bloomViews, baseline.view, issues),
		petals: numberValue(params, 'petals', baseline.petals, issues),
		whorls: numberValue(params, 'whorls', baseline.whorls, issues),
		bloomScale: numberValue(params, 'bloomScale', baseline.bloomScale, issues),
		petalLength: numberValue(params, 'petalLength', baseline.petalLength, issues),
		petalWidth: numberValue(params, 'petalWidth', baseline.petalWidth, issues),
		widthProfile: numberValue(params, 'widthProfile', baseline.widthProfile, issues),
		curl: numberValue(params, 'curl', baseline.curl, issues),
		symmetry: numberValue(params, 'symmetry', baseline.symmetry, issues),
		asymmetry: numberValue(params, 'asymmetry', baseline.asymmetry, issues),
		tipStyle: enumValue(params, 'pb_tip', tipStyles, baseline.tipStyle, issues),
		noiseStrength: numberValue(params, 'noiseStrength', baseline.noiseStrength, issues),
		noiseScale: numberValue(params, 'noiseScale', baseline.noiseScale, issues),
		domainWarp: numberValue(params, 'domainWarp', baseline.domainWarp, issues),
		octaves: numberValue(params, 'octaves', baseline.octaves, issues),
		falloff: numberValue(params, 'falloff', baseline.falloff, issues),
		noiseDrift: numberValue(params, 'noiseDrift', baseline.noiseDrift, issues),
		breath: numberValue(params, 'breath', baseline.breath, issues),
		rotation: numberValue(params, 'rotation', baseline.rotation, issues),
		pointerInfluence: numberValue(params, 'pointerInfluence', baseline.pointerInfluence, issues),
		trails: numberValue(params, 'trails', baseline.trails, issues),
		boxSize: numberValue(params, 'boxSize', baseline.boxSize, issues),
		constraint: numberValue(params, 'constraint', baseline.constraint, issues),
		ruptureThreshold: numberValue(params, 'ruptureThreshold', baseline.ruptureThreshold, issues),
		breakout: numberValue(params, 'breakout', baseline.breakout, issues),
		boxOpacity: numberValue(params, 'boxOpacity', baseline.boxOpacity, issues),
		boundaryPhysics: booleanValue(params, 'pb_physics', baseline.boundaryPhysics, issues),
		boxVisible: booleanValue(params, 'pb_visible', baseline.boxVisible, issues),
		membraneOpacity: numberValue(params, 'membraneOpacity', baseline.membraneOpacity, issues),
		veinBrightness: numberValue(params, 'veinBrightness', baseline.veinBrightness, issues),
		glow: numberValue(params, 'glow', baseline.glow, issues),
		grain: numberValue(params, 'grain', baseline.grain, issues),
		pollen: numberValue(params, 'pollen', baseline.pollen, issues),
		quality: enumValue(params, 'pb_quality', qualityLevels, baseline.quality, issues),
		motionEnabled: booleanValue(params, 'pb_motion', baseline.motionEnabled, issues)
	};
	return { config: normalizeFlowerConfig(config, baseline), issues, unsupportedVersion: false };
}

function sameNumber(left: number, right: number): boolean {
	return Math.abs(left - right) <= 1e-9;
}

function formatNumber(key: NumericConfigKey, value: number): string {
	const digits = Math.min(6, Math.max(3, CONFIG_RANGES[key].decimals + 2));
	return Number(value.toFixed(digits)).toString();
}

function writeBloomState(params: URLSearchParams, config: Readonly<FlowerConfig>): void {
	for (const key of KNOWN_KEYS) params.delete(key);
	const state = normalizeFlowerConfig(config);
	const baseline = stateForPreset(state.preset, state.seed);
	params.set('pb_v', '1');
	params.set('pb_seed', state.seed);
	params.set('pb_preset', state.preset);
	if (state.palette !== baseline.palette) params.set('pb_palette', state.palette);
	if (state.view !== baseline.view) params.set('pb_view', state.view);
	for (const key of Object.keys(NUMERIC_PARAMETERS) as NumericConfigKey[]) {
		if (!sameNumber(state[key], baseline[key])) {
			params.set(NUMERIC_PARAMETERS[key], formatNumber(key, state[key]));
		}
	}
	if (state.tipStyle !== baseline.tipStyle) params.set('pb_tip', state.tipStyle);
	if (state.boundaryPhysics !== baseline.boundaryPhysics) {
		params.set('pb_physics', state.boundaryPhysics ? '1' : '0');
	}
	if (state.boxVisible !== baseline.boxVisible) {
		params.set('pb_visible', state.boxVisible ? '1' : '0');
	}
	if (state.quality !== baseline.quality) params.set('pb_quality', state.quality);
	if (state.motionEnabled !== baseline.motionEnabled) {
		params.set('pb_motion', state.motionEnabled ? '1' : '0');
	}
}

export function serializePerlinBloomState(
	input: Readonly<FlowerConfig>,
	source?: string | URL | URLSearchParams | null
): URLSearchParams {
	const params = paramsFrom(source);
	writeBloomState(params, input);
	if (params.toString().length <= MAX_PERLIN_BLOOM_QUERY_LENGTH) return params;
	// An oversized unrelated query cannot be preserved safely; the complete bloom state takes priority.
	const compact = new URLSearchParams();
	writeBloomState(compact, input);
	return compact;
}

export function buildPerlinBloomStateUrl(
	baseUrl: string | URL,
	config: Readonly<FlowerConfig>
): string {
	const url = baseUrl instanceof URL ? new URL(baseUrl.href) : new URL(baseUrl);
	url.search = serializePerlinBloomState(config, url.searchParams).toString();
	return url.href;
}

export function buildPerlinBloomStatePath(
	baseUrl: string | URL,
	config: Readonly<FlowerConfig>
): string {
	const url = new URL(buildPerlinBloomStateUrl(baseUrl, config));
	return `${url.pathname}${url.search}${url.hash}`;
}

export function buildPerlinBloomShareUrl(
	baseUrl: string | URL,
	config: Readonly<FlowerConfig>
): string {
	const url = new URL(buildPerlinBloomStateUrl(baseUrl, config));
	url.searchParams.delete('pb_debug');
	url.searchParams.delete('pb_poster');
	return url.href;
}

export const parsePerlinBloomUrl = parsePerlinBloomState;
export const serializePerlinBloomUrl = serializePerlinBloomState;
export const parseUrlState = parsePerlinBloomState;
export const serializeUrlState = serializePerlinBloomState;
