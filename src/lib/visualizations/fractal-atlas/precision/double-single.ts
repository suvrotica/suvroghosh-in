import Decimal from 'decimal.js';

/**
 * CPU reference implementation of the float32 double-single operations used by
 * the deep-zoom fragment shaders. Every elementary operation is rounded with
 * Math.fround so tests exercise the same 24-bit arithmetic model as GLSL highp
 * floats rather than silently benefiting from JavaScript doubles.
 */
export interface DoubleSingle {
	hi: number;
	lo: number;
}

export interface DoubleSingleComplex {
	re: DoubleSingle;
	im: DoubleSingle;
}

const SPLITTER = 4_097;

function f32(value: number) {
	return Math.fround(value);
}

function normalize(hi: number, lo: number): DoubleSingle {
	const sum = f32(hi + lo);
	return { hi: sum, lo: f32(lo - f32(sum - hi)) };
}

export function splitDoubleSingle(value: number): DoubleSingle {
	const finite = Number.isFinite(value) ? value : 0;
	const hi = f32(finite);
	return normalize(hi, f32(finite - hi));
}

export function splitDecimalDoubleSingle(
	value: string | undefined,
	fallback: number
): DoubleSingle {
	if (typeof value !== 'string' || value.length > 160) return splitDoubleSingle(fallback);
	try {
		const decimal = new Decimal(value);
		if (!decimal.isFinite()) return splitDoubleSingle(fallback);
		const hi = f32(decimal.toNumber());
		return normalize(hi, f32(decimal.minus(hi.toString()).toNumber()));
	} catch {
		return splitDoubleSingle(fallback);
	}
}

export function doubleSingleToNumber(value: DoubleSingle) {
	return value.hi + value.lo;
}

export function addDoubleSingle(a: DoubleSingle, b: DoubleSingle): DoubleSingle {
	const sum = f32(a.hi + b.hi);
	const virtualB = f32(sum - a.hi);
	const error = f32(f32(a.hi - f32(sum - virtualB)) + f32(b.hi - virtualB) + f32(a.lo + b.lo));
	return normalize(sum, error);
}

export function negateDoubleSingle(value: DoubleSingle): DoubleSingle {
	return { hi: f32(-value.hi), lo: f32(-value.lo) };
}

export function subtractDoubleSingle(a: DoubleSingle, b: DoubleSingle): DoubleSingle {
	return addDoubleSingle(a, negateDoubleSingle(b));
}

function splitFloat(value: number): readonly [number, number] {
	const scaled = f32(value * SPLITTER);
	const high = f32(scaled - f32(scaled - value));
	return [high, f32(value - high)];
}

export function multiplyDoubleSingle(a: DoubleSingle, b: DoubleSingle): DoubleSingle {
	const product = f32(a.hi * b.hi);
	const [aHigh, aLow] = splitFloat(a.hi);
	const [bHigh, bLow] = splitFloat(b.hi);
	let error = f32(aHigh * bHigh - product);
	error = f32(error + f32(aHigh * bLow));
	error = f32(error + f32(aLow * bHigh));
	error = f32(error + f32(aLow * bLow));
	error = f32(error + f32(a.hi * b.lo));
	error = f32(error + f32(a.lo * b.hi));
	error = f32(error + f32(a.lo * b.lo));
	return normalize(product, error);
}

export function scaleDoubleSingle(value: DoubleSingle, scalar: number): DoubleSingle {
	return multiplyDoubleSingle(value, splitDoubleSingle(scalar));
}

export function splitComplexDoubleSingle(re: number, im: number): DoubleSingleComplex {
	return { re: splitDoubleSingle(re), im: splitDoubleSingle(im) };
}

export function addComplexDoubleSingle(
	a: DoubleSingleComplex,
	b: DoubleSingleComplex
): DoubleSingleComplex {
	return {
		re: addDoubleSingle(a.re, b.re),
		im: addDoubleSingle(a.im, b.im)
	};
}

export function multiplyComplexDoubleSingle(
	a: DoubleSingleComplex,
	b: DoubleSingleComplex
): DoubleSingleComplex {
	return {
		re: subtractDoubleSingle(multiplyDoubleSingle(a.re, b.re), multiplyDoubleSingle(a.im, b.im)),
		im: addDoubleSingle(multiplyDoubleSingle(a.re, b.im), multiplyDoubleSingle(a.im, b.re))
	};
}

export function doubleSingleComplexToNumber(value: DoubleSingleComplex) {
	return {
		re: doubleSingleToNumber(value.re),
		im: doubleSingleToNumber(value.im)
	};
}

/**
 * Tests whether a rotated one-pixel basis survives double-single centre
 * addition. This mirrors floatCoordinateGridCollapses but uses the actual
 * hi/lo operations, making automatic tier selection evidence based.
 */
export function doubleSingleCoordinateGridCollapses(
	centerRe: number,
	centerIm: number,
	spanY: number,
	rotation: number,
	renderHeight: number
) {
	const center = splitComplexDoubleSingle(centerRe, centerIm);
	const safeSpan = Number.isFinite(spanY) && spanY !== 0 ? Math.abs(spanY) : 2.8;
	const step = safeSpan / Math.max(1, Math.floor(renderHeight));
	const cosine = Math.cos(Number.isFinite(rotation) ? rotation : 0);
	const sine = Math.sin(Number.isFinite(rotation) ? rotation : 0);
	const basisX = splitComplexDoubleSingle(cosine * step, sine * step);
	const basisY = splitComplexDoubleSingle(-sine * step, cosine * step);
	const x = addComplexDoubleSingle(center, basisX);
	const y = addComplexDoubleSingle(center, basisY);
	const xRe = doubleSingleToNumber(subtractDoubleSingle(x.re, center.re));
	const xIm = doubleSingleToNumber(subtractDoubleSingle(x.im, center.im));
	const yRe = doubleSingleToNumber(subtractDoubleSingle(y.re, center.re));
	const yIm = doubleSingleToNumber(subtractDoubleSingle(y.im, center.im));
	const xCollapsed = xRe === 0 && xIm === 0;
	const yCollapsed = yRe === 0 && yIm === 0;
	const determinant = xRe * yIm - xIm * yRe;
	return xCollapsed || yCollapsed || determinant === 0;
}
