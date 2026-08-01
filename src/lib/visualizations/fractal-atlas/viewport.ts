import Decimal from 'decimal.js';
import type {
	ComplexValue,
	DecimalComplexValue,
	FractalViewport,
	ScreenPoint,
	ViewportBounds
} from './types';

/**
 * Perturbation keeps pixel deltas relative to a decimal reference orbit, so it
 * remains useful after absolute JavaScript coordinate addition has collapsed.
 * 1e-35 stays comfortably above highp float underflow in the delta shader and
 * is an explicit finite precision floor—not a claim of infinite zoom.
 */
export const MIN_VIEW_SPAN_Y = 1e-35;
export const MAX_VIEW_SPAN_Y = 1e6;

export const DEFAULT_FRACTAL_VIEWPORT: FractalViewport = {
	center: { re: -0.5, im: 0 },
	centerDecimal: { re: '-0.5', im: '0' },
	spanY: 2.8,
	rotation: 0
};

export function viewportSpanX(viewport: FractalViewport, width: number, height: number): number {
	return (viewport.spanY * safeDimension(width)) / safeDimension(height);
}

/**
 * Return the axis-aligned bounds enclosing the possibly rotated viewport.
 * Coordinate conversion should use screenToComplex rather than interpolating
 * these bounds when rotation is non-zero.
 */
export function viewportBounds(
	viewport: FractalViewport,
	width: number,
	height: number
): ViewportBounds {
	const corners = [
		screenToComplex(viewport, 0, 0, width, height),
		screenToComplex(viewport, width, 0, width, height),
		screenToComplex(viewport, width, height, width, height),
		screenToComplex(viewport, 0, height, width, height)
	];
	return {
		minRe: Math.min(...corners.map((point) => point.re)),
		maxRe: Math.max(...corners.map((point) => point.re)),
		minIm: Math.min(...corners.map((point) => point.im)),
		maxIm: Math.max(...corners.map((point) => point.im))
	};
}

export function screenToComplex(
	viewport: FractalViewport,
	x: number,
	y: number,
	width: number,
	height: number
): ComplexValue {
	const safeWidth = safeDimension(width);
	const safeHeight = safeDimension(height);
	const spanX = viewportSpanX(viewport, safeWidth, safeHeight);
	const localRe = (x / safeWidth - 0.5) * spanX;
	const localIm = (0.5 - y / safeHeight) * viewport.spanY;
	const rotated = rotate(localRe, localIm, viewport.rotation);
	return {
		re: viewport.center.re + rotated.re,
		im: viewport.center.im + rotated.im
	};
}

/**
 * Exact-centre counterpart to screenToComplex. Screen offsets remain bounded
 * Numbers, then Decimal addition preserves them when absolute Number addition
 * would collapse at a deep centre.
 */
export function screenToDecimalComplex(
	viewport: FractalViewport,
	x: number,
	y: number,
	width: number,
	height: number
): DecimalComplexValue {
	const offset = screenOffset(viewport, x, y, width, height);
	const translated = translateViewportCenter(viewport, offset.re, offset.im);
	return (
		translated.centerDecimal ?? {
			re: translated.center.re.toString(),
			im: translated.center.im.toString()
		}
	);
}

export function complexToScreen(
	viewport: FractalViewport,
	value: ComplexValue,
	width: number,
	height: number
): ScreenPoint {
	const safeWidth = safeDimension(width);
	const safeHeight = safeDimension(height);
	const spanX = viewportSpanX(viewport, safeWidth, safeHeight);
	const deltaRe = value.re - viewport.center.re;
	const deltaIm = value.im - viewport.center.im;
	const local = rotate(deltaRe, deltaIm, -viewport.rotation);
	return {
		x: (local.re / spanX + 0.5) * safeWidth,
		y: (0.5 - local.im / viewport.spanY) * safeHeight
	};
}

export function decimalComplexToScreen(
	viewport: FractalViewport,
	value: DecimalComplexValue,
	width: number,
	height: number
): ScreenPoint {
	const safeWidth = safeDimension(width);
	const safeHeight = safeDimension(height);
	const center = normalizeDecimalCenter(viewport.centerDecimal, viewport.center);
	const DecimalType = Decimal.clone({
		precision: exactOperationDigits(center.re, center.im, viewport.spanY),
		rounding: Decimal.ROUND_HALF_EVEN,
		toExpNeg: -1_000_000,
		toExpPos: 1_000_000
	});
	let deltaRe: number;
	let deltaIm: number;
	try {
		deltaRe = new DecimalType(value.re).minus(center.re).toNumber();
		deltaIm = new DecimalType(value.im).minus(center.im).toNumber();
	} catch {
		return complexToScreen(
			viewport,
			{ re: Number(value.re), im: Number(value.im) },
			safeWidth,
			safeHeight
		);
	}
	const local = rotate(deltaRe, deltaIm, -viewport.rotation);
	return {
		x: (local.re / viewportSpanX(viewport, safeWidth, safeHeight) + 0.5) * safeWidth,
		y: (0.5 - local.im / viewport.spanY) * safeHeight
	};
}

export function panViewport(
	viewport: FractalViewport,
	deltaX: number,
	deltaY: number,
	width: number,
	height: number
): FractalViewport {
	const safeWidth = safeDimension(width);
	const safeHeight = safeDimension(height);
	const localRe = (deltaX / safeWidth) * viewportSpanX(viewport, safeWidth, safeHeight);
	const localIm = (-deltaY / safeHeight) * viewport.spanY;
	const worldDelta = rotate(localRe, localIm, viewport.rotation);
	return translateViewportCenter(viewport, -worldDelta.re, -worldDelta.im);
}

/**
 * Zoom around a screen-space anchor. The complex value beneath that cursor is
 * invariant apart from ordinary floating-point rounding.
 */
export function zoomViewport(
	viewport: FractalViewport,
	x: number,
	y: number,
	width: number,
	height: number,
	factor: number
): FractalViewport {
	const safeFactor = Number.isFinite(factor) && factor > 0 ? factor : 1;
	const anchorBefore = screenOffset(viewport, x, y, width, height);
	const next = {
		...viewport,
		center: { ...viewport.center },
		spanY: clampSpan(viewport.spanY * safeFactor)
	};
	const anchorAfter = screenOffset(next, x, y, width, height);
	return translateViewportCenter(
		next,
		anchorBefore.re - anchorAfter.re,
		anchorBefore.im - anchorAfter.im
	);
}

export function zoomToRectangle(
	viewport: FractalViewport,
	start: ScreenPoint,
	end: ScreenPoint,
	width: number,
	height: number
): FractalViewport {
	const safeWidth = safeDimension(width);
	const safeHeight = safeDimension(height);
	const rectangleWidth = Math.abs(end.x - start.x);
	const rectangleHeight = Math.abs(end.y - start.y);
	if (rectangleWidth < 1 || rectangleHeight < 1) {
		return { ...viewport, center: { ...viewport.center } };
	}

	const midpoint = {
		x: (start.x + end.x) / 2,
		y: (start.y + end.y) / 2
	};
	const offset = screenOffset(viewport, midpoint.x, midpoint.y, safeWidth, safeHeight);
	const scale = Math.max(rectangleWidth / safeWidth, rectangleHeight / safeHeight);
	return {
		...translateViewportCenter(viewport, offset.re, offset.im),
		spanY: clampSpan(viewport.spanY * scale),
		rotation: viewport.rotation
	};
}

export function rotateViewport(viewport: FractalViewport, radians: number): FractalViewport {
	return {
		...viewport,
		center: { ...viewport.center },
		rotation: normalizeAngle(Number.isFinite(radians) ? radians : viewport.rotation)
	};
}

export function normalizeViewport(
	viewport: Partial<FractalViewport> | null | undefined,
	fallback: FractalViewport = DEFAULT_FRACTAL_VIEWPORT
): FractalViewport {
	const center = viewport?.center;
	const centerDecimal = normalizeDecimalCenter(
		viewport?.centerDecimal,
		center ?? fallback.center,
		fallback.centerDecimal
	);
	return {
		center: {
			re: Number(centerDecimal.re),
			im: Number(centerDecimal.im)
		},
		centerDecimal,
		spanY: clampSpan(finiteOr(viewport?.spanY, fallback.spanY)),
		rotation: normalizeAngle(finiteOr(viewport?.rotation, fallback.rotation))
	};
}

export function pixelScale(viewport: FractalViewport, height: number): number {
	return viewport.spanY / safeDimension(height);
}

export interface PrecisionEstimate {
	pixelScale: number;
	collapsedX: boolean;
	collapsedY: boolean;
	significantDigits: number;
}

/**
 * Detect when adding one pixel to a Number-valued centre no longer changes the
 * represented coordinate. This is a warning meter, not an arbitrary-precision claim.
 */
export function estimateViewportPrecision(
	viewport: FractalViewport,
	width: number,
	height: number
): PrecisionEstimate {
	const scaleY = pixelScale(viewport, height);
	const scaleX = viewportSpanX(viewport, width, height) / safeDimension(width);
	const collapsedX = viewport.center.re + scaleX === viewport.center.re;
	const collapsedY = viewport.center.im + scaleY === viewport.center.im;
	const significantDigits = Math.max(
		0,
		Math.min(17, Math.floor(-Math.log10(Math.max(scaleX, scaleY))))
	);
	return {
		pixelScale: Math.max(scaleX, scaleY),
		collapsedX,
		collapsedY,
		significantDigits: Number.isFinite(significantDigits) ? significantDigits : 0
	};
}

export function niceGridStep(span: number, pixelLength: number, targetPixels = 88): number {
	const targetWorld =
		(Math.abs(finiteOr(span, 1)) * Math.max(8, finiteOr(targetPixels, 88))) /
		safeDimension(pixelLength);
	const exponent = Math.floor(Math.log10(Math.max(Number.MIN_VALUE, targetWorld)));
	const fraction = targetWorld / 10 ** exponent;
	const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
	return niceFraction * 10 ** exponent;
}

/**
 * Produces a finite axis ledger even when `first + step === first` at a deep
 * absolute coordinate. Recomputing from the index avoids accumulated drift;
 * the equality guard turns numeric stagnation into an honest empty/short grid
 * instead of an unbounded UI-thread loop.
 */
export function boundedGridValues(
	minimum: number,
	maximum: number,
	step: number,
	maximumLines = 64
): number[] {
	if (
		!Number.isFinite(minimum) ||
		!Number.isFinite(maximum) ||
		!Number.isFinite(step) ||
		step <= 0 ||
		maximum < minimum
	) {
		return [];
	}
	const limit = Math.max(1, Math.min(256, Math.floor(maximumLines)));
	const first = Math.ceil(minimum / step) * step;
	const values: number[] = [];
	for (let index = 0; index < limit; index += 1) {
		const value = first + step * index;
		if (!Number.isFinite(value) || value > maximum + step / 2) break;
		if (values.length > 0 && value === values.at(-1)) break;
		values.push(value);
	}
	return values;
}

function rotate(re: number, im: number, angle: number): ComplexValue {
	const cosine = Math.cos(angle);
	const sine = Math.sin(angle);
	return {
		re: re * cosine - im * sine,
		im: re * sine + im * cosine
	};
}

function screenOffset(
	viewport: FractalViewport,
	x: number,
	y: number,
	width: number,
	height: number
) {
	const safeWidth = safeDimension(width);
	const safeHeight = safeDimension(height);
	const localRe = (x / safeWidth - 0.5) * viewportSpanX(viewport, safeWidth, safeHeight);
	const localIm = (0.5 - y / safeHeight) * viewport.spanY;
	return rotate(localRe, localIm, viewport.rotation);
}

function translateViewportCenter(
	viewport: FractalViewport,
	deltaRe: number,
	deltaIm: number
): FractalViewport {
	const current = normalizeDecimalCenter(viewport.centerDecimal, viewport.center);
	const DecimalType = Decimal.clone({
		precision: exactOperationDigits(current.re, current.im, viewport.spanY),
		rounding: Decimal.ROUND_HALF_EVEN,
		toExpNeg: -1_000_000,
		toExpPos: 1_000_000
	});
	const re = new DecimalType(current.re)
		.plus(new DecimalType(finiteOr(deltaRe, 0).toString()))
		.toString();
	const im = new DecimalType(current.im)
		.plus(new DecimalType(finiteOr(deltaIm, 0).toString()))
		.toString();
	return {
		...viewport,
		center: { re: Number(re), im: Number(im) },
		centerDecimal: { re, im }
	};
}

function exactOperationDigits(re: string, im: string, spanY: number) {
	const existingDigits = Math.max(decimalSignificantDigits(re), decimalSignificantDigits(im));
	const scaleDigits = Math.max(
		0,
		Math.ceil(-Math.log10(Math.max(Number.MIN_VALUE, Math.abs(spanY))))
	);
	return Math.max(34, Math.min(160, existingDigits + 8, scaleDigits + 32));
}

function decimalSignificantDigits(value: string) {
	const mantissa = value.toLowerCase().split('e')[0].replace(/^[+-]/u, '').replace('.', '');
	return Math.max(1, mantissa.replace(/^0+/u, '').length);
}

function normalizeDecimalCenter(
	value: FractalViewport['centerDecimal'] | null | undefined,
	numericFallback: Partial<ComplexValue>,
	decimalFallback?: FractalViewport['centerDecimal']
) {
	const fallbackRe = finiteOr(numericFallback.re, Number(decimalFallback?.re ?? -0.5)).toString();
	const fallbackIm = finiteOr(numericFallback.im, Number(decimalFallback?.im ?? 0)).toString();
	return {
		re: validDecimalCoordinate(value?.re) ? value.re : fallbackRe,
		im: validDecimalCoordinate(value?.im) ? value.im : fallbackIm
	};
}

function validDecimalCoordinate(value: unknown): value is string {
	if (
		typeof value !== 'string' ||
		value.length < 1 ||
		value.length > 160 ||
		!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/iu.test(value)
	) {
		return false;
	}
	const numeric = Number(value);
	return Number.isFinite(numeric);
}

function clampSpan(span: number): number {
	if (!Number.isFinite(span) || span <= 0) return DEFAULT_FRACTAL_VIEWPORT.spanY;
	return Math.min(MAX_VIEW_SPAN_Y, Math.max(MIN_VIEW_SPAN_Y, span));
}

function safeDimension(value: number): number {
	return Math.max(1, Number.isFinite(value) ? Math.abs(value) : 1);
}

function finiteOr(value: number | null | undefined, fallback: number): number {
	return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizeAngle(value: number): number {
	const turn = Math.PI * 2;
	return ((((value + Math.PI) % turn) + turn) % turn) - Math.PI;
}
