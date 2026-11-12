import { computeExportDimensions, prepareMaterial, renderPainting } from './material.ts';
import { buildCompositionModel, normalizeAspectRatio, normalizeState } from './state.ts';
import { buildPaintTimeline } from './timeline.ts';
import type { MondrianState } from './types.ts';

export type ExportLongSide = 2048 | 4096;

export interface ExportPaintingOptions {
	readonly longSidePx: ExportLongSide | number;
	readonly aspectRatio?: number;
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

export function formatExportFilename(seed: number, width: number, height: number): string {
	return `mondrian-seed-${seed}-${width}x${height}.png`;
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
		const imageData = new ImageData(new Uint8ClampedArray(rgba), width, height);
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
		const imageData = new ImageData(new Uint8ClampedArray(rgba), width, height);
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

/**
 * Renders the finished artwork cleanly at the requested export dimensions without any UI chrome
 * and without touching or interrupting the visible playback canvas.
 * If a large allocation fails on a constrained device, offers an explicit lower-size fallback
 * and clearly reports the actual delivered pixel dimensions.
 */
export async function exportPainting(
	stateInput: MondrianState,
	options: ExportPaintingOptions
): Promise<ExportPaintingResult> {
	const targetRatio = normalizeAspectRatio(
		options.aspectRatio ?? stateInput.aspectRatio,
		stateInput.aspectRatio
	);
	const exportState = normalizeState({
		...stateInput,
		aspectRatio: targetRatio
	});

	const requestedLong = Math.max(512, Math.min(4096, Math.round(options.longSidePx)));
	const requestedDims = computeExportDimensions(requestedLong, targetRatio);

	const fallbackChain = Array.from(
		new Set([requestedLong, requestedLong > 2048 ? 2048 : 1280, 1280].filter((n) => n <= requestedLong))
	);

	let lastError: unknown = null;
	for (let i = 0; i < fallbackChain.length; i++) {
		const attemptLong = fallbackChain[i]!;
		const { width, height } = computeExportDimensions(attemptLong, targetRatio);
		try {
			const model = buildCompositionModel(exportState);
			const timeline = buildPaintTimeline(model.layout, model.colors, exportState.paintingTime);
			const prepared = prepareMaterial({
				layout: model.layout,
				colors: model.colors,
				timeline,
				paintTexture: exportState.paintTexture,
				width,
				height
			});
			const finished = renderPainting(prepared, 1.0);
			const blob = await rgbaToPngBlob(finished, width, height);
			const fallbackApplied = attemptLong !== requestedLong;
			const filename = formatExportFilename(exportState.seed, width, height);
			const statusMessage = fallbackApplied
				? `Memory limit reached at ${requestedDims.width}×${requestedDims.height}; saved clean finished painting at ${width}×${height} px.`
				: `Saved finished painting (${width}×${height} px).`;

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
