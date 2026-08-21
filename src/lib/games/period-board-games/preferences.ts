import { DEFAULT_PREFERENCES, type BoardPreferences, type Pace } from './shared';

export const PREFERENCES_STORAGE_KEY = 'suvroghosh:games:board-preferences:v1';

type PreferencesRecord = {
	version: 1;
	preferences: BoardPreferences;
};

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function isPace(value: unknown): value is Pace {
	return value === 'relaxed' || value === 'normal' || value === 'brisk';
}

export function parsePreferences(raw: string | null): BoardPreferences {
	if (!raw) return { ...DEFAULT_PREFERENCES };
	try {
		const record = JSON.parse(raw) as Partial<PreferencesRecord>;
		if (
			record.version !== 1 ||
			!record.preferences ||
			!isPace(record.preferences.pace) ||
			typeof record.preferences.sound !== 'boolean'
		) {
			return { ...DEFAULT_PREFERENCES };
		}
		return { ...record.preferences };
	} catch {
		return { ...DEFAULT_PREFERENCES };
	}
}

export function serializePreferences(preferences: BoardPreferences) {
	return JSON.stringify({ version: 1, preferences } satisfies PreferencesRecord);
}

export function loadPreferences(storage: StorageLike) {
	try {
		return parsePreferences(storage.getItem(PREFERENCES_STORAGE_KEY));
	} catch {
		return { ...DEFAULT_PREFERENCES };
	}
}

export function savePreferences(storage: StorageLike, preferences: BoardPreferences) {
	try {
		storage.setItem(PREFERENCES_STORAGE_KEY, serializePreferences(preferences));
		return true;
	} catch {
		return false;
	}
}
