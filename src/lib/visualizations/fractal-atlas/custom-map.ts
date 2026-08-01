import type {
	ComplexValue,
	CustomMapInitialZRule,
	CustomMapRecipe,
	EscapeTimeFamily,
	FractalPlane
} from './types';

export const CUSTOM_MAP_MIN_POWER = 2;
export const CUSTOM_MAP_MAX_POWER = 12;
export const CUSTOM_MAP_MAX_MEMORY_COMPONENT = 16;

export const DEFAULT_CUSTOM_MAP_RECIPE: Readonly<CustomMapRecipe> = Object.freeze({
	power: 2,
	conjugateBeforePower: false,
	absoluteReal: false,
	absoluteImaginary: false,
	addC: true,
	memoryEnabled: false,
	memoryCoefficient: Object.freeze({ re: -0.5, im: 0 }),
	initialZ: 'plane-default'
});

export interface CustomMapRecipeIssue {
	path: string;
	value?: unknown;
	message: string;
}

export interface CustomMapRecipeValidation {
	recipe: CustomMapRecipe;
	issues: CustomMapRecipeIssue[];
}

export interface CustomMapIdentity {
	label: string;
	conventionalFamily: Exclude<EscapeTimeFamily, 'custom-map'> | null;
	conventional: boolean;
}

export interface CustomMapFormula {
	/** Optional named transform applied before the integer power. */
	transform?: string;
	recurrence: string;
	initialCondition: string;
	full: string;
}

const INITIAL_RULES = new Set<CustomMapInitialZRule>([
	'plane-default',
	'zero',
	'pixel',
	'parameter'
]);

const RECIPE_KEYS = new Set<keyof CustomMapRecipe>([
	'power',
	'conjugateBeforePower',
	'absoluteReal',
	'absoluteImaginary',
	'addC',
	'memoryEnabled',
	'memoryCoefficient',
	'initialZ'
]);

export function cloneCustomMapRecipe(
	recipe: CustomMapRecipe = DEFAULT_CUSTOM_MAP_RECIPE
): CustomMapRecipe {
	return {
		...recipe,
		memoryCoefficient: { ...recipe.memoryCoefficient }
	};
}

/**
 * Normalises only the fixed recipe grammar. Unknown fields are discarded and
 * reported; string expressions and executable source never enter the result.
 */
export function normalizeCustomMapRecipe(
	value: unknown,
	fallback: CustomMapRecipe = cloneCustomMapRecipe(DEFAULT_CUSTOM_MAP_RECIPE)
): CustomMapRecipeValidation {
	const safeFallback = cloneCustomMapRecipe(fallback);
	const issues: CustomMapRecipeIssue[] = [];
	if (!isRecord(value)) {
		return {
			recipe: safeFallback,
			issues: [
				{
					path: 'customMap',
					value,
					message:
						'Custom-map recipe must be a structured object; the safe quadratic recipe was used.'
				}
			]
		};
	}

	const unknownKeys = Object.keys(value).filter(
		(key) => !RECIPE_KEYS.has(key as keyof CustomMapRecipe)
	);
	if (unknownKeys.length > 0) {
		issues.push({
			path: 'customMap',
			value: unknownKeys.slice(0, 12),
			message:
				'Unsupported custom-map fields were ignored; executable formula text is never accepted.'
		});
	}

	const recipe = cloneCustomMapRecipe(safeFallback);
	recipe.power = boundedInteger(
		value.power,
		safeFallback.power,
		CUSTOM_MAP_MIN_POWER,
		CUSTOM_MAP_MAX_POWER,
		'customMap.power',
		issues
	);
	recipe.conjugateBeforePower = strictBoolean(
		value.conjugateBeforePower,
		safeFallback.conjugateBeforePower,
		'customMap.conjugateBeforePower',
		issues
	);
	recipe.absoluteReal = strictBoolean(
		value.absoluteReal,
		safeFallback.absoluteReal,
		'customMap.absoluteReal',
		issues
	);
	recipe.absoluteImaginary = strictBoolean(
		value.absoluteImaginary,
		safeFallback.absoluteImaginary,
		'customMap.absoluteImaginary',
		issues
	);
	recipe.addC = strictBoolean(value.addC, safeFallback.addC, 'customMap.addC', issues);
	recipe.memoryEnabled = strictBoolean(
		value.memoryEnabled,
		safeFallback.memoryEnabled,
		'customMap.memoryEnabled',
		issues
	);
	recipe.memoryCoefficient = boundedComplex(
		value.memoryCoefficient,
		safeFallback.memoryCoefficient,
		'customMap.memoryCoefficient',
		issues
	);
	if (value.initialZ !== undefined) {
		if (
			typeof value.initialZ === 'string' &&
			INITIAL_RULES.has(value.initialZ as CustomMapInitialZRule)
		) {
			recipe.initialZ = value.initialZ as CustomMapInitialZRule;
		} else {
			issues.push({
				path: 'customMap.initialZ',
				value: value.initialZ,
				message: 'Initial z rule must be plane-default, zero, pixel, or parameter.'
			});
		}
	}

	return { recipe, issues };
}

export function transformCustomMapValue(
	value: ComplexValue,
	recipe: CustomMapRecipe
): ComplexValue {
	const imaginary = recipe.conjugateBeforePower ? -value.im : value.im;
	return {
		re: recipe.absoluteReal ? Math.abs(value.re) : value.re,
		im: recipe.absoluteImaginary ? Math.abs(imaginary) : imaginary
	};
}

export function customMapStep(
	value: ComplexValue,
	previous: ComplexValue,
	c: ComplexValue,
	recipe: CustomMapRecipe
): ComplexValue {
	let next = integerPower(transformCustomMapValue(value, recipe), recipe.power);
	if (recipe.addC) next = add(next, c);
	if (recipe.memoryEnabled) {
		next = add(next, multiply(recipe.memoryCoefficient, previous));
	}
	return next;
}

export function customMapInitialValue(
	recipe: CustomMapRecipe,
	plane: Extract<FractalPlane, 'parameter' | 'dynamical'>,
	pixel: ComplexValue,
	c: ComplexValue
): ComplexValue {
	switch (recipe.initialZ) {
		case 'zero':
			return { re: 0, im: 0 };
		case 'pixel':
			return { ...pixel };
		case 'parameter':
			return { ...c };
		case 'plane-default':
			return plane === 'parameter' ? { re: 0, im: 0 } : { ...pixel };
	}
}

/**
 * The renderer propagates an ordinary complex derivative only for holomorphic
 * recipes. Conjugation and component folds require a real 2×2 Jacobian, so
 * derivative-distance colouring is disabled for those maps.
 */
export function customMapSupportsDistanceEstimate(
	recipe: CustomMapRecipe,
	plane: Extract<FractalPlane, 'parameter' | 'dynamical'>
): boolean {
	if (recipe.conjugateBeforePower || recipe.absoluteReal || recipe.absoluteImaginary) {
		return false;
	}
	if (plane === 'parameter') {
		return recipe.addC || recipe.initialZ === 'pixel' || recipe.initialZ === 'parameter';
	}
	return recipe.initialZ === 'plane-default' || recipe.initialZ === 'pixel';
}

export function customMapInitialDerivative(
	recipe: CustomMapRecipe,
	plane: Extract<FractalPlane, 'parameter' | 'dynamical'>
): ComplexValue {
	switch (recipe.initialZ) {
		case 'pixel':
			return { re: 1, im: 0 };
		case 'parameter':
			return plane === 'parameter' ? { re: 1, im: 0 } : { re: 0, im: 0 };
		case 'zero':
			return { re: 0, im: 0 };
		case 'plane-default':
			return plane === 'dynamical' ? { re: 1, im: 0 } : { re: 0, im: 0 };
	}
}

export function identifyCustomMap(
	recipe: CustomMapRecipe,
	plane: Extract<FractalPlane, 'parameter' | 'dynamical'>
): CustomMapIdentity {
	if (!usesConventionalInitialRule(recipe, plane) || !recipe.addC) return customIdentity();

	const memoryIsZero = recipe.memoryCoefficient.re === 0 && recipe.memoryCoefficient.im === 0;
	const noMemory = !recipe.memoryEnabled || memoryIsZero;
	const noFolds = !recipe.absoluteReal && !recipe.absoluteImaginary;
	const holomorphic = noFolds && !recipe.conjugateBeforePower;

	if (
		recipe.power === 2 &&
		holomorphic &&
		!noMemory &&
		plane === 'dynamical' &&
		recipe.memoryCoefficient.im === 0
	) {
		return {
			label: 'Phoenix map',
			conventionalFamily: 'phoenix',
			conventional: true
		};
	}
	if (!noMemory) return customIdentity();
	if (recipe.power === 2 && recipe.absoluteReal && recipe.absoluteImaginary) {
		return {
			label: 'Burning Ship',
			conventionalFamily: 'burning-ship',
			conventional: true
		};
	}
	if (recipe.power === 2 && noFolds && recipe.conjugateBeforePower) {
		return {
			label: 'Tricorn',
			conventionalFamily: 'tricorn',
			conventional: true
		};
	}
	if (holomorphic) {
		if (recipe.power === 2) {
			return {
				label: plane === 'parameter' ? 'Mandelbrot set' : 'Quadratic Julia family',
				conventionalFamily: plane === 'parameter' ? 'mandelbrot' : 'julia',
				conventional: true
			};
		}
		return {
			label:
				plane === 'parameter'
					? `Degree-${recipe.power} Multibrot`
					: `Degree-${recipe.power} Multibrot dynamical plane`,
			conventionalFamily: 'multibrot',
			conventional: true
		};
	}
	return customIdentity();
}

export function customMapFormula(
	recipe: CustomMapRecipe,
	plane: Extract<FractalPlane, 'parameter' | 'dynamical'>
): CustomMapFormula {
	const transform = transformFormula(recipe);
	const base = transform ? 'T(zₙ)' : 'zₙ';
	const terms = [`${base}${superscript(recipe.power)}`];
	if (recipe.addC) terms.push('c');
	if (recipe.memoryEnabled) {
		terms.push(`${coefficientFormula(recipe.memoryCoefficient)}zₙ₋₁`);
	}
	const recurrence = `zₙ₊₁ = ${terms.join(' + ')}`;
	const initialCondition = `${initialFormula(recipe, plane)}${recipe.memoryEnabled ? ', z₋₁ = 0' : ''}`;
	const full = [transform, recurrence, initialCondition].filter(Boolean).join('; ');
	return { transform, recurrence, initialCondition, full };
}

export function customMapDisplayName(
	recipe: CustomMapRecipe,
	plane: Extract<FractalPlane, 'parameter' | 'dynamical'>
): string {
	return identifyCustomMap(recipe, plane).label;
}

function transformFormula(recipe: CustomMapRecipe): string | undefined {
	if (!recipe.conjugateBeforePower && !recipe.absoluteReal && !recipe.absoluteImaginary) {
		return undefined;
	}
	const source = recipe.conjugateBeforePower ? 'conjugate(zₙ)' : 'zₙ';
	const real = recipe.absoluteReal ? `|Re(${source})|` : `Re(${source})`;
	const imaginary = recipe.absoluteImaginary ? `|Im(${source})|` : `Im(${source})`;
	return `T(zₙ) = ${real} + i${imaginary}`;
}

function initialFormula(
	recipe: CustomMapRecipe,
	plane: Extract<FractalPlane, 'parameter' | 'dynamical'>
): string {
	switch (recipe.initialZ) {
		case 'zero':
			return 'z₀ = 0';
		case 'pixel':
			return 'z₀ = pixel';
		case 'parameter':
			return 'z₀ = c';
		case 'plane-default':
			return plane === 'parameter' ? 'z₀ = 0; pixel supplies c' : 'z₀ = pixel; c is fixed';
	}
}

function coefficientFormula(coefficient: ComplexValue): string {
	if (coefficient.im === 0) return parenthesizedNumber(coefficient.re);
	const real = numberFormula(coefficient.re);
	const sign = coefficient.im < 0 ? ' − ' : ' + ';
	const imaginaryMagnitude = Math.abs(coefficient.im);
	const imaginary = imaginaryMagnitude === 1 ? 'i' : `${numberFormula(imaginaryMagnitude)}i`;
	return `(${real}${sign}${imaginary})`;
}

function parenthesizedNumber(value: number): string {
	const formatted = numberFormula(value);
	return value < 0 ? `(${formatted})` : formatted;
}

function numberFormula(value: number): string {
	if (Object.is(value, -0) || value === 0) return '0';
	return value.toString().replace('-', '−');
}

function superscript(value: number): string {
	const digits: Readonly<Record<string, string>> = {
		'0': '⁰',
		'1': '¹',
		'2': '²',
		'3': '³',
		'4': '⁴',
		'5': '⁵',
		'6': '⁶',
		'7': '⁷',
		'8': '⁸',
		'9': '⁹'
	};
	return value
		.toString()
		.split('')
		.map((digit) => digits[digit])
		.join('');
}

function usesConventionalInitialRule(
	recipe: CustomMapRecipe,
	plane: Extract<FractalPlane, 'parameter' | 'dynamical'>
): boolean {
	return plane === 'parameter'
		? recipe.initialZ === 'plane-default' || recipe.initialZ === 'zero'
		: recipe.initialZ === 'plane-default' || recipe.initialZ === 'pixel';
}

function customIdentity(): CustomMapIdentity {
	return { label: 'Custom map', conventionalFamily: null, conventional: false };
}

function add(left: ComplexValue, right: ComplexValue): ComplexValue {
	return { re: left.re + right.re, im: left.im + right.im };
}

function multiply(left: ComplexValue, right: ComplexValue): ComplexValue {
	return {
		re: left.re * right.re - left.im * right.im,
		im: left.re * right.im + left.im * right.re
	};
}

function integerPower(value: ComplexValue, requestedPower: number): ComplexValue {
	let power = Math.max(
		CUSTOM_MAP_MIN_POWER,
		Math.min(CUSTOM_MAP_MAX_POWER, Math.floor(requestedPower))
	);
	let result: ComplexValue = { re: 1, im: 0 };
	let factor = { ...value };
	while (power > 0) {
		if (power % 2 === 1) result = multiply(result, factor);
		power = Math.floor(power / 2);
		if (power > 0) factor = multiply(factor, factor);
	}
	return result;
}

function boundedInteger(
	value: unknown,
	fallback: number,
	minimum: number,
	maximum: number,
	path: string,
	issues: CustomMapRecipeIssue[]
): number {
	if (value === undefined) return fallback;
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		issues.push({
			path,
			value,
			message: 'Value must be a finite integer; the safe default was used.'
		});
		return fallback;
	}
	const bounded = Math.min(maximum, Math.max(minimum, Math.floor(value)));
	if (bounded !== value) {
		issues.push({
			path,
			value,
			message: `Value was bounded to the integer range ${minimum}–${maximum}.`
		});
	}
	return bounded;
}

function strictBoolean(
	value: unknown,
	fallback: boolean,
	path: string,
	issues: CustomMapRecipeIssue[]
): boolean {
	if (value === undefined) return fallback;
	if (typeof value === 'boolean') return value;
	issues.push({ path, value, message: 'Value must be true or false; the safe default was used.' });
	return fallback;
}

function boundedComplex(
	value: unknown,
	fallback: ComplexValue,
	path: string,
	issues: CustomMapRecipeIssue[]
): ComplexValue {
	if (!isRecord(value) || typeof value.re !== 'number' || typeof value.im !== 'number') {
		issues.push({
			path,
			value,
			message: 'Memory coefficient must contain finite real and imaginary numbers.'
		});
		return { ...fallback };
	}
	if (!Number.isFinite(value.re) || !Number.isFinite(value.im)) {
		issues.push({
			path,
			value,
			message: 'Memory coefficient must be finite; the safe default was used.'
		});
		return { ...fallback };
	}
	const re = Math.max(
		-CUSTOM_MAP_MAX_MEMORY_COMPONENT,
		Math.min(CUSTOM_MAP_MAX_MEMORY_COMPONENT, value.re)
	);
	const im = Math.max(
		-CUSTOM_MAP_MAX_MEMORY_COMPONENT,
		Math.min(CUSTOM_MAP_MAX_MEMORY_COMPONENT, value.im)
	);
	if (re !== value.re || im !== value.im) {
		issues.push({
			path,
			value,
			message: `Memory coefficient components were bounded to ±${CUSTOM_MAP_MAX_MEMORY_COMPONENT}.`
		});
	}
	return { re, im };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}
