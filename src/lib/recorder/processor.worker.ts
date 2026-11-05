import { enhanceAudioBuffer } from './dsp';
import { renderEditedAudio } from './editor';
import { exportRecordingMedia } from './mp4-encoder';
import type {
	EditRecipe,
	EnhancementSettings,
	ExportFormat,
	ExportPresetId,
	RecordingMode
} from './types';

export type RecorderWorkerRequest =
	| {
			id: string;
			type: 'CANCEL';
			targetId: string;
	  }
	| {
			id: string;
			type: 'ENHANCE';
			channelData: Float32Array[];
			sampleRate: number;
			settings: EnhancementSettings;
	  }
	| {
			id: string;
			type: 'EXPORT';
			title: string;
			mode: RecordingMode;
			format: ExportFormat;
			presetId: ExportPresetId;
			originalChannels: Float32Array[];
			sampleRate: number;
			recipe: EditRecipe;
			waveformPeaks: number[];
	  };

const cancelledIds = new Set<string>();

self.onmessage = async (event: MessageEvent<RecorderWorkerRequest>) => {
	const msg = event.data;
	if (!msg) return;

	if (msg.type === 'CANCEL') {
		cancelledIds.add(msg.targetId);
		return;
	}

	const shouldCancel = () => cancelledIds.has(msg.id);

	try {
		if (msg.type === 'ENHANCE') {
			const res = enhanceAudioBuffer(msg.channelData, msg.sampleRate, msg.settings, {
				shouldCancel,
				onProgress: (fraction) => {
					self.postMessage({ id: msg.id, type: 'PROGRESS', fraction });
				}
			});
			if (shouldCancel()) {
				self.postMessage({ id: msg.id, type: 'CANCELLED' });
				return;
			}
			self.postMessage({
				id: msg.id,
				type: 'ENHANCE_DONE',
				result: res
			});
		} else if (msg.type === 'EXPORT') {
			const rendered = renderEditedAudio({
				originalChannels: msg.originalChannels,
				sampleRate: msg.sampleRate,
				recipe: msg.recipe,
				includeEnhancement: true,
				shouldCancel,
				onProgress: (fraction) => {
					self.postMessage({ id: msg.id, type: 'PROGRESS', fraction: fraction * 0.5 });
				}
			});
			if (shouldCancel()) {
				self.postMessage({ id: msg.id, type: 'CANCELLED' });
				return;
			}

			const exported = await exportRecordingMedia({
				title: msg.title,
				mode: msg.mode,
				format: msg.format,
				presetId: msg.presetId,
				channelData: rendered.renderedChannels,
				sampleRate: rendered.sampleRate,
				waveformPeaks: msg.waveformPeaks,
				onProgress: (fraction) => {
					self.postMessage({ id: msg.id, type: 'PROGRESS', fraction: 0.5 + fraction * 0.5 });
				}
			});
			if (shouldCancel()) {
				self.postMessage({ id: msg.id, type: 'CANCELLED' });
				return;
			}

			const arrayBuffer = await exported.blob.arrayBuffer();
			self.postMessage(
				{
					id: msg.id,
					type: 'EXPORT_DONE',
					result: {
						...exported,
						blob: undefined,
						arrayBuffer
					}
				},
				{ transfer: [arrayBuffer] }
			);
		}
	} catch (err) {
		self.postMessage({
			id: msg.id,
			type: 'ERROR',
			message: err instanceof Error ? err.message : String(err)
		});
	} finally {
		cancelledIds.delete(msg.id);
	}
};
