import { buildPaintingModel, renderPaintingCrop } from './material.ts';
import { normalizeState } from './state.ts';
import type { ExportLongSide, PaintingModel, PointillismState } from './types.ts';

export interface ExportDimensions {
	readonly width: number;
	readonly height: number;
}

export interface ExportPaintingOptions {
	readonly longSidePx: ExportLongSide | number;
	readonly model?: PaintingModel;
}

export interface ExportPaintingResult {
	readonly blob: Blob;
	readonly filename: string;
	readonly width: number;
	readonly height: number;
	readonly requestedWidth: number;
	readonly requestedHeight: number;
	readonly fallbackApplied: boolean;
	readonly statusMessage: string;
}

export function computeExportDimensions(
	artboardWidth: number,
	artboardHeight: number,
	longSidePx: number
): ExportDimensions {
	const aw = Math.max(1, artboardWidth);
	const ah = Math.max(1, artboardHeight);
	const targetLong = Math.max(256, Math.min(4096, Math.round(longSidePx)));

	if (aw >= ah) {
		const width = targetLong;
		const height = Math.max(1, Math.round((targetLong * ah) / aw));
		return { width, height };
	}
	const height = targetLong;
	const width = Math.max(1, Math.round((targetLong * aw) / ah));
	return { width, height };
}

export function formatExportFilename(
	sceneFamily: string,
	seed: number,
	width: number,
	height: number
): string {
	return `pointillism-${sceneFamily}-seed-${seed}-${width}x${height}.png`;
}

/**
 * Pure RGBA whole-painting renderer used by browser PNG export, Node asset scripts, and parity tests.
 * Always renders the entire finished logical artboard [0, 0, artboardWidth, artboardHeight]
 * regardless of current studio zoom or playback progress.
 */
export function renderWholePaintingRgba(
	stateInput: PointillismState,
	longSidePx: number,
	precomputedModel?: PaintingModel
): { pixels: Uint8ClampedArray; width: number; height: number; model: PaintingModel } {
	const state = normalizeState(stateInput);
	const model =
		precomputedModel &&
		precomputedModel.state.seed === state.seed &&
		precomputedModel.state.sceneFamily === state.sceneFamily &&
		precomputedModel.state.dotSize === state.dotSize &&
		precomputedModel.state.dotSpacing === state.dotSpacing &&
		precomputedModel.state.paletteContrast === state.paletteContrast &&
		precomputedModel.state.colorVariation === state.colorVariation &&
		precomputedModel.state.paintTexture === state.paintTexture &&
		precomputedModel.state.artboardWidth === state.artboardWidth &&
		precomputedModel.state.artboardHeight === state.artboardHeight
			? precomputedModel
			: buildPaintingModel(state);

	const { width, height } = computeExportDimensions(
		state.artboardWidth,
		state.artboardHeight,
		longSidePx
	);
	const pixels = renderPaintingCrop(
		model,
		{ x: 0, y: 0, width: state.artboardWidth, height: state.artboardHeight },
		width,
		height,
		model.scheduledMarks.length
	);

	return { pixels, width, height, model };
}

async function rgbaToPngBlob(
	rgba: Uint8ClampedArray,
	width: number,
	height: number
): Promise<Blob> {
	if (typeof OffscreenCanvas !== 'undefined') {
		const offscreen = new OffscreenCanvas(width, height);
		const ctx = offscreen.getContext('2d');
		if (!ctx) {
			throw new Error('Could not acquire 2D context on OffscreenCanvas.');
		}
		const copy = new Uint8ClampedArray(rgba.length);
		copy.set(rgba);
		const imageData = new ImageData(copy, width, height);
		ctx.putImageData(imageData, 0, 0);
		if (typeof offscreen.convertToBlob === 'function') {
			return await offscreen.convertToBlob({ type: 'image/png' });
		}
	}

	if (typeof document !== 'undefined') {
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		const ctx = canvas.getContext('2d');
		if (!ctx) {
			throw new Error('Could not acquire 2D canvas context for PNG export.');
		}
		const copy = new Uint8ClampedArray(rgba.length);
		copy.set(rgba);
		const imageData = new ImageData(copy, width, height);
		ctx.putImageData(imageData, 0, 0);
		const blob = await new Promise<Blob | null>((resolve) => {
			canvas.toBlob((b) => resolve(b), 'image/png');
		});
		canvas.width = 0;
		canvas.height = 0;
		if (!blob) {
			throw new Error('Canvas PNG encoding returned null.');
		}
		return blob;
	}

	throw new Error('Browser canvas encoding is unavailable in this environment.');
}

export async function exportWholePainting(
	stateInput: PointillismState,
	options: ExportPaintingOptions
): Promise<ExportPaintingResult> {
	const state = normalizeState(stateInput);
	const requestedLong = Math.max(512, Math.min(4096, Math.round(options.longSidePx)));
	const requestedDims = computeExportDimensions(
		state.artboardWidth,
		state.artboardHeight,
		requestedLong
	);

	const fallbackChain = Array.from(
		new Set(
			[requestedLong, requestedLong > 2048 ? 2048 : 1280, 1280].filter((n) => n <= requestedLong)
		)
	);

	let lastError: unknown = null;
	for (const attemptLong of fallbackChain) {
		try {
			const { pixels, width, height } = renderWholePaintingRgba(state, attemptLong, options.model);
			const blob = await rgbaToPngBlob(pixels, width, height);
			const fallbackApplied = attemptLong !== requestedLong;
			const filename = formatExportFilename(state.sceneFamily, state.seed, width, height);
			const statusMessage = fallbackApplied
				? `Memory limit reached at ${requestedDims.width}×${requestedDims.height}; saved whole painting at ${width}×${height} px.`
				: `Saved whole painting (${width}×${height} px).`;

			return {
				blob,
				filename,
				width,
				height,
				requestedWidth: requestedDims.width,
				requestedHeight: requestedDims.height,
				fallbackApplied,
				statusMessage
			};
		} catch (err) {
			lastError = err;
		}
	}

	throw lastError instanceof Error
		? lastError
		: new Error('Unable to allocate export canvas on this device.');
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
	if (typeof document === 'undefined' || typeof URL === 'undefined') return;
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = filename;
	anchor.rel = 'noopener';
	anchor.style.display = 'none';
	document.body.appendChild(anchor);
	anchor.click();
	anchor.remove();
	setTimeout(() => {
		URL.revokeObjectURL(url);
	}, 2500);
}
