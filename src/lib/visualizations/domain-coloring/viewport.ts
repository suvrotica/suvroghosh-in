import type { Viewport, ViewportBounds } from './types';

export const DEFAULT_VIEWPORT: Viewport = {
	centerRe: 0,
	centerIm: 0,
	spanIm: 4
};

const minimumSpan = 1e-5;
const maximumSpan = 1e6;

export function viewportBounds(viewport: Viewport, width: number, height: number): ViewportBounds {
	const safeHeight = Math.max(1, height);
	const spanRe = viewport.spanIm * (Math.max(1, width) / safeHeight);
	return {
		minRe: viewport.centerRe - spanRe / 2,
		maxRe: viewport.centerRe + spanRe / 2,
		minIm: viewport.centerIm - viewport.spanIm / 2,
		maxIm: viewport.centerIm + viewport.spanIm / 2
	};
}

export function screenToComplex(
	viewport: Viewport,
	x: number,
	y: number,
	width: number,
	height: number
) {
	const bounds = viewportBounds(viewport, width, height);
	return {
		re: bounds.minRe + (x / Math.max(1, width)) * (bounds.maxRe - bounds.minRe),
		im: bounds.maxIm - (y / Math.max(1, height)) * (bounds.maxIm - bounds.minIm)
	};
}

export function panViewport(
	viewport: Viewport,
	deltaX: number,
	deltaY: number,
	width: number,
	height: number
): Viewport {
	const bounds = viewportBounds(viewport, width, height);
	return {
		...viewport,
		centerRe: viewport.centerRe - (deltaX / Math.max(1, width)) * (bounds.maxRe - bounds.minRe),
		centerIm: viewport.centerIm + (deltaY / Math.max(1, height)) * viewport.spanIm
	};
}

export function zoomViewport(
	viewport: Viewport,
	x: number,
	y: number,
	width: number,
	height: number,
	factor: number
): Viewport {
	const anchor = screenToComplex(viewport, x, y, width, height);
	const nextSpan = Math.min(maximumSpan, Math.max(minimumSpan, viewport.spanIm * factor));
	const next = { ...viewport, spanIm: nextSpan };
	const shiftedAnchor = screenToComplex(next, x, y, width, height);
	return {
		...next,
		centerRe: next.centerRe + anchor.re - shiftedAnchor.re,
		centerIm: next.centerIm + anchor.im - shiftedAnchor.im
	};
}

export function niceGridStep(span: number, pixelLength: number, targetPixels = 88): number {
	const targetWorld = (span * targetPixels) / Math.max(1, pixelLength);
	const exponent = Math.floor(Math.log10(targetWorld));
	const fraction = targetWorld / 10 ** exponent;
	const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
	return niceFraction * 10 ** exponent;
}
