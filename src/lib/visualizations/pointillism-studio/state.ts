import { createNextSeed as nextSeedFromPrng, normalizeSeed } from './prng.ts';
import {
	CURATED_SCENE_SEEDS,
	DEFAULT_ARTBOARD_HEIGHT,
	DEFAULT_ARTBOARD_WIDTH,
	DEFAULT_POINTILLISM_STATE,
	DEFAULT_VIEW_STATE,
	INITIAL_CURATED_SEED,
	POINTILLISM_GENERATOR_VERSION,
	SCENE_FAMILIES,
	type CropRect,
	type PointillismState,
	type SceneFamilyId,
	type ViewMode,
	type ViewState
} from './types.ts';

export const POINTILLISM_STORAGE_KEY = 'pointillism-studio.state.v1';
export const MAX_UNDO_HISTORY = 24;

const VALID_FAMILIES: readonly SceneFamilyId[] = SCENE_FAMILIES.map((f) => f.id);
const VALID_VIEW_MODES: readonly ViewMode[] = ['fill', 'fit', 'inspect'];

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

export function normalizeSceneFamily(
	raw: unknown,
	fallback: SceneFamilyId = DEFAULT_POINTILLISM_STATE.sceneFamily
): SceneFamilyId {
	if (typeof raw === 'string' && (VALID_FAMILIES as readonly string[]).includes(raw)) {
		return raw as SceneFamilyId;
	}
	return fallback;
}

export function normalizeArtboardDimension(raw: unknown, fallback: number): number {
	const parsed = Math.round(parseFiniteNumber(raw, fallback));
	return clamp(parsed, 600, 1600);
}

/**
 * Chooses a curated logical artboard size when creating a new painting or resetting on a viewport,
 * keeping horizontal scenes roomy while adapting gently to portrait, square, or landscape screens.
 */
export function chooseArtboardForViewport(
	viewportWidth: number,
	viewportHeight: number
): { artboardWidth: number; artboardHeight: number } {
	if (
		!Number.isFinite(viewportWidth) ||
		!Number.isFinite(viewportHeight) ||
		viewportWidth <= 0 ||
		viewportHeight <= 0
	) {
		return {
			artboardWidth: DEFAULT_ARTBOARD_WIDTH,
			artboardHeight: DEFAULT_ARTBOARD_HEIGHT
		};
	}
	const ratio = viewportWidth / viewportHeight;
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

export function normalizeState(
	partial?: Partial<Record<keyof PointillismState, unknown>>
): PointillismState {
	const base = DEFAULT_POINTILLISM_STATE;
	const sceneFamily = normalizeSceneFamily(partial?.sceneFamily, base.sceneFamily);
	const fallbackSeed = CURATED_SCENE_SEEDS[sceneFamily] ?? INITIAL_CURATED_SEED;
	const seed = normalizeSeed(partial?.seed, fallbackSeed);

	const dotSize = Math.round(clamp(parseFiniteNumber(partial?.dotSize, base.dotSize), 0, 100));
	const dotSpacing = Math.round(
		clamp(parseFiniteNumber(partial?.dotSpacing, base.dotSpacing), 0, 100)
	);
	const paletteContrast = Math.round(
		clamp(parseFiniteNumber(partial?.paletteContrast, base.paletteContrast), 0, 100)
	);
	const colorVariation = Math.round(
		clamp(parseFiniteNumber(partial?.colorVariation, base.colorVariation), 0, 100)
	);
	const paintTexture = Math.round(
		clamp(parseFiniteNumber(partial?.paintTexture, base.paintTexture), 0, 100)
	);
	const paintingTime = Math.round(
		clamp(parseFiniteNumber(partial?.paintingTime, base.paintingTime), 4, 20)
	);
	const artboardWidth = normalizeArtboardDimension(partial?.artboardWidth, base.artboardWidth);
	const artboardHeight = normalizeArtboardDimension(partial?.artboardHeight, base.artboardHeight);

	return {
		version: POINTILLISM_GENERATOR_VERSION,
		seed,
		sceneFamily,
		dotSize,
		dotSpacing,
		paletteContrast,
		colorVariation,
		paintTexture,
		paintingTime,
		artboardWidth,
		artboardHeight
	};
}

export function normalizeViewState(
	partial?: Partial<Record<keyof ViewState, unknown>>
): ViewState {
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

/**
 * Computes the logical artboard CropRect shown in Inspect-dots mode so zoomed inspection
 * renders the exact same mark subset at higher magnification without inventing extra dots.
 */
export function computeInspectCropRect(
	artboardWidth: number,
	artboardHeight: number,
	view: ViewState,
	viewportWidth = artboardWidth,
	viewportHeight = artboardHeight
): CropRect {
	const zoom = clamp(view.inspectZoom, 2.0, 5.0);
	const vpRatio =
		viewportWidth > 0 && viewportHeight > 0
			? clamp(viewportWidth / viewportHeight, 0.45, 2.6)
			: artboardWidth / artboardHeight;
	const artRatio = artboardWidth / artboardHeight;

	let cropW = artboardWidth / zoom;
	let cropH = cropW / vpRatio;
	if (cropH > artboardHeight / 1.5) {
		cropH = artboardHeight / zoom;
		cropW = cropH * vpRatio;
	}
	cropW = Math.min(artboardWidth, Math.max(120, cropW));
	cropH = Math.min(artboardHeight, Math.max(90, cropH));
	void artRatio;

	const halfW = cropW * 0.5;
	const halfH = cropH * 0.5;
	const cx = clamp(view.inspectCenterX * artboardWidth, halfW, artboardWidth - halfW);
	const cy = clamp(view.inspectCenterY * artboardHeight, halfH, artboardHeight - halfH);

	return {
		x: cx - halfW,
		y: cy - halfH,
		width: cropW,
		height: cropH
	};
}

/**
 * Computes uniform display dimensions and offsets for Fill-screen and Fit-painting modes.
 * Never stretches the logical artboard non-uniformly.
 */
export function computeUniformStagePlacement(
	artboardWidth: number,
	artboardHeight: number,
	stageWidth: number,
	stageHeight: number,
	mode: 'fill' | 'fit'
): {
	cssWidth: number;
	cssHeight: number;
	offsetX: number;
	offsetY: number;
	scale: number;
} {
	const sw = Math.max(1, stageWidth);
	const sh = Math.max(1, stageHeight);
	const aw = Math.max(1, artboardWidth);
	const ah = Math.max(1, artboardHeight);

	const fitPadding = mode === 'fit' ? 0.92 : 1.0;
	const scale =
		mode === 'fill'
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

export function nextPaintingSeed(currentSeed: number, step = 1): number {
	const candidate = nextSeedFromPrng(currentSeed, step);
	if (candidate === currentSeed) {
		return ((candidate + 15485863) % 899_999) + 100_000;
	}
	return candidate;
}

export function statesEqual(a: PointillismState, b: PointillismState): boolean {
	return (
		a.seed === b.seed &&
		a.sceneFamily === b.sceneFamily &&
		a.dotSize === b.dotSize &&
		a.dotSpacing === b.dotSpacing &&
		a.paletteContrast === b.paletteContrast &&
		a.colorVariation === b.colorVariation &&
		a.paintTexture === b.paintTexture &&
		a.paintingTime === b.paintingTime &&
		a.artboardWidth === b.artboardWidth &&
		a.artboardHeight === b.artboardHeight
	);
}

export function serializeStateParams(
	state: PointillismState,
	options?: { overlayView?: 'painting' | 'article'; viewState?: ViewState }
): URLSearchParams {
	const s = normalizeState(state);
	const params = new URLSearchParams();
	params.set('v', String(POINTILLISM_GENERATOR_VERSION));
	params.set('sf', s.sceneFamily);
	params.set('s', String(s.seed));
	params.set('ds', String(s.dotSize));
	params.set('sp', String(s.dotSpacing));
	params.set('pc', String(s.paletteContrast));
	params.set('cv', String(s.colorVariation));
	params.set('pt', String(s.paintTexture));
	params.set('t', String(s.paintingTime));
	params.set('aw', String(s.artboardWidth));
	params.set('ah', String(s.artboardHeight));

	if (options?.viewState && options.viewState.mode !== 'fill') {
		params.set('vm', options.viewState.mode);
		if (options.viewState.mode === 'inspect') {
			params.set('iz', options.viewState.inspectZoom.toFixed(2));
			params.set('ix', options.viewState.inspectCenterX.toFixed(3));
			params.set('iy', options.viewState.inspectCenterY.toFixed(3));
		}
	}

	if (options?.overlayView === 'article') {
		params.set('view', 'article');
	}
	return params;
}

export function serializeStateQuery(
	state: PointillismState,
	options?: { overlayView?: 'painting' | 'article'; viewState?: ViewState }
): string {
	return serializeStateParams(state, options).toString();
}

export interface DeserializedPointillismUrl {
	readonly state: PointillismState;
	readonly viewState: ViewState;
	readonly hasExplicitState: boolean;
	readonly hasExplicitView: boolean;
	readonly initialOverlay: 'painting' | 'article';
}

export function deserializeStateParams(
	input: URLSearchParams | string
): DeserializedPointillismUrl {
	const params = typeof input === 'string' ? new URLSearchParams(input) : input;
	const stateKeys = ['sf', 's', 'ds', 'sp', 'pc', 'cv', 'pt', 't', 'aw', 'ah'] as const;
	const hasExplicitState = stateKeys.some((k) => params.has(k));
	const hasExplicitView = params.has('vm') || params.has('iz') || params.has('ix') || params.has('iy');
	const initialOverlay = params.get('view') === 'article' ? 'article' : 'painting';

	const state = hasExplicitState
		? normalizeState({
				sceneFamily: params.get('sf') ?? undefined,
				seed: params.get('s') ?? undefined,
				dotSize: params.get('ds') ?? undefined,
				dotSpacing: params.get('sp') ?? undefined,
				paletteContrast: params.get('pc') ?? undefined,
				colorVariation: params.get('cv') ?? undefined,
				paintTexture: params.get('pt') ?? undefined,
				paintingTime: params.get('t') ?? undefined,
				artboardWidth: params.get('aw') ?? undefined,
				artboardHeight: params.get('ah') ?? undefined
			})
		: { ...DEFAULT_POINTILLISM_STATE };

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

export function saveStateToStorage(state: PointillismState): boolean {
	try {
		if (typeof globalThis.localStorage === 'undefined') return false;
		const normalized = normalizeState(state);
		globalThis.localStorage.setItem(POINTILLISM_STORAGE_KEY, JSON.stringify(normalized));
		return true;
	} catch {
		return false;
	}
}

export function loadStateFromStorage(): PointillismState | null {
	try {
		if (typeof globalThis.localStorage === 'undefined') return null;
		const raw = globalThis.localStorage.getItem(POINTILLISM_STORAGE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as Record<string, unknown>;
		if (!parsed || typeof parsed !== 'object') return null;
		return normalizeState(parsed as Partial<Record<keyof PointillismState, unknown>>);
	} catch {
		return null;
	}
}

export function clearStateFromStorage(): void {
	try {
		if (typeof globalThis.localStorage === 'undefined') return;
		globalThis.localStorage.removeItem(POINTILLISM_STORAGE_KEY);
	} catch {
		// Ignore unavailable browser storage.
	}
}
