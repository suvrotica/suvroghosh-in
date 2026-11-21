import { computeAcousticMetrics } from './metrics';
import { runSynchronousRirCapture } from './solver';
import { DX, FS_SIM, type AcousticMetrics, type GridPoint, type PerimeterMode } from './types';

export interface RirWorkerRequest {
	id: number;
	material: Uint8Array;
	perimeter: PerimeterMode;
	source: GridPoint;
	listener: GridPoint;
}

export interface RirWorkerResponse {
	id: number;
	metrics: AcousticMetrics;
}

const workerScope = self as unknown as {
	onmessage: ((event: MessageEvent<RirWorkerRequest>) => void) | null;
	postMessage: (message: RirWorkerResponse, transfer?: Transferable[]) => void;
};

workerScope.onmessage = (event: MessageEvent<RirWorkerRequest>) => {
	const { id, material, perimeter, source, listener } = event.data;
	const rawRir = runSynchronousRirCapture({
		material,
		perimeter,
		source,
		listener
	});
	const distMeters = Math.hypot((listener.x - source.x) * DX, (listener.y - source.y) * DX);
	const metrics = computeAcousticMetrics(rawRir, FS_SIM, distMeters);
	workerScope.postMessage({ id, metrics }, [
		metrics.rir.buffer,
		metrics.schroederDb.buffer,
		metrics.spectrumFreqsHz.buffer,
		metrics.spectrumDb.buffer
	]);
};
