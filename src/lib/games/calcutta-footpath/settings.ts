export const SETTINGS_VERSION = 3 as const;
export const SETTINGS_STORAGE_KEY = 'calcutta-footpath.settings';

export const DETAIL_LEVELS = ['auto', 'low', 'high'] as const;
export type DetailLevel = (typeof DETAIL_LEVELS)[number];

export const CONTROL_SCHEMES = ['simple', 'experienced'] as const;
export type ControlScheme = (typeof CONTROL_SCHEMES)[number];

export const CAMERA_MOVEMENTS = ['gentle', 'normal'] as const;
export type CameraMovement = (typeof CAMERA_MOVEMENTS)[number];

export interface GameSettings {
	version: typeof SETTINGS_VERSION;
	soundEnabled: boolean;
	reducedMotion: boolean;
	detailLevel: DetailLevel;
	controlScheme: ControlScheme;
	cameraMovement: CameraMovement;
	tutorialEnabled: boolean;
	tutorialCompleted: boolean;
	highContrastWarnings: boolean;
}

export interface SettingsParseResult {
	settings: GameSettings;
	migratedFrom: number | null;
	repaired: boolean;
}

export const DEFAULT_GAME_SETTINGS: Readonly<GameSettings> = {
	version: SETTINGS_VERSION,
	soundEnabled: true,
	reducedMotion: false,
	detailLevel: 'auto',
	controlScheme: 'simple',
	cameraMovement: 'gentle',
	tutorialEnabled: true,
	tutorialCompleted: false,
	highContrastWarnings: false
};

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function booleanValue(value: unknown, fallback: boolean): boolean {
	return typeof value === 'boolean' ? value : fallback;
}

function memberOf<const Value extends string>(
	value: unknown,
	values: readonly Value[],
	fallback: Value
): Value {
	return typeof value === 'string' && values.includes(value as Value) ? (value as Value) : fallback;
}

function parseJson(value: string): unknown {
	try {
		return JSON.parse(value) as unknown;
	} catch {
		return null;
	}
}

function numericVersion(value: unknown): number {
	if (!isRecord(value)) return 0;
	return typeof value.version === 'number' && Number.isInteger(value.version)
		? Math.max(0, value.version)
		: 0;
}

function legacyControl(value: unknown): ControlScheme {
	return value === 'wasd' || value === 'keyboard' || value === 'gamepad' ? 'experienced' : 'simple';
}

function migrateLegacy(record: UnknownRecord): UnknownRecord {
	const quality =
		record.quality === 'minimal' ? 'low' : record.quality === 'full' ? 'high' : record.quality;
	return {
		version: SETTINGS_VERSION,
		soundEnabled:
			typeof record.soundEnabled === 'boolean'
				? record.soundEnabled
				: typeof record.muted === 'boolean'
					? !record.muted
					: DEFAULT_GAME_SETTINGS.soundEnabled,
		reducedMotion: record.reducedMotion ?? record.reduceMotion,
		detailLevel: record.detailLevel ?? record.detail ?? quality,
		controlScheme: legacyControl(record.controlScheme ?? record.controls),
		cameraMovement: record.cameraMovement,
		tutorialEnabled: record.tutorialEnabled ?? record.showTutorial,
		tutorialCompleted: record.tutorialCompleted,
		highContrastWarnings: record.highContrastWarnings ?? record.highContrast
	};
}

function migrateVersionOne(record: UnknownRecord): UnknownRecord {
	return {
		...record,
		version: SETTINGS_VERSION,
		detailLevel: record.detailLevel ?? record.detail,
		controlScheme: legacyControl(record.controlScheme ?? record.controls),
		cameraMovement: 'gentle',
		tutorialEnabled: record.tutorialEnabled ?? record.tutorial,
		tutorialCompleted: false
	};
}

function migrateVersionTwo(record: UnknownRecord): UnknownRecord {
	return {
		...record,
		version: SETTINGS_VERSION,
		controlScheme: legacyControl(record.controlScheme),
		cameraMovement: 'gentle',
		tutorialCompleted: false
	};
}

function repairCurrent(record: UnknownRecord): GameSettings {
	return {
		version: SETTINGS_VERSION,
		soundEnabled: booleanValue(record.soundEnabled, DEFAULT_GAME_SETTINGS.soundEnabled),
		reducedMotion: booleanValue(record.reducedMotion, DEFAULT_GAME_SETTINGS.reducedMotion),
		detailLevel: memberOf(record.detailLevel, DETAIL_LEVELS, DEFAULT_GAME_SETTINGS.detailLevel),
		controlScheme: memberOf(
			record.controlScheme,
			CONTROL_SCHEMES,
			DEFAULT_GAME_SETTINGS.controlScheme
		),
		cameraMovement: memberOf(
			record.cameraMovement,
			CAMERA_MOVEMENTS,
			DEFAULT_GAME_SETTINGS.cameraMovement
		),
		tutorialEnabled: booleanValue(record.tutorialEnabled, DEFAULT_GAME_SETTINGS.tutorialEnabled),
		tutorialCompleted: booleanValue(
			record.tutorialCompleted,
			DEFAULT_GAME_SETTINGS.tutorialCompleted
		),
		highContrastWarnings: booleanValue(
			record.highContrastWarnings,
			DEFAULT_GAME_SETTINGS.highContrastWarnings
		)
	};
}

function hasSameValues(record: UnknownRecord, settings: GameSettings): boolean {
	return (
		record.version === settings.version &&
		record.soundEnabled === settings.soundEnabled &&
		record.reducedMotion === settings.reducedMotion &&
		record.detailLevel === settings.detailLevel &&
		record.controlScheme === settings.controlScheme &&
		record.cameraMovement === settings.cameraMovement &&
		record.tutorialEnabled === settings.tutorialEnabled &&
		record.tutorialCompleted === settings.tutorialCompleted &&
		record.highContrastWarnings === settings.highContrastWarnings
	);
}

/** Parses JSON text or already-decoded data. Browser storage is deliberately left to the caller. */
export function parseSettings(value: unknown): SettingsParseResult {
	const decoded = typeof value === 'string' ? parseJson(value) : value;
	if (!isRecord(decoded)) {
		return {
			settings: { ...DEFAULT_GAME_SETTINGS },
			migratedFrom: null,
			repaired: value !== null && value !== undefined
		};
	}

	const version = numericVersion(decoded);
	const migrated =
		version === 0
			? migrateLegacy(decoded)
			: version === 1
				? migrateVersionOne(decoded)
				: version === 2
					? migrateVersionTwo(decoded)
					: decoded;
	const settings = repairCurrent(migrated);

	return {
		settings,
		migratedFrom: version < SETTINGS_VERSION ? version : null,
		repaired: version !== SETTINGS_VERSION || !hasSameValues(decoded, settings)
	};
}

export function serializeSettings(settings: GameSettings): string {
	return JSON.stringify(repairCurrent({ ...settings }));
}
