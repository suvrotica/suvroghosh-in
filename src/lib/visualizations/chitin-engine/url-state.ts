import {
	DEFAULT_EXHIBIT_STATE,
	DEFAULT_GENOME,
	QUALITY_LEVELS,
	VIEW_MODES,
	normalizeExhibitState,
	validateGenome
} from './genome';
import { CREATURE_PRESETS, WORLD_PRESETS, getCreaturePreset } from './presets';
import { normalizeSeed } from './seed';
import type { CreatureGenome, ExhibitState, PresetId, ViewMode, WorldId } from './types';

export const CHITIN_URL_VERSION = '1';
export const CHITIN_URL_PAYLOAD_KEY = 'ce_g';
export const MAX_CHITIN_URL_LENGTH = 16_384;
export const MAX_CHITIN_PAYLOAD_LENGTH = 6_000;

export type ChitinUrlStateResult = Readonly<{
	state: ExhibitState;
	issues: readonly string[];
	unsupportedVersion: boolean;
}>;

type PayloadDisplayKey = 'q' | 'z' | 'y' | 'p' | 'r' | 's' | 'b' | 'g' | 'c';

type CompactPayload = Readonly<{
	g?: Readonly<Record<string, unknown>>;
	x?: Readonly<Partial<Record<PayloadDisplayKey, unknown>>>;
}>;

const VISIBLE_KEYS = Object.freeze([
	'ce_v',
	'ce_seed',
	'ce_preset',
	'ce_world',
	'ce_view'
] as const);
const KNOWN_KEYS = Object.freeze([...VISIBLE_KEYS, CHITIN_URL_PAYLOAD_KEY] as const);
const PRESET_IDS = new Set<PresetId>(CREATURE_PRESETS.map((preset) => preset.id));
const WORLD_IDS = new Set<WorldId>(WORLD_PRESETS.map((world) => world.id));
const GENOME_KEYS = Object.freeze(Object.keys(DEFAULT_GENOME) as (keyof CreatureGenome)[]);
const PAYLOAD_GENOME_KEYS = new Set<keyof CreatureGenome>(
	GENOME_KEYS.filter((key) => !['schemaVersion', 'seed', 'preset', 'world'].includes(key))
);

const DISPLAY_TO_PAYLOAD = Object.freeze({
	quality: 'q',
	paused: 'z',
	cameraYaw: 'y',
	cameraPitch: 'p',
	cameraRoll: 'r',
	scannerIntensity: 's',
	bloom: 'b',
	grain: 'g',
	chromaticFault: 'c'
} as const);

function recordFrom(value: unknown): Record<string, unknown> | undefined {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

function roundNumber(value: number): number {
	return Number(value.toFixed(6));
}

function compactValue(value: CreatureGenome[keyof CreatureGenome]): unknown {
	return typeof value === 'number' ? roundNumber(value) : value;
}

function paramsFrom(input: string | URL | URLSearchParams): URLSearchParams {
	if (input instanceof URLSearchParams) return new URLSearchParams(input);
	if (input instanceof URL) return new URLSearchParams(input.searchParams);
	try {
		return new URLSearchParams(new URL(input).searchParams);
	} catch {
		// Query strings and relative URLs are handled without relying on document.location.
	}
	const queryStart = input.indexOf('?');
	const query =
		queryStart >= 0 ? input.slice(queryStart + 1).split('#')[0] : input.replace(/^\?/, '');
	return new URLSearchParams(query);
}

function payloadForState(stateInput: ExhibitState): CompactPayload | undefined {
	const state = normalizeExhibitState(stateInput);
	const presetGenome = getCreaturePreset(state.genome.preset).genome;
	const genome: Record<string, unknown> = {};
	for (const key of PAYLOAD_GENOME_KEYS) {
		if (state.genome[key] !== presetGenome[key]) genome[key] = compactValue(state.genome[key]);
	}
	const display: Partial<Record<PayloadDisplayKey, unknown>> = {};
	for (const [stateKey, payloadKey] of Object.entries(DISPLAY_TO_PAYLOAD) as [
		keyof typeof DISPLAY_TO_PAYLOAD,
		PayloadDisplayKey
	][]) {
		const value = state[stateKey];
		if (value !== DEFAULT_EXHIBIT_STATE[stateKey]) {
			display[payloadKey] = typeof value === 'number' ? roundNumber(value) : value;
		}
	}
	if (Object.keys(genome).length === 0 && Object.keys(display).length === 0) return undefined;
	return Object.freeze({
		...(Object.keys(genome).length > 0 ? { g: Object.freeze(genome) } : {}),
		...(Object.keys(display).length > 0 ? { x: Object.freeze(display) } : {})
	});
}

/** Serializes visible identity fields plus a bounded deviations-only payload. */
export function serializeChitinUrlState(
	stateInput: ExhibitState,
	existing: URLSearchParams = new URLSearchParams()
): URLSearchParams {
	const state = normalizeExhibitState(stateInput);
	const params = new URLSearchParams(existing);
	for (const key of KNOWN_KEYS) params.delete(key);
	params.set('ce_v', CHITIN_URL_VERSION);
	params.set('ce_seed', state.genome.seed);
	params.set('ce_preset', state.genome.preset);
	params.set('ce_world', state.genome.world);
	params.set('ce_view', state.view);
	const payload = payloadForState(state);
	if (payload) {
		const text = JSON.stringify(payload);
		if (text.length <= MAX_CHITIN_PAYLOAD_LENGTH) params.set(CHITIN_URL_PAYLOAD_KEY, text);
	}
	return params;
}

function parsePayload(text: string | null, issues: string[]): CompactPayload | undefined {
	if (text === null || text === '') return undefined;
	if (text.length > MAX_CHITIN_PAYLOAD_LENGTH) {
		issues.push('Genome deviation payload exceeded its safety limit and was ignored.');
		return undefined;
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(text) as unknown;
	} catch {
		issues.push('Genome deviation payload was malformed and was ignored.');
		return undefined;
	}
	const root = recordFrom(parsed);
	if (!root) {
		issues.push('Genome deviation payload was not an object and was ignored.');
		return undefined;
	}
	const genome = recordFrom(root.g);
	const display = recordFrom(root.x);
	if (root.g !== undefined && !genome)
		issues.push('Genome deviations were invalid and were ignored.');
	if (root.x !== undefined && !display)
		issues.push('Display deviations were invalid and were ignored.');
	return { g: genome, x: display };
}

function applyGenomeDeviations(
	base: CreatureGenome,
	deviations: Readonly<Record<string, unknown>> | undefined,
	issues: string[]
): Record<string, unknown> {
	const candidate: Record<string, unknown> = { ...base };
	if (!deviations) return candidate;
	for (const [key, value] of Object.entries(deviations)) {
		if (PAYLOAD_GENOME_KEYS.has(key as keyof CreatureGenome)) candidate[key] = value;
		else issues.push(`Unknown genome deviation ${key} was ignored.`);
	}
	return candidate;
}

function applyDisplayDeviations(
	deviations: Readonly<Record<string, unknown>> | undefined,
	issues: string[]
): Partial<ExhibitState> {
	if (!deviations) return {};
	const reverse = Object.fromEntries(
		Object.entries(DISPLAY_TO_PAYLOAD).map(([stateKey, payloadKey]) => [payloadKey, stateKey])
	) as Record<PayloadDisplayKey, keyof typeof DISPLAY_TO_PAYLOAD>;
	const display: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(deviations)) {
		const stateKey = reverse[key as PayloadDisplayKey];
		if (stateKey) display[stateKey] = value;
		else issues.push(`Unknown display deviation ${key} was ignored.`);
	}
	return display as Partial<ExhibitState>;
}

/** Parses once into a validated genome and bounded exhibit state. */
export function parseChitinUrlState(
	input: string | URL | URLSearchParams,
	fallback: ExhibitState = DEFAULT_EXHIBIT_STATE
): ChitinUrlStateResult {
	const raw =
		input instanceof URL
			? input.search
			: input instanceof URLSearchParams
				? input.toString()
				: input;
	if (raw.length > MAX_CHITIN_URL_LENGTH) {
		return Object.freeze({
			state: normalizeExhibitState(fallback),
			issues: Object.freeze(['Chitin Engine URL state exceeded its safety limit and was ignored.']),
			unsupportedVersion: false
		});
	}
	const params = paramsFrom(input);
	const issues: string[] = [];
	const version = params.get('ce_v');
	if (version !== CHITIN_URL_VERSION) {
		if (version !== null) issues.push(`Unsupported Chitin Engine URL version ${version}.`);
		else if ([...params.keys()].some((key) => key.startsWith('ce_'))) {
			issues.push('Unversioned Chitin Engine URL state was ignored.');
		}
		return Object.freeze({
			state: normalizeExhibitState(fallback),
			issues: Object.freeze(issues),
			unsupportedVersion: version !== null
		});
	}

	const presetText = params.get('ce_preset');
	const preset: PresetId = PRESET_IDS.has(presetText as PresetId)
		? (presetText as PresetId)
		: fallback.genome.preset;
	if (presetText === null || !PRESET_IDS.has(presetText as PresetId)) {
		issues.push('Unknown or missing preset was restored to the fallback preset.');
	}
	const presetGenome = getCreaturePreset(preset).genome;
	const payload = parsePayload(params.get(CHITIN_URL_PAYLOAD_KEY), issues);
	const genomeCandidate = applyGenomeDeviations(presetGenome, payload?.g, issues);
	genomeCandidate.preset = preset;

	const seedText = params.get('ce_seed');
	if (seedText !== null) {
		const seed = normalizeSeed(seedText, presetGenome.seed);
		genomeCandidate.seed = seed;
		if (seed !== seedText) issues.push('Seed was normalized to a safe bounded value.');
	} else {
		issues.push('Missing seed was restored from the selected preset.');
	}

	const worldText = params.get('ce_world');
	if (WORLD_IDS.has(worldText as WorldId)) genomeCandidate.world = worldText as WorldId;
	else if (worldText !== null) issues.push('Unknown world was restored from the selected preset.');

	const validated = validateGenome(genomeCandidate, presetGenome);
	issues.push(...validated.issues.map((issue) => `${issue.field}: ${issue.message}`));
	const displayCandidate = applyDisplayDeviations(payload?.x, issues);
	const viewText = params.get('ce_view');
	const view: ViewMode = VIEW_MODES.includes(viewText as ViewMode)
		? (viewText as ViewMode)
		: DEFAULT_EXHIBIT_STATE.view;
	if (viewText === null || !VIEW_MODES.includes(viewText as ViewMode)) {
		issues.push('Unknown or missing view was restored to specimen view.');
	}
	const state = normalizeExhibitState({
		...DEFAULT_EXHIBIT_STATE,
		...displayCandidate,
		genome: validated.genome,
		view
	});

	if (
		displayCandidate.quality !== undefined &&
		!QUALITY_LEVELS.includes(displayCandidate.quality as ExhibitState['quality'])
	) {
		issues.push('Unknown quality level was restored to auto.');
	}
	if (displayCandidate.paused !== undefined && typeof displayCandidate.paused !== 'boolean') {
		issues.push('Invalid paused state was restored to false.');
	}
	for (const key of [
		'cameraYaw',
		'cameraPitch',
		'cameraRoll',
		'scannerIntensity',
		'bloom',
		'grain',
		'chromaticFault'
	] as const) {
		if (displayCandidate[key] !== undefined && displayCandidate[key] !== state[key]) {
			issues.push(`${key} was invalid or clamped.`);
		}
	}

	return Object.freeze({ state, issues: Object.freeze(issues), unsupportedVersion: false });
}

export function writeChitinStateToUrl(input: URL | string, state: ExhibitState): URL {
	const url = input instanceof URL ? new URL(input.toString()) : new URL(input);
	url.search = serializeChitinUrlState(state, url.searchParams).toString();
	return url;
}

export function removeChitinStateFromUrl(input: URL | string): URL {
	const url = input instanceof URL ? new URL(input.toString()) : new URL(input);
	for (const key of [...url.searchParams.keys()]) {
		if (key.startsWith('ce_')) url.searchParams.delete(key);
	}
	return url;
}

/** Returns the share-free canonical page URL while retaining unrelated query state. */
export function canonicalCleanChitinUrl(input: URL | string): string {
	const url = removeChitinStateFromUrl(input);
	url.hash = '';
	return url.toString();
}

export const serializeUrlState = serializeChitinUrlState;
export const parseUrlState = parseChitinUrlState;
