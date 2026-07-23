const ACCEPTED_IMAGE_TYPES = new Set([
	'image/jpeg',
	'image/png',
	'image/webp',
	'image/avif',
	'image/gif'
]);

const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
const MAX_PIXELS = 25_000_000;
const MAX_EDGE = 1_920;
const MAX_PREPARED_BYTES = 2 * 1024 * 1024;

function blobToDataUrl(blob: Blob) {
	return new Promise<string>((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result));
		reader.onerror = () => reject(new Error('The selected image could not be read.'));
		reader.readAsDataURL(blob);
	});
}

export async function prepareImageFile(file: File) {
	if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
		throw new Error(
			'Choose a JPEG, PNG, WebP, AVIF, or GIF image. SVG and HTML files are not accepted.'
		);
	}
	if (file.size > MAX_UPLOAD_BYTES) {
		throw new Error('Images must be 12 MB or smaller.');
	}

	const bitmap = await createImageBitmap(file);
	try {
		if (bitmap.width * bitmap.height > MAX_PIXELS) {
			throw new Error('The image is too large to decode safely (25 megapixels maximum).');
		}
		const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
		const width = Math.max(1, Math.round(bitmap.width * scale));
		const height = Math.max(1, Math.round(bitmap.height * scale));
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		const context = canvas.getContext('2d', { alpha: false });
		if (!context) throw new Error('This browser cannot prepare images for the canvas.');
		context.fillStyle = '#ffffff';
		context.fillRect(0, 0, width, height);
		context.drawImage(bitmap, 0, 0, width, height);
		const blob = await new Promise<Blob | null>((resolve) =>
			canvas.toBlob(resolve, 'image/webp', 0.82)
		);
		if (!blob) throw new Error('The browser could not convert this image.');
		if (blob.size > MAX_PREPARED_BYTES) {
			throw new Error(
				'The prepared image is still too detailed. Choose a smaller image or crop it first.'
			);
		}
		return {
			src: await blobToDataUrl(blob),
			width,
			height,
			alt: file.name
				.replace(/\.[^.]+$/, '')
				.replaceAll(/[-_]+/g, ' ')
				.trim(),
			mimeType: blob.type
		};
	} finally {
		bitmap.close();
	}
}

export async function dataUrlToBlob(source: string) {
	const response = await fetch(source);
	if (!response.ok) throw new Error('The prepared image could not be converted for upload.');
	return response.blob();
}
