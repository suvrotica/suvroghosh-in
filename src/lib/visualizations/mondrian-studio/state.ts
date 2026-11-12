import { assignColors, describeComposition } from './colors.ts';
import { generateLayout } from './layout.ts';
import { avalanche32, normalizeSeed } from './prng.ts';
import {
	DEFAULT_ASPECT_RATIO,
	DEFAULT_MONDRIAN_STATE,
	INITIAL_CURATED_SEED,
	MAX_PANELS,
	MIN_PANELS,
	MONDRIAN_GENERATOR_VERSION,
	MONDRIAN_PRESETS,
	type ColorEmphasis,
	type CompositionModel,
	type MondrianParameters,
	type MondrianState,
	type PresetId
} from './types.ts';

export const MONDRIAN_STORAGE_KEY = 'mondrian-studio.state.v1';
export const MAX_UNDO_HISTORY = 24;

const VALID_EMPHASIS: readonly ColorEmphasis[] = ['balanced', 'red', 'yellow', 'blue'];

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function parseFiniteNumber(raw: unknown, fallback: number): number {
	if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
	if (typeof raw === 'string' && raw.trim() !== '') {
		const parsed = Number(raw);
		if (Number.isFinite(parsed)) return parsed;
	}
	return fallback;
}

export function normalizeColorEmphasis(raw: unknown, fallback: ColorEmphasis = 'balanced'): ColorEmphasis {
	if (typeof raw === 'string' && (VALID_EMPHASIS as readonly string[]).includes(raw)) {
		return raw as ColorEmphasis;
	}
	return fallback;
}

export function normalizeParameters(partial?: Partial<Record<keyof MondrianParameters, unknown>>): MondrianParameters {
	const base = DEFAULT_MONDRIAN_STATE;
	const panels = Math.round(
		clamp(parseFiniteNumber(partial?.panels, base.panels), MIN_PANELS, MAX_PANELS)
	);
	const unevenSpacing = Math.round(
		clamp(parseFiniteNumber(partial?.unevenSpacing, base.unevenSpacing), 0, 100)
	);
	const colorArea = Math.round(
		clamp(parseFiniteNumber(partial?.colorArea, base.colorArea), 0, 60)
	);
	const rawLw = clamp(parseFiniteNumber(partial?.lineWidth, base.lineWidth), 0.25, 1.5);
	const lineWidth = Number((Math.round(rawLw / 0.05) * 0.05).toFixed(2));
	const paintTexture = Math.round(
		clamp(parseFiniteNumber(partial?.paintTexture, base.paintTexture), 0, 100)
	);
	const paintingTime = Math.round(
		clamp(parseFiniteNumber(partial?.paintingTime, base.paintingTime), 3, 18)
	);
	const colorEmphasis = normalizeColorEmphasis(partial?.colorEmphasis, base.colorEmphasis);

	return {
		panels,
		unevenSpacing,
		colorArea,
		lineWidth,
		paintTexture,
		paintingTime,
		colorEmphasis
	};
}

export function normalizeAspectRatio(raw: unknown, fallback = DEFAULT_ASPECT_RATIO): number {
	const num = parseFiniteNumber(raw, fallback);
	return Number(clamp(num, 0.15, 6.5).toFixed(4));
}

export function normalizeState(partial?: Partial<Record<keyof MondrianState, unknown>>): MondrianState {
	const seed = normalizeSeed(
		partial?.seed as number | string | undefined,
		INITIAL_CURATED_SEED
	);
	const aspectRatio = normalizeAspectRatio(partial?.aspectRatio, DEFAULT_ASPECT_RATIO);
	const params = normalizeParameters(partial);
	return {
		version: MONDRIAN_GENERATOR_VERSION,
		seed,
		aspectRatio,
		...params
	};
}

/**
 * Applies a documented preset while preserving the current seed and aspect ratio
 * so visitors can compare how parameter combinations reshape the same seed.
 */
export function applyPreset(currentState: MondrianState, presetId: PresetId): MondrianState {
	const preset = MONDRIAN_PRESETS.find((p) => p.id === presetId) ?? MONDRIAN_PRESETS[0]!;
	return {
		version: MONDRIAN_GENERATOR_VERSION,
		seed: currentState.seed,
		aspectRatio: currentState.aspectRatio,
		...preset.parameters
	};
}

export function findMatchingPreset(params: MondrianParameters): PresetId | null {
	for (const preset of MONDRIAN_PRESETS) {
		const p = preset.parameters;
		if (
			p.panels === params.panels &&
			p.unevenSpacing === params.unevenSpacing &&
			p.colorArea === params.colorArea &&
			Math.abs(p.lineWidth - params.lineWidth) < 1e-4 &&
			p.paintTexture === params.paintTexture &&
			p.paintingTime === params.paintingTime &&
			p.colorEmphasis === params.colorEmphasis
		) {
			return preset.id;
		}
	}
	return null;
}

export function createNextSeed(currentSeed: number, entropySalt = Date.now()): number {
	const mixed = avalanche32((normalizeSeed(currentSeed) ^ (entropySalt >>> 0)) + 0x9e3779b9);
	// Keep human-friendly 6-digit seeds in [100000, 999999] that never match currentSeed.
	let candidate = 100000 + (mixed % 900000);
	if (candidate === currentSeed) {
		candidate = 100000 + ((candidate + 137179) % 900000);
	}
	return candidate;
}

export function statesEqual(a: MondrianState, b: MondrianState): boolean {
	return (
		a.seed === b.seed &&
		a.panels === b.panels &&
		a.unevenSpacing === b.unevenSpacing &&
		a.colorArea === b.colorArea &&
		Math.abs(a.lineWidth - b.lineWidth) < 1e-4 &&
		a.paintTexture === b.paintTexture &&
		a.paintingTime === b.paintingTime &&
		a.colorEmphasis === b.colorEmphasis
	);
}

export function serializeStateParams(
	state: MondrianState,
	options?: { view?: 'painting' | 'article' }
): URLSearchParams {
	const normalized = normalizeState(state);
	const params = new URLSearchParams();
	params.set('v', String(MONDRIAN_GENERATOR_VERSION));
	params.set('s', String(normalized.seed));
	params.set('p', String(normalized.panels));
	params.set('u', String(normalized.unevenSpacing));
	params.set('ca', String(normalized.colorArea));
	params.set('lw', String(normalized.lineWidth));
	params.set('pt', String(normalized.paintTexture));
	params.set('t', String(normalized.paintingTime));
	params.set('ce', normalized.colorEmphasis);
	params.set('ar', normalized.aspectRatio.toFixed(3));
	if (options?.view === 'article') {
		params.set('view', 'article');
	}
	return params;
}

export function serializeStateQuery(
	state: MondrianState,
	options?: { view?: 'painting' | 'article' }
): string {
	return serializeStateParams(state, options).toString();
}

export interface DeserializedUrlState {
	readonly state: MondrianState;
	readonly hasExplicitState: boolean;
	readonly savedAspectRatio: number | null;
	readonly initialView: 'painting' | 'article';
}

export function deserializeStateParams(
	input: URLSearchParams | string
): DeserializedUrlState {
	const params = typeof input === 'string' ? new URLSearchParams(input) : input;
	const stateKeys = ['s', 'p', 'u', 'ca', 'lw', 'pt', 't', 'ce', 'ar'] as const;
	const hasExplicitState = stateKeys.some((k) => params.has(k));
	const initialView = params.get('view') === 'article' ? 'article' : 'painting';

	if (!hasExplicitState) {
		return {
			state: { ...DEFAULT_MONDRIAN_STATE },
			hasExplicitState: false,
			savedAspectRatio: null,
			initialView
		};
	}

	const savedAr = params.has('ar') ? normalizeAspectRatio(params.get('ar')) : null;
	const state = normalizeState({
		seed: params.get('s') ?? INITIAL_CURATED_SEED,
		panels: params.get('p') ?? undefined,
		unevenSpacing: params.get('u') ?? undefined,
		colorArea: params.get('ca') ?? undefined,
		lineWidth: params.get('lw') ?? undefined,
		paintTexture: params.get('pt') ?? undefined,
		paintingTime: params.get('t') ?? undefined,
		colorEmphasis: params.get('ce') ?? undefined,
		aspectRatio: savedAr ?? DEFAULT_ASPECT_RATIO
	});

	return {
		state,
		hasExplicitState: true,
		savedAspectRatio: savedAr,
		initialView
	};
}

export interface StoredStateResult {
	readonly state: MondrianState;
	readonly savedAspectRatio: number | null;
}

export function saveStateToStorage(state: MondrianState): boolean {
	try {
		if (typeof globalThis.localStorage === 'undefined') return false;
		const normalized = normalizeState(state);
		globalThis.localStorage.setItem(MONDRIAN_STORAGE_KEY, JSON.stringify(normalized));
		return true;
	} catch {
		return false;
	}
}

export function loadStateFromStorage(): StoredStateResult | null {
	try {
		if (typeof globalThis.localStorage === 'undefined') return null;
		const raw = globalThis.localStorage.getItem(MONDRIAN_STORAGE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as Record<string, unknown>;
		if (!parsed || typeof parsed !== 'object') return null;
		const savedAspectRatio =
			parsed.aspectRatio !== undefined ? normalizeAspectRatio(parsed.aspectRatio) : null;
		const state = normalizeState(parsed as Partial<Record<keyof MondrianState, unknown>>);
		return { state, savedAspectRatio };
	} catch {
		return null;
	}
}

export function clearStateFromStorage(): void {
	try {
		if (typeof globalThis.localStorage === 'undefined') return;
		globalThis.localStorage.removeItem(MONDRIAN_STORAGE_KEY);
	} catch {
		// Ignore unavailable browser storage.
	}
}

/**
 * Builds the single authoritative composition model consumed by preview, playback, and export.
 */
export function buildCompositionModel(stateInput: MondrianState): CompositionModel {
	const state = normalizeState(stateInput);
	const layout = generateLayout({
		seed: state.seed,
		panels: state.panels,
		unevenSpacing: state.unevenSpacing,
		aspectRatio: state.aspectRatio,
		lineWidth: state.lineWidth
	});
	const colors = assignColors(layout, {
		colorArea: state.colorArea,
		colorEmphasis: state.colorEmphasis
	});
	const description = describeComposition(layout, colors);
	return {
		state,
		layout,
		colors,
		description
	};
}
