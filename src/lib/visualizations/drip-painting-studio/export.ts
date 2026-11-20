import { normalizeState, statesEqual } from './state.ts';
import { buildPaintingModel, renderPaintingStill } from './surface.ts';
import {
	DEFAULT_ARTBOARD_HEIGHT,
	DEFAULT_ARTBOARD_WIDTH,
	type DripPaintingState,
	type ExportResolution,
	type ExportResult,
	type PaintingModel,
	type StudyId
} from './types.ts';

export interface ExportDimensions {
	readonly width: number;
	readonly height: number;
}

export interface ExportPaintingOptions {
	readonly model?: PaintingModel;
	readonly encodePng?: (rgba: Uint8ClampedArray, width: number, height: number) => Promise<Blob>;
}

export function computeExportDimensions(
	artboardWidth: number,
	artboardHeight: number,
	longerSidePx: number
): ExportDimensions {
	const aw =
		Number.isFinite(artboardWidth) && artboardWidth > 0
			? Math.max(1, artboardWidth)
			: DEFAULT_ARTBOARD_WIDTH;
	const ah =
		Number.isFinite(artboardHeight) && artboardHeight > 0
			? Math.max(1, artboardHeight)
			: DEFAULT_ARTBOARD_HEIGHT;
	const safeLong = Number.isFinite(longerSidePx)
		? Math.round(longerSidePx)
		: longerSidePx === Number.POSITIVE_INFINITY
			? 4096
			: longerSidePx === Number.NEGATIVE_INFINITY
				? 256
				: 2048;
	const targetLong = Math.max(256, Math.min(4096, safeLong));

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
	study: StudyId | string,
	seed: number,
	width: number,
	height: number
): string {
	return `drip-painting-${study}-seed-${seed}-${width}x${height}.png`;
}

export function renderWholePaintingRgba(
	stateInput: DripPaintingState,
	outWidth: number,
	outHeight: number,
	precomputedModel?: PaintingModel
): { pixels: Uint8ClampedArray; width: number; height: number; model: PaintingModel } {
	const state = normalizeState(stateInput);
	const model =
		precomputedModel && statesEqual(precomputedModel.state, state)
			? precomputedModel
			: buildPaintingModel(state);

	const width =
		Number.isFinite(outWidth) && outWidth > 0
			? Math.max(1, Math.round(outWidth))
			: state.artboardWidth;
	const height =
		Number.isFinite(outHeight) && outHeight > 0
			? Math.max(1, Math.round(outHeight))
			: state.artboardHeight;

	const pixels = renderPaintingStill(null, model, {
		crop: { x: 0, y: 0, width: state.artboardWidth, height: state.artboardHeight },
		width,
		height,
		maxProgress: 1
	});

	return { pixels, width, height, model };
}

const CRC32_TABLE = (() => {
	const table = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) {
			c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		}
		table[n] = c >>> 0;
	}
	return table;
})();

function crc32(bytes: Uint8Array): number {
	let c = 0xffffffff;
	for (let i = 0; i < bytes.length; i++) {
		c = CRC32_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
	}
	return (c ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array): number {
	let a = 1;
	let b = 0;
	const MOD = 65521;
	for (let i = 0; i < bytes.length; i++) {
		a = (a + bytes[i]!) % MOD;
		b = (b + a) % MOD;
	}
	return ((b << 16) | a) >>> 0;
}

function makePngChunk(type: string, data: Uint8Array): Uint8Array {
	const chunk = new Uint8Array(12 + data.length);
	const view = new DataView(chunk.buffer);
	view.setUint32(0, data.length, false);
	chunk[4] = type.charCodeAt(0);
	chunk[5] = type.charCodeAt(1);
	chunk[6] = type.charCodeAt(2);
	chunk[7] = type.charCodeAt(3);
	chunk.set(data, 8);
	const crcVal = crc32(chunk.subarray(4, 8 + data.length));
	view.setUint32(8 + data.length, crcVal, false);
	return chunk;
}

function encodeRgbaAsStoredPng(rgba: Uint8ClampedArray, width: number, height: number): Blob {
	const rowBytes = width * 4 + 1;
	const raw = new Uint8Array(rowBytes * height);
	for (let y = 0; y < height; y++) {
		const dstRow = y * rowBytes;
		raw[dstRow] = 0; // filter type 0 (None)
		const srcRow = y * width * 4;
		raw.set(rgba.subarray(srcRow, srcRow + width * 4), dstRow + 1);
	}

	const maxBlock = 65535;
	const blockCount = Math.max(1, Math.ceil(raw.length / maxBlock));
	const zlibLen = 2 + raw.length + blockCount * 5 + 4;
	const zlib = new Uint8Array(zlibLen);
	zlib[0] = 0x78;
	zlib[1] = 0x01;

	let zPos = 2;
	let rPos = 0;
	for (let b = 0; b < blockCount; b++) {
		const remaining = raw.length - rPos;
		const len = Math.min(maxBlock, remaining);
		const isFinal = b === blockCount - 1 ? 1 : 0;
		zlib[zPos++] = isFinal;
		zlib[zPos++] = len & 0xff;
		zlib[zPos++] = (len >>> 8) & 0xff;
		const nlen = ~len & 0xffff;
		zlib[zPos++] = nlen & 0xff;
		zlib[zPos++] = (nlen >>> 8) & 0xff;
		zlib.set(raw.subarray(rPos, rPos + len), zPos);
		zPos += len;
		rPos += len;
	}

	const adler = adler32(raw);
	const zView = new DataView(zlib.buffer);
	zView.setUint32(zPos, adler, false);

	const ihdrData = new Uint8Array(13);
	const ihdrView = new DataView(ihdrData.buffer);
	ihdrView.setUint32(0, width, false);
	ihdrView.setUint32(4, height, false);
	ihdrData[8] = 8; // bit depth
	ihdrData[9] = 6; // RGBA
	ihdrData[10] = 0;
	ihdrData[11] = 0;
	ihdrData[12] = 0;

	const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
	const ihdr = makePngChunk('IHDR', ihdrData);
	const idat = makePngChunk('IDAT', zlib);
	const iend = makePngChunk('IEND', new Uint8Array(0));

	const out = new Uint8Array(sig.length + ihdr.length + idat.length + iend.length);
	let o = 0;
	out.set(sig, o);
	o += sig.length;
	out.set(ihdr, o);
	o += ihdr.length;
	out.set(idat, o);
	o += idat.length;
	out.set(iend, o);

	return new Blob([out], { type: 'image/png' });
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
		ctx.putImageData(new ImageData(copy, width, height), 0, 0);
		if (typeof offscreen.convertToBlob === 'function') {
			return await offscreen.convertToBlob({ type: 'image/png' });
		}
		throw new Error('OffscreenCanvas.convertToBlob is unavailable.');
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
		ctx.putImageData(new ImageData(copy, width, height), 0, 0);
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

	// Headless Node / Vitest fallback only when neither OffscreenCanvas nor document exists
	return encodeRgbaAsStoredPng(rgba, width, height);
}

export async function exportWholePainting(
	stateInput: DripPaintingState,
	longerSidePx: ExportResolution | number,
	options?: ExportPaintingOptions
): Promise<ExportResult> {
	const state = normalizeState(stateInput);
	const safeLong = Number.isFinite(longerSidePx)
		? Math.round(longerSidePx)
		: longerSidePx === Number.POSITIVE_INFINITY
			? 4096
			: longerSidePx === Number.NEGATIVE_INFINITY
				? 512
				: 2048;
	const requestedLong = Math.max(512, Math.min(4096, safeLong));
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

	const encoder = options?.encodePng ?? rgbaToPngBlob;
	let lastError: unknown = null;

	for (const attemptLong of fallbackChain) {
		try {
			const dims = computeExportDimensions(state.artboardWidth, state.artboardHeight, attemptLong);
			const { pixels, width, height } = renderWholePaintingRgba(
				state,
				dims.width,
				dims.height,
				options?.model
			);
			const blob = await encoder(pixels, width, height);
			const fallbackApplied = attemptLong !== requestedLong;
			const filename = formatExportFilename(state.study, state.seed, width, height);
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
