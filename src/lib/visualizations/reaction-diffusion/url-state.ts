import {
	DEFAULT_REACTION_DIFFUSION_SETUP,
	MAX_SHARE_URL_LENGTH,
	REACTION_DIFFUSION_QUERY_PREFIX
} from './constants';
import { cloneSetup, normalizeSetup } from './setup';
import { REACTION_DIFFUSION_SCHEMA_VERSION } from './types';
import type {
	DisplayMode,
	GrayScottSetup,
	PaletteId,
	ReactionDiffusionPanel,
	UrlDecodeResult
} from './types';

export interface ReactionDiffusionUrlState {
	readonly setup: GrayScottSetup;
	readonly displayMode?: DisplayMode;
	readonly palette?: PaletteId;
	readonly selectedPanel?: string;
}

const DISPLAY_MODES = new Set<DisplayMode>([
	'v',
	'u',
	'composite',
	'u-minus-v',
	'reaction-rate',
	'v-diffusion',
	'v-derivative'
]);
const PALETTES = new Set<PaletteId>(['mineral', 'cividis', 'high-contrast', 'diverging']);
export const REACTION_DIFFUSION_PANELS = [
	'laboratory',
	'compare',
	'diagnostics',
	'numerics',
	'export'
] as const satisfies readonly ReactionDiffusionPanel[];
const PANELS = new Set<ReactionDiffusionPanel>(REACTION_DIFFUSION_PANELS);
const LEGACY_PANEL_ALIASES: Readonly<Record<string, ReactionDiffusionPanel>> = Object.freeze({
	stability: 'diagnostics'
});
const OWNED_KEYS = [
	'v',
	'f',
	'k',
	'du',
	'dv',
	'dt',
	'n',
	'w',
	'boundary',
	'mask',
	'initial',
	'seed',
	'integrator',
	'display',
	'palette',
	'panel'
] as const;

function key(name: (typeof OWNED_KEYS)[number]): string {
	return `${REACTION_DIFFUSION_QUERY_PREFIX}${name}`;
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

export function clearReactionDiffusionUrlState(
	source?: string | URL | URLSearchParams
): URLSearchParams {
	const params = sourceParams(source);
	for (const owned of OWNED_KEYS) params.delete(key(owned));
	return params;
}

export function encodeReactionDiffusionUrlState(
	state: Readonly<ReactionDiffusionUrlState>,
	source?: string | URL | URLSearchParams
): URLSearchParams {
	const normalized = normalizeSetup(state.setup, DEFAULT_REACTION_DIFFUSION_SETUP).setup;
	const params = clearReactionDiffusionUrlState(source);
	params.set(key('v'), String(REACTION_DIFFUSION_SCHEMA_VERSION));
	params.set(key('f'), numberText(normalized.feed));
	params.set(key('k'), numberText(normalized.kill));
	params.set(key('du'), numberText(normalized.diffusionU));
	params.set(key('dv'), numberText(normalized.diffusionV));
	params.set(key('dt'), numberText(normalized.timestep));
	params.set(key('n'), String(normalized.gridSize));
	params.set(key('w'), numberText(normalized.domainWidth));
	params.set(key('boundary'), normalized.boundary);
	params.set(key('mask'), normalized.maskPreset);
	params.set(key('initial'), normalized.initialCondition);
	params.set(key('seed'), normalized.seed);
	params.set(key('integrator'), normalized.integrator);
	params.set(key('display'), state.displayMode ?? 'v');
	params.set(key('palette'), state.palette ?? 'mineral');
	const selectedPanel = canonicalPanel(state.selectedPanel ?? 'laboratory') ?? 'laboratory';
	params.set(key('panel'), selectedPanel);
	if (params.toString().length > MAX_SHARE_URL_LENGTH) {
		throw new RangeError(
			`Reaction–diffusion URL state exceeds ${MAX_SHARE_URL_LENGTH} characters.`
		);
	}
	return params;
}

function numericText(value: string | null): number | string | undefined {
	if (value === null) return undefined;
	if (value.length > 64 || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/iu.test(value)) {
		return value;
	}
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : value;
}

function readDisplay(value: string | null, issues: string[]): DisplayMode {
	if (value === null) return 'v';
	if (DISPLAY_MODES.has(value as DisplayMode)) return value as DisplayMode;
	issues.push('The shared display mode was not recognised; V view was restored.');
	return 'v';
}

function readPalette(value: string | null, issues: string[]): PaletteId {
	if (value === null) return 'mineral';
	if (PALETTES.has(value as PaletteId)) return value as PaletteId;
	issues.push('The shared palette was not recognised; the mineral palette was restored.');
	return 'mineral';
}

function canonicalPanel(value: string): ReactionDiffusionPanel | null {
	if (PANELS.has(value as ReactionDiffusionPanel)) return value as ReactionDiffusionPanel;
	return LEGACY_PANEL_ALIASES[value] ?? null;
}

function readPanel(value: string | null, issues: string[]): ReactionDiffusionPanel {
	if (value === null) return 'laboratory';
	const panel = canonicalPanel(value);
	if (panel) return panel;
	issues.push('The shared instrument panel was not recognised; the laboratory panel was restored.');
	return 'laboratory';
}

export function decodeReactionDiffusionUrlState(
	source: string | URL | URLSearchParams,
	fallback: Readonly<GrayScottSetup> = DEFAULT_REACTION_DIFFUSION_SETUP
): UrlDecodeResult {
	const raw =
		typeof source === 'string'
			? source.includes('?')
				? source.slice(source.indexOf('?') + 1).split('#', 1)[0]
				: source.replace(/^\?/u, '')
			: source instanceof URL
				? source.search.slice(1)
				: source.toString();
	if (raw.length > MAX_SHARE_URL_LENGTH) {
		return {
			setup: cloneSetup(fallback),
			displayMode: 'v',
			palette: 'mineral',
			selectedPanel: 'laboratory',
			issues: [`Shared setup exceeds the ${MAX_SHARE_URL_LENGTH}-character safety limit.`],
			unsupportedVersion: false
		};
	}
	const params = new URLSearchParams(raw);
	const rawVersion = params.get(key('v'));
	if (rawVersion !== null && Number(rawVersion) !== REACTION_DIFFUSION_SCHEMA_VERSION) {
		return {
			setup: cloneSetup(fallback),
			displayMode: 'v',
			palette: 'mineral',
			selectedPanel: 'laboratory',
			issues: [
				`This setup uses unsupported schema ${rawVersion}; version ${REACTION_DIFFUSION_SCHEMA_VERSION} defaults were restored.`
			],
			unsupportedVersion: true
		};
	}
	const normalized = normalizeSetup(
		{
			feed: numericText(params.get(key('f'))),
			kill: numericText(params.get(key('k'))),
			diffusionU: numericText(params.get(key('du'))),
			diffusionV: numericText(params.get(key('dv'))),
			timestep: numericText(params.get(key('dt'))),
			gridSize: numericText(params.get(key('n'))),
			domainWidth: numericText(params.get(key('w'))),
			boundary: params.get(key('boundary')) ?? undefined,
			maskPreset: params.get(key('mask')) ?? undefined,
			initialCondition: params.get(key('initial')) ?? undefined,
			seed: params.get(key('seed')) ?? undefined,
			integrator: params.get(key('integrator')) ?? undefined
		},
		fallback
	);
	const issues = [...normalized.issues];
	const displayMode = readDisplay(params.get(key('display')), issues);
	const palette = readPalette(params.get(key('palette')), issues);
	const selectedPanel = readPanel(params.get(key('panel')), issues);
	return {
		setup: normalized.setup,
		displayMode,
		palette,
		selectedPanel,
		issues,
		unsupportedVersion: false
	};
}

export function buildReactionDiffusionShareUrl(
	baseUrl: string | URL,
	state: Readonly<ReactionDiffusionUrlState>
): string {
	const url = new URL(baseUrl.toString());
	url.search = encodeReactionDiffusionUrlState(state, url.searchParams).toString();
	return url.toString();
}

export const encodeReactionDiffusionUrl = encodeReactionDiffusionUrlState;
export const decodeReactionDiffusionUrl = decodeReactionDiffusionUrlState;
