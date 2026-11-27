import { createNextSeed as nextSeedFromPrng, normalizeSeed } from './prng.ts';
import { STUDY_BY_ID } from './studies.ts';
import {
	ARTBOARDS,
	BOUNDS,
	COLOR_FIELD_GENERATOR_VERSION,
	CURATED_DEFAULT_SEED,
	CURATED_STUDY_SEEDS,
	DEFAULT_ARTBOARD_HEIGHT,
	DEFAULT_ARTBOARD_KEY,
	DEFAULT_ARTBOARD_WIDTH,
	DEFAULT_STATE,
	DEFAULT_VIEW_STATE,
	PRESET_SPECS,
	type ArtboardKey,
	type ArtboardSpec,
	type ColorFieldState,
	type CropRect,
	type PresetId,
	type StagePlacement,
	type StudyId,
	type ViewMode,
	type ViewState
} from './types.ts';

export const COLOR_FIELD_STORAGE_KEY = 'color-field-studio.state.v1';
export const MAX_UNDO_HISTORY = 24;

const VALID_STUDIES: readonly StudyId[] = [
	'rothko-nocturne',
	'frankenthaler-wash',
	'ochre-horizon',
	'cobalt-veil',
	'terra-stillness'
];
const VALID_ARTBOARDS: readonly ArtboardKey[] = ['landscape', 'square', 'portrait'];
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

export function normalizeStudy(raw: unknown, fallback: StudyId = DEFAULT_STATE.studyId): StudyId {
	if (typeof raw === 'string' && (VALID_STUDIES as readonly string[]).includes(raw)) {
		return raw as StudyId;
	}
	return fallback;
}

export function normalizeArtboard(
	raw: unknown,
	fallback: ArtboardKey = DEFAULT_ARTBOARD_KEY
): ArtboardKey {
	if (typeof raw === 'string' && (VALID_ARTBOARDS as readonly string[]).includes(raw)) {
		return raw as ArtboardKey;
	}
	return fallback;
}

function resolveArtboardByDimensions(w: number, h: number): ArtboardKey {
	const ratio = w / h;
	if (ratio < 1.0) return 'portrait';
	if (ratio < 1.32) return 'square';
	return 'landscape';
}

function resolveArtboardFromPartial(
	partial: Partial<Record<keyof ColorFieldState, unknown>> | undefined,
	fallbackKey: ArtboardKey
): ArtboardKey {
	const w = parseFiniteNumber(partial?.artboardWidth, Number.NaN);
	const h = parseFiniteNumber(partial?.artboardHeight, Number.NaN);
	const hasDims = Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0;

	if (partial?.artboard !== undefined) {
		const explicitKey = normalizeArtboard(partial.artboard, fallbackKey);
		if (hasDims && explicitKey === fallbackKey) {
			const spec = ARTBOARDS[explicitKey];
			const specRatio = spec.artboardWidth / spec.artboardHeight;
			if (Math.abs(w / h - specRatio) > 0.05) {
				return resolveArtboardByDimensions(w, h);
			}
		}
		return explicitKey;
	}
	if (hasDims) {
		return resolveArtboardByDimensions(w, h);
	}
	return fallbackKey;
}

export function createDefaultState(
	artboard?: ArtboardKey | Partial<ArtboardSpec>
): ColorFieldState {
	const key =
		typeof artboard === 'string'
			? normalizeArtboard(artboard)
			: artboard?.key
				? normalizeArtboard(artboard.key)
				: artboard?.artboardWidth && artboard?.artboardHeight
					? chooseArtboardForViewport(artboard.artboardWidth, artboard.artboardHeight).key
					: DEFAULT_ARTBOARD_KEY;
	const spec = ARTBOARDS[key];
	return {
		...DEFAULT_STATE,
		artboard: spec.key,
		artboardWidth: spec.artboardWidth,
		artboardHeight: spec.artboardHeight
	};
}

export function normalizeState(
	partial?: Partial<Record<keyof ColorFieldState, unknown>>,
	fallback?: Partial<Record<keyof ColorFieldState, unknown>>
): ColorFieldState {
	const base = fallback !== undefined ? normalizeState(fallback) : DEFAULT_STATE;
	const studyId = normalizeStudy(partial?.studyId, base.studyId);
	const fallbackSeed =
		fallback !== undefined
			? base.seed
			: (CURATED_STUDY_SEEDS[studyId] ?? STUDY_BY_ID[studyId]?.defaultSeed ?? CURATED_DEFAULT_SEED);
	const seed = normalizeSeed(partial?.seed, fallbackSeed);

	const areaCount = Math.round(
		clamp(
			parseFiniteNumber(partial?.areaCount, base.areaCount),
			BOUNDS.areaCount.min,
			BOUNDS.areaCount.max
		)
	);
	const areaSize = Math.round(
		clamp(
			parseFiniteNumber(partial?.areaSize, base.areaSize),
			BOUNDS.areaSize.min,
			BOUNDS.areaSize.max
		)
	);
	const edgeSoftness = Math.round(
		clamp(
			parseFiniteNumber(partial?.edgeSoftness, base.edgeSoftness),
			BOUNDS.edgeSoftness.min,
			BOUNDS.edgeSoftness.max
		)
	);
	const transparency = Math.round(
		clamp(
			parseFiniteNumber(partial?.transparency, base.transparency),
			BOUNDS.transparency.min,
			BOUNDS.transparency.max
		)
	);
	const canvasTexture = Math.round(
		clamp(
			parseFiniteNumber(partial?.canvasTexture, base.canvasTexture),
			BOUNDS.canvasTexture.min,
			BOUNDS.canvasTexture.max
		)
	);
	const paintingTime = Math.round(
		clamp(
			parseFiniteNumber(partial?.paintingTime, base.paintingTime),
			BOUNDS.paintingTime.min,
			BOUNDS.paintingTime.max
		)
	);

	const artboard = resolveArtboardFromPartial(partial, base.artboard);
	const artSpec = ARTBOARDS[artboard];

	return {
		version: COLOR_FIELD_GENERATOR_VERSION,
		generatorVersion: COLOR_FIELD_GENERATOR_VERSION,
		studyId,
		seed,
		areaCount,
		areaSize,
		edgeSoftness,
		transparency,
		canvasTexture,
		paintingTime,
		artboard: artSpec.key,
		artboardWidth: artSpec.artboardWidth,
		artboardHeight: artSpec.artboardHeight
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
		).toFixed(3)
	);
	const inspectCenterY = Number(
		clamp(
			parseFiniteNumber(partial?.inspectCenterY, base.inspectCenterY),
			halfSpan,
			1 - halfSpan
		).toFixed(3)
	);

	return {
		mode,
		inspectZoom,
		inspectCenterX,
		inspectCenterY
	};
}

export function setArtboard(state: ColorFieldState, artboardKey: ArtboardKey): ColorFieldState {
	const normalized = normalizeState(state);
	const key = normalizeArtboard(artboardKey, normalized.artboard);
	const spec = ARTBOARDS[key];
	return {
		...normalized,
		artboard: spec.key,
		artboardWidth: spec.artboardWidth,
		artboardHeight: spec.artboardHeight
	};
}

export function statesEqual(a: ColorFieldState, b: ColorFieldState): boolean {
	return (
		a.generatorVersion === b.generatorVersion &&
		a.studyId === b.studyId &&
		a.seed === b.seed &&
		a.areaCount === b.areaCount &&
		a.areaSize === b.areaSize &&
		a.edgeSoftness === b.edgeSoftness &&
		a.transparency === b.transparency &&
		a.canvasTexture === b.canvasTexture &&
		a.paintingTime === b.paintingTime &&
		a.artboard === b.artboard
	);
}

export function applyPreset(
	state: ColorFieldState,
	presetOrStudyId: PresetId | StudyId
): ColorFieldState {
	const normalized = normalizeState(state);
	const spec = PRESET_SPECS.find((p) => p.id === presetOrStudyId);
	if (spec) {
		return {
			...normalized,
			areaCount: spec.parameters.areaCount,
			areaSize: spec.parameters.areaSize,
			edgeSoftness: spec.parameters.edgeSoftness,
			transparency: spec.parameters.transparency,
			canvasTexture: spec.parameters.canvasTexture
		};
	}
	if ((VALID_STUDIES as readonly string[]).includes(presetOrStudyId)) {
		const studyId = presetOrStudyId as StudyId;
		return normalizeState({
			...normalized,
			studyId,
			seed: CURATED_STUDY_SEEDS[studyId] ?? normalized.seed
		});
	}
	return normalized;
}

export function findMatchingPreset(state: ColorFieldState): PresetId | null {
	const s = normalizeState(state);
	for (const spec of PRESET_SPECS) {
		const p = spec.parameters;
		if (
			s.areaCount === p.areaCount &&
			s.areaSize === p.areaSize &&
			s.edgeSoftness === p.edgeSoftness &&
			s.transparency === p.transparency &&
			s.canvasTexture === p.canvasTexture
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
		return ARTBOARDS.landscape;
	}
	const ratio = width / height;
	if (ratio < 0.88) {
		return ARTBOARDS.portrait;
	}
	if (ratio < 1.15) {
		return ARTBOARDS.square;
	}
	return ARTBOARDS.landscape;
}

export function computeUniformStagePlacement(
	stageW: number,
	stageH: number,
	artboardW: number,
	artboardH: number,
	fitMode: 'fill' | 'fit' = 'fill'
): StagePlacement {
	const sw = Math.max(1, Number.isFinite(stageW) && stageW > 0 ? stageW : 1);
	const sh = Math.max(1, Number.isFinite(stageH) && stageH > 0 ? stageH : 1);
	const aw = Math.max(
		1,
		Number.isFinite(artboardW) && artboardW > 0 ? artboardW : DEFAULT_ARTBOARD_WIDTH
	);
	const ah = Math.max(
		1,
		Number.isFinite(artboardH) && artboardH > 0 ? artboardH : DEFAULT_ARTBOARD_HEIGHT
	);

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
	artboard: Pick<ArtboardSpec, 'artboardWidth' | 'artboardHeight'> | ArtboardKey,
	zoom: number,
	centerX: number,
	centerY: number,
	viewportWidth?: number,
	viewportHeight?: number
): CropRect {
	const spec = typeof artboard === 'string' ? ARTBOARDS[normalizeArtboard(artboard)] : artboard;
	const aw =
		Number.isFinite(spec.artboardWidth) && spec.artboardWidth > 0
			? Math.max(200, Math.round(spec.artboardWidth))
			: DEFAULT_ARTBOARD_WIDTH;
	const ah =
		Number.isFinite(spec.artboardHeight) && spec.artboardHeight > 0
			? Math.max(200, Math.round(spec.artboardHeight))
			: DEFAULT_ARTBOARD_HEIGHT;
	const vpW = viewportWidth ?? aw;
	const vpH = viewportHeight ?? ah;
	const clampedZoom = clamp(Number.isFinite(zoom) ? zoom : 3.5, 2.0, 5.0);
	const vpRatio =
		vpW > 0 && vpH > 0 && Number.isFinite(vpW) && Number.isFinite(vpH)
			? clamp(vpW / vpH, 0.45, 2.6)
			: aw / ah;

	let cropW = aw / clampedZoom;
	let cropH = cropW / vpRatio;
	const maxCropH = ah / clampedZoom;
	if (cropH > maxCropH) {
		const scale = maxCropH / cropH;
		cropW *= scale;
		cropH *= scale;
	}
	const minW = Math.min(120, aw);
	const minH = Math.min(90, ah);
	if (cropW < minW) {
		const scale = minW / Math.max(1e-6, cropW);
		cropW *= scale;
		cropH *= scale;
	}
	if (cropH < minH) {
		const scale = minH / Math.max(1e-6, cropH);
		cropW *= scale;
		cropH *= scale;
	}
	if (cropW > aw || cropH > ah) {
		const scale = Math.min(aw / cropW, ah / cropH);
		cropW *= scale;
		cropH *= scale;
	}

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
	state: ColorFieldState,
	view?: { overlayView?: 'painting' | 'article'; viewState?: ViewState }
): URLSearchParams {
	const s = normalizeState(state);
	const params = new URLSearchParams();
	params.set('v', String(COLOR_FIELD_GENERATOR_VERSION));
	params.set('areas', String(s.areaCount));
	params.set('size', String(s.areaSize));
	params.set('edge', String(s.edgeSoftness));
	params.set('trans', String(s.transparency));
	params.set('texture', String(s.canvasTexture));
	params.set('time', String(s.paintingTime));
	params.set('study', s.studyId);
	params.set('seed', String(s.seed));
	params.set('artboard', s.artboard);

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
	state: ColorFieldState,
	view?: { overlayView?: 'painting' | 'article'; viewState?: ViewState }
): string {
	return serializeStateParams(state, view).toString();
}

export interface DeserializedColorFieldUrl {
	readonly state: ColorFieldState;
	readonly viewState: ViewState;
	readonly hasExplicitState: boolean;
	readonly hasExplicitView: boolean;
	readonly initialOverlay: 'painting' | 'article';
}

const STATE_QUERY_KEYS = [
	'areas',
	'size',
	'edge',
	'trans',
	'texture',
	'time',
	'study',
	'seed',
	'artboard'
] as const;

export function deserializeStateParams(
	search: URLSearchParams | string,
	fallback?: Partial<ColorFieldState>
): DeserializedColorFieldUrl {
	const params = typeof search === 'string' ? new URLSearchParams(search) : search;
	const hasExplicitState = STATE_QUERY_KEYS.some((k) => params.has(k));
	const hasExplicitView =
		params.has('vm') || params.has('iz') || params.has('ix') || params.has('iy');
	const initialOverlay = params.get('view') === 'article' ? 'article' : 'painting';

	const base = normalizeState(fallback);

	const state = hasExplicitState
		? normalizeState(
				{
					areaCount: params.get('areas') ?? undefined,
					areaSize: params.get('size') ?? undefined,
					edgeSoftness: params.get('edge') ?? undefined,
					transparency: params.get('trans') ?? undefined,
					canvasTexture: params.get('texture') ?? undefined,
					paintingTime: params.get('time') ?? undefined,
					studyId: params.get('study') ?? undefined,
					seed: params.get('seed') ?? undefined,
					artboard: params.get('artboard') ?? undefined
				},
				fallback !== undefined ? base : undefined
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

export function saveStateToStorage(state: ColorFieldState): boolean {
	try {
		if (typeof globalThis.localStorage === 'undefined') return false;
		const normalized = normalizeState(state);
		globalThis.localStorage.setItem(COLOR_FIELD_STORAGE_KEY, JSON.stringify(normalized));
		return true;
	} catch {
		return false;
	}
}

export function loadStateFromStorage(): ColorFieldState | null {
	try {
		if (typeof globalThis.localStorage === 'undefined') return null;
		const raw = globalThis.localStorage.getItem(COLOR_FIELD_STORAGE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as unknown;
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
		const record = parsed as Record<string, unknown>;
		if (
			record.generatorVersion !== COLOR_FIELD_GENERATOR_VERSION &&
			record.version !== COLOR_FIELD_GENERATOR_VERSION
		) {
			return null;
		}
		if (
			record.generatorVersion !== undefined &&
			record.generatorVersion !== COLOR_FIELD_GENERATOR_VERSION
		) {
			return null;
		}
		if (record.version !== undefined && record.version !== COLOR_FIELD_GENERATOR_VERSION) {
			return null;
		}
		return normalizeState(record as Partial<Record<keyof ColorFieldState, unknown>>);
	} catch {
		return null;
	}
}

export function clearStateFromStorage(): void {
	try {
		if (typeof globalThis.localStorage === 'undefined') return;
		globalThis.localStorage.removeItem(COLOR_FIELD_STORAGE_KEY);
	} catch {
		// Ignore unavailable browser storage.
	}
}
