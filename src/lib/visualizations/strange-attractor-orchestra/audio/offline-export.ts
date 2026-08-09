import type { AudioExportProgress } from './contracts';
import {
	renderOrchestraOffline,
	type OfflineRenderOptions,
	type OfflineRenderResult
} from './offline-renderer';
import { exportOrchestraScoreJson, type ScoreJsonExport } from './score-export';
import { throwIfAborted } from './safety';
import {
	WavEncoderWorkerClient,
	type EncodedWav,
	type WavWorkerFactory
} from './wav-worker-client';

export type OrchestraOfflineExportOptions = OfflineRenderOptions &
	Readonly<{
		filenameStem?: string;
		workerFactory?: WavWorkerFactory;
	}>;

export type OrchestraOfflineExport = Readonly<{
	render: OfflineRenderResult;
	wav: EncodedWav;
	wavFilename: string;
	score: ScoreJsonExport;
}>;

function cleanFilenameStem(value: string | undefined): string {
	const cleaned = (value ?? 'strange-attractor-orchestra')
		.toLowerCase()
		.replace(/[^a-z0-9]+/gu, '-')
		.replace(/^-+|-+$/gu, '')
		.slice(0, 80);
	return cleaned || 'strange-attractor-orchestra';
}

function notify(
	callback: OrchestraOfflineExportOptions['onProgress'],
	stage: AudioExportProgress['stage'],
	progress: number,
	message: string
): void {
	callback?.({ stage, progress: Math.max(0, Math.min(1, progress)), message });
}

/** Offline render + dedicated-worker WAV encode + byte-stable score JSON. */
export async function exportOrchestraOffline(
	options: OrchestraOfflineExportOptions
): Promise<OrchestraOfflineExport> {
	throwIfAborted(options.signal);
	const stem = cleanFilenameStem(options.filenameStem);
	const score = exportOrchestraScoreJson({
		events: options.events,
		seed: options.seed,
		soundWorld: options.soundWorld,
		filenameStem: stem
	});
	const render = await renderOrchestraOffline({
		...options,
		onProgress(update) {
			if (update.stage === 'preparing') {
				notify(options.onProgress, 'preparing', update.progress, update.message);
			} else {
				notify(options.onProgress, 'rendering', update.progress, update.message);
			}
		}
	});
	throwIfAborted(options.signal);

	const encoder = new WavEncoderWorkerClient(options.workerFactory);
	try {
		notify(options.onProgress, 'encoding', 0, 'Encoding 16-bit WAV');
		const wav = await encoder.encodeAudioBuffer(render.buffer, {
			signal: options.signal,
			onProgress(value) {
				notify(options.onProgress, 'encoding', value, 'Encoding 16-bit WAV');
			}
		});
		throwIfAborted(options.signal);
		notify(options.onProgress, 'complete', 1, 'WAV and deterministic score are ready');
		return {
			render,
			wav,
			wavFilename: `${stem}.wav`,
			score
		};
	} finally {
		encoder.dispose();
	}
}
