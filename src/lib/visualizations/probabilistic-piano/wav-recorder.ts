import { buildSynthOfflineGraph } from './audio';
import { validateSynthPatch, type SynthPatch } from './synth-patch';
import type { WavEncodeRequest, WavWorkerResponse } from './wav-encoder.worker';

const DEFAULT_SAMPLE_RATE = 48_000;
const DEFAULT_MAX_DURATION_SECONDS = 180;
const MAX_RECORDED_EVENTS = 10_000;

export type WavRecordEventInput =
	| { type: 'noteOn'; pitch: number; velocity?: number; voiceKey?: string; at?: number }
	| { type: 'noteOff'; voiceKey?: string; pitch?: number; at?: number }
	| { type: 'sustain'; value: boolean; at?: number }
	| { type: 'modWheel'; value: number; at?: number }
	| { type: 'pitchBend'; value: number; at?: number }
	| { type: 'patch'; patch: SynthPatch; at?: number }
	| { type: 'stopAll'; at?: number };

export type RecordedSynthEvent =
	| {
			readonly type: 'noteOn';
			readonly at: number;
			readonly voiceKey: string;
			readonly pitch: number;
			readonly velocity: number;
	  }
	| { readonly type: 'noteOff'; readonly at: number; readonly voiceKey: string }
	| { readonly type: 'sustain'; readonly at: number; readonly value: boolean }
	| { readonly type: 'modWheel'; readonly at: number; readonly value: number }
	| { readonly type: 'pitchBend'; readonly at: number; readonly value: number }
	| { readonly type: 'patch'; readonly at: number; readonly patch: SynthPatch }
	| { readonly type: 'stopAll'; readonly at: number };

export type OfflineAudioContextLike = BaseAudioContext & {
	startRendering(): Promise<AudioBuffer>;
};

export interface WavRecorderOptions {
	sampleRate?: number;
	maxDurationSeconds?: number;
	tailSeconds?: number;
	nowSeconds?: () => number;
	offlineContextFactory?: (
		channels: number,
		length: number,
		sampleRate: number
	) => OfflineAudioContextLike;
	workerFactory?: () => Worker;
	createObjectUrl?: (blob: Blob) => string;
	revokeObjectUrl?: (url: string) => void;
}

export interface WavRecorder {
	readonly recording: boolean;
	readonly exporting: boolean;
	readonly eventCount: number;
	start(initialPatch?: SynthPatch): void;
	stop(): readonly RecordedSynthEvent[];
	recordEvent(event: WavRecordEventInput): void;
	exportWav(patch: SynthPatch): Promise<Blob>;
	createBlobUrl(blob: Blob): string;
	revokeLastUrl(): void;
	cancel(): void;
	dispose(): void;
}

function clamp(value: number, min: number, max: number): number {
	return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : min;
}

function defaultNowSeconds(): number {
	return typeof performance !== 'undefined' ? performance.now() / 1000 : Date.now() / 1000;
}

function defaultOfflineContextFactory(
	channels: number,
	length: number,
	sampleRate: number
): OfflineAudioContextLike {
	if (typeof OfflineAudioContext === 'undefined') {
		throw new Error('OfflineAudioContext is unavailable in this environment.');
	}
	return new OfflineAudioContext(channels, length, sampleRate);
}

function defaultWorkerFactory(): Worker {
	if (typeof Worker === 'undefined') {
		throw new Error('Web Workers are unavailable in this environment.');
	}
	return new Worker(new URL('./wav-encoder.worker.ts', import.meta.url), {
		type: 'module'
	});
}

function defaultCreateObjectUrl(blob: Blob): string {
	if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
		throw new Error('URL.createObjectURL is unavailable in this environment.');
	}
	return URL.createObjectURL(blob);
}

function defaultRevokeObjectUrl(url: string): void {
	if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
		URL.revokeObjectURL(url);
	}
}

function computeTailSeconds(patch: SynthPatch): number {
	const release = clamp(patch.ampEnv.release, 0.015, 6);
	const reverbTail = patch.fx.reverb.room === 'off' || patch.fx.reverb.mix <= 0 ? 0.25 : 1.5;
	const delayTail =
		patch.fx.delay.bypass || patch.fx.delay.mix <= 0
			? 0
			: clamp((patch.fx.delay.timeMs / 1000) * (1 + patch.fx.delay.feedback * 2), 0, 2);
	return clamp(release + Math.max(reverbTail, delayTail), 0.35, 8);
}

export function createWavRecorder(options: WavRecorderOptions = {}): WavRecorder {
	const sampleRate = Math.round(clamp(options.sampleRate ?? DEFAULT_SAMPLE_RATE, 8_000, 96_000));
	const maxDurationSeconds = clamp(
		options.maxDurationSeconds ?? DEFAULT_MAX_DURATION_SECONDS,
		1,
		600
	);
	const nowSeconds = options.nowSeconds ?? defaultNowSeconds;
	const offlineContextFactory = options.offlineContextFactory ?? defaultOfflineContextFactory;
	const workerFactory = options.workerFactory ?? defaultWorkerFactory;
	const createObjectUrl = options.createObjectUrl ?? defaultCreateObjectUrl;
	const revokeObjectUrl = options.revokeObjectUrl ?? defaultRevokeObjectUrl;

	let recording = false;
	let exporting = false;
	let disposed = false;
	let startTime = 0;
	let stopTime = 0;
	let events: RecordedSynthEvent[] = [];
	const openVoices = new Map<string, number>();
	let lastSustain = false;
	let initialRecordedPatch: SynthPatch | null = null;
	let activeWorker: Worker | null = null;
	let rejectActiveExport: ((reason?: unknown) => void) | null = null;
	let exportGeneration = 0;
	let lastBlobUrl: string | null = null;
	let jobSerial = 0;

	const terminateWorker = (): void => {
		if (!activeWorker) return;
		const w = activeWorker;
		activeWorker = null;
		try {
			w.terminate();
		} catch {
			// Ignore worker termination errors.
		}
	};

	const revokeManagedUrl = (): void => {
		if (!lastBlobUrl) return;
		const url = lastBlobUrl;
		lastBlobUrl = null;
		revokeObjectUrl(url);
	};

	const eventTimestamp = (explicitAt?: number): number => {
		if (explicitAt !== undefined && Number.isFinite(explicitAt)) {
			return Math.max(0, explicitAt);
		}
		return Math.max(0, nowSeconds() - startTime);
	};

	const pushEvent = (event: RecordedSynthEvent): void => {
		if (events.length < MAX_RECORDED_EVENTS) {
			events.push(event);
		}
	};

	const stopRecording = (): readonly RecordedSynthEvent[] => {
		if (!recording) return [...events];
		recording = false;
		const maxAt = events.reduce((max, ev) => Math.max(max, ev.at), 0);
		stopTime = Math.max(maxAt, nowSeconds() - startTime);

		if (lastSustain) {
			pushEvent({ type: 'sustain', at: stopTime, value: false });
			lastSustain = false;
		}
		for (const voiceKey of openVoices.keys()) {
			pushEvent({ type: 'noteOff', at: stopTime, voiceKey });
		}
		openVoices.clear();
		return [...events];
	};

	const encodeInWorker = (
		jobId: string,
		sr: number,
		channels: readonly Float32Array[],
		token: number
	): Promise<ArrayBuffer> => {
		const transferred = channels.map((ch) => ch.slice().buffer);
		const worker = workerFactory();
		activeWorker = worker;

		return new Promise<ArrayBuffer>((resolve, reject) => {
			let settled = false;

			const finish = (wav?: ArrayBuffer, error?: unknown): void => {
				if (settled) return;
				settled = true;
				rejectActiveExport = null;
				if (typeof worker.removeEventListener === 'function') {
					worker.removeEventListener('message', onMessage as EventListener);
					worker.removeEventListener('error', onError as EventListener);
				}
				terminateWorker();
				if (error !== undefined) reject(error);
				else if (wav) resolve(wav);
			};

			rejectActiveExport = (reason) => finish(undefined, reason);

			const onMessage = (ev: MessageEvent<WavWorkerResponse>): void => {
				if (disposed || token !== exportGeneration) {
					finish(undefined, new Error('WAV export cancelled.'));
					return;
				}
				const data = ev.data;
				if (!data || data.jobId !== jobId) return;
				if (data.type === 'complete') {
					finish(data.wav);
				} else if (data.type === 'cancelled') {
					finish(undefined, new Error('WAV export cancelled.'));
				} else if (data.type === 'error') {
					finish(undefined, new Error(data.message || 'WAV encoding failed.'));
				}
			};

			const onError = (ev: ErrorEvent): void => {
				finish(undefined, new Error(ev.message || 'WAV encoder worker error.'));
			};

			worker.addEventListener('message', onMessage as EventListener);
			worker.addEventListener('error', onError as EventListener);

			const request: WavEncodeRequest = {
				type: 'encode',
				jobId,
				sampleRate: sr,
				channels: transferred
			};
			try {
				worker.postMessage(request, transferred);
			} catch (err) {
				finish(undefined, err);
			}
		});
	};

	const cancel = (): void => {
		exportGeneration++;
		exporting = false;
		if (rejectActiveExport) {
			const reject = rejectActiveExport;
			rejectActiveExport = null;
			reject(new Error('WAV export cancelled.'));
		}
		terminateWorker();
	};

	return {
		get recording(): boolean {
			return recording;
		},

		get exporting(): boolean {
			return exporting;
		},

		get eventCount(): number {
			return events.length;
		},

		start(initialPatch?: SynthPatch): void {
			if (disposed) return;
			events = [];
			openVoices.clear();
			lastSustain = false;
			startTime = nowSeconds();
			stopTime = 0;
			initialRecordedPatch = initialPatch ? validateSynthPatch(initialPatch) : null;
			recording = true;
		},

		stop(): readonly RecordedSynthEvent[] {
			return stopRecording();
		},

		recordEvent(input: WavRecordEventInput): void {
			if (!recording || disposed) return;
			const at = eventTimestamp(input.at);
			switch (input.type) {
				case 'noteOn': {
					const pitch = Math.round(input.pitch);
					if (!Number.isInteger(pitch) || pitch < 0 || pitch > 127) return;
					const velocity = clamp(input.velocity ?? 0.75, 0, 1);
					if (velocity === 0) return;
					const voiceKey = input.voiceKey ?? `pitch-${pitch}`;
					openVoices.set(voiceKey, pitch);
					pushEvent({ type: 'noteOn', at, voiceKey, pitch, velocity });
					break;
				}
				case 'noteOff': {
					const voiceKey =
						input.voiceKey ??
						(input.pitch !== undefined ? `pitch-${Math.round(input.pitch)}` : undefined);
					if (!voiceKey) return;
					openVoices.delete(voiceKey);
					pushEvent({ type: 'noteOff', at, voiceKey });
					break;
				}
				case 'sustain':
					lastSustain = Boolean(input.value);
					pushEvent({ type: 'sustain', at, value: lastSustain });
					break;
				case 'modWheel':
					pushEvent({ type: 'modWheel', at, value: clamp(input.value, 0, 1) });
					break;
				case 'pitchBend':
					pushEvent({ type: 'pitchBend', at, value: clamp(input.value, -1, 1) });
					break;
				case 'patch':
					pushEvent({ type: 'patch', at, patch: validateSynthPatch(input.patch) });
					break;
				case 'stopAll':
					openVoices.clear();
					lastSustain = false;
					pushEvent({ type: 'stopAll', at });
					break;
			}
		},

		async exportWav(patch: SynthPatch): Promise<Blob> {
			if (disposed) {
				throw new Error('WAV recorder has been disposed.');
			}
			if (exporting) {
				throw new Error('A WAV export is already in progress.');
			}
			if (recording) {
				stopRecording();
			}

			const playableNotes = events.filter((ev) => ev.type === 'noteOn' && ev.velocity > 0);
			if (playableNotes.length === 0) {
				throw new Error('No playable notes were recorded.');
			}

			const basePatch = validateSynthPatch(initialRecordedPatch ?? patch);
			const sortedEvents = [...events].sort((a, b) => a.at - b.at);
			const lastEventAt = Math.max(stopTime, sortedEvents[sortedEvents.length - 1]?.at ?? 0);
			let maxTail = computeTailSeconds(basePatch);
			for (const ev of sortedEvents) {
				if (ev.type === 'patch') {
					maxTail = Math.max(maxTail, computeTailSeconds(ev.patch));
				}
			}
			const tail = options.tailSeconds ?? maxTail;
			const durationSeconds = clamp(lastEventAt + tail, 0.25, maxDurationSeconds);
			const frameCount = Math.max(1, Math.ceil(durationSeconds * sampleRate));

			exporting = true;
			const token = ++exportGeneration;
			let graph: ReturnType<typeof buildSynthOfflineGraph> | null = null;

			try {
				const offlineContext = offlineContextFactory(2, frameCount, sampleRate);
				graph = buildSynthOfflineGraph(offlineContext, { patch: basePatch });
				const activeVoices = new Map<string, string[]>();

				for (const ev of sortedEvents) {
					if (ev.at > durationSeconds) continue;
					switch (ev.type) {
						case 'noteOn': {
							const voiceId = graph.noteOn(ev.pitch, ev.velocity, ev.at);
							if (voiceId) {
								const list = activeVoices.get(ev.voiceKey);
								if (list) {
									list.push(voiceId);
								} else {
									activeVoices.set(ev.voiceKey, [voiceId]);
								}
							}
							break;
						}
						case 'noteOff': {
							const list = activeVoices.get(ev.voiceKey);
							if (list) {
								for (const voiceId of list) {
									graph.noteOff(voiceId, ev.at);
								}
								activeVoices.delete(ev.voiceKey);
							}
							break;
						}
						case 'sustain':
							graph.setSustain(ev.value, ev.at);
							break;
						case 'modWheel':
							graph.setModWheel(ev.value, ev.at);
							break;
						case 'pitchBend':
							graph.setPitchBend(ev.value, ev.at);
							break;
						case 'patch':
							graph.setPatch(ev.patch, ev.at);
							break;
						case 'stopAll':
							graph.setSustain(false, ev.at);
							for (const list of activeVoices.values()) {
								for (const voiceId of list) {
									graph.noteOff(voiceId, ev.at);
								}
							}
							activeVoices.clear();
							break;
					}
				}

				const rendered = await offlineContext.startRendering();
				graph.dispose();
				graph = null;

				if (disposed || token !== exportGeneration) {
					throw new Error('WAV export cancelled.');
				}

				const ch0 = rendered.getChannelData(0);
				const ch1 = rendered.numberOfChannels > 1 ? rendered.getChannelData(1) : ch0;
				const jobId = `wav-${++jobSerial}`;
				const wavBuffer = await encodeInWorker(jobId, sampleRate, [ch0, ch1], token);

				if (disposed || token !== exportGeneration) {
					throw new Error('WAV export cancelled.');
				}

				return new Blob([wavBuffer], { type: 'audio/wav' });
			} finally {
				graph?.dispose();
				if (token === exportGeneration) {
					exporting = false;
				}
			}
		},

		createBlobUrl(blob: Blob): string {
			if (disposed) throw new Error('WAV recorder has been disposed.');
			revokeManagedUrl();
			const url = createObjectUrl(blob);
			lastBlobUrl = url;
			return url;
		},

		revokeLastUrl(): void {
			revokeManagedUrl();
		},

		cancel,

		dispose(): void {
			if (disposed) return;
			disposed = true;
			recording = false;
			cancel();
			revokeManagedUrl();
			events = [];
			openVoices.clear();
			initialRecordedPatch = null;
		}
	};
}
