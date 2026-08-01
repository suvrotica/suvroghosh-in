import type {
	ComplexValue,
	CustomMapRecipe,
	DecimalComplexValue,
	EscapeOrbitResult,
	EscapeTimeFamily,
	FractalPlane,
	NewtonOrbitResult,
	OrbitPoint,
	PolynomialState
} from './types';
import Decimal from 'decimal.js';
import { cloneCustomMapRecipe, customMapInitialValue, customMapStep } from './custom-map';

export const MAX_ORBIT_ITERATIONS = 100_000;
export const MAX_RECORDED_ORBIT_POINTS = 20_001;
export const DEFAULT_PERIODICITY_TOLERANCE = 1e-12;
export const DEFAULT_PERIODICITY_TRANSIENT = 8;
export const DEFAULT_PERIODICITY_MATCHING_CYCLES = 3;

export interface EscapeOrbitOptions {
	maxIterations?: number;
	bailout?: number;
	periodicity?: boolean;
	periodicityTolerance?: number;
	/** Iterations ignored before approximate cycle matching begins. */
	periodicityTransient?: number;
	/** Complete matching cycles required before reporting an apparent period. */
	periodicityMatchingCycles?: number;
	recordOrbit?: boolean;
	maxRecordedPoints?: number;
}

export interface EscapeFamilyOrbitInput extends EscapeOrbitOptions {
	family: EscapeTimeFamily;
	plane?: FractalPlane;
	pixel: ComplexValue;
	/** Exact selected coordinate. Activates Decimal arithmetic for Mandelbrot/Julia. */
	pixelDecimal?: DecimalComplexValue;
	c?: ComplexValue;
	/** Exact fixed parameter. Activates Decimal arithmetic for Julia. */
	cDecimal?: DecimalComplexValue;
	exponent?: number;
	phoenixP?: ComplexValue;
	previous?: ComplexValue;
	customMap?: CustomMapRecipe;
}

export interface NewtonOrbitOptions {
	maxIterations?: number;
	convergenceTolerance?: number;
	relaxation?: number;
	derivativeTolerance?: number;
	rootTolerance?: number;
	roots?: readonly ComplexValue[];
	recordOrbit?: boolean;
	maxRecordedPoints?: number;
}

export function complex(re: number, im = 0): ComplexValue {
	return { re, im };
}

export function addComplex(left: ComplexValue, right: ComplexValue): ComplexValue {
	return { re: left.re + right.re, im: left.im + right.im };
}

export function subtractComplex(left: ComplexValue, right: ComplexValue): ComplexValue {
	return { re: left.re - right.re, im: left.im - right.im };
}

export function multiplyComplex(left: ComplexValue, right: ComplexValue): ComplexValue {
	return {
		re: left.re * right.re - left.im * right.im,
		im: left.re * right.im + left.im * right.re
	};
}

export function scaleComplex(value: ComplexValue, scalar: number): ComplexValue {
	return { re: value.re * scalar, im: value.im * scalar };
}

export function divideComplex(numerator: ComplexValue, denominator: ComplexValue): ComplexValue {
	const absoluteRe = Math.abs(denominator.re);
	const absoluteIm = Math.abs(denominator.im);
	if (absoluteRe === 0 && absoluteIm === 0) return { re: Number.NaN, im: Number.NaN };

	// Smith's scaled division avoids unnecessarily overflowing c² + d².
	if (absoluteRe >= absoluteIm) {
		const ratio = denominator.im / denominator.re;
		const scale = denominator.re + denominator.im * ratio;
		return {
			re: (numerator.re + numerator.im * ratio) / scale,
			im: (numerator.im - numerator.re * ratio) / scale
		};
	}

	const ratio = denominator.re / denominator.im;
	const scale = denominator.im + denominator.re * ratio;
	return {
		re: (numerator.re * ratio + numerator.im) / scale,
		im: (numerator.im * ratio - numerator.re) / scale
	};
}

export function conjugateComplex(value: ComplexValue): ComplexValue {
	return { re: value.re, im: -value.im };
}

export function magnitudeSquared(value: ComplexValue): number {
	return value.re * value.re + value.im * value.im;
}

export function magnitude(value: ComplexValue): number {
	return Math.hypot(value.re, value.im);
}

export function argument(value: ComplexValue): number {
	return Math.atan2(value.im, value.re);
}

export function distanceSquared(left: ComplexValue, right: ComplexValue): number {
	const deltaRe = left.re - right.re;
	const deltaIm = left.im - right.im;
	return deltaRe * deltaRe + deltaIm * deltaIm;
}

export function isFiniteComplex(value: ComplexValue): boolean {
	return Number.isFinite(value.re) && Number.isFinite(value.im);
}

export function integerPower(value: ComplexValue, exponent: number): ComplexValue {
	if (!Number.isSafeInteger(exponent)) {
		throw new RangeError('Complex integerPower requires a safe integer exponent.');
	}
	if (exponent === 0) return { re: 1, im: 0 };
	if (exponent < 0) return divideComplex({ re: 1, im: 0 }, integerPower(value, -exponent));

	let result = { re: 1, im: 0 };
	let base = { ...value };
	let remaining = exponent;
	while (remaining > 0) {
		if (remaining % 2 === 1) result = multiplyComplex(result, base);
		remaining = Math.floor(remaining / 2);
		if (remaining > 0) base = multiplyComplex(base, base);
	}
	return result;
}

export function quadraticStep(value: ComplexValue, c: ComplexValue): ComplexValue {
	return addComplex(multiplyComplex(value, value), c);
}

export function multibrotStep(
	value: ComplexValue,
	c: ComplexValue,
	exponent: number
): ComplexValue {
	const safeExponent = clampInteger(exponent, 2, 12, 2);
	return addComplex(integerPower(value, safeExponent), c);
}

export function burningShipStep(value: ComplexValue, c: ComplexValue): ComplexValue {
	const folded = { re: Math.abs(value.re), im: Math.abs(value.im) };
	return quadraticStep(folded, c);
}

export function tricornStep(value: ComplexValue, c: ComplexValue): ComplexValue {
	return quadraticStep(conjugateComplex(value), c);
}

export function phoenixStep(
	value: ComplexValue,
	previous: ComplexValue,
	c: ComplexValue,
	p: ComplexValue
): ComplexValue {
	return addComplex(quadraticStep(value, c), multiplyComplex(p, previous));
}

export function smoothEscapeIteration(
	iteration: number,
	escapeMagnitude: number,
	exponent = 2
): number {
	if (
		!Number.isFinite(iteration) ||
		!Number.isFinite(escapeMagnitude) ||
		escapeMagnitude <= 1 ||
		!Number.isFinite(exponent) ||
		exponent <= 1
	) {
		return Math.max(0, Number.isFinite(iteration) ? iteration : 0);
	}
	const smoothed = iteration + 1 - Math.log(Math.log(escapeMagnitude)) / Math.log(exponent);
	return Number.isFinite(smoothed) ? smoothed : iteration;
}

export function iterateMandelbrot(
	c: ComplexValue,
	options: EscapeOrbitOptions = {}
): EscapeOrbitResult {
	return iterateEscapeOrbit({
		family: 'mandelbrot',
		plane: 'parameter',
		pixel: c,
		...options
	});
}

export function iterateJulia(
	start: ComplexValue,
	c: ComplexValue,
	options: EscapeOrbitOptions = {}
): EscapeOrbitResult {
	return iterateEscapeOrbit({
		family: 'julia',
		plane: 'dynamical',
		pixel: start,
		c,
		...options
	});
}

export function iterateMultibrot(
	c: ComplexValue,
	exponent: number,
	options: EscapeOrbitOptions & { start?: ComplexValue } = {}
): EscapeOrbitResult {
	const { start, ...orbitOptions } = options;
	return iterateEscapeOrbit({
		family: 'multibrot',
		plane: start ? 'dynamical' : 'parameter',
		pixel: start ?? c,
		c: start ? c : undefined,
		exponent,
		...orbitOptions
	});
}

export function iterateBurningShip(
	c: ComplexValue,
	options: EscapeOrbitOptions & { start?: ComplexValue } = {}
): EscapeOrbitResult {
	const { start, ...orbitOptions } = options;
	return iterateEscapeOrbit({
		family: 'burning-ship',
		plane: start ? 'dynamical' : 'parameter',
		pixel: start ?? c,
		c: start ? c : undefined,
		...orbitOptions
	});
}

export function iterateTricorn(
	c: ComplexValue,
	options: EscapeOrbitOptions & { start?: ComplexValue } = {}
): EscapeOrbitResult {
	const { start, ...orbitOptions } = options;
	return iterateEscapeOrbit({
		family: 'tricorn',
		plane: start ? 'dynamical' : 'parameter',
		pixel: start ?? c,
		c: start ? c : undefined,
		...orbitOptions
	});
}

export function iteratePhoenix(
	start: ComplexValue,
	c: ComplexValue,
	p: ComplexValue,
	options: EscapeOrbitOptions & { previous?: ComplexValue } = {}
): EscapeOrbitResult {
	return iterateEscapeOrbit({
		family: 'phoenix',
		plane: 'dynamical',
		pixel: start,
		c,
		phoenixP: p,
		...options
	});
}

export function iterateCustomMap(
	pixel: ComplexValue,
	recipe: CustomMapRecipe,
	options: EscapeOrbitOptions & {
		plane?: Extract<FractalPlane, 'parameter' | 'dynamical'>;
		c?: ComplexValue;
		previous?: ComplexValue;
	} = {}
): EscapeOrbitResult {
	return iterateEscapeOrbit({
		family: 'custom-map',
		plane: options.plane ?? 'parameter',
		pixel,
		c: options.c,
		previous: options.previous,
		customMap: recipe,
		maxIterations: options.maxIterations,
		bailout: options.bailout,
		periodicity: options.periodicity,
		periodicityTolerance: options.periodicityTolerance,
		periodicityTransient: options.periodicityTransient,
		periodicityMatchingCycles: options.periodicityMatchingCycles,
		recordOrbit: options.recordOrbit,
		maxRecordedPoints: options.maxRecordedPoints
	});
}

export function iterateEscapeOrbit(input: EscapeFamilyOrbitInput): EscapeOrbitResult {
	const maxIterations = clampInteger(input.maxIterations ?? 300, 1, MAX_ORBIT_ITERATIONS, 300);
	const bailout = clampFinite(input.bailout ?? 2, 1 + Number.EPSILON, 1e12, 2);
	const bailoutSquared = bailout * bailout;
	const customMap = cloneCustomMapRecipe(input.customMap);
	const exponent =
		input.family === 'multibrot'
			? clampInteger(input.exponent ?? 2, 2, 12, 2)
			: input.family === 'custom-map'
				? customMap.power
				: 2;
	const plane: EscapeOrbitResult['plane'] =
		input.family === 'mandelbrot'
			? 'parameter'
			: input.family === 'julia' || input.family === 'phoenix'
				? 'dynamical'
				: input.plane === 'dynamical'
					? 'dynamical'
					: 'parameter';
	const decimalQuadraticOrbit = iterateDecimalQuadraticOrbit(input, plane, maxIterations, bailout);
	if (decimalQuadraticOrbit) return decimalQuadraticOrbit;
	const c = plane === 'parameter' ? input.pixel : (input.c ?? complex(0));
	let value =
		input.family === 'custom-map'
			? customMapInitialValue(customMap, plane, input.pixel, c)
			: plane === 'parameter'
				? complex(0)
				: { ...input.pixel };
	const remembersPrevious =
		input.family === 'phoenix' || (input.family === 'custom-map' && customMap.memoryEnabled);
	let previous = remembersPrevious ? { ...(input.previous ?? ZERO_COMPLEX) } : undefined;
	const phoenixP = input.phoenixP ?? complex(-0.5);
	const shouldRecord = input.recordOrbit !== false;
	const recordLimit = clampInteger(
		input.maxRecordedPoints ?? MAX_RECORDED_ORBIT_POINTS,
		1,
		MAX_RECORDED_ORBIT_POINTS,
		MAX_RECORDED_ORBIT_POINTS
	);
	const orbit: OrbitPoint[] = [];
	const periodDetection = periodDetectionConfiguration(input, maxIterations);
	const periodicity = periodDetection.enabled;
	const toleranceSquared = periodDetection.tolerance * periodDetection.tolerance;
	const resultContext = {
		plane,
		pixel: { ...input.pixel },
		c: { ...c },
		bailout,
		maximumMagnitude: isFiniteComplex(value) ? magnitude(value) : Number.POSITIVE_INFINITY,
		periodDetection
	};
	recordPoint(orbit, shouldRecord, recordLimit, 0, value, previous);

	if (!isFiniteComplex(value) || !isFiniteComplex(c)) {
		return {
			...resultContext,
			status: 'non-finite',
			iterations: 0,
			value,
			previous,
			orbit
		};
	}

	if (magnitudeSquared(value) > bailoutSquared) {
		const escapeMagnitude = magnitude(value);
		return {
			...resultContext,
			status: 'escaped',
			iterations: 0,
			value,
			previous,
			orbit,
			escapeMagnitude,
			smoothIteration: smoothEscapeIteration(0, escapeMagnitude, exponent)
		};
	}

	let checkpoint = { ...value };
	let checkpointPrevious = previous ? { ...previous } : undefined;
	let checkpointIteration = 0;
	let checkpointWindow = 1;
	let stepsSinceCheckpoint = 0;
	let candidatePeriod = 0;
	let candidateMatchingPoints = 0;
	const periodHistory: NumericPeriodState[] = periodicity
		? [{ value: { ...value }, previous: previous ? { ...previous } : undefined }]
		: [];

	for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
		const oldValue = value;
		switch (input.family) {
			case 'mandelbrot':
			case 'julia':
				value = quadraticStep(value, c);
				break;
			case 'multibrot':
				value = multibrotStep(value, c, exponent);
				break;
			case 'burning-ship':
				value = burningShipStep(value, c);
				break;
			case 'tricorn':
				value = tricornStep(value, c);
				break;
			case 'phoenix':
				value = phoenixStep(value, previous ?? ZERO_COMPLEX, c, phoenixP);
				previous = oldValue;
				break;
			case 'custom-map':
				value = customMapStep(value, previous ?? ZERO_COMPLEX, c, customMap);
				if (customMap.memoryEnabled) previous = oldValue;
				break;
		}

		recordPoint(orbit, shouldRecord, recordLimit, iteration, value, previous);

		if (!isFiniteComplex(value)) {
			resultContext.maximumMagnitude = Number.POSITIVE_INFINITY;
			return {
				...resultContext,
				status: 'non-finite',
				iterations: iteration,
				value,
				previous,
				orbit
			};
		}

		const absoluteSquared = magnitudeSquared(value);
		resultContext.maximumMagnitude = Math.max(
			resultContext.maximumMagnitude,
			Math.sqrt(absoluteSquared)
		);
		if (absoluteSquared > bailoutSquared) {
			const escapeMagnitude = Math.sqrt(absoluteSquared);
			return {
				...resultContext,
				status: 'escaped',
				iterations: iteration,
				value,
				previous,
				orbit,
				escapeMagnitude,
				smoothIteration: smoothEscapeIteration(iteration, escapeMagnitude, exponent)
			};
		}

		if (periodicity) {
			periodHistory.push({
				value: { ...value },
				previous: previous ? { ...previous } : undefined
			});
			if (iteration <= periodDetection.transientIterations) {
				if (iteration === periodDetection.transientIterations) {
					checkpoint = { ...value };
					checkpointPrevious = previous ? { ...previous } : undefined;
					checkpointIteration = iteration;
					checkpointWindow = 1;
					stepsSinceCheckpoint = 0;
				}
				continue;
			}

			if (candidatePeriod > 0) {
				const reference = periodHistory[periodHistory.length - 1 - candidatePeriod];
				if (
					reference &&
					numericPeriodStatesMatch(
						{ value, previous },
						reference,
						toleranceSquared,
						remembersPrevious
					)
				) {
					candidateMatchingPoints += 1;
					const matchingCycles = Math.floor(candidateMatchingPoints / candidatePeriod);
					if (matchingCycles >= periodDetection.requiredMatchingCycles) {
						return {
							...resultContext,
							status: 'periodic',
							iterations: iteration,
							value,
							previous,
							orbit,
							period: candidatePeriod,
							periodDetection: { ...periodDetection, matchingCycles }
						};
					}
					continue;
				}

				candidatePeriod = 0;
				candidateMatchingPoints = 0;
				checkpoint = { ...value };
				checkpointPrevious = previous ? { ...previous } : undefined;
				checkpointIteration = iteration;
				checkpointWindow = 1;
				stepsSinceCheckpoint = 0;
				continue;
			}

			stepsSinceCheckpoint += 1;
			const samePrevious =
				!remembersPrevious ||
				distanceSquared(previous ?? ZERO_COMPLEX, checkpointPrevious ?? ZERO_COMPLEX) <=
					toleranceSquared;
			if (distanceSquared(value, checkpoint) <= toleranceSquared && samePrevious) {
				candidatePeriod = Math.max(1, iteration - checkpointIteration);
				candidateMatchingPoints = 1;
				const matchingCycles = Math.floor(candidateMatchingPoints / candidatePeriod);
				if (matchingCycles >= periodDetection.requiredMatchingCycles) {
					return {
						...resultContext,
						status: 'periodic',
						iterations: iteration,
						value,
						previous,
						orbit,
						period: candidatePeriod,
						periodDetection: { ...periodDetection, matchingCycles }
					};
				}
				continue;
			}
			if (stepsSinceCheckpoint >= checkpointWindow) {
				checkpoint = { ...value };
				checkpointPrevious = previous ? { ...previous } : undefined;
				checkpointIteration = iteration;
				checkpointWindow = Math.min(MAX_ORBIT_ITERATIONS, checkpointWindow * 2);
				stepsSinceCheckpoint = 0;
			}
		}
	}

	return {
		...resultContext,
		status: 'max-iterations',
		iterations: maxIterations,
		value,
		previous,
		orbit
	};
}

type DecimalPair = { re: Decimal; im: Decimal };

/**
 * Runs the two standard quadratic maps without first collapsing authoritative
 * Decimal coordinates into binary64. Number fields remain compatibility shadows
 * for plotting and older consumers; the `*Decimal` fields carry the calculated
 * values used for classification.
 */
function iterateDecimalQuadraticOrbit(
	input: EscapeFamilyOrbitInput,
	plane: EscapeOrbitResult['plane'],
	maxIterations: number,
	bailout: number
): EscapeOrbitResult | null {
	if (input.family !== 'mandelbrot' && input.family !== 'julia') return null;

	const explicitPixel = validDecimalPair(input.pixelDecimal) ? input.pixelDecimal : undefined;
	const explicitC = validDecimalPair(input.cDecimal) ? input.cDecimal : undefined;
	const usesExactInput =
		plane === 'parameter' ? Boolean(explicitPixel) : Boolean(explicitPixel || explicitC);
	if (!usesExactInput) return null;

	const pixelSource = explicitPixel ?? numberPairStrings(input.pixel);
	const numericC = plane === 'parameter' ? input.pixel : (input.c ?? ZERO_COMPLEX);
	const cSource = plane === 'parameter' ? pixelSource : (explicitC ?? numberPairStrings(numericC));
	const decimalPrecision = clampInteger(
		Math.max(
			decimalSignificantDigits(pixelSource.re),
			decimalSignificantDigits(pixelSource.im),
			decimalSignificantDigits(cSource.re),
			decimalSignificantDigits(cSource.im)
		) + 48,
		64,
		224,
		80
	);
	const DecimalType = Decimal.clone({
		precision: decimalPrecision,
		rounding: Decimal.ROUND_HALF_EVEN,
		toExpNeg: -1_000,
		toExpPos: 1_000
	});
	const pixel: DecimalPair = {
		re: new DecimalType(pixelSource.re),
		im: new DecimalType(pixelSource.im)
	};
	const c: DecimalPair = {
		re: new DecimalType(cSource.re),
		im: new DecimalType(cSource.im)
	};
	let value: DecimalPair =
		plane === 'parameter'
			? { re: new DecimalType(0), im: new DecimalType(0) }
			: { re: pixel.re, im: pixel.im };
	const shouldRecord = input.recordOrbit !== false;
	const recordLimit = clampInteger(
		input.maxRecordedPoints ?? MAX_RECORDED_ORBIT_POINTS,
		1,
		MAX_RECORDED_ORBIT_POINTS,
		MAX_RECORDED_ORBIT_POINTS
	);
	const orbit: OrbitPoint[] = [];
	const periodDetection = periodDetectionConfiguration(input, maxIterations);
	recordDecimalPoint(orbit, shouldRecord, recordLimit, 0, value);

	const pixelShadow = { ...input.pixel };
	const cShadow = { ...numericC };
	const resultContext = {
		plane,
		pixel: pixelShadow,
		pixelDecimal: { ...pixelSource },
		c: cShadow,
		cDecimal: { ...cSource },
		bailout,
		maximumMagnitude: decimalMagnitude(value),
		decimalPrecision,
		periodDetection
	};
	const bailoutSquared = new DecimalType(bailout.toString()).pow(2);

	if (!decimalPairIsFinite(value) || !decimalPairIsFinite(c)) {
		return {
			...resultContext,
			maximumMagnitude: Number.POSITIVE_INFINITY,
			status: 'non-finite',
			iterations: 0,
			value: decimalPairToComplex(value),
			orbit
		};
	}

	let absoluteSquared = decimalMagnitudeSquared(value);
	if (absoluteSquared.greaterThan(bailoutSquared)) {
		const escapeMagnitude = absoluteSquared.sqrt().toNumber();
		return {
			...resultContext,
			status: 'escaped',
			iterations: 0,
			value: decimalPairToComplex(value),
			valueDecimal: decimalPairStrings(value),
			orbit,
			escapeMagnitude,
			smoothIteration: smoothEscapeIteration(0, escapeMagnitude, 2)
		};
	}

	const periodicity = periodDetection.enabled;
	const toleranceSquared = new DecimalType(periodDetection.tolerance.toString()).pow(2);
	let checkpoint = { re: value.re, im: value.im };
	let checkpointIteration = 0;
	let checkpointWindow = 1;
	let stepsSinceCheckpoint = 0;
	let candidatePeriod = 0;
	let candidateMatchingPoints = 0;
	const periodHistory: DecimalPair[] = periodicity ? [{ re: value.re, im: value.im }] : [];

	for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
		value = decimalQuadraticStep(value, c);
		recordDecimalPoint(orbit, shouldRecord, recordLimit, iteration, value);

		if (!decimalPairIsFinite(value)) {
			return {
				...resultContext,
				maximumMagnitude: Number.POSITIVE_INFINITY,
				status: 'non-finite',
				iterations: iteration,
				value: decimalPairToComplex(value),
				orbit
			};
		}

		absoluteSquared = decimalMagnitudeSquared(value);
		resultContext.maximumMagnitude = Math.max(
			resultContext.maximumMagnitude,
			absoluteSquared.sqrt().toNumber()
		);
		if (absoluteSquared.greaterThan(bailoutSquared)) {
			const escapeMagnitude = absoluteSquared.sqrt().toNumber();
			return {
				...resultContext,
				status: 'escaped',
				iterations: iteration,
				value: decimalPairToComplex(value),
				valueDecimal: decimalPairStrings(value),
				orbit,
				escapeMagnitude,
				smoothIteration: smoothEscapeIteration(iteration, escapeMagnitude, 2)
			};
		}

		if (periodicity) {
			periodHistory.push({ re: value.re, im: value.im });
			if (iteration <= periodDetection.transientIterations) {
				if (iteration === periodDetection.transientIterations) {
					checkpoint = { re: value.re, im: value.im };
					checkpointIteration = iteration;
					checkpointWindow = 1;
					stepsSinceCheckpoint = 0;
				}
				continue;
			}

			if (candidatePeriod > 0) {
				const reference = periodHistory[periodHistory.length - 1 - candidatePeriod];
				if (
					reference &&
					decimalDistanceSquared(value, reference).lessThanOrEqualTo(toleranceSquared)
				) {
					candidateMatchingPoints += 1;
					const matchingCycles = Math.floor(candidateMatchingPoints / candidatePeriod);
					if (matchingCycles >= periodDetection.requiredMatchingCycles) {
						return {
							...resultContext,
							status: 'periodic',
							iterations: iteration,
							value: decimalPairToComplex(value),
							valueDecimal: decimalPairStrings(value),
							orbit,
							period: candidatePeriod,
							periodDetection: { ...periodDetection, matchingCycles }
						};
					}
					continue;
				}

				candidatePeriod = 0;
				candidateMatchingPoints = 0;
				checkpoint = { re: value.re, im: value.im };
				checkpointIteration = iteration;
				checkpointWindow = 1;
				stepsSinceCheckpoint = 0;
				continue;
			}

			stepsSinceCheckpoint += 1;
			if (decimalDistanceSquared(value, checkpoint).lessThanOrEqualTo(toleranceSquared)) {
				candidatePeriod = Math.max(1, iteration - checkpointIteration);
				candidateMatchingPoints = 1;
				const matchingCycles = Math.floor(candidateMatchingPoints / candidatePeriod);
				if (matchingCycles >= periodDetection.requiredMatchingCycles) {
					return {
						...resultContext,
						status: 'periodic',
						iterations: iteration,
						value: decimalPairToComplex(value),
						valueDecimal: decimalPairStrings(value),
						orbit,
						period: candidatePeriod,
						periodDetection: { ...periodDetection, matchingCycles }
					};
				}
				continue;
			}
			if (stepsSinceCheckpoint >= checkpointWindow) {
				checkpoint = { re: value.re, im: value.im };
				checkpointIteration = iteration;
				checkpointWindow = Math.min(MAX_ORBIT_ITERATIONS, checkpointWindow * 2);
				stepsSinceCheckpoint = 0;
			}
		}
	}

	return {
		...resultContext,
		status: 'max-iterations',
		iterations: maxIterations,
		value: decimalPairToComplex(value),
		valueDecimal: decimalPairStrings(value),
		orbit
	};
}

function validDecimalPair(value: DecimalComplexValue | undefined): value is DecimalComplexValue {
	if (!value || typeof value.re !== 'string' || typeof value.im !== 'string') return false;
	try {
		return new Decimal(value.re).isFinite() && new Decimal(value.im).isFinite();
	} catch {
		return false;
	}
}

function numberPairStrings(value: ComplexValue): DecimalComplexValue {
	return { re: value.re.toString(), im: value.im.toString() };
}

function decimalSignificantDigits(value: string): number {
	const mantissa = value.trim().toLowerCase().split('e')[0] ?? '';
	const digits = mantissa.replace(/[^0-9]/g, '').replace(/^0+/, '');
	return Math.max(1, digits.length);
}

function decimalQuadraticStep(value: DecimalPair, c: DecimalPair): DecimalPair {
	return {
		re: value.re.times(value.re).minus(value.im.times(value.im)).plus(c.re),
		im: value.re.times(value.im).times(2).plus(c.im)
	};
}

function decimalMagnitudeSquared(value: DecimalPair): Decimal {
	return value.re.times(value.re).plus(value.im.times(value.im));
}

function decimalDistanceSquared(left: DecimalPair, right: DecimalPair): Decimal {
	return left.re.minus(right.re).pow(2).plus(left.im.minus(right.im).pow(2));
}

function decimalMagnitude(value: DecimalPair): number {
	if (!decimalPairIsFinite(value)) return Number.POSITIVE_INFINITY;
	return decimalMagnitudeSquared(value).sqrt().toNumber();
}

function decimalPairIsFinite(value: DecimalPair): boolean {
	return value.re.isFinite() && value.im.isFinite();
}

function decimalPairToComplex(value: DecimalPair): ComplexValue {
	return { re: value.re.toNumber(), im: value.im.toNumber() };
}

function decimalPairStrings(value: DecimalPair): DecimalComplexValue {
	return { re: value.re.toString(), im: value.im.toString() };
}

function recordDecimalPoint(
	orbit: OrbitPoint[],
	enabled: boolean,
	limit: number,
	iteration: number,
	value: DecimalPair
): void {
	if (!enabled || orbit.length >= limit) return;
	orbit.push({
		iteration,
		value: decimalPairToComplex(value),
		valueDecimal: decimalPairIsFinite(value) ? decimalPairStrings(value) : undefined
	});
}

export function evaluatePolynomial(
	polynomial: PolynomialState | readonly ComplexValue[],
	z: ComplexValue
): ComplexValue {
	return evaluatePolynomialAndDerivative(polynomial, z).value;
}

/**
 * Simultaneous Horner evaluation. Coefficients are highest-power first.
 *
 * If p starts as aₙ, each pass applies:
 *   p′ ← p′z + p
 *   p  ← pz + a
 */
export function evaluatePolynomialAndDerivative(
	polynomial: PolynomialState | readonly ComplexValue[],
	z: ComplexValue
): { value: ComplexValue; derivative: ComplexValue } {
	const coefficients = Array.isArray(polynomial)
		? polynomial
		: (polynomial as PolynomialState).coefficients;
	if (coefficients.length === 0) {
		return { value: complex(0), derivative: complex(0) };
	}

	let value = { ...coefficients[0] };
	let derivative = complex(0);
	for (let index = 1; index < coefficients.length; index += 1) {
		derivative = addComplex(multiplyComplex(derivative, z), value);
		value = addComplex(multiplyComplex(value, z), coefficients[index]);
	}
	return { value, derivative };
}

export function newtonStep(
	z: ComplexValue,
	polynomial: PolynomialState | readonly ComplexValue[],
	derivativeTolerance = 1e-14,
	relaxation = 1
): { value: ComplexValue; derivativeMagnitude: number; residual: number } | null {
	const evaluation = evaluatePolynomialAndDerivative(polynomial, z);
	const derivativeMagnitude = magnitude(evaluation.derivative);
	if (
		!isFiniteComplex(evaluation.value) ||
		!isFiniteComplex(evaluation.derivative) ||
		derivativeMagnitude <= derivativeTolerance
	) {
		return null;
	}
	const safeRelaxation = clampFinite(relaxation, 0.05, 2, 1);
	const correction = scaleComplex(
		divideComplex(evaluation.value, evaluation.derivative),
		safeRelaxation
	);
	const value = subtractComplex(z, correction);
	return {
		value,
		derivativeMagnitude,
		residual: magnitude(evaluation.value)
	};
}

export function iterateNewton(
	start: ComplexValue,
	polynomial: PolynomialState | readonly ComplexValue[],
	options: NewtonOrbitOptions = {}
): NewtonOrbitResult {
	const coefficients = Array.isArray(polynomial)
		? polynomial
		: (polynomial as PolynomialState).coefficients;
	const maxIterations = clampInteger(options.maxIterations ?? 80, 1, 10_000, 80);
	const convergenceTolerance = clampFinite(options.convergenceTolerance ?? 1e-8, 1e-15, 1, 1e-8);
	const relaxation = clampFinite(options.relaxation ?? 1, 0.05, 2, 1);
	const derivativeTolerance = clampFinite(options.derivativeTolerance ?? 1e-14, 1e-18, 1, 1e-14);
	const rootTolerance = clampFinite(options.rootTolerance ?? 1e-5, 1e-12, 1, 1e-5);
	const roots = (options.roots ?? inferRootsOfUnity(coefficients)).map((root) => ({ ...root }));
	const shouldRecord = options.recordOrbit !== false;
	const recordLimit = clampInteger(
		options.maxRecordedPoints ?? MAX_RECORDED_ORBIT_POINTS,
		1,
		MAX_RECORDED_ORBIT_POINTS,
		MAX_RECORDED_ORBIT_POINTS
	);
	const orbit: OrbitPoint[] = [];
	let value = { ...start };
	const resultContext = {
		roots,
		convergenceTolerance,
		relaxation,
		maximumMagnitude: isFiniteComplex(value) ? magnitude(value) : Number.POSITIVE_INFINITY
	};

	if (
		!isFiniteComplex(value) ||
		coefficients.some((coefficient) => !isFiniteComplex(coefficient))
	) {
		recordNewtonPoint(orbit, shouldRecord, recordLimit, 0, value, {
			residual: Number.POSITIVE_INFINITY,
			derivativeMagnitude: Number.POSITIVE_INFINITY,
			nearestRoot: nearestRootDiagnostic(value, roots)
		});
		return {
			...resultContext,
			status: 'non-finite',
			iterations: 0,
			value,
			orbit,
			residual: Number.POSITIVE_INFINITY
		};
	}

	for (let iteration = 0; iteration <= maxIterations; iteration += 1) {
		const evaluation = evaluatePolynomialAndDerivative(coefficients, value);
		const residual = magnitude(evaluation.value);
		const derivativeMagnitude = magnitude(evaluation.derivative);
		const nearest = nearestRootDiagnostic(value, roots);
		recordNewtonPoint(orbit, shouldRecord, recordLimit, iteration, value, {
			residual,
			derivativeMagnitude,
			nearestRoot: nearest
		});
		if (!Number.isFinite(residual) || !isFiniteComplex(evaluation.derivative)) {
			return {
				...resultContext,
				status: 'non-finite',
				iterations: iteration,
				value,
				orbit,
				residual: Number.POSITIVE_INFINITY
			};
		}

		if (residual <= convergenceTolerance) {
			const rootMatch = nearest && nearest.distance <= rootTolerance ? nearest : undefined;
			return {
				...resultContext,
				status: 'converged',
				iterations: iteration,
				value,
				orbit,
				rootIndex: rootMatch?.index,
				root: rootMatch?.root ?? { ...value },
				residual
			};
		}

		if (iteration === maxIterations) {
			return {
				...resultContext,
				status: 'max-iterations',
				iterations: iteration,
				value,
				orbit,
				residual
			};
		}

		if (derivativeMagnitude <= derivativeTolerance) {
			return {
				...resultContext,
				status: 'derivative-zero',
				iterations: iteration,
				value,
				orbit,
				residual
			};
		}

		value = subtractComplex(
			value,
			scaleComplex(divideComplex(evaluation.value, evaluation.derivative), relaxation)
		);
		if (!isFiniteComplex(value)) {
			recordNewtonPoint(orbit, shouldRecord, recordLimit, iteration + 1, value, {
				residual: Number.POSITIVE_INFINITY,
				derivativeMagnitude: Number.POSITIVE_INFINITY,
				nearestRoot: undefined
			});
			resultContext.maximumMagnitude = Number.POSITIVE_INFINITY;
			return {
				...resultContext,
				status: 'non-finite',
				iterations: iteration + 1,
				value,
				orbit,
				residual: Number.POSITIVE_INFINITY
			};
		}
		resultContext.maximumMagnitude = Math.max(resultContext.maximumMagnitude, magnitude(value));
	}

	/* The loop's final-iteration branch returns before this point. */
	return {
		...resultContext,
		status: 'max-iterations',
		iterations: maxIterations,
		value,
		orbit,
		residual: magnitude(evaluatePolynomial(coefficients, value))
	};
}

export function rootsOfUnity(degree: number): ComplexValue[] {
	const safeDegree = clampInteger(degree, 1, 64, 1);
	return Array.from({ length: safeDegree }, (_, index) => {
		const angle = (index * Math.PI * 2) / safeDegree;
		return { re: Math.cos(angle), im: Math.sin(angle) };
	});
}

/**
 * Recognises the atlas' structured a(zᵈ − 1) form so the inspector can mark
 * every known root without attempting a general-purpose polynomial solver.
 */
function inferRootsOfUnity(coefficients: readonly ComplexValue[]): ComplexValue[] {
	const degree = coefficients.length - 1;
	if (degree < 1 || degree > 64) return [];

	const leading = coefficients[0];
	if (magnitude(leading) <= Number.EPSILON) return [];
	const tolerance = Math.max(1, magnitude(leading)) * 1e-12;
	const middleIsZero = coefficients
		.slice(1, -1)
		.every((coefficient) => magnitude(coefficient) <= tolerance);
	const constantBalancesLeading =
		magnitude(addComplex(coefficients[coefficients.length - 1], leading)) <= tolerance;

	return middleIsZero && constantBalancesLeading ? rootsOfUnity(degree) : [];
}

type NearestRootDiagnostic = { index: number; root: ComplexValue; distance: number };

function nearestRootDiagnostic(
	value: ComplexValue,
	roots: readonly ComplexValue[] | undefined
): NearestRootDiagnostic | undefined {
	if (!roots?.length) return undefined;
	let nearestIndex = 0;
	let nearestDistance = Number.POSITIVE_INFINITY;
	for (let index = 0; index < roots.length; index += 1) {
		const candidateDistance = distanceSquared(value, roots[index]);
		if (Number.isFinite(candidateDistance) && candidateDistance < nearestDistance) {
			nearestDistance = candidateDistance;
			nearestIndex = index;
		}
	}
	if (!Number.isFinite(nearestDistance)) return undefined;
	return {
		index: nearestIndex,
		root: { ...roots[nearestIndex] },
		distance: Math.sqrt(nearestDistance)
	};
}

type NumericPeriodState = {
	value: ComplexValue;
	previous?: ComplexValue;
};

/**
 * Brent-style checkpoints nominate a candidate period after a bounded transient.
 * The detector then compares every state with the state one candidate period
 * earlier and only reports after several complete cycles agree at the requested
 * tolerance. This remains numerical evidence, never a proof of periodicity.
 */
function periodDetectionConfiguration(input: EscapeOrbitOptions, maxIterations: number) {
	return {
		enabled: input.periodicity !== false,
		tolerance: clampFinite(
			input.periodicityTolerance ?? DEFAULT_PERIODICITY_TOLERANCE,
			Number.EPSILON,
			1e-3,
			DEFAULT_PERIODICITY_TOLERANCE
		),
		transientIterations: clampInteger(
			input.periodicityTransient ?? DEFAULT_PERIODICITY_TRANSIENT,
			0,
			maxIterations,
			DEFAULT_PERIODICITY_TRANSIENT
		),
		requiredMatchingCycles: clampInteger(
			input.periodicityMatchingCycles ?? DEFAULT_PERIODICITY_MATCHING_CYCLES,
			1,
			12,
			DEFAULT_PERIODICITY_MATCHING_CYCLES
		),
		matchingCycles: 0
	};
}

function numericPeriodStatesMatch(
	left: NumericPeriodState,
	right: NumericPeriodState,
	toleranceSquared: number,
	comparesPrevious: boolean
): boolean {
	if (distanceSquared(left.value, right.value) > toleranceSquared) return false;
	return (
		!comparesPrevious ||
		distanceSquared(left.previous ?? ZERO_COMPLEX, right.previous ?? ZERO_COMPLEX) <=
			toleranceSquared
	);
}

const ZERO_COMPLEX: ComplexValue = Object.freeze({ re: 0, im: 0 });

function recordPoint(
	orbit: OrbitPoint[],
	enabled: boolean,
	limit: number,
	iteration: number,
	value: ComplexValue,
	previous?: ComplexValue
): void {
	if (!enabled || orbit.length >= limit) return;
	orbit.push({
		iteration,
		value: { ...value },
		previous: previous ? { ...previous } : undefined
	});
}

function recordNewtonPoint(
	orbit: OrbitPoint[],
	enabled: boolean,
	limit: number,
	iteration: number,
	value: ComplexValue,
	diagnostics: {
		residual: number;
		derivativeMagnitude: number;
		nearestRoot: NearestRootDiagnostic | undefined;
	}
): void {
	if (!enabled || orbit.length >= limit) return;
	orbit.push({
		iteration,
		value: { ...value },
		residual: diagnostics.residual,
		derivativeMagnitude: diagnostics.derivativeMagnitude,
		nearestRootIndex: diagnostics.nearestRoot?.index,
		nearestRootDistance: diagnostics.nearestRoot?.distance
	});
}

function clampInteger(value: number, minimum: number, maximum: number, fallback: number): number {
	if (!Number.isFinite(value)) return fallback;
	return Math.min(maximum, Math.max(minimum, Math.floor(value)));
}

function clampFinite(value: number, minimum: number, maximum: number, fallback: number): number {
	if (!Number.isFinite(value)) return fallback;
	return Math.min(maximum, Math.max(minimum, value));
}
