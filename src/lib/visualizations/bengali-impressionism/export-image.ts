import type { Frame, PaintSettings } from './brush';
import type { SceneFamily } from './scene';

export interface PaintingExportRequest {
	family: SceneFamily;
	seed: string;
	settings: PaintSettings;
	frame: Frame;
	width: number;
	height: number;
}

export type PaintingExportReply = { blob: Blob } | { error: string };

export function startExport(
	request: PaintingExportRequest
): { result: Promise<Blob>; cancel: () => void } | undefined {
	if (typeof Worker !== 'function' || typeof OffscreenCanvas !== 'function') return;

	let worker: Worker;
	try {
		worker = new Worker(new URL('./export.worker.ts', import.meta.url), { type: 'module' });
	} catch {
		return;
	}

	let active = true;
	let rejectResult: (error: Error) => void;
	const result = new Promise<Blob>((resolve, reject) => {
		rejectResult = reject;
		worker.onmessage = ({ data }: MessageEvent<PaintingExportReply>) => {
			terminate();
			if ('blob' in data) resolve(data.blob);
			else reject(new Error(data.error));
		};
		worker.onerror = (event) => {
			event.preventDefault();
			terminate();
			reject(new Error(event.message || 'The PNG export worker could not run.'));
		};
		worker.onmessageerror = () => {
			terminate();
			reject(new Error('The PNG export worker returned an unreadable result.'));
		};
		try {
			worker.postMessage(request);
		} catch (error) {
			terminate();
			reject(error);
		}
	});

	function terminate() {
		active = false;
		worker.terminate();
	}

	return {
		result,
		cancel() {
			if (!active) return;
			terminate();
			rejectResult(new DOMException('The PNG export was canceled.', 'AbortError'));
		}
	};
}
