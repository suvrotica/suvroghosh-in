import { ANCHOR_BY_ID, ANCHORS, clampAnchorPlacement, cloneCityConfig } from './anchors';
import { CITY_GRID_PRESETS, CIVIC_PATIENCE_BUDGETS, DEFAULT_CITY_CONFIG } from './constants';
import type {
	AnomalyAppetite,
	BuildingDensity,
	CityConfig,
	CityConfigIssue,
	CityConfigParseResult,
	CitySizePreset,
	CivicPatience,
	LandmarkFrequency,
	Rotation,
	TramPreference
} from './types';

const SIZE_FROM_SERIALIZED: Record<string, CitySizePreset> = {
	small: 'small',
	'18x14': 'small',
	standard: 'standard',
	'24x18': 'standard',
	large: 'large',
	'32x24': 'large'
};

const PATIENCE_FROM_SERIALIZED: Record<string, CivicPatience> = {
	patient: 'patient',
	'24': 'patient',
	familiar: 'familiar',
	'8': 'familiar',
	impulsive: 'impulsive',
	'1': 'impulsive',
	none: 'none',
	'no-paperwork': 'none',
	'0': 'none'
};

export function serializeCityConfig(config: CityConfig): URLSearchParams {
	const normalized = normalizeCityConfig(config).config;
	const dimensions = CITY_GRID_PRESETS[normalized.size];
	const params = new URLSearchParams();
	params.set('v', String(normalized.generatorVersion));
	params.set('seed', normalized.seed);
	params.set('anchor', normalized.anchor.id);
	params.set('ax', String(normalized.anchor.x));
	params.set('ay', String(normalized.anchor.y));
	params.set('r', String(normalized.anchor.rotation));
	params.set('size', `${dimensions.width}x${dimensions.height}`);
	params.set('patience', String(CIVIC_PATIENCE_BUDGETS[normalized.civicPatience]));
	params.set('guarantees', normalized.minimumGuarantees ? '1' : '0');
	params.set('density', normalized.density);
	params.set('landmarks', normalized.landmarkFrequency);
	params.set('appetite', normalized.anomalyAppetite);
	params.set('tram', normalized.tramPreference);
	return params;
}

export function parseCityConfig(params: URLSearchParams): CityConfigParseResult {
	const issues: CityConfigIssue[] = [];
	const config = cloneCityConfig(DEFAULT_CITY_CONFIG);

	const versionRaw = params.get('v');
	const version = parseInteger(versionRaw);
	const unsupportedVersion =
		versionRaw !== null && (version === null || version !== DEFAULT_CITY_CONFIG.generatorVersion);
	if (unsupportedVersion) {
		issues.push({
			parameter: 'v',
			value: versionRaw,
			message: `Generator version ${versionRaw ?? '(missing)'} is unsupported; version 1 is available.`,
			severity: 'error'
		});
	}

	const seedRaw = params.get('seed');
	if (seedRaw !== null) {
		const seed = validSeed(seedRaw);
		if (seed === null) {
			issues.push(issue('seed', seedRaw, 'The seed was empty, too long, or contained controls.'));
		} else {
			config.seed = seed;
		}
	}

	const sizeRaw = params.get('size');
	if (sizeRaw !== null) {
		const size = SIZE_FROM_SERIALIZED[sizeRaw.toLowerCase()];
		if (size) config.size = size;
		else issues.push(issue('size', sizeRaw, 'Unsupported map size; using Standard.'));
	}

	const anchorRaw = params.get('anchor');
	if (anchorRaw !== null) {
		if (anchorRaw in ANCHOR_BY_ID) {
			config.anchor.id = anchorRaw as CityConfig['anchor']['id'];
		} else {
			issues.push(issue('anchor', anchorRaw, 'Unknown anchor; using the sweet shop.'));
		}
	}

	const rotationRaw = params.get('r');
	if (rotationRaw !== null) {
		const rotation = parseInteger(rotationRaw);
		const definition = ANCHOR_BY_ID[config.anchor.id];
		if (
			rotation !== null &&
			rotation >= 0 &&
			rotation <= 3 &&
			definition.rotations.includes(rotation as Rotation)
		) {
			config.anchor.rotation = rotation as Rotation;
		} else {
			issues.push(issue('r', rotationRaw, 'Invalid rotation for this anchor; using its default.'));
			config.anchor.rotation = definition.rotations[0];
		}
	}

	const xRaw = params.get('ax');
	const yRaw = params.get('ay');
	if (xRaw !== null) {
		const x = parseInteger(xRaw);
		if (x === null) issues.push(issue('ax', xRaw, 'Anchor column must be an integer.'));
		else config.anchor.x = x;
	}
	if (yRaw !== null) {
		const y = parseInteger(yRaw);
		if (y === null) issues.push(issue('ay', yRaw, 'Anchor row must be an integer.'));
		else config.anchor.y = y;
	}

	readEnum(params, 'patience', PATIENCE_FROM_SERIALIZED, issues, (value) => {
		config.civicPatience = value;
	});
	readBoolean(params, 'guarantees', issues, (value) => {
		config.minimumGuarantees = value;
	});
	readEnum(
		params,
		'density',
		{ open: 'open', balanced: 'balanced', dense: 'dense' } as const,
		issues,
		(value: BuildingDensity) => {
			config.density = value;
		}
	);
	readEnum(
		params,
		'landmarks',
		{ scarce: 'scarce', balanced: 'balanced', frequent: 'frequent' } as const,
		issues,
		(value: LandmarkFrequency) => {
			config.landmarkFrequency = value;
		}
	);
	readEnum(
		params,
		'appetite',
		{
			restrained: 'restrained',
			balanced: 'balanced',
			enthusiastic: 'enthusiastic'
		} as const,
		issues,
		(value: AnomalyAppetite) => {
			config.anomalyAppetite = value;
		}
	);
	readEnum(
		params,
		'tram',
		{ ordinary: 'ordinary', high: 'high' } as const,
		issues,
		(value: TramPreference) => {
			config.tramPreference = value;
		}
	);

	const dimensions = CITY_GRID_PRESETS[config.size];
	const unclamped = { ...config.anchor };
	config.anchor = clampAnchorPlacement(config.anchor, dimensions.width, dimensions.height);
	if (config.anchor.x !== unclamped.x) {
		issues.push(issue('ax', xRaw, `Anchor column was clamped to ${config.anchor.x}.`));
	}
	if (config.anchor.y !== unclamped.y) {
		issues.push(issue('ay', yRaw, `Anchor row was clamped to ${config.anchor.y}.`));
	}

	return { config, issues, unsupportedVersion };
}

export function normalizeCityConfig(config: CityConfig): CityConfigParseResult {
	const params = new URLSearchParams();
	params.set('v', String(config.generatorVersion));
	params.set('seed', String(config.seed));
	params.set('anchor', String(config.anchor?.id));
	params.set('ax', String(config.anchor?.x));
	params.set('ay', String(config.anchor?.y));
	params.set('r', String(config.anchor?.rotation));
	params.set('size', String(config.size));
	params.set('patience', String(config.civicPatience));
	params.set('guarantees', config.minimumGuarantees ? '1' : '0');
	params.set('density', String(config.density));
	params.set('landmarks', String(config.landmarkFrequency));
	params.set('appetite', String(config.anomalyAppetite));
	params.set('tram', String(config.tramPreference));
	return parseCityConfig(params);
}

function issue(parameter: string, value: string | null, message: string): CityConfigIssue {
	return { parameter, value, message, severity: 'warning' };
}

function validSeed(value: string): string | null {
	const trimmed = value.trim();
	const containsControl = [...trimmed].some((character) => {
		const code = character.charCodeAt(0);
		return code <= 31 || code === 127;
	});
	if (trimmed.length === 0 || trimmed.length > 80 || containsControl) {
		return null;
	}
	return trimmed;
}

function parseInteger(value: string | null): number | null {
	if (value === null || !/^-?\d+$/u.test(value)) return null;
	const result = Number(value);
	return Number.isSafeInteger(result) ? result : null;
}

function readEnum<Value extends string>(
	params: URLSearchParams,
	key: string,
	values: Readonly<Record<string, Value>>,
	issues: CityConfigIssue[],
	write: (value: Value) => void
): void {
	const raw = params.get(key);
	if (raw === null) return;
	const parsed = values[raw.toLowerCase()];
	if (parsed === undefined) {
		issues.push(issue(key, raw, `Unsupported ${key} setting; using the safe default.`));
		return;
	}
	write(parsed);
}

function readBoolean(
	params: URLSearchParams,
	key: string,
	issues: CityConfigIssue[],
	write: (value: boolean) => void
): void {
	const raw = params.get(key);
	if (raw === null) return;
	if (raw === '1' || raw === 'true') write(true);
	else if (raw === '0' || raw === 'false') write(false);
	else issues.push(issue(key, raw, `${key} must be 0 or 1; using the safe default.`));
}

export function isKnownAnchorId(value: string): value is CityConfig['anchor']['id'] {
	return ANCHORS.some((anchor) => anchor.id === value);
}
