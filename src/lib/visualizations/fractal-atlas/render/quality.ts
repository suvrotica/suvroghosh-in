import type { RenderQuality } from '../types';

export const WEBGL_MAX_PIXELS = 4_194_304;
export const WEBGL_PREVIEW_MAX_PIXELS = 786_432;
export const WEBGL_MAX_WORK_UNITS = 180_000_000;
export const CPU_MAX_PIXELS = 196_608;
export const CPU_PREVIEW_MAX_PIXELS = 98_304;
export const CPU_MAX_WORK_UNITS = 14_000_000;
export const MAX_RENDER_DIMENSION = 16_384;

export interface RenderSizeOptions {
	devicePixelRatio?: number;
	quality?: RenderQuality;
	preview?: boolean;
	maxPixels?: number;
	maxDimension?: number;
}

export interface RenderSize {
	width: number;
	height: number;
	pixelRatio: number;
	resolutionScale: number;
	pixelCount: number;
}

const QUALITY_SETTINGS: Record<
	RenderQuality,
	{ resolutionScale: number; maximumPixelRatio: number; maximumPixels: number }
> = {
	battery: { resolutionScale: 0.4, maximumPixelRatio: 1, maximumPixels: 393_216 },
	draft: { resolutionScale: 0.58, maximumPixelRatio: 1, maximumPixels: 786_432 },
	balanced: { resolutionScale: 0.82, maximumPixelRatio: 1.5, maximumPixels: 2_097_152 },
	high: { resolutionScale: 1, maximumPixelRatio: 2, maximumPixels: WEBGL_MAX_PIXELS }
};

export interface ProgressiveWorkerBudget {
	maxWidth: number;
	densitySampleCap: number;
	densityBatchSize: number;
	fernPointCap: number;
	fernBatchSize: number;
}

const CPU_FALLBACK_PIXEL_BUDGET: Record<RenderQuality, number> = {
	battery: 49_152,
	draft: 98_304,
	balanced: 147_456,
	high: CPU_MAX_PIXELS
};

const PROGRESSIVE_WORKER_BUDGET: Record<RenderQuality, ProgressiveWorkerBudget> = {
	battery: {
		maxWidth: 360,
		densitySampleCap: 75_000,
		densityBatchSize: 1_000,
		fernPointCap: 20_000,
		fernBatchSize: 1_500
	},
	draft: {
		maxWidth: 480,
		densitySampleCap: 200_000,
		densityBatchSize: 2_500,
		fernPointCap: 45_000,
		fernBatchSize: 5_000
	},
	balanced: {
		maxWidth: 700,
		densitySampleCap: 5_000_000,
		densityBatchSize: 8_000,
		fernPointCap: 140_000,
		fernBatchSize: 5_000
	},
	high: {
		maxWidth: 900,
		densitySampleCap: 5_000_000,
		densityBatchSize: 8_000,
		fernPointCap: 300_000,
		fernBatchSize: 5_000
	}
};

export function cpuFallbackPixelBudget(quality: RenderQuality) {
	return CPU_FALLBACK_PIXEL_BUDGET[quality];
}

export function progressiveWorkerBudget(quality: RenderQuality): ProgressiveWorkerBudget {
	return { ...PROGRESSIVE_WORKER_BUDGET[quality] };
}

function finitePositive(value: number | undefined, fallback: number) {
	return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * Converts CSS dimensions to a bounded drawing-buffer size. The returned
 * dimensions retain the CSS aspect ratio even when the pixel budget applies.
 */
export function computeRenderSize(
	cssWidth: number,
	cssHeight: number,
	options: RenderSizeOptions = {}
): RenderSize {
	const width = finitePositive(cssWidth, 1);
	const height = finitePositive(cssHeight, 1);
	const quality = options.quality ?? 'balanced';
	const settings = QUALITY_SETTINGS[quality];
	const previewScale = options.preview ? 0.56 : 1;
	const devicePixelRatio = Math.min(
		settings.maximumPixelRatio,
		finitePositive(options.devicePixelRatio, 1)
	);
	let resolutionScale = settings.resolutionScale * previewScale;
	const qualityMaximumPixels = options.preview
		? Math.min(settings.maximumPixels, WEBGL_PREVIEW_MAX_PIXELS)
		: settings.maximumPixels;
	const maximumPixels = Math.max(
		1,
		Math.floor(
			Math.min(finitePositive(options.maxPixels, qualityMaximumPixels), qualityMaximumPixels)
		)
	);
	const maximumDimension = Math.max(
		1,
		Math.floor(
			Math.min(finitePositive(options.maxDimension, MAX_RENDER_DIMENSION), MAX_RENDER_DIMENSION)
		)
	);

	let renderWidth = Math.max(1, Math.round(width * devicePixelRatio * resolutionScale));
	let renderHeight = Math.max(1, Math.round(height * devicePixelRatio * resolutionScale));
	const requestedPixels = renderWidth * renderHeight;
	if (requestedPixels > maximumPixels) {
		const budgetScale = Math.sqrt(maximumPixels / requestedPixels);
		resolutionScale *= budgetScale;
		renderWidth = Math.max(1, Math.floor(renderWidth * budgetScale));
		renderHeight = Math.max(1, Math.floor(renderHeight * budgetScale));
	}
	const largestDimension = Math.max(renderWidth, renderHeight);
	if (largestDimension > maximumDimension) {
		const dimensionScale = maximumDimension / largestDimension;
		resolutionScale *= dimensionScale;
		renderWidth = Math.max(1, Math.floor(renderWidth * dimensionScale));
		renderHeight = Math.max(1, Math.floor(renderHeight * dimensionScale));
	}
	if (renderWidth * renderHeight > maximumPixels) {
		if (renderWidth >= renderHeight) {
			renderWidth = Math.max(1, Math.floor(maximumPixels / renderHeight));
		} else {
			renderHeight = Math.max(1, Math.floor(maximumPixels / renderWidth));
		}
	}

	return {
		width: renderWidth,
		height: renderHeight,
		pixelRatio: devicePixelRatio,
		resolutionScale,
		pixelCount: renderWidth * renderHeight
	};
}

export function computeCpuRenderSize(
	cssWidth: number,
	cssHeight: number,
	options: RenderSizeOptions = {}
) {
	const maximumPixels = options.preview ? CPU_PREVIEW_MAX_PIXELS : CPU_MAX_PIXELS;
	return computeRenderSize(cssWidth, cssHeight, {
		...options,
		devicePixelRatio: Math.min(finitePositive(options.devicePixelRatio, 1), 1),
		quality: 'high',
		maxPixels: Math.min(finitePositive(options.maxPixels, maximumPixels), maximumPixels)
	});
}

export function boundedCpuIterations(pixelCount: number, requestedIterations: number) {
	const pixels = Math.max(1, Math.floor(finitePositive(pixelCount, 1)));
	const requested = Math.max(
		1,
		Math.min(2_048, Math.floor(finitePositive(requestedIterations, 1)))
	);
	return Math.min(requested, Math.max(8, Math.floor(CPU_MAX_WORK_UNITS / pixels)));
}

/**
 * Detects when a one-pixel complex-plane basis loses a dimension after the
 * float32 centre addition used by ordinary WebGL uniforms.
 */
export function floatCoordinateGridCollapses(
	centerRe: number,
	centerIm: number,
	spanY: number,
	rotation: number,
	renderHeight: number
) {
	const re = Number.isFinite(centerRe) ? centerRe : 0;
	const im = Number.isFinite(centerIm) ? centerIm : 0;
	const safeSpanY = Number.isFinite(spanY) && spanY !== 0 ? Math.abs(spanY) : 2.8;
	const step =
		Math.max(Number.MIN_VALUE, safeSpanY) /
		Math.max(1, Math.floor(finitePositive(renderHeight, 1)));
	const angle = Number.isFinite(rotation) ? rotation : 0;
	const cosine = Math.cos(angle);
	const sine = Math.sin(angle);
	const baseRe = Math.fround(re);
	const baseIm = Math.fround(im);
	const xRe = Math.fround(re + cosine * step) - baseRe;
	const xIm = Math.fround(im + sine * step) - baseIm;
	const yRe = Math.fround(re - sine * step) - baseRe;
	const yIm = Math.fround(im + cosine * step) - baseIm;
	const xCollapsed = xRe === 0 && xIm === 0;
	const yCollapsed = yRe === 0 && yIm === 0;
	const determinant = xRe * yIm - xIm * yRe;
	return xCollapsed || yCollapsed || determinant === 0;
}
