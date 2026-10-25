import { describe, expect, it, vi } from 'vitest';
import { inspectImageHeader, loadLocalImage, previewDimensions, validateDimensions } from './image';

function png(width: number, height: number, animated = false) {
	const chunks = animated ? ['IHDR', 'acTL', 'IEND'] : ['IHDR', 'IEND'];
	const bytes = new Uint8Array(animated ? 65 : 45);
	bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
	const view = new DataView(bytes.buffer);
	let offset = 8;
	for (const chunk of chunks) {
		const size = chunk === 'IHDR' ? 13 : chunk === 'acTL' ? 8 : 0;
		view.setUint32(offset, size);
		bytes.set(
			[...chunk].map((char) => char.charCodeAt(0)),
			offset + 4
		);
		if (chunk === 'IHDR') {
			view.setUint32(offset + 8, width);
			view.setUint32(offset + 12, height);
		}
		offset += size + 12;
	}
	return bytes;
}

describe('local image admission', () => {
	it('reads PNG dimensions from actual bytes', () => {
		expect(inspectImageHeader(png(1400, 1000))).toEqual({
			format: 'png',
			width: 1400,
			height: 1000
		});
	});
	it('rejects source dimensions before decompression', () => {
		expect(() => inspectImageHeader(png(8193, 1))).toThrow('8192-pixel');
		expect(() => inspectImageHeader(png(6000, 4000))).toThrow('20-megapixel');
		expect(() => validateDimensions(0, 50)).toThrow('damaged');
	});
	it('rejects oversized and animated input before calling the browser decoder', async () => {
		const decoder = vi.fn();
		vi.stubGlobal('createImageBitmap', decoder);
		try {
			await expect(
				loadLocalImage(new File([png(6000, 4000)], 'large.png', { type: 'image/png' }))
			).rejects.toThrow('20-megapixel');
			await expect(
				loadLocalImage(new File([png(100, 100, true)], 'animated.png', { type: 'image/png' }))
			).rejects.toThrow('Animated PNG');
			expect(decoder).not.toHaveBeenCalled();
		} finally {
			vi.unstubAllGlobals();
		}
	});
	it('rejects animated PNG and truncated chunks', () => {
		expect(() => inspectImageHeader(png(100, 100, true))).toThrow('Animated PNG');
		expect(() => inspectImageHeader(png(100, 100).subarray(0, 34))).toThrow('damaged');
	});
	it('reads JPEG frame dimensions without decoding pixels', () => {
		const bytes = new Uint8Array([255, 216, 255, 192, 0, 11, 8, 3, 232, 5, 120, 1, 1, 17, 0]);
		expect(inspectImageHeader(bytes)).toEqual({ format: 'jpeg', width: 1400, height: 1000 });
	});
	it('rejects an animation flag in a WebP extended header', () => {
		const bytes = new Uint8Array(30);
		bytes.set(
			[...'RIFF'].map((char) => char.charCodeAt(0)),
			0
		);
		bytes.set(
			[...'WEBPVP8X'].map((char) => char.charCodeAt(0)),
			8
		);
		const view = new DataView(bytes.buffer);
		view.setUint32(4, 22, true);
		view.setUint32(16, 10, true);
		bytes[20] = 2;
		expect(() => inspectImageHeader(bytes)).toThrow('Animated WebP');
	});
	it('rejects text and SVG masquerading as raster files', () => {
		expect(() =>
			inspectImageHeader(new TextEncoder().encode('<svg width="5000" height="5000"></svg>'))
		).toThrow('unsupported');
	});
	it('caps preview size while preserving aspect ratio and avoiding upscaling', () => {
		expect(previewDimensions(4000, 3000)).toEqual([2048, 1536]);
		expect(previewDimensions(3000, 4000, 1024)).toEqual([768, 1024]);
		expect(previewDimensions(140, 100)).toEqual([140, 100]);
	});
});
