/// <reference lib="webworker" />

import { inspectPcmInput, writePcm16Frames, writeWavHeader } from './wav-encoder-core';
import {
	WAV_WORKER_PROTOCOL_VERSION,
	type WavWorkerRequest,
	type WavWorkerResponse
} from './wav-worker-protocol';

const workerScope = self as DedicatedWorkerGlobalScope;
const cancelledJobs = new Set<string>();
let disposed = false;

function respond(message: WavWorkerResponse, transfer: Transferable[] = []): void {
	workerScope.postMessage(message, transfer);
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function runEncode(request: Extract<WavWorkerRequest, { type: 'encode' }>): void {
	try {
		const channels = request.channels.map((buffer) => new Float32Array(buffer));
		const format = inspectPcmInput(request.sampleRate, channels);
		const wav = new ArrayBuffer(format.totalBytes);
		const view = new DataView(wav);
		writeWavHeader(view, format);
		let nextFrame = 0;
		const framesPerChunk = 8_192;

		const pump = () => {
			if (disposed || cancelledJobs.delete(request.jobId)) {
				respond({
					version: WAV_WORKER_PROTOCOL_VERSION,
					type: 'cancelled',
					jobId: request.jobId
				});
				return;
			}
			try {
				const end = Math.min(format.frames, nextFrame + framesPerChunk);
				writePcm16Frames(view, channels, nextFrame, end);
				nextFrame = end;
				respond({
					version: WAV_WORKER_PROTOCOL_VERSION,
					type: 'progress',
					jobId: request.jobId,
					progress: nextFrame / format.frames
				});
				if (nextFrame < format.frames) {
					workerScope.setTimeout(pump, 0);
					return;
				}
				respond(
					{
						version: WAV_WORKER_PROTOCOL_VERSION,
						type: 'complete',
						jobId: request.jobId,
						wav
					},
					[wav]
				);
			} catch (error) {
				respond({
					version: WAV_WORKER_PROTOCOL_VERSION,
					type: 'error',
					jobId: request.jobId,
					message: errorMessage(error)
				});
			}
		};

		pump();
	} catch (error) {
		respond({
			version: WAV_WORKER_PROTOCOL_VERSION,
			type: 'error',
			jobId: request.jobId,
			message: errorMessage(error)
		});
	}
}

workerScope.addEventListener('message', (event: MessageEvent<WavWorkerRequest>) => {
	const request = event.data;
	if (!request || request.version !== WAV_WORKER_PROTOCOL_VERSION) return;
	if (request.type === 'cancel') {
		cancelledJobs.add(request.jobId);
		return;
	}
	if (request.type === 'dispose') {
		disposed = true;
		respond({ version: WAV_WORKER_PROTOCOL_VERSION, type: 'disposed' });
		workerScope.close();
		return;
	}
	if (!disposed) runEncode(request);
});

respond({ version: WAV_WORKER_PROTOCOL_VERSION, type: 'ready' });
