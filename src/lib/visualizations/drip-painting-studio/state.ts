import { createNextSeed as nextSeedFromPrng, normalizeSeed } from './prng.ts';
import {
	CURATED_DEFAULT_SEED,
	CURATED_STUDY_SEEDS,
	DEFAULT_ARTBOARD_HEIGHT,
	DEFAULT_ARTBOARD_WIDTH,
	DEFAULT_DRIP_STATE,
	DEFAULT_VIEW_STATE,
	DRIP_GENERATOR_VERSION,
	MAX_FLOW,
	MAX_LAYERS,
	MAX_PAINTING_TIME,
	MAX_PASSES,
	MAX_SWEEP,
	MAX_TEXTURE,
	MIN_FLOW,
	MIN_LAYERS,
	MIN_PAINTING_TIME,
	MIN_PASSES,
	MIN_SWEEP,
	MIN_TEXTURE,
	PRESET_SPECS,
	type ArtboardSpec,
	type CropRect,
	type DripPaintingState,
	type PresetId,
	type StagePlacement,
	type StudyId,
	type ViewMode,
	type ViewState
} from './types.ts';

export const DRIP_STORAGE_KEY = 'drip-painting-studio.state.v1';
export const MAX_UNDO_HISTORY = 24;

const VALID_STUDIES: readonly StudyId[] = [
	'pending-file',
	'public-works-tenders',
	'counter-middleman',
	'whitewash-record'
];
const VALID_VIEW_MODES: readonly ViewMode[] = ['fill', 'fit', 'inspect'];

function clamp(v: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, v));
}

function parseFiniteNumber(raw: unknown, fallback: number): number {
	if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
	if (typeof raw === 'string' && raw.trim() !== '') {
		const parsed = Number(raw);
		if (Number.isFinite(parsed)) return parsed;
	}
	return fallback;
}

export function normalizeStudy(
	raw: unknown,
	fallback: StudyId = DEFAULT_DRIP_STATE.study
): StudyId {
	if (typeof raw === 'string' && (VALID_STUDIES as readonly string[]).includes(raw)) {
		return raw as StudyId;
	}
	return fallback;
}

export function normalizeArtboardDimension(raw: unknown, fallback: number): number {
	const parsed = Math.round(parseFiniteNumber(raw, fallback));
	return clamp(parsed, 600, 1600);
}

export function createDefaultState(artboard?: Partial<ArtboardSpec>): DripPaintingState {
	const artboardWidth = normalizeArtboardDimension(artboard?.artboardWidth, DEFAULT_ARTBOARD_WIDTH);
	const artboardHeight = normalizeArtboardDimension(
		artboard?.artboardHeight,
		DEFAULT_ARTBOARD_HEIGHT
	);
	return {
		...DEFAULT_DRIP_STATE,
		artboardWidth,
		artboardHeight
	};
}

export function normalizeState(
	partial?: Partial<Record<keyof DripPaintingState, unknown>>,
	fallback?: Partial<Record<keyof DripPaintingState, unknown>>
): DripPaintingState {
	const base = fallback !== undefined ? normalizeState(fallback) : DEFAULT_DRIP_STATE;
	const study = normalizeStudy(partial?.study, base.study);
	const fallbackSeed =
		fallback !== undefined ? base.seed : (CURATED_STUDY_SEEDS[study] ?? CURATED_DEFAULT_SEED);
	const seed = normalizeSeed(partial?.seed, fallbackSeed);

	const passes = Math.round(
		clamp(parseFiniteNumber(partial?.passes, base.passes), MIN_PASSES, MAX_PASSES)
	);
	const paintFlow = Math.round(
		clamp(parseFiniteNumber(partial?.paintFlow, base.paintFlow), MIN_FLOW, MAX_FLOW)
	);
	const sweepWidth = Math.round(
		clamp(parseFiniteNumber(partial?.sweepWidth, base.sweepWidth), MIN_SWEEP, MAX_SWEEP)
	);
	const paintLayers = Math.round(
		clamp(parseFiniteNumber(partial?.paintLayers, base.paintLayers), MIN_LAYERS, MAX_LAYERS)
	);
	const paintTexture = Math.round(
		clamp(parseFiniteNumber(partial?.paintTexture, base.paintTexture), MIN_TEXTURE, MAX_TEXTURE)
	);
	const paintingTime = Math.round(
		clamp(
			parseFiniteNumber(partial?.paintingTime, base.paintingTime),
			MIN_PAINTING_TIME,
			MAX_PAINTING_TIME
		)
	);
	const artboardWidth = normalizeArtboardDimension(partial?.artboardWidth, base.artboardWidth);
	const artboardHeight = normalizeArtboardDimension(partial?.artboardHeight, base.artboardHeight);

	return {
		version: DRIP_GENERATOR_VERSION,
		seed,
		study,
		passes,
		paintFlow,
		sweepWidth,
		paintLayers,
		paintTexture,
		paintingTime,
		artboardWidth,
		artboardHeight
	};
}

export function normalizeViewState(partial?: Partial<Record<keyof ViewState, unknown>>): ViewState {
	const base = DEFAULT_VIEW_STATE;
	const modeRaw = partial?.mode;
	const mode: ViewMode =
		typeof modeRaw === 'string' && (VALID_VIEW_MODES as readonly string[]).includes(modeRaw)
			? (modeRaw as ViewMode)
			: base.mode;
	const inspectZoom = Number(
		clamp(parseFiniteNumber(partial?.inspectZoom, base.inspectZoom), 2.0, 5.0).toFixed(2)
	);
	const halfSpan = 0.5 / inspectZoom;
	const inspectCenterX = Number(
		clamp(
			parseFiniteNumber(partial?.inspectCenterX, base.inspectCenterX),
			halfSpan,
			1 - halfSpan
		).toFixed(4)
	);
	const inspectCenterY = Number(
		clamp(
			parseFiniteNumber(partial?.inspectCenterY, base.inspectCenterY),
			halfSpan,
			1 - halfSpan
		).toFixed(4)
	);

	return {
		mode,
		inspectZoom,
		inspectCenterX,
		inspectCenterY
	};
}

export function statesEqual(a: DripPaintingState, b: DripPaintingState): boolean {
	return (
		a.version === b.version &&
		a.seed === b.seed &&
		a.study === b.study &&
		a.passes === b.passes &&
		a.paintFlow === b.paintFlow &&
		a.sweepWidth === b.sweepWidth &&
		a.paintLayers === b.paintLayers &&
		a.paintTexture === b.paintTexture &&
		a.paintingTime === b.paintingTime &&
		a.artboardWidth === b.artboardWidth &&
		a.artboardHeight === b.artboardHeight
	);
}

export function applyPreset(state: DripPaintingState, presetId: PresetId): DripPaintingState {
	const normalized = normalizeState(state);
	const spec = PRESET_SPECS.find((p) => p.id === presetId);
	if (!spec) return normalized;
	return {
		...normalized,
		passes: spec.parameters.passes,
		paintFlow: spec.parameters.paintFlow,
		sweepWidth: spec.parameters.sweepWidth,
		paintLayers: spec.parameters.paintLayers,
		paintTexture: spec.parameters.paintTexture
	};
}

export function findMatchingPreset(state: DripPaintingState): PresetId | null {
	const s = normalizeState(state);
	for (const spec of PRESET_SPECS) {
		const p = spec.parameters;
		if (
			s.passes === p.passes &&
			s.paintFlow === p.paintFlow &&
			s.sweepWidth === p.sweepWidth &&
			s.paintLayers === p.paintLayers &&
			s.paintTexture === p.paintTexture
		) {
			return spec.id;
		}
	}
	return null;
}

export function createNextSeed(currentSeed: number, step = 1): number {
	return nextSeedFromPrng(currentSeed, step);
}

export function chooseArtboardForViewport(width: number, height: number): ArtboardSpec {
	if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
		return {
			artboardWidth: DEFAULT_ARTBOARD_WIDTH,
			artboardHeight: DEFAULT_ARTBOARD_HEIGHT
		};
	}
	const ratio = width / height;
	if (ratio < 0.88) {
		return { artboardWidth: 960, artboardHeight: 1080 };
	}
	if (ratio < 1.15) {
		return { artboardWidth: 1080, artboardHeight: 900 };
	}
	return {
		artboardWidth: DEFAULT_ARTBOARD_WIDTH,
		artboardHeight: DEFAULT_ARTBOARD_HEIGHT
	};
}

export function computeUniformStagePlacement(
	stageW: number,
	stageH: number,
	artboardW: number,
	artboardH: number,
	fitMode: 'fill' | 'fit' = 'fill'
): StagePlacement {
	const sw = Math.max(1, Number.isFinite(stageW) ? stageW : 1);
	const sh = Math.max(1, Number.isFinite(stageH) ? stageH : 1);
	const aw = Math.max(1, Number.isFinite(artboardW) ? artboardW : DEFAULT_ARTBOARD_WIDTH);
	const ah = Math.max(1, Number.isFinite(artboardH) ? artboardH : DEFAULT_ARTBOARD_HEIGHT);

	const fitPadding = fitMode === 'fit' ? 0.92 : 1.0;
	const scale =
		fitMode === 'fill'
			? Math.max(sw / aw, sh / ah)
			: Math.min((sw * fitPadding) / aw, (sh * fitPadding) / ah);

	const cssWidth = Math.max(1, Math.round(aw * scale));
	const cssHeight = Math.max(1, Math.round(ah * scale));
	const offsetX = Math.round((sw - cssWidth) * 0.5);
	const offsetY = Math.round((sh - cssHeight) * 0.5);

	return {
		cssWidth,
		cssHeight,
		offsetX,
		offsetY,
		scale
	};
}

export function computeInspectCropRect(
	artboard: ArtboardSpec,
	zoom: number,
	centerX: number,
	centerY: number,
	viewportWidth = artboard.artboardWidth,
	viewportHeight = artboard.artboardHeight
): CropRect {
	const aw =
		Number.isFinite(artboard.artboardWidth) && artboard.artboardWidth > 0
			? Math.max(200, Math.round(artboard.artboardWidth))
			: DEFAULT_ARTBOARD_WIDTH;
	const ah =
		Number.isFinite(artboard.artboardHeight) && artboard.artboardHeight > 0
			? Math.max(200, Math.round(artboard.artboardHeight))
			: DEFAULT_ARTBOARD_HEIGHT;
	const clampedZoom = clamp(Number.isFinite(zoom) ? zoom : 3.5, 2.0, 5.0);
	const vpRatio =
		viewportWidth > 0 &&
		viewportHeight > 0 &&
		Number.isFinite(viewportWidth) &&
		Number.isFinite(viewportHeight)
			? clamp(viewportWidth / viewportHeight, 0.45, 2.6)
			: aw / ah;

	let cropW = aw / clampedZoom;
	let cropH = cropW / vpRatio;
	if (cropH > ah / 1.5) {
		cropH = ah / clampedZoom;
		cropW = cropH * vpRatio;
	}
	cropW = Math.min(aw, Math.max(Math.min(120, aw), cropW));
	cropH = Math.min(ah, Math.max(Math.min(90, ah), cropH));

	const halfW = cropW * 0.5;
	const halfH = cropH * 0.5;
	const cxNorm = Number.isFinite(centerX) ? centerX : 0.5;
	const cyNorm = Number.isFinite(centerY) ? centerY : 0.5;
	const cx = clamp(cxNorm * aw, halfW, aw - halfW);
	const cy = clamp(cyNorm * ah, halfH, ah - halfH);

	return {
		x: cx - halfW,
		y: cy - halfH,
		width: cropW,
		height: cropH
	};
}

export function serializeStateParams(
	state: DripPaintingState,
	view?: { overlayView?: 'painting' | 'article'; viewState?: ViewState }
): URLSearchParams {
	const s = normalizeState(state);
	const params = new URLSearchParams();
	params.set('v', String(DRIP_GENERATOR_VERSION));
	params.set('st', s.study);
	params.set('s', String(s.seed));
	params.set('p', String(s.passes));
	params.set('pf', String(s.paintFlow));
	params.set('sw', String(s.sweepWidth));
	params.set('pl', String(s.paintLayers));
	params.set('pt', String(s.paintTexture));
	params.set('t', String(s.paintingTime));
	params.set('aw', String(s.artboardWidth));
	params.set('ah', String(s.artboardHeight));

	if (view?.viewState && view.viewState.mode !== 'fill') {
		params.set('vm', view.viewState.mode);
		if (view.viewState.mode === 'inspect') {
			params.set('iz', view.viewState.inspectZoom.toFixed(2));
			params.set('ix', view.viewState.inspectCenterX.toFixed(3));
			params.set('iy', view.viewState.inspectCenterY.toFixed(3));
		}
	}

	if (view?.overlayView === 'article') {
		params.set('view', 'article');
	}
	return params;
}

export function serializeStateQuery(
	state: DripPaintingState,
	view?: { overlayView?: 'painting' | 'article'; viewState?: ViewState }
): string {
	return serializeStateParams(state, view).toString();
}

export interface DeserializedDripUrl {
	readonly state: DripPaintingState;
	readonly viewState: ViewState;
	readonly hasExplicitState: boolean;
	readonly hasExplicitView: boolean;
	readonly initialOverlay: 'painting' | 'article';
}

export function deserializeStateParams(
	search: URLSearchParams | string,
	fallback?: Partial<DripPaintingState>
): DeserializedDripUrl {
	const params = typeof search === 'string' ? new URLSearchParams(search) : search;
	const stateKeys = ['st', 's', 'p', 'pf', 'sw', 'pl', 'pt', 't', 'aw', 'ah'] as const;
	const hasExplicitState = stateKeys.some((k) => params.has(k));
	const hasExplicitView =
		params.has('vm') || params.has('iz') || params.has('ix') || params.has('iy');
	const initialOverlay = params.get('view') === 'article' ? 'article' : 'painting';

	const base = normalizeState(fallback);

	const state = hasExplicitState
		? normalizeState(
				{
					study: params.get('st') ?? undefined,
					seed: params.get('s') ?? undefined,
					passes: params.get('p') ?? undefined,
					paintFlow: params.get('pf') ?? undefined,
					sweepWidth: params.get('sw') ?? undefined,
					paintLayers: params.get('pl') ?? undefined,
					paintTexture: params.get('pt') ?? undefined,
					paintingTime: params.get('t') ?? undefined,
					artboardWidth: params.get('aw') ?? undefined,
					artboardHeight: params.get('ah') ?? undefined
				},
				base
			)
		: base;

	const viewState = hasExplicitView
		? normalizeViewState({
				mode: params.get('vm') ?? 'fill',
				inspectZoom: params.get('iz') ?? undefined,
				inspectCenterX: params.get('ix') ?? undefined,
				inspectCenterY: params.get('iy') ?? undefined
			})
		: { ...DEFAULT_VIEW_STATE };

	return {
		state,
		viewState,
		hasExplicitState,
		hasExplicitView,
		initialOverlay
	};
}

export function saveStateToStorage(state: DripPaintingState): boolean {
	try {
		if (typeof globalThis.localStorage === 'undefined') return false;
		const normalized = normalizeState(state);
		globalThis.localStorage.setItem(DRIP_STORAGE_KEY, JSON.stringify(normalized));
		return true;
	} catch {
		return false;
	}
}

export function loadStateFromStorage(): DripPaintingState | null {
	try {
		if (typeof globalThis.localStorage === 'undefined') return null;
		const raw = globalThis.localStorage.getItem(DRIP_STORAGE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as unknown;
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
		const record = parsed as Record<string, unknown>;
		if (record.version !== DRIP_GENERATOR_VERSION) return null;
		return normalizeState(record as Partial<Record<keyof DripPaintingState, unknown>>);
	} catch {
		return null;
	}
}

export function clearStateFromStorage(): void {
	try {
		if (typeof globalThis.localStorage === 'undefined') return;
		globalThis.localStorage.removeItem(DRIP_STORAGE_KEY);
	} catch {
		// Ignore unavailable browser storage.
	}
}
