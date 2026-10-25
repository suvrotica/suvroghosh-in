export const imageLimits = {
	bytes: 10_000_000,
	pixels: 20_000_000,
	edge: 8192,
	previewEdge: 2048
} as const;

export interface ImageHeader {
	format: 'jpeg' | 'png' | 'webp';
	width: number;
	height: number;
}
export interface PreparedImage {
	canvas: HTMLCanvasElement;
	width: number;
	height: number;
	sourceWidth: number;
	sourceHeight: number;
	dispose: () => void;
}

const invalid = () =>
	new Error(
		'This image is damaged or uses an unsupported format. Choose a JPEG, PNG or static WebP image.'
	);
const ascii = (bytes: Uint8Array, start: number, count: number) =>
	String.fromCharCode(...bytes.subarray(start, start + count));

export function validateDimensions(width: number, height: number) {
	if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1)
		throw invalid();
	if (width > imageLimits.edge || height > imageLimits.edge)
		throw new Error(
			'This image exceeds the 8192-pixel width or height limit. Resize it and try again.'
		);
	if (width * height > imageLimits.pixels)
		throw new Error('This image exceeds the 20-megapixel limit. Resize it and try again.');
}

/** Inspect container headers before handing compressed pixels to an image decoder. */
export function inspectImageHeader(input: ArrayBuffer | Uint8Array): ImageHeader {
	const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	let header: ImageHeader | undefined;
	if (
		bytes.length >= 33 &&
		bytes[0] === 137 &&
		ascii(bytes, 1, 3) === 'PNG' &&
		bytes[4] === 13 &&
		bytes[5] === 10 &&
		bytes[6] === 26 &&
		bytes[7] === 10
	) {
		if (ascii(bytes, 12, 4) !== 'IHDR' || view.getUint32(8) !== 13) throw invalid();
		header = { format: 'png', width: view.getUint32(16), height: view.getUint32(20) };
		let offset = 8;
		let ended = false;
		while (offset + 12 <= bytes.length) {
			const size = view.getUint32(offset);
			if (size > bytes.length - offset - 12) throw invalid();
			const type = ascii(bytes, offset + 4, 4);
			if (type === 'acTL')
				throw new Error('Animated PNG images are not supported. Choose a still image.');
			offset += size + 12;
			if (type === 'IEND') {
				ended = true;
				break;
			}
		}
		if (!ended) throw invalid();
	} else if (bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216) {
		let offset = 2;
		while (offset + 4 <= bytes.length) {
			if (bytes[offset] !== 255) throw invalid();
			while (offset < bytes.length && bytes[offset] === 255) offset++;
			const marker = bytes[offset++];
			if (marker === 217 || marker === 218) break;
			if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
			if (offset + 2 > bytes.length) throw invalid();
			const size = view.getUint16(offset);
			if (size < 2 || offset + size > bytes.length) throw invalid();
			if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker)) {
				if (size < 8) throw invalid();
				header = {
					format: 'jpeg',
					width: view.getUint16(offset + 5),
					height: view.getUint16(offset + 3)
				};
				break;
			}
			offset += size;
		}
	} else if (bytes.length >= 20 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') {
		const end = view.getUint32(4, true) + 8;
		if (end > bytes.length || end < 20) throw invalid();
		let offset = 12;
		let frame: ImageHeader | undefined;
		while (offset + 8 <= end) {
			const type = ascii(bytes, offset, 4);
			const size = view.getUint32(offset + 4, true);
			const start = offset + 8;
			if (size > end - start) throw invalid();
			if (
				type === 'ANIM' ||
				type === 'ANMF' ||
				(type === 'VP8X' && size >= 1 && (bytes[start] & 2) !== 0)
			)
				throw new Error('Animated WebP images are not supported. Choose a still image.');
			if (type === 'VP8X' && size >= 10) {
				header = {
					format: 'webp',
					width: 1 + bytes[start + 4] + (bytes[start + 5] << 8) + (bytes[start + 6] << 16),
					height: 1 + bytes[start + 7] + (bytes[start + 8] << 8) + (bytes[start + 9] << 16)
				};
			} else if (
				type === 'VP8 ' &&
				size >= 10 &&
				bytes[start + 3] === 157 &&
				bytes[start + 4] === 1 &&
				bytes[start + 5] === 42
			) {
				frame = {
					format: 'webp',
					width: view.getUint16(start + 6, true) & 16383,
					height: view.getUint16(start + 8, true) & 16383
				};
			} else if (type === 'VP8L' && size >= 5 && bytes[start] === 47) {
				frame = {
					format: 'webp',
					width: 1 + bytes[start + 1] + ((bytes[start + 2] & 63) << 8),
					height:
						1 +
						((bytes[start + 2] & 192) >> 6) +
						(bytes[start + 3] << 2) +
						((bytes[start + 4] & 15) << 10)
				};
			}
			if (frame) validateDimensions(frame.width, frame.height);
			offset = start + size + (size % 2);
		}
		if (!frame || offset !== end) throw invalid();
		if (header && (header.width !== frame.width || header.height !== frame.height)) throw invalid();
		header ??= frame;
	}
	if (!header) throw invalid();
	validateDimensions(header.width, header.height);
	return header;
}

export function previewDimensions(
	width: number,
	height: number,
	maximumEdge: number = imageLimits.previewEdge
): [number, number] {
	const edge = Math.max(
		1,
		Math.min(
			imageLimits.previewEdge,
			Number.isFinite(maximumEdge) ? Math.floor(maximumEdge) : imageLimits.previewEdge
		)
	);
	const ratio = Math.min(1, edge / Math.max(width, height));
	return [Math.max(1, Math.round(width * ratio)), Math.max(1, Math.round(height * ratio))];
}

export async function loadLocalImage(
	file: File,
	maximumTextureSize: number = imageLimits.previewEdge
): Promise<PreparedImage> {
	if (file.size > imageLimits.bytes)
		throw new Error('This image exceeds the 10 MB file-size limit. Choose a smaller file.');
	if (file.size === 0) throw invalid();
	const bytes = await file.arrayBuffer();
	const header = inspectImageHeader(bytes);
	const acceptedType = header.format === 'jpeg' ? 'image/jpeg' : `image/${header.format}`;
	if (file.type && file.type !== acceptedType && file.type !== 'application/octet-stream')
		throw invalid();
	const blob = new Blob([bytes], { type: acceptedType });
	let source: ImageBitmap | HTMLImageElement | null = null;
	let objectUrl: string | null = null;
	try {
		if (typeof createImageBitmap === 'function')
			source = await createImageBitmap(blob, { imageOrientation: 'from-image' });
		else {
			objectUrl = URL.createObjectURL(blob);
			const image = new Image();
			image.src = objectUrl;
			await image.decode();
			source = image;
		}
		const sourceWidth = source instanceof HTMLImageElement ? source.naturalWidth : source.width;
		const sourceHeight = source instanceof HTMLImageElement ? source.naturalHeight : source.height;
		validateDimensions(sourceWidth, sourceHeight);
		// Orientation may exchange dimensions, but decoding may not alter the bounded area.
		if (sourceWidth * sourceHeight !== header.width * header.height) throw invalid();
		const [width, height] = previewDimensions(sourceWidth, sourceHeight, maximumTextureSize);
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		const context = canvas.getContext('2d');
		if (!context)
			throw new Error('Your browser could not prepare this image. Try a smaller image.');
		context.drawImage(source, 0, 0, width, height);
		return {
			canvas,
			width,
			height,
			sourceWidth,
			sourceHeight,
			dispose: () => {
				canvas.width = 1;
				canvas.height = 1;
			}
		};
	} catch (error) {
		if (
			error instanceof Error &&
			(error.message.includes('limit') ||
				error.message.includes('browser') ||
				error.message.includes('unsupported'))
		)
			throw error;
		throw invalid();
	} finally {
		if (source && 'close' in source) source.close();
		if (objectUrl) URL.revokeObjectURL(objectUrl);
	}
}
