export const SETTINGS_VERSION = 2 as const;
export const SETTINGS_STORAGE_KEY = 'calcutta-footpath.settings';

export const DETAIL_LEVELS = ['auto', 'low', 'high'] as const;
export type DetailLevel = (typeof DETAIL_LEVELS)[number];

export const CONTROL_SCHEMES = ['auto', 'keyboard', 'drag', 'joystick'] as const;
export type ControlScheme = (typeof CONTROL_SCHEMES)[number];

export const JOYSTICK_SIDES = ['left', 'right'] as const;
export type JoystickSide = (typeof JOYSTICK_SIDES)[number];

export interface GameSettings {
	version: typeof SETTINGS_VERSION;
	soundEnabled: boolean;
	reducedMotion: boolean;
	detailLevel: DetailLevel;
	controlScheme: ControlScheme;
	joystickSide: JoystickSide;
	tutorialEnabled: boolean;
	highContrastWarnings: boolean;
}

export interface SettingsParseResult {
	settings: GameSettings;
	migratedFrom: number | null;
	repaired: boolean;
}

export const DEFAULT_GAME_SETTINGS: Readonly<GameSettings> = {
	version: SETTINGS_VERSION,
	soundEnabled: false,
	reducedMotion: false,
	detailLevel: 'auto',
	controlScheme: 'auto',
	joystickSide: 'left',
	tutorialEnabled: true,
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

function migrateLegacy(record: UnknownRecord): UnknownRecord {
	const quality =
		record.quality === 'minimal' ? 'low' : record.quality === 'full' ? 'high' : record.quality;
	const controls =
		record.controls === 'wasd' || record.controls === 'arrows' ? 'keyboard' : record.controls;
	const joystick =
		record.joystickHand === 'southpaw'
			? 'right'
			: record.joystickHand === 'standard'
				? 'left'
				: record.joystickHand;

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
		controlScheme: record.controlScheme ?? controls,
		joystickSide: record.joystickSide ?? joystick,
		tutorialEnabled: record.tutorialEnabled ?? record.showTutorial,
		highContrastWarnings: record.highContrastWarnings ?? record.highContrast
	};
}

function migrateVersionOne(record: UnknownRecord): UnknownRecord {
	return {
		version: SETTINGS_VERSION,
		soundEnabled: record.soundEnabled,
		reducedMotion: record.reducedMotion,
		detailLevel: record.detailLevel ?? record.detail,
		controlScheme: record.controlScheme ?? record.controls,
		joystickSide: record.joystickSide,
		tutorialEnabled: record.tutorialEnabled ?? record.tutorial,
		highContrastWarnings: record.highContrastWarnings
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
		joystickSide: memberOf(record.joystickSide, JOYSTICK_SIDES, DEFAULT_GAME_SETTINGS.joystickSide),
		tutorialEnabled: booleanValue(record.tutorialEnabled, DEFAULT_GAME_SETTINGS.tutorialEnabled),
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
		record.joystickSide === settings.joystickSide &&
		record.tutorialEnabled === settings.tutorialEnabled &&
		record.highContrastWarnings === settings.highContrastWarnings
	);
}

/**
 * Parses JSON text or already-decoded data. Browser storage is deliberately left to the caller.
 */
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
		version === 0 ? migrateLegacy(decoded) : version === 1 ? migrateVersionOne(decoded) : decoded;
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
