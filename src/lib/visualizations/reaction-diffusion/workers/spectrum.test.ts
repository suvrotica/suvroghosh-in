import { describe, expect, it } from 'vitest';
import { calculateRadialSpectrum } from '../spectrum';
import { analyzeSpatialSpectrum } from './spectrum-analysis';
import { SpectrumWorkerHandler } from './spectrum-handler';
import {
	SPECTRUM_WORKER_PROTOCOL_VERSION,
	cloneSpectrumInputForTransfer,
	isSpectrumWorkerRequest,
	spectrumRequestTransferables,
	spectrumResponseTransferables,
	type SpectrumWorkerRequest
} from './spectrum-protocol';

describe('spatial-spectrum analysis', () => {
	it('declines to invent a wavelength for a constant field', () => {
		const result = analyzeSpatialSpectrum({
			size: 32,
			domainWidth: 32,
			boundary: 'periodic',
			field: new Float64Array(32 * 32).fill(0.25)
		});
		expect(result.trustworthy).toBe(false);
		expect(result.dominantWavelength).toBeNull();
		expect(result.reason).toMatch(/constant/i);
	});

	it('recovers the wavelength of a periodic synthetic sinusoid', () => {
		const size = 64;
		const cycles = 4;
		const field = Float64Array.from({ length: size * size }, (_, index) => {
			const column = index % size;
			return Math.cos((2 * Math.PI * cycles * column) / size);
		});
		const result = analyzeSpatialSpectrum({
			size,
			domainWidth: size,
			boundary: 'periodic',
			field
		});
		expect(result.trustworthy).toBe(true);
		expect(result.dominantWavelength).toBeCloseTo(size / cycles, 10);
		expect(result.window).toBe('none');
	});

	it('selects a deterministic Hann window for non-periodic boundaries', () => {
		const input = {
			size: 16,
			domainWidth: 16,
			boundary: 'no-flux' as const,
			field: Float64Array.from({ length: 256 }, (_, index) => index / 255)
		};
		const first = analyzeSpatialSpectrum(input);
		const second = analyzeSpatialSpectrum(input);
		expect(first.window).toBe('hann');
		expect([...first.power]).toEqual([...second.power]);
	});

	it('matches the canonical fallback for a masked domain and ignores inactive values', () => {
		const size = 32;
		const mask = Uint8Array.from({ length: size * size }, (_, index) => {
			const row = Math.floor(index / size);
			const column = index % size;
			return row >= 5 && row < 27 && column >= 4 && column < 29 ? 1 : 0;
		});
		const field = Float64Array.from({ length: size * size }, (_, index) => {
			const column = index % size;
			return mask[index] ? 0.35 + 0.12 * Math.cos((2 * Math.PI * 4 * column) / size) : 8;
		});
		const workerResult = analyzeSpatialSpectrum({
			size,
			domainWidth: size,
			boundary: 'no-flux',
			field,
			mask,
			window: 'hann'
		});
		const canonicalResult = calculateRadialSpectrum(field, size, size, {
			mask,
			subtractMean: true,
			window: 'hann'
		});
		const activeValues = [...field].filter((_, index) => mask[index] === 1);
		const activeMean = activeValues.reduce((sum, value) => sum + value, 0) / activeValues.length;
		const activeVariance =
			activeValues.reduce((sum, value) => sum + (value - activeMean) ** 2, 0) / activeValues.length;

		expect([...workerResult.q]).toEqual(canonicalResult.bins.map((bin) => bin.q));
		expect([...workerResult.power]).toEqual(canonicalResult.bins.map((bin) => bin.power));
		expect(workerResult.dominantWavelength).toBe(canonicalResult.dominantWavelength);
		expect(workerResult.fieldMean).toBeCloseTo(activeMean, 14);
		expect(workerResult.fieldVariance).toBeCloseTo(activeVariance, 14);

		const alteredInactiveField = Float64Array.from(field, (value, index) =>
			mask[index] ? value : -6 + (index % 7)
		);
		const alteredResult = analyzeSpatialSpectrum({
			size,
			domainWidth: size,
			boundary: 'no-flux',
			field: alteredInactiveField,
			mask,
			window: 'hann'
		});
		expect([...alteredResult.power]).toEqual([...workerResult.power]);
		expect(alteredResult.fieldMean).toBe(workerResult.fieldMean);
		expect(alteredResult.fieldVariance).toBe(workerResult.fieldVariance);
	});
});

describe('SpectrumWorkerHandler', () => {
	it('rejects stale generations and transfers only the two result arrays', () => {
		const handler = new SpectrumWorkerHandler();
		const first = handler.handle(analyzeRequest(1, 1));
		expect(first.type).toBe('SPECTRUM_RESULT');
		if (first.type !== 'SPECTRUM_RESULT') return;
		expect(spectrumResponseTransferables(first)).toEqual([
			first.result.q.buffer,
			first.result.power.buffer
		]);
		expect(handler.handle(analyzeRequest(2, 1))).toMatchObject({
			type: 'STALE',
			activeGeneration: 1
		});
	});

	it('rejects non-power-of-two transforms at the protocol boundary', () => {
		const malformed = analyzeRequest(1, 1);
		if (malformed.type !== 'ANALYZE') return;
		(malformed.input as { size: number }).size = 12;
		expect(isSpectrumWorkerRequest(malformed)).toBe(false);
	});

	it('validates, clones, and transfers the active-domain mask with the field', () => {
		const request = analyzeRequest(3, 2);
		if (request.type !== 'ANALYZE') return;
		const copiedInput = cloneSpectrumInputForTransfer(request.input);
		const copiedRequest: SpectrumWorkerRequest = { ...request, input: copiedInput };

		expect(copiedInput.field).not.toBe(request.input.field);
		expect(copiedInput.mask).not.toBe(request.input.mask);
		expect(spectrumRequestTransferables(copiedRequest)).toEqual([
			copiedInput.field.buffer,
			copiedInput.mask?.buffer
		]);
		expect(request.input.field.byteLength).toBe(64 * Float32Array.BYTES_PER_ELEMENT);
		expect(request.input.mask?.byteLength).toBe(64);

		const wrongLength = {
			...request,
			input: { ...request.input, mask: new Uint8Array(63) }
		};
		const invalidValueMask = new Uint8Array(64);
		invalidValueMask[0] = 2;
		const invalidValue = {
			...request,
			input: { ...request.input, mask: invalidValueMask }
		};
		expect(isSpectrumWorkerRequest(wrongLength)).toBe(false);
		expect(isSpectrumWorkerRequest(invalidValue)).toBe(false);
	});
});

function analyzeRequest(requestId: number, generation: number): SpectrumWorkerRequest {
	return {
		protocolVersion: SPECTRUM_WORKER_PROTOCOL_VERSION,
		requestId,
		generation,
		type: 'ANALYZE',
		input: {
			size: 8,
			domainWidth: 8,
			boundary: 'periodic',
			field: new Float32Array(64),
			mask: new Uint8Array(64).fill(1)
		}
	};
}
