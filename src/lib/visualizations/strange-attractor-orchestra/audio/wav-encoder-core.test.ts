import { describe, expect, it } from 'vitest';
import { encodePcm16Wav, WAV_HEADER_BYTES } from './wav-encoder-core';

function ascii(buffer: ArrayBuffer, start: number, length: number): string {
	return String.fromCharCode(...new Uint8Array(buffer, start, length));
}

describe('16-bit WAV encoder', () => {
	it('writes a valid little-endian stereo PCM header and interleaves bounded samples', () => {
		const left = new Float32Array([-2, -0.5, Number.NaN, 1]);
		const right = new Float32Array([2, 0.5, 0, -1]);
		const wav = encodePcm16Wav(48_000, [left, right]);
		const view = new DataView(wav);
		expect(ascii(wav, 0, 4)).toBe('RIFF');
		expect(ascii(wav, 8, 4)).toBe('WAVE');
		expect(ascii(wav, 36, 4)).toBe('data');
		expect(view.getUint16(20, true)).toBe(1);
		expect(view.getUint16(22, true)).toBe(2);
		expect(view.getUint32(24, true)).toBe(48_000);
		expect(view.getUint16(34, true)).toBe(16);
		expect(view.getInt16(WAV_HEADER_BYTES, true)).toBe(-32_768);
		expect(view.getInt16(WAV_HEADER_BYTES + 2, true)).toBe(32_767);
		expect(view.getInt16(WAV_HEADER_BYTES + 8, true)).toBe(0);
		expect(view.getInt16(WAV_HEADER_BYTES + 12, true)).toBe(32_767);
		expect(view.getInt16(WAV_HEADER_BYTES + 14, true)).toBe(-32_768);
	});

	it('is byte-for-byte deterministic', () => {
		const samples = new Float32Array([0.1, -0.2, 0.3]);
		expect(new Uint8Array(encodePcm16Wav(44_100, [samples]))).toEqual(
			new Uint8Array(encodePcm16Wav(44_100, [samples]))
		);
	});
});
