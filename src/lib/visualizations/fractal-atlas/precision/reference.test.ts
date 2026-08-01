import { describe, expect, it } from 'vitest';
import { FRACTAL_STATE_VERSION, type FractalViewState } from '../types';
import {
	PrecisionReferenceWorkerClient,
	estimatedReferenceDigits,
	precisionReferenceConfig,
	type PrecisionWorkerLike
} from './client';
import {
	PRECISION_WORKER_PROTOCOL_VERSION,
	isPrecisionWorkerResponse,
	type PrecisionReferenceConfig,
	type PrecisionWorkerRequest,
	type PrecisionWorkerResponse
} from './protocol';
import { PrecisionCalculationCancelledError, calculatePrecisionReference } from './reference';

function config(overrides: Partial<PrecisionReferenceConfig> = {}): PrecisionReferenceConfig {
	return {
		family: 'mandelbrot',
		centerRe: '-0.743643887037151',
		centerIm: '0.13182590420533',
		spanY: '2.4e-12',
		rotation: '0',
		juliaRe: '-0.8',
		juliaIm: '0.156',
		width: 320,
		height: 200,
		maxIterations: 48,
		bailout: 2,
		flipY: false,
		precisionDigits: 48,
		settingsHash: 'settings-a',
		...overrides
	};
}

function state(): FractalViewState {
	return {
		version: FRACTAL_STATE_VERSION,
		family: 'mandelbrot',
		plane: 'parameter',
		center: { re: -0.743643887037151, im: 0.13182590420533 },
		spanY: 2.4e-18,
		rotation: 0,
		maxIterations: 120,
		bailout: 2,
		exponent: 2,
		juliaC: { re: -0.8, im: 0.156 },
		phoenixP: { re: -0.5, im: 0 },
		phoenixPrevious: { re: 0, im: 0 },
		newtonRelaxation: 1,
		coloring: 'smooth',
		paletteId: 'observatory',
		paletteOffset: 0,
		paletteCycles: 1,
		interiorColor: '#05070D',
		seed: 1,
		renderQuality: 'balanced',
		precisionMode: 'auto',
		flipY: false,
		analyticInteriorTests: false,
		convergenceTolerance: 1e-6
	};
}

describe('arbitrary-precision perturbation references', () => {
	it('selects decimal precision from pixel scale plus guard digits', () => {
		expect(estimatedReferenceDigits(2.4e-18, 1_000)).toBeGreaterThanOrEqual(45);
		const deepState = state();
		deepState.centerDecimal = {
			re: '-0.74364388703715100792301305236157',
			im: '0.13182590420532999943598128774412'
		};
		const request = precisionReferenceConfig(deepState, 640, 360, 120);
		expect(request.precisionDigits).toBeGreaterThanOrEqual(44);
		expect(request.settingsHash).toMatch(/^[a-f0-9]{8}$/);
		expect(request.family).toBe('mandelbrot');
		expect(request.centerRe).toBe(deepState.centerDecimal.re);
	});

	it('calculates transferable hi/lo reference rows and bounded glitch diagnostics', async () => {
		const result = await calculatePrecisionReference(config(), {
			yieldControl: async () => {}
		});
		expect(result.precisionDigits).toBe(48);
		expect(result.orbitLength).toBe(49);
		expect([1, 4]).toContain(result.gridSize);
		expect(result.orbit).toHaveLength(result.gridSize * result.gridSize * result.orbitLength * 4);
		expect(result.referencePoints).toHaveLength(result.gridSize * result.gridSize * 4);
		expect(result.referenceLengths.every((length) => length >= 2 && length <= 49)).toBe(true);
		expect(result.diagnosticSamples).toBe(9);
		expect(result.glitchesAfterRebase).toBeLessThanOrEqual(result.diagnosticSamples);
		expect(
			isPrecisionWorkerResponse({
				protocolVersion: PRECISION_WORKER_PROTOCOL_VERSION,
				taskId: 1,
				generation: 1,
				settingsHash: 'settings-a',
				type: 'REFERENCE_RESULT',
				result
			})
		).toBe(true);
	});

	it('cooperatively cancels a stale high-cost calculation', async () => {
		let checks = 0;
		await expect(
			calculatePrecisionReference(config({ maxIterations: 256 }), {
				shouldCancel: () => ++checks > 4,
				yieldControl: async () => {}
			})
		).rejects.toBeInstanceOf(PrecisionCalculationCancelledError);
	});
});

class FakeWorker implements PrecisionWorkerLike {
	requests: PrecisionWorkerRequest[] = [];
	listeners = new Set<(event: MessageEvent<unknown>) => void>();

	postMessage(message: PrecisionWorkerRequest) {
		this.requests.push(message);
	}

	addEventListener(_type: 'message', listener: (event: MessageEvent<unknown>) => void) {
		this.listeners.add(listener);
	}

	removeEventListener(_type: 'message', listener: (event: MessageEvent<unknown>) => void) {
		this.listeners.delete(listener);
	}

	terminate() {}

	emit(response: PrecisionWorkerResponse) {
		for (const listener of this.listeners)
			listener(new MessageEvent('message', { data: response }));
	}
}

describe('precision Worker generation barrier', () => {
	it('cancels the prior generation and ignores its late result/status', () => {
		const fake = new FakeWorker();
		const client = new PrecisionReferenceWorkerClient(fake);
		const received: PrecisionWorkerResponse[] = [];
		client.subscribe((message) => received.push(message));

		client.calculate(config({ settingsHash: 'settings-a' }));
		client.calculate(config({ settingsHash: 'settings-b', centerRe: '-0.75' }));
		expect(fake.requests.map((request) => request.type)).toEqual([
			'CALCULATE_REFERENCE',
			'CANCEL_GENERATION',
			'CALCULATE_REFERENCE'
		]);
		const stale = {
			protocolVersion: PRECISION_WORKER_PROTOCOL_VERSION,
			taskId: 1,
			generation: 1,
			settingsHash: 'settings-a',
			type: 'REFERENCE_STATUS',
			phase: 'calculating',
			progress: 0.5,
			precisionDigits: 48
		} satisfies PrecisionWorkerResponse;
		fake.emit(stale);
		const current = {
			...stale,
			taskId: 3,
			generation: 2,
			settingsHash: 'settings-b'
		} satisfies PrecisionWorkerResponse;
		fake.emit(current);
		expect(received).toEqual([current]);
		client.dispose();
	});
});
