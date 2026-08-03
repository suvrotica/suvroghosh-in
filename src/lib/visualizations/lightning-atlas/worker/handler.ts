import {
	AnalysisCancelledError,
	analyseAttachmentBatch,
	analyseAttachmentBatchAsync
} from '../batch-analysis';
import { generateLightningFlash } from '../leader-generator';
import type { AtlasWorkerRequest, AtlasWorkerResponse } from '../types';

export class LightningAtlasWorkerHandler {
	private cancelled = new Set<number>();

	cancel(requestId: number) {
		this.cancelled.add(requestId);
	}

	async handleAsync(
		request: AtlasWorkerRequest,
		options: { maximumBatchRuns?: number } = {}
	): Promise<AtlasWorkerResponse | null> {
		if (request.type === 'cancel') {
			this.cancel(request.targetId);
			return { id: request.targetId, type: 'cancelled' };
		}
		if (this.cancelled.delete(request.id)) return { id: request.id, type: 'cancelled' };
		try {
			if (request.type === 'generate-flash') {
				const result = generateLightningFlash(request.input);
				return { id: request.id, type: 'flash', ...result };
			}
			const result = await analyseAttachmentBatchAsync(
				request.input,
				() => this.cancelled.has(request.id),
				{ maximumRuns: options.maximumBatchRuns }
			);
			this.cancelled.delete(request.id);
			return { id: request.id, type: 'batch', result };
		} catch (error) {
			this.cancelled.delete(request.id);
			if (error instanceof AnalysisCancelledError) return { id: request.id, type: 'cancelled' };
			return {
				id: request.id,
				type: 'error',
				message: error instanceof Error ? error.message : 'Lightning Atlas worker failed.'
			};
		}
	}

	handle(request: AtlasWorkerRequest): AtlasWorkerResponse | null {
		if (request.type === 'cancel') {
			this.cancel(request.targetId);
			return { id: request.targetId, type: 'cancelled' };
		}
		if (this.cancelled.delete(request.id)) return { id: request.id, type: 'cancelled' };

		try {
			if (request.type === 'generate-flash') {
				const result = generateLightningFlash(request.input);
				return { id: request.id, type: 'flash', ...result };
			}
			const result = analyseAttachmentBatch(request.input, () => this.cancelled.has(request.id));
			this.cancelled.delete(request.id);
			return { id: request.id, type: 'batch', result };
		} catch (error) {
			if (error instanceof AnalysisCancelledError) return { id: request.id, type: 'cancelled' };
			return {
				id: request.id,
				type: 'error',
				message: error instanceof Error ? error.message : 'Lightning Atlas worker failed.'
			};
		}
	}
}
