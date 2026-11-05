export interface EngineeringBounds {
	unit: string;
	min: number;
	max: number;
	allowZero?: boolean;
	allowNegative?: boolean;
	logarithmic?: boolean;
	step?: number;
}

export interface ParsedEngineeringValue {
	ok: true;
	value: number;
	formatted: string;
	baseFormatted: string;
}

export interface InvalidEngineeringValue {
	ok: false;
	error: string;
}

export type EngineeringParseResult = ParsedEngineeringValue | InvalidEngineeringValue;

const SI_PREFIXES: Record<string, number> = {
	p: 1e-12,
	n: 1e-9,
	u: 1e-6,
	µ: 1e-6,
	μ: 1e-6,
	m: 1e-3,
	'': 1,
	k: 1e3,
	K: 1e3,
	M: 1e6,
	meg: 1e6,
	MEG: 1e6,
	G: 1e9
};

export const PARAMETER_BOUNDS: Record<string, EngineeringBounds> = {
	resistance: {
		unit: 'Ω',
		min: 0.1,
		max: 100e6,
		logarithmic: true
	},
	capacitance: {
		unit: 'F',
		min: 1e-12,
		max: 1,
		logarithmic: true
	},
	initialVoltage: {
		unit: 'V',
		min: -500,
		max: 500,
		allowZero: true,
		allowNegative: true,
		logarithmic: false,
		step: 0.5
	},
	inductance: {
		unit: 'H',
		min: 1e-6,
		max: 100,
		logarithmic: true
	},
	initialCurrent: {
		unit: 'A',
		min: -50,
		max: 50,
		allowZero: true,
		allowNegative: true,
		logarithmic: false,
		step: 0.01
	},
	voltage: {
		unit: 'V',
		min: -500,
		max: 500,
		allowZero: true,
		allowNegative: true,
		logarithmic: false,
		step: 0.5
	},
	amplitude: {
		unit: 'V',
		min: 0.01,
		max: 500,
		logarithmic: false,
		step: 0.5
	},
	frequency: {
		unit: 'Hz',
		min: 0.1,
		max: 100e3,
		logarithmic: true
	},
	offset: {
		unit: 'V',
		min: -500,
		max: 500,
		allowZero: true,
		allowNegative: true,
		logarithmic: false,
		step: 0.5
	},
	phaseDeg: {
		unit: '°',
		min: -360,
		max: 360,
		allowZero: true,
		allowNegative: true,
		logarithmic: false,
		step: 15
	},
	dutyPercent: {
		unit: '%',
		min: 5,
		max: 95,
		logarithmic: false,
		step: 5
	}
};

function stripUnitSuffix(raw: string): string {
	return raw.replace(/\s+/g, '').replace(/(ohms?|Ω|Hz|hz|deg|°|%|V|v|A|a|F|f|H|h|s|W|w)$/u, '');
}

/**
 * Parse practical engineering notation such as 1k, 4.7k, 4k7, 100n, 10u, 1,000u, 2.2M.
 */
export function parseEngineeringValue(
	rawInput: string,
	bounds: EngineeringBounds
): EngineeringParseResult {
	if (typeof rawInput !== 'string') {
		return { ok: false, error: 'Enter a numeric value.' };
	}
	const trimmed = rawInput.trim().replace(/,/g, '');
	if (!trimmed) {
		return { ok: false, error: 'Value cannot be empty.' };
	}

	const cleaned = stripUnitSuffix(trimmed);

	// Support resistor-style infix notation such as 4k7, 2M2, 100n5
	const infixMatch = cleaned.match(/^([+-]?\d+)([pnuµμmkKMG])(\d+)$/u);
	let numericValue: number;

	if (infixMatch) {
		const [, whole, prefix, frac] = infixMatch;
		const multiplier = SI_PREFIXES[prefix];
		if (!multiplier) {
			return { ok: false, error: `Unrecognised prefix “${prefix}”.` };
		}
		const sign = whole.startsWith('-') ? -1 : 1;
		const absWhole = Math.abs(Number(whole));
		const fracNumber = Number(`0.${frac}`);
		numericValue = sign * (absWhole + fracNumber) * multiplier;
	} else {
		const match = cleaned.match(/^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*([a-zA-Zµμ]*)$/u);
		if (!match) {
			return {
				ok: false,
				error: 'Use a number with an optional engineering prefix (p, n, u, m, k, M).'
			};
		}
		const [, numPart, prefixPart] = match;
		const multiplier = SI_PREFIXES[prefixPart];
		if (multiplier === undefined) {
			return {
				ok: false,
				error: `Unrecognised prefix “${prefixPart}”. Supported prefixes: p, n, u/µ, m, k, M, G.`
			};
		}
		numericValue = Number(numPart) * multiplier;
	}

	if (!Number.isFinite(numericValue)) {
		return { ok: false, error: 'Value must be a finite number.' };
	}

	if (!bounds.allowNegative && numericValue < 0) {
		return {
			ok: false,
			error: `Value must be positive (at least ${formatEngineeringValue(bounds.min, bounds.unit)}).`
		};
	}

	if (!bounds.allowZero && numericValue === 0) {
		return {
			ok: false,
			error: `Value cannot be zero (minimum ${formatEngineeringValue(bounds.min, bounds.unit)}).`
		};
	}

	if (numericValue < bounds.min - 1e-18 || numericValue > bounds.max + 1e-9) {
		return {
			ok: false,
			error: `Keep value between ${formatEngineeringValue(bounds.min, bounds.unit)} and ${formatEngineeringValue(bounds.max, bounds.unit)}.`
		};
	}

	const clamped = Math.min(bounds.max, Math.max(bounds.min, numericValue));
	return {
		ok: true,
		value: clamped,
		formatted: formatEngineeringValue(clamped, bounds.unit),
		baseFormatted: `${Number(clamped.toPrecision(6))} ${bounds.unit}`.trim()
	};
}

function cleanNumber(num: number, maxDecimals = 2): string {
	const rounded = Number(num.toFixed(maxDecimals));
	if (Math.abs(rounded) >= 1000 && maxDecimals === 0) {
		return rounded.toLocaleString('en-GB');
	}
	return String(rounded);
}

/**
 * Format a component parameter or measurement into readable British English engineering notation.
 */
export function formatEngineeringValue(
	value: number,
	unit: string,
	options: { fixedDecimals?: number; signed?: boolean } = {}
): string {
	if (!Number.isFinite(value)) return '—';
	const sign = value < -1e-15 ? '−' : options.signed && value > 1e-15 ? '+' : '';
	const abs = Math.abs(value);

	if (unit === '%' || unit === '°') {
		return `${sign}${cleanNumber(abs, options.fixedDecimals ?? 0)}${unit === '°' ? '°' : ' %'}`;
	}

	if (abs < 1e-14) {
		const dec = options.fixedDecimals;
		return `0${dec !== undefined && dec > 0 ? '.' + '0'.repeat(dec) : ''} ${unit}`.trim();
	}

	// Preserve familiar capacitor notation: 1,000 µF for 1e-3 F
	if (unit === 'F' && abs >= 99.9e-6 && abs <= 9999e-6) {
		const micro = abs * 1e6;
		const roundedMicro = Number(micro.toFixed(1));
		const formattedMicro =
			roundedMicro >= 1000
				? roundedMicro.toLocaleString('en-GB', { maximumFractionDigits: 1 })
				: String(roundedMicro);
		return `${sign}${formattedMicro} µF`;
	}

	const tiers: Array<{ threshold: number; scale: number; prefix: string }> = [
		{ threshold: 1e9, scale: 1e-9, prefix: 'G' },
		{ threshold: 1e6, scale: 1e-6, prefix: 'M' },
		{ threshold: 1e3, scale: 1e-3, prefix: 'k' },
		{ threshold: 1, scale: 1, prefix: '' },
		{ threshold: 1e-3, scale: 1e3, prefix: 'm' },
		{ threshold: 1e-6, scale: 1e6, prefix: 'µ' },
		{ threshold: 1e-9, scale: 1e9, prefix: 'n' },
		{ threshold: 0, scale: 1e12, prefix: 'p' }
	];

	for (const tier of tiers) {
		if (abs >= tier.threshold * 0.999999) {
			const scaled = abs * tier.scale;
			const decimals =
				options.fixedDecimals !== undefined
					? options.fixedDecimals
					: scaled >= 100
						? 1
						: scaled >= 10
							? 2
							: 2;
			const numText =
				options.fixedDecimals !== undefined
					? scaled.toFixed(options.fixedDecimals)
					: cleanNumber(scaled, decimals);
			return `${sign}${numText} ${tier.prefix}${unit}`.trim();
		}
	}

	return `${sign}${cleanNumber(abs, 2)} ${unit}`.trim();
}

/**
 * Format a measurement (V, A, W, s) with consistent tabular precision for instrument readouts.
 */
export function formatMeasurement(
	value: number | null | undefined,
	unit: 'V' | 'A' | 'W' | 's' | 'J'
): string {
	if (value === null || value === undefined || !Number.isFinite(value)) return '—';
	const abs = Math.abs(value);
	const sign = value < -1e-12 ? '−' : '';

	if (abs < 1e-11) {
		return `0.00 ${unit}`;
	}

	if (unit === 'V') {
		if (abs >= 1000) return `${sign}${(abs * 1e-3).toFixed(2)} kV`;
		if (abs >= 0.01) return `${sign}${abs.toFixed(2)} V`;
		if (abs >= 1e-5) return `${sign}${(abs * 1e3).toFixed(2)} mV`;
		return `${sign}${(abs * 1e6).toFixed(1)} µV`;
	}

	if (unit === 'A') {
		if (abs >= 1) return `${sign}${abs.toFixed(2)} A`;
		if (abs >= 1e-4) return `${sign}${(abs * 1e3).toFixed(2)} mA`;
		if (abs >= 1e-7) return `${sign}${(abs * 1e6).toFixed(2)} µA`;
		return `${sign}${(abs * 1e9).toFixed(1)} nA`;
	}

	if (unit === 'W' || unit === 'J') {
		if (abs >= 1) return `${sign}${abs.toFixed(2)} ${unit}`;
		if (abs >= 1e-4) return `${sign}${(abs * 1e3).toFixed(2)} m${unit}`;
		if (abs >= 1e-7) return `${sign}${(abs * 1e6).toFixed(2)} µ${unit}`;
		return `${sign}${(abs * 1e9).toFixed(1)} n${unit}`;
	}

	if (unit === 's') {
		if (abs >= 0.1) return `${sign}${abs.toFixed(2)} s`;
		if (abs >= 1e-4) return `${sign}${(abs * 1e3).toFixed(2)} ms`;
		return `${sign}${(abs * 1e6).toFixed(1)} µs`;
	}

	return formatEngineeringValue(value, unit, { fixedDecimals: 2 });
}

/**
 * Convert a parameter value to a normalised [0, 1] rotary dial position.
 */
export function valueToDialNormalized(value: number, bounds: EngineeringBounds): number {
	const clamped = Math.min(bounds.max, Math.max(bounds.min, value));
	if (bounds.logarithmic && bounds.min > 0) {
		const logMin = Math.log10(bounds.min);
		const logMax = Math.log10(bounds.max);
		return Math.min(1, Math.max(0, (Math.log10(clamped) - logMin) / (logMax - logMin)));
	}
	return Math.min(1, Math.max(0, (clamped - bounds.min) / (bounds.max - bounds.min)));
}

/**
 * Convert a normalised [0, 1] rotary dial position to a sensible rounded parameter value.
 */
export function dialNormalizedToValue(norm: number, bounds: EngineeringBounds): number {
	const t = Math.min(1, Math.max(0, norm));
	if (bounds.logarithmic && bounds.min > 0) {
		const logMin = Math.log10(bounds.min);
		const logMax = Math.log10(bounds.max);
		const raw = Math.pow(10, logMin + t * (logMax - logMin));
		return Number(raw.toPrecision(3));
	}
	const raw = bounds.min + t * (bounds.max - bounds.min);
	const step = bounds.step ?? (bounds.max - bounds.min) / 200;
	const stepped = Math.round(raw / step) * step;
	return Number(Math.min(bounds.max, Math.max(bounds.min, stepped)).toFixed(4));
}

/**
 * Step a parameter value up or down by a clean increment (for keyboard or step buttons).
 */
export function stepParameterValue(
	current: number,
	direction: -1 | 1,
	bounds: EngineeringBounds,
	coarse = false
): number {
	if (bounds.logarithmic && bounds.min > 0) {
		const factor = coarse ? (direction > 0 ? 2 : 0.5) : direction > 0 ? 1.1 : 1 / 1.1;
		const next = current * factor;
		const clamped = Math.min(bounds.max, Math.max(bounds.min, next));
		return Number(clamped.toPrecision(3));
	}
	const baseStep = bounds.step ?? (bounds.max - bounds.min) / 100;
	const delta = direction * (coarse ? baseStep * 5 : baseStep);
	const next = current + delta;
	const clamped = Math.min(bounds.max, Math.max(bounds.min, next));
	return Number(clamped.toFixed(4));
}
