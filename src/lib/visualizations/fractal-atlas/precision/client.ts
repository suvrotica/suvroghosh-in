import type { FractalViewState } from '../types';
import {
	PRECISION_LIMITS,
	PRECISION_WORKER_PROTOCOL_VERSION,
	isPrecisionWorkerResponse,
	type PrecisionReferenceConfig,
	type PrecisionReferenceResult,
	type PrecisionWorkerRequest,
	type PrecisionWorkerResponse
} from './protocol';

export interface PrecisionWorkerLike {
	postMessage(message: PrecisionWorkerRequest): void;
	addEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
	removeEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
	terminate(): void;
}

export type PrecisionWorkerListener = (response: PrecisionWorkerResponse) => void;
type WithoutEnvelope<Message> = Message extends unknown ? Omit<Message, keyof BaseRequest> : never;
type PrecisionWorkerRequestBody = WithoutEnvelope<PrecisionWorkerRequest>;

function decimalString(value: number, fallback: number) {
	return (Number.isFinite(value) ? value : fallback).toString();
}

function exactCenterString(value: string | undefined, numeric: number, fallback: number) {
	return typeof value === 'string' && value.length <= 160
		? value
		: decimalString(numeric, fallback);
}

function fnv1a(value: string) {
	let hash = 0x811c9dc5;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(16).padStart(8, '0');
}

export function estimatedReferenceDigits(spanY: number, renderHeight: number) {
	const pixelScale =
		Math.max(Number.MIN_VALUE, Math.abs(Number.isFinite(spanY) ? spanY : 2.8)) /
		Math.max(1, renderHeight);
	const coordinateDigits = Math.max(0, Math.ceil(-Math.log10(pixelScale)));
	return Math.min(
		PRECISION_LIMITS.maxDecimalDigits,
		Math.max(PRECISION_LIMITS.minDecimalDigits, coordinateDigits + 24)
	);
}

export function precisionSettingsHash(
	state: FractalViewState,
	width: number,
	height: number,
	iterations: number,
	precisionDigits: number
) {
	return fnv1a(
		[
			state.family,
			exactCenterString(state.centerDecimal?.re, state.center.re, -0.5),
			exactCenterString(state.centerDecimal?.im, state.center.im, 0),
			decimalString(state.spanY, 2.8),
			decimalString(state.rotation, 0),
			exactCenterString(state.juliaCDecimal?.re, state.juliaC.re, 0),
			exactCenterString(state.juliaCDecimal?.im, state.juliaC.im, 0),
			width,
			height,
			iterations,
			decimalString(state.bailout, 2),
			state.flipY ? 1 : 0,
			precisionDigits
		].join('|')
	);
}

export function precisionReferenceConfig(
	state: FractalViewState,
	width: number,
	height: number,
	iterations: number
): PrecisionReferenceConfig {
	if (state.family !== 'mandelbrot' && state.family !== 'julia') {
		throw new Error('Perturbation reference orbits are limited to quadratic Mandelbrot and Julia.');
	}
	const safeWidth = Math.max(1, Math.min(PRECISION_LIMITS.maxDimension, Math.floor(width)));
	const safeHeight = Math.max(1, Math.min(PRECISION_LIMITS.maxDimension, Math.floor(height)));
	const safeIterations = Math.max(
		1,
		Math.min(PRECISION_LIMITS.maxIterations, Math.floor(iterations))
	);
	const precisionDigits = estimatedReferenceDigits(state.spanY, safeHeight);
	const settingsHash = precisionSettingsHash(
		state,
		safeWidth,
		safeHeight,
		safeIterations,
		precisionDigits
	);
	return {
		family: state.family,
		centerRe: exactCenterString(state.centerDecimal?.re, state.center.re, -0.5),
		centerIm: exactCenterString(state.centerDecimal?.im, state.center.im, 0),
		spanY: decimalString(Math.abs(state.spanY), 2.8),
		rotation: decimalString(state.rotation, 0),
		juliaRe: exactCenterString(state.juliaCDecimal?.re, state.juliaC.re, 0),
		juliaIm: exactCenterString(state.juliaCDecimal?.im, state.juliaC.im, 0),
		width: safeWidth,
		height: safeHeight,
		maxIterations: safeIterations,
		bailout: Math.max(2, Number.isFinite(state.bailout) ? state.bailout : 2),
		flipY: state.flipY,
		precisionDigits,
		settingsHash
	};
}

export class PrecisionReferenceWorkerClient {
	private taskId = 0;
	private generation = 0;
	private activeSettingsHash = '';
	private disposed = false;
	private listeners = new Set<PrecisionWorkerListener>();

	constructor(private readonly worker: PrecisionWorkerLike) {
		this.worker.addEventListener('message', this.handleMessage);
	}

	subscribe(listener: PrecisionWorkerListener) {
		this.ensureActive();
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	calculate(config: PrecisionReferenceConfig) {
		this.ensureActive();
		if (this.generation > 0) this.cancel();
		this.generation += 1;
		this.activeSettingsHash = config.settingsHash;
		this.send({
			type: 'CALCULATE_REFERENCE',
			config
		});
		return this.generation;
	}

	cancel() {
		if (this.disposed || this.generation === 0) return;
		this.send({ type: 'CANCEL_GENERATION' });
	}

	currentGeneration() {
		return this.generation;
	}

	dispose() {
		if (this.disposed) return;
		try {
			this.send({ type: 'DISPOSE' });
		} finally {
			this.disposed = true;
			this.worker.removeEventListener('message', this.handleMessage);
			this.listeners.clear();
			this.worker.terminate();
		}
	}

	private send(body: PrecisionWorkerRequestBody) {
		this.ensureActive();
		this.taskId += 1;
		this.worker.postMessage({
			protocolVersion: PRECISION_WORKER_PROTOCOL_VERSION,
			taskId: this.taskId,
			generation: this.generation,
			settingsHash: this.activeSettingsHash,
			...body
		} as PrecisionWorkerRequest);
	}

	private handleMessage = (event: MessageEvent<unknown>) => {
		if (this.disposed || !isPrecisionWorkerResponse(event.data)) return;
		if (event.data.generation !== this.generation) return;
		if (event.data.settingsHash !== this.activeSettingsHash) return;
		for (const listener of this.listeners) listener(event.data);
	};

	private ensureActive() {
		if (this.disposed) throw new Error('The precision reference Worker has been disposed.');
	}
}

type BaseRequest = {
	protocolVersion: number;
	taskId: number;
	generation: number;
	settingsHash: string;
};

export function createPrecisionReferenceWorkerClient() {
	if (typeof Worker === 'undefined') {
		throw new Error('The perturbation reference Worker requires a browser.');
	}
	return new PrecisionReferenceWorkerClient(
		new Worker(new URL('./precision.worker.ts', import.meta.url), {
			type: 'module',
			name: 'fractal-atlas-precision'
		})
	);
}

export type { PrecisionReferenceResult };
