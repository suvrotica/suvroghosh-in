import sharp from 'sharp';
import { error } from '@sveltejs/kit';

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_PIXELS = 25_000_000;
const MAX_EDGE = 2_560;

function ascii(bytes: Uint8Array, start: number, length: number) {
	return String.fromCharCode(...bytes.slice(start, start + length));
}

/**
 * Treat the browser conversion as an optimisation, not a trust boundary. The server
 * fully decodes and re-encodes the first frame through libvips, removing metadata,
 * animation, malformed trailing chunks, and polyglot payloads.
 */
export async function validatePreparedWebp(file: File) {
	if (file.size <= 0 || file.size > MAX_BYTES) {
		throw error(413, { message: 'Prepared images must be 2 MB or smaller.' });
	}
	if (file.type && file.type !== 'image/webp') {
		throw error(415, { message: 'Only sanitised WebP images are accepted by this endpoint.' });
	}
	const input = new Uint8Array(await file.arrayBuffer());
	if (input.length < 30 || ascii(input, 0, 4) !== 'RIFF' || ascii(input, 8, 4) !== 'WEBP') {
		throw error(415, { message: 'The uploaded file is not a valid WebP image.' });
	}

	try {
		const pipeline = sharp(input, {
			animated: false,
			failOn: 'warning',
			limitInputPixels: MAX_PIXELS
		});
		const metadata = await pipeline.metadata();
		if (
			metadata.format !== 'webp' ||
			!metadata.width ||
			!metadata.height ||
			metadata.width > MAX_EDGE ||
			metadata.height > MAX_EDGE ||
			metadata.width * metadata.height > MAX_PIXELS
		) {
			throw error(413, { message: 'The image dimensions exceed the safe upload limit.' });
		}
		const { data, info } = await pipeline
			.rotate()
			.resize({
				width: MAX_EDGE,
				height: MAX_EDGE,
				fit: 'inside',
				withoutEnlargement: true
			})
			.flatten({ background: '#ffffff' })
			.webp({ quality: 82, effort: 4, smartSubsample: true })
			.toBuffer({ resolveWithObject: true });
		if (data.byteLength > MAX_BYTES) {
			throw error(413, {
				message: 'The sanitised image is still too detailed. Crop or reduce it before uploading.'
			});
		}
		return {
			bytes: new Uint8Array(data),
			width: info.width,
			height: info.height
		};
	} catch (cause) {
		if (
			typeof cause === 'object' &&
			cause !== null &&
			'status' in cause &&
			typeof cause.status === 'number'
		) {
			throw cause;
		}
		throw error(415, { message: 'The WebP image could not be decoded safely.' });
	}
}
