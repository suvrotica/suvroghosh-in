import { DEFAULT_PRESET_ID, getPresetById, PRESETS } from './presets';
import {
	GRID_NX,
	GRID_NY,
	type ChamberUrlState,
	type PerimeterMode,
	type PresetId,
	type StudioTheme,
	type ViewMode
} from './types';

const VALID_PRESETS = new Set<string>(PRESETS.map((p) => p.id));

function clampFinite(val: number, min: number, max: number, fallback: number): number {
	if (!Number.isFinite(val)) return fallback;
	return Math.max(min, Math.min(max, val));
}

function parseCoord(raw: string | null, min: number, max: number, fallback: number): number {
	if (raw === null || raw.trim() === '') return fallback;
	const n = Number(raw);
	return clampFinite(Math.round(n * 10) / 10, min, max, fallback);
}

export function createDefaultUrlState(presetId: PresetId = DEFAULT_PRESET_ID): ChamberUrlState {
	const preset = getPresetById(presetId);
	return {
		presetId: preset.id,
		sx: preset.defaultSource.x,
		sy: preset.defaultSource.y,
		lx: preset.defaultListener.x,
		ly: preset.defaultListener.y,
		view: 'relief',
		perimeter: preset.defaultPerimeter,
		chladni: true,
		toneHz: preset.recommendedToneHz,
		theme: 'dark'
	};
}

export function decodeStateFromQuery(search: string): ChamberUrlState {
	const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
	const rawPreset = params.get('preset');
	const presetId: PresetId =
		rawPreset && VALID_PRESETS.has(rawPreset) ? (rawPreset as PresetId) : DEFAULT_PRESET_ID;
	const base = createDefaultUrlState(presetId);

	const rawView = params.get('view');
	const view: ViewMode = rawView === 'interferometer' || rawView === 'relief' ? rawView : base.view;

	const rawPerim = params.get('perim');
	const perimeter: PerimeterMode =
		rawPerim === 'rigid' || rawPerim === 'open' ? rawPerim : base.perimeter;

	const rawChladni = params.get('chladni');
	const chladni = rawChladni === '0' ? false : rawChladni === '1' ? true : base.chladni;

	const rawTheme = params.get('theme');
	const theme: StudioTheme = rawTheme === 'light' || rawTheme === 'dark' ? rawTheme : base.theme;

	const freqRaw = params.get('freq');
	const freqParsed = freqRaw !== null && freqRaw.trim() !== '' ? Number(freqRaw) : base.toneHz;
	const toneHz = Math.round(clampFinite(freqParsed, 60, 1000, base.toneHz));

	return {
		presetId,
		sx: parseCoord(params.get('sx'), 2, GRID_NX - 3, base.sx),
		sy: parseCoord(params.get('sy'), 2, GRID_NY - 3, base.sy),
		lx: parseCoord(params.get('lx'), 2, GRID_NX - 3, base.lx),
		ly: parseCoord(params.get('ly'), 2, GRID_NY - 3, base.ly),
		view,
		perimeter,
		chladni,
		toneHz,
		theme
	};
}

export function encodeStateToQuery(state: ChamberUrlState, existingSearch = ''): string {
	const params = new URLSearchParams(
		existingSearch.startsWith('?') ? existingSearch.slice(1) : existingSearch
	);

	params.set('preset', state.presetId);
	params.set('sx', String(Math.round(clampFinite(state.sx, 2, GRID_NX - 3, 40))));
	params.set('sy', String(Math.round(clampFinite(state.sy, 2, GRID_NY - 3, 72))));
	params.set('lx', String(Math.round(clampFinite(state.lx, 2, GRID_NX - 3, 180))));
	params.set('ly', String(Math.round(clampFinite(state.ly, 2, GRID_NY - 3, 72))));
	params.set('view', state.view);
	params.set('perim', state.perimeter);
	params.set('chladni', state.chladni ? '1' : '0');
	params.set('freq', String(Math.round(clampFinite(state.toneHz, 60, 1000, 245))));
	params.set('theme', state.theme);

	return params.toString();
}
