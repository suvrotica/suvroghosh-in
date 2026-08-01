import type { ComplexValue, FractalViewState, OrbitTrapState, PolynomialState } from '../types';
import {
	cloneCustomMapRecipe,
	customMapInitialDerivative,
	customMapInitialValue,
	customMapSupportsDistanceEstimate,
	customMapStep,
	transformCustomMapValue
} from '../custom-map';

export const MAX_SHADER_ITERATIONS = 2_048;
/**
 * ANGLE expands the double-single perturbation loop aggressively on several
 * integrated GPUs. Keep this experimental path deliberately bounded so a
 * first deep-zoom visit cannot monopolise the browser's main thread while the
 * shader compiler works. The ordinary and double-single programs retain the
 * larger general cap above.
 */
export const MAX_PERTURBATION_SHADER_ITERATIONS = 128;
export const MAX_POLYNOMIAL_COEFFICIENTS = 9;
export const MAX_NEWTON_ROOTS = MAX_POLYNOMIAL_COEFFICIENTS - 1;

export type FractalSampleStatus =
	| 'escaped'
	| 'bounded'
	| 'periodic'
	| 'converged'
	| 'unresolved'
	| 'non-finite';

export interface FractalSample {
	status: FractalSampleStatus;
	iterations: number;
	smoothIteration: number;
	magnitude: number;
	distanceEstimate: number;
	trapDistance: number;
	rootIndex: number;
	residual: number;
}

const ZERO: ComplexValue = { re: 0, im: 0 };
const ONE: ComplexValue = { re: 1, im: 0 };

function finite(value: number, fallback = 0) {
	return Number.isFinite(value) ? value : fallback;
}

export function add(a: ComplexValue, b: ComplexValue): ComplexValue {
	return { re: a.re + b.re, im: a.im + b.im };
}

export function subtract(a: ComplexValue, b: ComplexValue): ComplexValue {
	return { re: a.re - b.re, im: a.im - b.im };
}

export function multiply(a: ComplexValue, b: ComplexValue): ComplexValue {
	return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re };
}

export function divide(a: ComplexValue, b: ComplexValue): ComplexValue {
	const denominator = b.re * b.re + b.im * b.im;
	if (!Number.isFinite(denominator) || denominator < 1e-30) {
		return { re: Number.POSITIVE_INFINITY, im: Number.POSITIVE_INFINITY };
	}
	return {
		re: (a.re * b.re + a.im * b.im) / denominator,
		im: (a.im * b.re - a.re * b.im) / denominator
	};
}

export function magnitudeSquared(value: ComplexValue) {
	return value.re * value.re + value.im * value.im;
}

export function magnitude(value: ComplexValue) {
	return Math.hypot(value.re, value.im);
}

export function complexPowerInteger(value: ComplexValue, requestedExponent: number): ComplexValue {
	let exponent = Math.max(0, Math.min(12, Math.round(requestedExponent)));
	let result = { ...ONE };
	let factor = value;
	while (exponent > 0) {
		if (exponent % 2 === 1) result = multiply(result, factor);
		exponent = Math.floor(exponent / 2);
		if (exponent > 0) factor = multiply(factor, factor);
	}
	return result;
}

/**
 * Maps a top-left-origin pixel sample to the complex plane. `spanY` always
 * describes the full visible vertical span; width affects only the real span.
 */
export function pixelToComplex(
	state: Pick<FractalViewState, 'center' | 'spanY' | 'rotation' | 'flipY'>,
	x: number,
	y: number,
	width: number,
	height: number
): ComplexValue {
	const safeWidth = Math.max(1, finite(width, 1));
	const safeHeight = Math.max(1, finite(height, 1));
	const spanY = Math.max(1e-37, Math.abs(finite(state.spanY, 2.8)));
	const aspect = safeWidth / safeHeight;
	const localX = ((finite(x) + 0.5) / safeWidth - 0.5) * spanY * aspect;
	let localY = (0.5 - (finite(y) + 0.5) / safeHeight) * spanY;
	if (state.flipY) localY = -localY;
	const rotation = finite(state.rotation);
	const cosine = Math.cos(rotation);
	const sine = Math.sin(rotation);
	return {
		re: finite(state.center.re) + cosine * localX - sine * localY,
		im: finite(state.center.im) + sine * localX + cosine * localY
	};
}

export function normalizePolynomialCoefficients(polynomial?: PolynomialState): ComplexValue[] {
	const source = polynomial?.coefficients?.length
		? polynomial.coefficients.slice(0, MAX_POLYNOMIAL_COEFFICIENTS)
		: [
				{ re: 1, im: 0 },
				{ re: 0, im: 0 },
				{ re: 0, im: 0 },
				{ re: -1, im: 0 }
			];
	const coefficients = source.map((coefficient) => ({
		re: finite(coefficient.re),
		im: finite(coefficient.im)
	}));
	while (coefficients.length > 2 && magnitudeSquared(coefficients[0]) < 1e-24) {
		coefficients.shift();
	}
	if (coefficients.length < 2 || magnitudeSquared(coefficients[0]) < 1e-24) {
		return [
			{ re: 1, im: 0 },
			{ re: 0, im: 0 },
			{ re: 0, im: 0 },
			{ re: -1, im: 0 }
		];
	}
	return coefficients;
}

export function evaluatePolynomial(
	coefficients: readonly ComplexValue[],
	value: ComplexValue
): { value: ComplexValue; derivative: ComplexValue } {
	let polynomial = { ...coefficients[0] };
	let derivative = { ...ZERO };
	for (let index = 1; index < coefficients.length; index += 1) {
		derivative = add(multiply(derivative, value), polynomial);
		polynomial = add(multiply(polynomial, value), coefficients[index]);
	}
	return { value: polynomial, derivative };
}

/**
 * Deterministic Durand–Kerner roots used only to colour Newton basins. The
 * actual Newton iteration still evaluates the selected coefficient list.
 */
export function findPolynomialRoots(
	polynomial?: PolynomialState,
	maximumIterations = 96
): ComplexValue[] {
	const coefficients = normalizePolynomialCoefficients(polynomial);
	const degree = coefficients.length - 1;
	const leading = coefficients[0];
	const monic = coefficients.map((coefficient) => divide(coefficient, leading));
	let radius = 1;
	for (let index = 1; index < monic.length; index += 1) {
		radius = Math.max(radius, 1 + magnitude(monic[index]));
	}
	let roots = Array.from({ length: degree }, (_, index) => {
		const angle = (Math.PI * 2 * (index + 0.37)) / degree;
		return { re: Math.cos(angle) * radius, im: Math.sin(angle) * radius };
	});

	for (let iteration = 0; iteration < Math.max(1, maximumIterations); iteration += 1) {
		let maximumDelta = 0;
		const nextRoots = roots.map((root, rootIndex) => {
			let denominator = { ...ONE };
			for (let otherIndex = 0; otherIndex < roots.length; otherIndex += 1) {
				if (rootIndex === otherIndex) continue;
				let difference = subtract(root, roots[otherIndex]);
				if (magnitudeSquared(difference) < 1e-24) {
					const nudge = 1e-7 * (rootIndex + 1);
					difference = { re: difference.re + nudge, im: difference.im - nudge };
				}
				denominator = multiply(denominator, difference);
			}
			const polynomialValue = evaluatePolynomial(monic, root).value;
			const delta = divide(polynomialValue, denominator);
			maximumDelta = Math.max(maximumDelta, magnitude(delta));
			return subtract(root, delta);
		});
		roots = nextRoots;
		if (maximumDelta < 1e-12) break;
	}

	return roots
		.map((root) => ({ re: finite(root.re), im: finite(root.im) }))
		.sort((a, b) => Math.atan2(a.im, a.re) - Math.atan2(b.im, b.re));
}

export function nearestRootIndex(value: ComplexValue, roots: readonly ComplexValue[]) {
	let selected = -1;
	let nearest = Number.POSITIVE_INFINITY;
	for (let index = 0; index < roots.length; index += 1) {
		const distance = magnitudeSquared(subtract(value, roots[index]));
		if (distance < nearest) {
			nearest = distance;
			selected = index;
		}
	}
	return selected;
}

function rotateAround(value: ComplexValue, origin: ComplexValue, angle: number) {
	const x = value.re - origin.re;
	const y = value.im - origin.im;
	const cosine = Math.cos(angle);
	const sine = Math.sin(angle);
	return {
		re: cosine * x + sine * y,
		im: -sine * x + cosine * y
	};
}

export function orbitTrapDistance(value: ComplexValue, trap?: OrbitTrapState) {
	if (!trap) return magnitude(value);
	const local = rotateAround(value, trap.position, finite(trap.rotation));
	const radius = Math.max(1e-9, Math.abs(finite(trap.radius, 0.5)));
	const spacing = Math.max(1e-9, Math.abs(finite(trap.spacing, 0.5)));
	switch (trap.kind) {
		case 'point':
			return magnitude(local);
		case 'line':
			return Math.abs(local.im);
		case 'circle':
			return Math.abs(magnitude(local) - radius);
		case 'cross':
			return Math.min(Math.abs(local.re), Math.abs(local.im));
		case 'grid': {
			const gridX = Math.abs(local.re - spacing * Math.round(local.re / spacing));
			const gridY = Math.abs(local.im - spacing * Math.round(local.im / spacing));
			return Math.min(gridX, gridY);
		}
	}
}

function isMandelbrotInterior(value: ComplexValue) {
	const shifted = value.re - 0.25;
	const q = shifted * shifted + value.im * value.im;
	const cardioid = q * (q + shifted) <= 0.25 * value.im * value.im;
	const periodTwoBulb = (value.re + 1) ** 2 + value.im * value.im <= 0.0625;
	return cardioid || periodTwoBulb;
}

function finiteComplex(value: ComplexValue) {
	return Number.isFinite(value.re) && Number.isFinite(value.im);
}

function familyExponent(state: FractalViewState) {
	if (state.family === 'multibrot') {
		return Math.max(2, Math.min(12, Math.round(state.exponent)));
	}
	if (state.family === 'custom-map') return cloneCustomMapRecipe(state.customMap).power;
	return 2;
}

function smoothEscape(completedIterations: number, value: ComplexValue, exponent: number) {
	const logMagnitude = Math.log(Math.max(1.0000001, magnitude(value)));
	const correction = Math.log(Math.max(1e-12, logMagnitude)) / Math.log(exponent);
	return completedIterations + 1 - correction;
}

function escapeSample(
	state: FractalViewState,
	point: ComplexValue,
	requestedIterations: number
): FractalSample {
	const exponent = familyExponent(state);
	const parameterPlane = state.plane === 'parameter' && state.family !== 'julia';
	const c = parameterPlane ? point : state.juliaC;
	const customMap = cloneCustomMapRecipe(state.customMap);
	const customPlane = parameterPlane ? 'parameter' : 'dynamical';
	let z =
		state.family === 'custom-map'
			? customMapInitialValue(customMap, customPlane, point, c)
			: parameterPlane
				? { ...ZERO }
				: { ...point };
	let previous = state.family === 'phoenix' ? { ...state.phoenixPrevious } : { ...ZERO };
	let derivative =
		state.family === 'custom-map'
			? customMapInitialDerivative(customMap, customPlane)
			: parameterPlane
				? { ...ZERO }
				: { ...ONE };
	const customDistanceValid =
		state.family !== 'custom-map' || customMapSupportsDistanceEstimate(customMap, customPlane);
	let previousDerivative = { ...ZERO };
	let trapDistance = parameterPlane
		? Number.POSITIVE_INFINITY
		: orbitTrapDistance(z, state.orbitTrap);
	const bailoutSquared = Math.max(4, finite(state.bailout, 2) ** 2);
	const iterations = Math.max(1, Math.min(MAX_SHADER_ITERATIONS, Math.floor(requestedIterations)));

	if (!finiteComplex(z) || !finiteComplex(c)) {
		return {
			status: 'non-finite',
			iterations: 0,
			smoothIteration: 0,
			magnitude: Number.POSITIVE_INFINITY,
			distanceEstimate: 0,
			trapDistance,
			rootIndex: -1,
			residual: Number.POSITIVE_INFINITY
		};
	}

	const initialRadiusSquared = magnitudeSquared(z);
	if (initialRadiusSquared > bailoutSquared) {
		const initialRadius = Math.sqrt(initialRadiusSquared);
		const derivativeMagnitude = magnitude(derivative);
		return {
			status: 'escaped',
			iterations: 0,
			smoothIteration: smoothEscape(0, z, exponent),
			magnitude: initialRadius,
			distanceEstimate:
				customDistanceValid && derivativeMagnitude > 1e-15
					? Math.max(
							0,
							(0.5 * Math.log(initialRadiusSquared) * initialRadius) / derivativeMagnitude
						)
					: 0,
			trapDistance,
			rootIndex: -1,
			residual: 0
		};
	}

	if (
		state.analyticInteriorTests &&
		state.family === 'mandelbrot' &&
		parameterPlane &&
		state.coloring !== 'orbit-trap' &&
		isMandelbrotInterior(c)
	) {
		return {
			status: 'bounded',
			iterations,
			smoothIteration: iterations,
			magnitude: magnitude(z),
			distanceEstimate: 0,
			trapDistance: orbitTrapDistance(z, state.orbitTrap),
			rootIndex: -1,
			residual: 0
		};
	}

	let checkpoint = { ...z };
	let checkpointPrevious = { ...previous };
	for (let iteration = 0; iteration < iterations; iteration += 1) {
		const oldZ = z;
		const oldDerivative = derivative;
		const factor = multiply({ re: exponent, im: 0 }, complexPowerInteger(oldZ, exponent - 1));
		if (state.family === 'phoenix') {
			z = add(add(multiply(oldZ, oldZ), c), multiply(state.phoenixP, previous));
			derivative = add(
				multiply({ re: 2 * oldZ.re, im: 2 * oldZ.im }, oldDerivative),
				multiply(state.phoenixP, previousDerivative)
			);
			if (parameterPlane) derivative = add(derivative, ONE);
			previous = oldZ;
			previousDerivative = oldDerivative;
		} else if (state.family === 'custom-map') {
			z = customMapStep(oldZ, previous, c, customMap);
			if (customDistanceValid) {
				const transformed = transformCustomMapValue(oldZ, customMap);
				const customFactor = multiply(
					{ re: exponent, im: 0 },
					complexPowerInteger(transformed, exponent - 1)
				);
				derivative = multiply(customFactor, oldDerivative);
				if (customMap.addC && parameterPlane) derivative = add(derivative, ONE);
				if (customMap.memoryEnabled) {
					derivative = add(derivative, multiply(customMap.memoryCoefficient, previousDerivative));
				}
			} else {
				derivative = { ...ZERO };
			}
			if (customMap.memoryEnabled) {
				previous = oldZ;
				previousDerivative = oldDerivative;
			}
		} else if (state.family === 'burning-ship') {
			const folded = { re: Math.abs(oldZ.re), im: Math.abs(oldZ.im) };
			z = add(multiply(folded, folded), c);
			const signedDerivative = {
				re: oldDerivative.re * Math.sign(oldZ.re || 1),
				im: oldDerivative.im * Math.sign(oldZ.im || 1)
			};
			derivative = multiply({ re: 2 * folded.re, im: 2 * folded.im }, signedDerivative);
			if (parameterPlane) derivative = add(derivative, ONE);
		} else if (state.family === 'tricorn') {
			const conjugate = { re: oldZ.re, im: -oldZ.im };
			const derivativeConjugate = { re: oldDerivative.re, im: -oldDerivative.im };
			z = add(multiply(conjugate, conjugate), c);
			derivative = multiply({ re: 2 * conjugate.re, im: 2 * conjugate.im }, derivativeConjugate);
			if (parameterPlane) derivative = add(derivative, ONE);
		} else {
			z = add(complexPowerInteger(oldZ, exponent), c);
			derivative = multiply(factor, oldDerivative);
			if (parameterPlane) derivative = add(derivative, ONE);
		}

		trapDistance = Math.min(trapDistance, orbitTrapDistance(z, state.orbitTrap));
		if (!finiteComplex(z)) {
			return {
				status: 'non-finite',
				iterations: iteration + 1,
				smoothIteration: iteration + 1,
				magnitude: Number.POSITIVE_INFINITY,
				distanceEstimate: 0,
				trapDistance,
				rootIndex: -1,
				residual: Number.POSITIVE_INFINITY
			};
		}
		const radiusSquared = magnitudeSquared(z);
		if (radiusSquared > bailoutSquared) {
			const radius = Math.sqrt(radiusSquared);
			const derivativeMagnitude = magnitude(derivative);
			const distanceEstimate =
				customDistanceValid && derivativeMagnitude > 1e-15
					? Math.max(0, (0.5 * Math.log(radiusSquared) * radius) / derivativeMagnitude)
					: 0;
			return {
				status: 'escaped',
				iterations: iteration + 1,
				smoothIteration: smoothEscape(iteration + 1, z, exponent),
				magnitude: radius,
				distanceEstimate,
				trapDistance,
				rootIndex: -1,
				residual: 0
			};
		}

		const previousStateMatches =
			(state.family !== 'phoenix' && (state.family !== 'custom-map' || !customMap.memoryEnabled)) ||
			magnitudeSquared(subtract(previous, checkpointPrevious)) < 1e-22;
		if (
			iteration > 20 &&
			magnitudeSquared(subtract(z, checkpoint)) < 1e-22 &&
			previousStateMatches
		) {
			return {
				status: 'periodic',
				iterations: iteration + 1,
				smoothIteration: iteration + 1,
				magnitude: Math.sqrt(radiusSquared),
				distanceEstimate: 0,
				trapDistance,
				rootIndex: -1,
				residual: 0
			};
		}
		if (iteration % 20 === 0) {
			checkpoint = { ...z };
			checkpointPrevious = { ...previous };
		}
	}

	return {
		status: 'bounded',
		iterations,
		smoothIteration: iterations,
		magnitude: magnitude(z),
		distanceEstimate: 0,
		trapDistance,
		rootIndex: -1,
		residual: 0
	};
}

function newtonSample(
	state: FractalViewState,
	point: ComplexValue,
	requestedIterations: number,
	roots: readonly ComplexValue[]
): FractalSample {
	const coefficients = normalizePolynomialCoefficients(state.polynomial);
	const iterations = Math.max(1, Math.min(MAX_SHADER_ITERATIONS, Math.floor(requestedIterations)));
	const tolerance = Math.max(
		1e-15,
		Math.min(0.1, Math.abs(finite(state.convergenceTolerance, 1e-6)))
	);
	let z = { ...point };
	let trapDistance = orbitTrapDistance(z, state.orbitTrap);
	let completedIterations = 0;

	for (let iteration = 0; iteration < iterations; iteration += 1) {
		const evaluated = evaluatePolynomial(coefficients, z);
		const residual = magnitude(evaluated.value);
		if (residual <= tolerance) {
			return {
				status: 'converged',
				iterations: iteration,
				smoothIteration: iteration,
				magnitude: magnitude(z),
				distanceEstimate: residual,
				trapDistance,
				rootIndex: nearestRootIndex(z, roots),
				residual
			};
		}
		if (magnitudeSquared(evaluated.derivative) < 1e-24) break;
		const step = divide(evaluated.value, evaluated.derivative);
		const relaxedStep = multiply(step, {
			re: Math.max(0.05, Math.min(2, finite(state.newtonRelaxation, 1))),
			im: 0
		});
		z = subtract(z, relaxedStep);
		completedIterations = iteration + 1;
		trapDistance = Math.min(trapDistance, orbitTrapDistance(z, state.orbitTrap));
		if (!finiteComplex(z)) {
			return {
				status: 'non-finite',
				iterations: iteration + 1,
				smoothIteration: iteration + 1,
				magnitude: Number.POSITIVE_INFINITY,
				distanceEstimate: 0,
				trapDistance,
				rootIndex: -1,
				residual: Number.POSITIVE_INFINITY
			};
		}
		if (magnitude(relaxedStep) <= tolerance) {
			const finalResidual = magnitude(evaluatePolynomial(coefficients, z).value);
			if (finalResidual <= tolerance) {
				return {
					status: 'converged',
					iterations: iteration + 1,
					smoothIteration: iteration + 1,
					magnitude: magnitude(z),
					distanceEstimate: finalResidual,
					trapDistance,
					rootIndex: nearestRootIndex(z, roots),
					residual: finalResidual
				};
			}
		}
	}

	const finalResidual = magnitude(evaluatePolynomial(coefficients, z).value);
	if (finalResidual <= tolerance) {
		return {
			status: 'converged',
			iterations: completedIterations,
			smoothIteration: completedIterations,
			magnitude: magnitude(z),
			distanceEstimate: finalResidual,
			trapDistance,
			rootIndex: nearestRootIndex(z, roots),
			residual: finalResidual
		};
	}

	return {
		status: 'unresolved',
		iterations: completedIterations,
		smoothIteration: completedIterations,
		magnitude: magnitude(z),
		distanceEstimate: finalResidual,
		trapDistance,
		rootIndex: -1,
		residual: finalResidual
	};
}

export function sampleFractalPoint(
	state: FractalViewState,
	point: ComplexValue,
	maximumIterations = state.maxIterations,
	newtonRoots?: readonly ComplexValue[]
): FractalSample {
	if (state.family === 'newton') {
		return newtonSample(
			state,
			point,
			maximumIterations,
			newtonRoots ?? findPolynomialRoots(state.polynomial)
		);
	}
	if (
		state.family === 'mandelbrot' ||
		state.family === 'julia' ||
		state.family === 'multibrot' ||
		state.family === 'burning-ship' ||
		state.family === 'tricorn' ||
		state.family === 'phoenix' ||
		state.family === 'custom-map'
	) {
		return escapeSample(state, point, maximumIterations);
	}
	return {
		status: 'unresolved',
		iterations: 0,
		smoothIteration: 0,
		magnitude: 0,
		distanceEstimate: 0,
		trapDistance: 0,
		rootIndex: -1,
		residual: Number.POSITIVE_INFINITY
	};
}
