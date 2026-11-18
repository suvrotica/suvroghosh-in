import { LANDMARK_BY_ID, MOOD_PRESETS, NEIGHBORHOOD_BY_ID, SECRET_BY_ID } from './lore';
import { clamp } from './prng';
import type {
	CityViewerState,
	ExplorationMode,
	LandmarkId,
	MoodPresetId,
	NeighborhoodId,
	SecretId
} from './types';

export const DISCOVERED_STORAGE_KEY = 'lcw:curiosities:v1';

const VALID_MODES = new Set<ExplorationMode>(['diorama', 'third-person', 'first-person']);
const VALID_MOODS = new Set<MoodPresetId>(['morning', 'golden-hour', 'blue-hour', 'lantern-night']);

export function createDefaultCityState(): CityViewerState {
	return {
		mode: 'diorama',
		activeNeighborhood: 'overview',
		selectedLandmarkId: null,
		selectedSecretId: null,
		mood: 'golden-hour',
		timeHours: 16.75,
		showLabels: true,
		stopMotionCadence: false,
		soundEnabled: false,
		discoveredSecrets: []
	};
}

export function cloneCityState(state: CityViewerState): CityViewerState {
	return {
		...state,
		discoveredSecrets: [...state.discoveredSecrets]
	};
}

export function resolveMoodForTime(hours: number): MoodPresetId {
	const t = ((hours % 24) + 24) % 24;
	if (t >= 6.5 && t < 14.5) return 'morning';
	if (t >= 14.5 && t < 18.2) return 'golden-hour';
	if (t >= 18.2 && t < 20.5) return 'blue-hour';
	return 'lantern-night';
}

export function presetTimeHours(mood: MoodPresetId): number {
	return MOOD_PRESETS.find((m) => m.id === mood)?.timeHours ?? 16.75;
}

export function formatClockLabel(hours: number): string {
	const wrapped = ((hours % 24) + 24) % 24;
	const hh = Math.floor(wrapped);
	const mm = Math.floor((wrapped - hh) * 60);
	const suffix = hh >= 12 ? 'PM' : 'AM';
	const h12 = hh % 12 === 0 ? 12 : hh % 12;
	return `${h12}:${String(mm).padStart(2, '0')} ${suffix}`;
}

export function encodeCityStateToQuery(state: CityViewerState): string {
	const def = createDefaultCityState();
	const params = new URLSearchParams();

	if (state.mode !== def.mode) params.set('mode', state.mode);
	if (state.activeNeighborhood !== def.activeNeighborhood) {
		params.set('district', state.activeNeighborhood);
	}
	if (state.selectedLandmarkId) {
		params.set('landmark', state.selectedLandmarkId);
	}
	if (Math.abs(state.timeHours - def.timeHours) > 0.08) {
		params.set('time', state.timeHours.toFixed(2));
	}
	if (state.showLabels !== def.showLabels) {
		params.set('labels', state.showLabels ? '1' : '0');
	}
	if (state.stopMotionCadence) {
		params.set('clay12', '1');
	}

	return params.toString();
}

export function decodeCityStateFromSearch(search: string): CityViewerState {
	const next = createDefaultCityState();
	if (!search) return next;
	const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);

	const mode = params.get('mode') as ExplorationMode | null;
	if (mode && VALID_MODES.has(mode)) {
		next.mode = mode;
	}

	const district = params.get('district');
	if (district === 'overview') {
		next.activeNeighborhood = 'overview';
	} else if (district && district in NEIGHBORHOOD_BY_ID) {
		next.activeNeighborhood = district as NeighborhoodId;
	}

	const landmark = params.get('landmark');
	if (landmark && landmark in LANDMARK_BY_ID) {
		next.selectedLandmarkId = landmark as LandmarkId;
		next.activeNeighborhood = LANDMARK_BY_ID[landmark as LandmarkId].neighborhoodId;
	}

	const moodParam = params.get('mood') as MoodPresetId | null;
	if (moodParam && VALID_MOODS.has(moodParam)) {
		next.mood = moodParam;
		next.timeHours = presetTimeHours(moodParam);
	}

	const timeParam = params.get('time');
	if (timeParam !== null) {
		const parsed = Number(timeParam);
		if (Number.isFinite(parsed)) {
			next.timeHours = clamp(parsed, 0, 24);
			next.mood = resolveMoodForTime(next.timeHours);
		}
	}

	const labelsParam = params.get('labels');
	if (labelsParam === '0') next.showLabels = false;
	if (labelsParam === '1') next.showLabels = true;

	if (params.get('clay12') === '1') {
		next.stopMotionCadence = true;
	}

	return next;
}

export function readDiscoveredSecrets(storage: Pick<Storage, 'getItem'> | null): SecretId[] {
	if (!storage) return [];
	try {
		const raw = storage.getItem(DISCOVERED_STORAGE_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		const out: SecretId[] = [];
		const seen = new Set<string>();
		for (const item of parsed) {
			if (typeof item === 'string' && item in SECRET_BY_ID && !seen.has(item)) {
				seen.add(item);
				out.push(item as SecretId);
			}
		}
		return out;
	} catch {
		return [];
	}
}

export function writeDiscoveredSecrets(
	storage: Pick<Storage, 'setItem'> | null,
	secrets: SecretId[]
): void {
	if (!storage) return;
	try {
		storage.setItem(DISCOVERED_STORAGE_KEY, JSON.stringify(secrets));
	} catch {
		// Ignore quota or private-browsing storage restrictions
	}
}
