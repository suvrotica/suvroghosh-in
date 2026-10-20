import { parseLocalState, serializeLocalState } from './state';
import type { ComplexValue, DecimalComplexValue } from './types';

export type AtlasPanel =
	| 'explore'
	| 'inspect'
	| 'colour'
	| 'formula'
	| 'precision'
	| 'presets'
	| 'export';
export interface SpecimenLabState {
	comparisonState: string;
	linkedJulia: boolean;
	showGrid: boolean;
	compareMode: boolean;
	linkComparisonViewport: boolean;
	linkComparisonColour: boolean;
	linkComparisonIterations: boolean;
	compareSplit: number;
	compareSplitLocked: boolean;
	parameterA: ComplexValue;
	parameterB: ComplexValue;
	parameterADecimal?: DecimalComplexValue;
	parameterBDecimal?: DecimalComplexValue;
	parameterPathOpen?: boolean;
	parameterPathSampleCount?: number;
	parameterPathIndex?: number;
	showMandelbrotLandmarks?: boolean;
	showMultibrotSymmetry?: boolean;
	sierpinskiMode?: 'recursive' | 'chaos' | 'overlay';
	activePanel: AtlasPanel;
}

function record(value: unknown): Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

export function normalizeSpecimenPoint(value: unknown, fallback: ComplexValue): ComplexValue {
	const point = record(value);
	return typeof point.re === 'number' &&
		Number.isFinite(point.re) &&
		typeof point.im === 'number' &&
		Number.isFinite(point.im)
		? { re: point.re, im: point.im }
		: { ...fallback };
}

/** Preserve exact decimal coordinates only when they describe the same finite point. */
export function normalizeSpecimenDecimal(value: unknown, point: ComplexValue): DecimalComplexValue {
	const candidate = record(value);
	const coordinate = (value: unknown, expected: number) =>
		typeof value === 'string' &&
		value.length <= 160 &&
		/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/iu.test(value) &&
		Number(value) === expected
			? value
			: expected.toString();
	return { re: coordinate(candidate.re, point.re), im: coordinate(candidate.im, point.im) };
}

/** Both imported JSON and older local specimens cross the same bounded UI boundary. */
export function normalizeSpecimenLab(value: unknown, fallback: SpecimenLabState): SpecimenLabState {
	const candidate = record(value);
	const next: SpecimenLabState = { ...fallback };
	for (const key of [
		'linkedJulia',
		'showGrid',
		'compareMode',
		'linkComparisonViewport',
		'linkComparisonColour',
		'linkComparisonIterations',
		'compareSplitLocked',
		'parameterPathOpen',
		'showMandelbrotLandmarks',
		'showMultibrotSymmetry'
	] as const) {
		if (typeof candidate[key] === 'boolean') next[key] = candidate[key];
	}
	if (typeof candidate.comparisonState === 'string') {
		next.comparisonState = serializeLocalState(parseLocalState(candidate.comparisonState).state);
	}
	const integer = (key: string, minimum: number, maximum: number, defaultValue: number) => {
		const value = candidate[key];
		return typeof value === 'number' && Number.isFinite(value)
			? Math.max(minimum, Math.min(maximum, Math.round(value)))
			: defaultValue;
	};
	next.compareSplit = integer('compareSplit', 25, 75, fallback.compareSplit);
	next.parameterPathSampleCount = integer(
		'parameterPathSampleCount',
		5,
		9,
		fallback.parameterPathSampleCount ?? 7
	);
	next.parameterPathIndex = integer(
		'parameterPathIndex',
		0,
		next.parameterPathSampleCount - 1,
		Math.min(next.parameterPathSampleCount - 1, fallback.parameterPathIndex ?? 0)
	);
	next.parameterA = normalizeSpecimenPoint(candidate.parameterA, fallback.parameterA);
	next.parameterB = normalizeSpecimenPoint(candidate.parameterB, fallback.parameterB);
	next.parameterADecimal = normalizeSpecimenDecimal(
		candidate.parameterADecimal ?? fallback.parameterADecimal,
		next.parameterA
	);
	next.parameterBDecimal = normalizeSpecimenDecimal(
		candidate.parameterBDecimal ?? fallback.parameterBDecimal,
		next.parameterB
	);
	if (
		typeof candidate.sierpinskiMode === 'string' &&
		['recursive', 'chaos', 'overlay'].includes(candidate.sierpinskiMode)
	) {
		next.sierpinskiMode = candidate.sierpinskiMode as SpecimenLabState['sierpinskiMode'];
	}
	if (
		typeof candidate.activePanel === 'string' &&
		['explore', 'inspect', 'colour', 'formula', 'precision', 'presets', 'export'].includes(
			candidate.activePanel
		)
	) {
		next.activePanel = candidate.activePanel as AtlasPanel;
	}
	return next;
}
