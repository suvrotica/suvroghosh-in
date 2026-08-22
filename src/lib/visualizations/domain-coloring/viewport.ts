import type { Viewport, ViewportBounds } from './types';

export type ViewportPlotRect = {
	x: number;
	y: number;
	width: number;
	height: number;
};

export const DEFAULT_VIEWPORT: Viewport = {
	centerRe: 0,
	centerIm: 0,
	spanRe: 64 / 9,
	spanIm: 4
};

const minimumSpan = 1e-5;
const maximumSpan = 1e6;

export function viewportBounds(viewport: Viewport): ViewportBounds {
	return {
		minRe: viewport.centerRe - viewport.spanRe / 2,
		maxRe: viewport.centerRe + viewport.spanRe / 2,
		minIm: viewport.centerIm - viewport.spanIm / 2,
		maxIm: viewport.centerIm + viewport.spanIm / 2
	};
}

export function viewportFromBounds(bounds: ViewportBounds): Viewport {
	const spanRe = Math.min(maximumSpan, Math.max(minimumSpan, bounds.maxRe - bounds.minRe));
	const spanIm = Math.min(maximumSpan, Math.max(minimumSpan, bounds.maxIm - bounds.minIm));
	return {
		centerRe: (bounds.minRe + bounds.maxRe) / 2,
		centerIm: (bounds.minIm + bounds.maxIm) / 2,
		spanRe,
		spanIm
	};
}

/**
 * Fit the exact mathematical rectangle into a screen rectangle without
 * stretching either complex-plane axis. Any spare pixels become letterbox
 * bars, so one unit of Re z always has the same size as one unit of Im z.
 */
export function viewportPlotRect(
	viewport: Viewport,
	width: number,
	height: number
): ViewportPlotRect {
	const safeWidth = Math.max(1, width);
	const safeHeight = Math.max(1, height);
	const domainAspect = viewport.spanRe / viewport.spanIm;
	const canvasAspect = safeWidth / safeHeight;
	if (canvasAspect > domainAspect) {
		const plotWidth = safeHeight * domainAspect;
		return {
			x: (safeWidth - plotWidth) / 2,
			y: 0,
			width: plotWidth,
			height: safeHeight
		};
	}
	const plotHeight = safeWidth / domainAspect;
	return {
		x: 0,
		y: (safeHeight - plotHeight) / 2,
		width: safeWidth,
		height: plotHeight
	};
}

export function screenToComplex(
	viewport: Viewport,
	x: number,
	y: number,
	width: number,
	height: number
) {
	const bounds = viewportBounds(viewport);
	const plot = viewportPlotRect(viewport, width, height);
	const plotX = Math.max(plot.x, Math.min(plot.x + plot.width, x));
	const plotY = Math.max(plot.y, Math.min(plot.y + plot.height, y));
	return {
		re: bounds.minRe + ((plotX - plot.x) / plot.width) * viewport.spanRe,
		im: bounds.maxIm - ((plotY - plot.y) / plot.height) * viewport.spanIm
	};
}

export function panViewport(
	viewport: Viewport,
	deltaX: number,
	deltaY: number,
	width: number,
	height: number
): Viewport {
	const plot = viewportPlotRect(viewport, width, height);
	return {
		...viewport,
		centerRe: viewport.centerRe - (deltaX / plot.width) * viewport.spanRe,
		centerIm: viewport.centerIm + (deltaY / plot.height) * viewport.spanIm
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
	const boundedFactor = Math.min(
		maximumSpan / Math.max(viewport.spanRe, viewport.spanIm),
		Math.max(minimumSpan / Math.min(viewport.spanRe, viewport.spanIm), factor)
	);
	const next = {
		...viewport,
		spanRe: Math.min(maximumSpan, Math.max(minimumSpan, viewport.spanRe * boundedFactor)),
		spanIm: Math.min(maximumSpan, Math.max(minimumSpan, viewport.spanIm * boundedFactor))
	};
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
