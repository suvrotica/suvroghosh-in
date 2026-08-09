import { abortError, clamp, throwIfAborted } from './safety';
import {
	WAV_WORKER_PROTOCOL_VERSION,
	isWavWorkerResponse,
	type WavWorkerRequest,
	type WavWorkerResponse
} from './wav-worker-protocol';

export type WavWorkerFactory = () => Worker;

export type WavEncodeOptions = Readonly<{
	signal?: AbortSignal;
	onProgress?: (progress: number) => void;
}>;

export type EncodedWav = Readonly<{
	arrayBuffer: ArrayBuffer;
	blob: Blob;
	sampleRate: number;
	channels: number;
	frames: number;
	durationSeconds: number;
}>;

type ActiveJob = {
	id: string;
	sampleRate: number;
	channels: number;
	frames: number;
	onProgress?: (progress: number) => void;
	signal?: AbortSignal;
	abortListener?: () => void;
	resolve: (value: EncodedWav) => void;
	reject: (reason?: unknown) => void;
};

function browserWorkerFactory(): Worker {
	if (typeof Worker === 'undefined')
		throw new Error('Web Workers are unavailable in this browser.');
	return new Worker(new URL('./wav-encoder.worker.ts', import.meta.url), {
		type: 'module',
		name: 'strange-attractor-wav-encoder'
	});
}

let jobCounter = 0;

/** Lazily owns a dedicated encoder worker. Constructing the client has no browser side effects. */
export class WavEncoderWorkerClient {
	private worker: Worker | null = null;
	private active: ActiveJob | null = null;
	private disposed = false;

	constructor(private readonly workerFactory: WavWorkerFactory = browserWorkerFactory) {}

	encodeAudioBuffer(buffer: AudioBuffer, options: WavEncodeOptions = {}): Promise<EncodedWav> {
		const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) =>
			buffer.getChannelData(index)
		);
		return this.encodeChannels(buffer.sampleRate, channels, options);
	}

	encodeChannels(
		sampleRate: number,
		channels: readonly Float32Array[],
		options: WavEncodeOptions = {}
	): Promise<EncodedWav> {
		if (this.disposed)
			return Promise.reject(new Error('The WAV encoder client has been disposed.'));
		if (this.active) return Promise.reject(new Error('The WAV encoder already has an active job.'));
		try {
			throwIfAborted(options.signal);
			if (channels.length < 1 || channels.length > 2) {
				throw new RangeError('WAV export supports one or two channels.');
			}
			const frames = channels[0]?.length ?? 0;
			if (frames < 1 || channels.some((channel) => channel.length !== frames)) {
				throw new RangeError('WAV channels must have one shared, non-zero frame count.');
			}
			const safeSampleRate = Math.round(clamp(sampleRate, 8_000, 96_000));
			const transferred = channels.map((channel) => channel.slice().buffer);
			const worker = this.ensureWorker();
			const id = `wav-${Date.now().toString(36)}-${(jobCounter += 1).toString(36)}`;

			return new Promise<EncodedWav>((resolve, reject) => {
				const active: ActiveJob = {
					id,
					sampleRate: safeSampleRate,
					channels: channels.length,
					frames,
					onProgress: options.onProgress,
					signal: options.signal,
					resolve,
					reject
				};
				if (options.signal) {
					active.abortListener = () => this.cancel(id);
					options.signal.addEventListener('abort', active.abortListener, { once: true });
				}
				this.active = active;
				const request: WavWorkerRequest = {
					version: WAV_WORKER_PROTOCOL_VERSION,
					type: 'encode',
					jobId: id,
					sampleRate: safeSampleRate,
					channels: transferred
				};
				worker.postMessage(request, transferred);
				if (options.signal?.aborted) this.cancel(id);
			});
		} catch (error) {
			return Promise.reject(error);
		}
	}

	cancel(jobId = this.active?.id): void {
		if (!jobId || !this.worker || this.active?.id !== jobId) return;
		const request: WavWorkerRequest = {
			version: WAV_WORKER_PROTOCOL_VERSION,
			type: 'cancel',
			jobId
		};
		this.worker.postMessage(request);
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		const worker = this.worker;
		if (worker) {
			worker.postMessage({
				version: WAV_WORKER_PROTOCOL_VERSION,
				type: 'dispose'
			} satisfies WavWorkerRequest);
			worker.terminate();
		}
		this.worker = null;
		if (this.active) this.finishActive(undefined, new Error('The WAV encoder was disposed.'));
	}

	private ensureWorker(): Worker {
		if (this.worker) return this.worker;
		const worker = this.workerFactory();
		worker.addEventListener('message', this.handleMessage);
		worker.addEventListener('error', this.handleWorkerError);
		this.worker = worker;
		return worker;
	}

	private handleMessage = (event: MessageEvent<unknown>): void => {
		if (!isWavWorkerResponse(event.data)) return;
		const response: WavWorkerResponse = event.data;
		if (response.type === 'ready' || response.type === 'disposed') return;
		const active = this.active;
		if (!active || response.jobId !== active.id) return;
		if (response.type === 'progress') {
			active.onProgress?.(clamp(response.progress, 0, 1));
			return;
		}
		if (response.type === 'cancelled') {
			this.finishActive(undefined, abortError());
			return;
		}
		if (response.type === 'error') {
			this.finishActive(undefined, new Error(response.message));
			return;
		}
		const arrayBuffer = response.wav;
		this.finishActive({
			arrayBuffer,
			blob: new Blob([arrayBuffer], { type: 'audio/wav' }),
			sampleRate: active.sampleRate,
			channels: active.channels,
			frames: active.frames,
			durationSeconds: active.frames / active.sampleRate
		});
	};

	private handleWorkerError = (event: ErrorEvent): void => {
		if (!this.active) return;
		this.finishActive(undefined, new Error(event.message || 'The WAV worker failed.'));
	};

	private finishActive(value?: EncodedWav, error?: unknown): void {
		const active = this.active;
		if (!active) return;
		this.active = null;
		if (active.signal && active.abortListener) {
			active.signal.removeEventListener('abort', active.abortListener);
		}
		if (error !== undefined) active.reject(error);
		else if (value) active.resolve(value);
	}
}

export function createWavEncoderWorkerClient(
	workerFactory?: WavWorkerFactory
): WavEncoderWorkerClient {
	return new WavEncoderWorkerClient(workerFactory);
}
