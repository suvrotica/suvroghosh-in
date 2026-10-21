import { DEFAULT_SETTINGS } from './model';
import type { Settings } from './types';

export const SHARE_VERSION = '1';

const finite = (value: unknown, fallback: number, low: number, high: number) => {
	const number =
		typeof value === 'number'
			? value
			: typeof value === 'string' && value.trim()
				? Number(value)
				: NaN;
	return Number.isFinite(number) ? Math.max(low, Math.min(high, number)) : fallback;
};

function choice<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
	return typeof value === 'string' && options.includes(value as T) ? (value as T) : fallback;
}

/** The URL carries a bounded experiment description, never arbitrary data or code. */
export function normalizeSettings(input: unknown): Settings {
	const value = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
	const scenario = choice(
		value.scenario,
		['mcar', 'mar', 'mnar', 'dropout', 'variables', 'instrument', 'nonresponse'],
		DEFAULT_SETTINGS.scenario
	);
	const requestedView = choice(value.view, ['variables', 'time'], DEFAULT_SETTINGS.view);
	return {
		seed: Math.round(finite(value.seed, DEFAULT_SETTINGS.seed, 1, 2147483647)),
		scenario,
		view:
			scenario === 'dropout' || scenario === 'instrument'
				? 'time'
				: scenario === 'variables'
					? 'variables'
					: requestedView,
		rate: Math.round(finite(value.rate, DEFAULT_SETTINGS.rate, 0, 0.9) * 100) / 100,
		strength: finite(value.strength, DEFAULT_SETTINGS.strength, 0.25, 4),
		imputation: choice(
			value.imputation,
			['none', 'mean', 'predictive'],
			DEFAULT_SETTINGS.imputation
		),
		draw: Math.round(finite(value.draw, DEFAULT_SETTINGS.draw, 0, 19)),
		delta: finite(value.delta, DEFAULT_SETTINGS.delta, -2, 2),
		ordering: choice(
			value.ordering,
			['original', 'missing', 'driver', 'dropout'],
			DEFAULT_SETTINGS.ordering
		),
		reveal: value.reveal === true || value.reveal === '1'
	};
}

export function encodeSettings(input: Settings): string {
	const settings = normalizeSettings(input);
	const params = new URLSearchParams({ mdv: SHARE_VERSION });
	for (const [key, value] of Object.entries(settings)) {
		params.set(`md_${key}`, typeof value === 'boolean' ? (value ? '1' : '0') : String(value));
	}
	return params.toString();
}

export function decodeSettings(params: URLSearchParams): Settings {
	if (params.get('mdv') !== SHARE_VERSION) return { ...DEFAULT_SETTINGS };
	const values: Record<string, string> = {};
	for (const key of Object.keys(DEFAULT_SETTINGS)) {
		const value = params.get(`md_${key}`);
		if (value !== null && value.length <= 64) values[key] = value;
	}
	return normalizeSettings(values);
}
