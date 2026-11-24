/// <reference lib="webworker" />

export const WAV_HEADER_BYTES = 44;
export const WAV_BITS_PER_SAMPLE = 16;

export interface WavEncodeRequest {
	readonly type: 'encode';
	readonly jobId: string;
	readonly sampleRate: number;
	readonly channels: ArrayBuffer[];
}

export interface WavCancelRequest {
	readonly type: 'cancel' | 'dispose';
	readonly jobId?: string;
}

export type WavWorkerRequest = WavEncodeRequest | WavCancelRequest;

export type WavWorkerResponse =
	| { readonly type: 'complete'; readonly jobId: string; readonly wav: ArrayBuffer }
	| { readonly type: 'cancelled'; readonly jobId: string }
	| { readonly type: 'error'; readonly jobId: string; readonly message: string };

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

function writeAscii(view: DataView, offset: number, text: string): void {
	for (let i = 0; i < text.length; i++) {
		view.setUint8(offset + i, text.charCodeAt(i));
	}
}

function floatToPcm16(sample: number): number {
	const safe = Number.isFinite(sample) ? clamp(sample, -1, 1) : 0;
	return safe < 0 ? Math.round(safe * 32_768) : Math.round(safe * 32_767);
}

/** Pure, deterministic 16-bit PCM RIFF/WAVE encoder (Node & Worker safe). */
export function encodePcm16Wav(sampleRate: number, channels: readonly Float32Array[]): ArrayBuffer {
	if (channels.length < 1 || channels.length > 2) {
		throw new RangeError('WAV export supports one or two channels.');
	}
	const frames = channels[0]?.length ?? 0;
	if (!Number.isSafeInteger(frames) || frames < 1) {
		throw new RangeError('WAV export requires at least one PCM frame.');
	}
	for (const channel of channels) {
		if (!(channel instanceof Float32Array) || channel.length !== frames) {
			throw new RangeError('Every WAV channel must be Float32Array with equal length.');
		}
	}

	const safeSampleRate = Math.round(
		Number.isFinite(sampleRate) ? clamp(sampleRate, 8_000, 96_000) : 48_000
	);
	const bytesPerFrame = channels.length * (WAV_BITS_PER_SAMPLE / 8);
	const dataBytes = frames * bytesPerFrame;
	const totalBytes = WAV_HEADER_BYTES + dataBytes;
	if (!Number.isSafeInteger(totalBytes) || dataBytes > 0xffff_ffff - 36) {
		throw new RangeError('WAV exceeds RIFF 32-bit size limit.');
	}

	const output = new ArrayBuffer(totalBytes);
	const view = new DataView(output);

	// 44-byte RIFF/WAVE PCM header
	writeAscii(view, 0, 'RIFF');
	view.setUint32(4, 36 + dataBytes, true);
	writeAscii(view, 8, 'WAVE');
	writeAscii(view, 12, 'fmt ');
	view.setUint32(16, 16, true); // PCM subchunk size
	view.setUint16(20, 1, true); // AudioFormat = 1 (PCM)
	view.setUint16(22, channels.length, true);
	view.setUint32(24, safeSampleRate, true);
	view.setUint32(28, safeSampleRate * bytesPerFrame, true); // ByteRate
	view.setUint16(32, bytesPerFrame, true); // BlockAlign
	view.setUint16(34, WAV_BITS_PER_SAMPLE, true);
	writeAscii(view, 36, 'data');
	view.setUint32(40, dataBytes, true);

	// Interleaved little-endian signed 16-bit PCM frames
	let offset = WAV_HEADER_BYTES;
	for (let frame = 0; frame < frames; frame++) {
		for (let ch = 0; ch < channels.length; ch++) {
			view.setInt16(offset, floatToPcm16(channels[ch][frame]), true);
			offset += 2;
		}
	}

	return output;
}

const isWorkerScope =
	typeof self !== 'undefined' &&
	typeof (self as unknown as DedicatedWorkerGlobalScope).postMessage === 'function' &&
	typeof (self as unknown as { document?: unknown }).document === 'undefined';

if (isWorkerScope) {
	const workerScope = self as unknown as DedicatedWorkerGlobalScope;
	const cancelledJobs = new Set<string>();
	let disposed = false;

	workerScope.addEventListener('message', (event: MessageEvent<WavWorkerRequest>) => {
		const request = event.data;
		if (!request || typeof request !== 'object') return;
		if (request.type === 'cancel') {
			if (request.jobId) cancelledJobs.add(request.jobId);
			return;
		}
		if (request.type === 'dispose') {
			disposed = true;
			workerScope.close();
			return;
		}
		if (request.type === 'encode') {
			if (disposed || cancelledJobs.delete(request.jobId)) {
				const cancelled: WavWorkerResponse = { type: 'cancelled', jobId: request.jobId };
				workerScope.postMessage(cancelled);
				return;
			}
			try {
				const pcmChannels = request.channels.map((buffer) => new Float32Array(buffer));
				const wav = encodePcm16Wav(request.sampleRate, pcmChannels);
				const response: WavWorkerResponse = { type: 'complete', jobId: request.jobId, wav };
				workerScope.postMessage(response, [wav]);
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				const errorResponse: WavWorkerResponse = {
					type: 'error',
					jobId: request.jobId,
					message
				};
				workerScope.postMessage(errorResponse);
			}
		}
	});
}
