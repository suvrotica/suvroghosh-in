export const WAV_WORKER_PROTOCOL_VERSION = 1 as const;

export type WavWorkerEncodeRequest = Readonly<{
	version: typeof WAV_WORKER_PROTOCOL_VERSION;
	type: 'encode';
	jobId: string;
	sampleRate: number;
	channels: readonly ArrayBuffer[];
}>;

export type WavWorkerCancelRequest = Readonly<{
	version: typeof WAV_WORKER_PROTOCOL_VERSION;
	type: 'cancel';
	jobId: string;
}>;

export type WavWorkerDisposeRequest = Readonly<{
	version: typeof WAV_WORKER_PROTOCOL_VERSION;
	type: 'dispose';
}>;

export type WavWorkerRequest =
	| WavWorkerEncodeRequest
	| WavWorkerCancelRequest
	| WavWorkerDisposeRequest;

export type WavWorkerResponse =
	| Readonly<{
			version: typeof WAV_WORKER_PROTOCOL_VERSION;
			type: 'ready';
	  }>
	| Readonly<{
			version: typeof WAV_WORKER_PROTOCOL_VERSION;
			type: 'progress';
			jobId: string;
			progress: number;
	  }>
	| Readonly<{
			version: typeof WAV_WORKER_PROTOCOL_VERSION;
			type: 'complete';
			jobId: string;
			wav: ArrayBuffer;
	  }>
	| Readonly<{
			version: typeof WAV_WORKER_PROTOCOL_VERSION;
			type: 'cancelled';
			jobId: string;
	  }>
	| Readonly<{
			version: typeof WAV_WORKER_PROTOCOL_VERSION;
			type: 'error';
			jobId: string;
			message: string;
	  }>
	| Readonly<{
			version: typeof WAV_WORKER_PROTOCOL_VERSION;
			type: 'disposed';
	  }>;

export function isWavWorkerResponse(value: unknown): value is WavWorkerResponse {
	if (!value || typeof value !== 'object') return false;
	const candidate = value as Partial<WavWorkerResponse>;
	if (candidate.version !== WAV_WORKER_PROTOCOL_VERSION || typeof candidate.type !== 'string') {
		return false;
	}
	if (candidate.type === 'ready' || candidate.type === 'disposed') return true;
	if (!('jobId' in candidate) || typeof candidate.jobId !== 'string') return false;
	if (candidate.type === 'progress') {
		return 'progress' in candidate && typeof candidate.progress === 'number';
	}
	if (candidate.type === 'complete') {
		return 'wav' in candidate && candidate.wav instanceof ArrayBuffer;
	}
	if (candidate.type === 'error') {
		return 'message' in candidate && typeof candidate.message === 'string';
	}
	return candidate.type === 'cancelled';
}
