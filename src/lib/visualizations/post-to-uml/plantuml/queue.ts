import type { UmlDiagramType } from '../types';
import { renderPlantUmlToSvg, type PlantUmlRenderResult } from './renderer';

export interface RenderQueueTask {
	id: string;
	sourceCode: string;
	diagramType: UmlDiagramType;
	titleOverride?: string;
	isConceptual?: boolean;
	signal?: AbortSignal;
}

export class BoundedRenderQueue {
	private readonly maxConcurrency: number;
	private readonly maxPending: number;
	private activeCount = 0;
	private readonly queue: {
		task: RenderQueueTask;
		resolve: (res: PlantUmlRenderResult) => void;
		reject: (err: Error) => void;
	}[] = [];

	constructor(maxConcurrency = 3, maxPending = 32) {
		this.maxConcurrency = Math.max(1, maxConcurrency);
		this.maxPending = Math.max(4, maxPending);
	}

	enqueue(task: RenderQueueTask): Promise<PlantUmlRenderResult> {
		if (task.signal?.aborted) {
			return Promise.reject(new Error('Render task was cancelled.'));
		}

		// Replace existing pending task with the same diagram id so rapid edits coalesce
		const existingIdx = this.queue.findIndex((item) => item.task.id === task.id);
		if (existingIdx >= 0) {
			const [superseded] = this.queue.splice(existingIdx, 1);
			superseded.reject(new Error('Render superseded by a newer source revision.'));
		}

		if (this.queue.length >= this.maxPending) {
			const dropped = this.queue.shift();
			dropped?.reject(new Error('Render queue limit exceeded; older render superseded.'));
		}

		return new Promise<PlantUmlRenderResult>((resolve, reject) => {
			this.queue.push({ task, resolve, reject });
			this.pump();
		});
	}

	cancelAll(): void {
		while (this.queue.length > 0) {
			const item = this.queue.shift();
			item?.reject(new Error('Render queue cancelled.'));
		}
	}

	private pump(): void {
		while (this.activeCount < this.maxConcurrency && this.queue.length > 0) {
			const next = this.queue.shift();
			if (!next) break;
			if (next.task.signal?.aborted) {
				next.reject(new Error('Render task was cancelled.'));
				continue;
			}
			this.activeCount += 1;
			Promise.resolve()
				.then(() =>
					renderPlantUmlToSvg(next.task.sourceCode, next.task.diagramType, {
						titleOverride: next.task.titleOverride,
						isConceptual: next.task.isConceptual
					})
				)
				.then((result) => {
					next.resolve(result);
				})
				.catch((err) => {
					next.reject(err instanceof Error ? err : new Error(String(err)));
				})
				.finally(() => {
					this.activeCount -= 1;
					this.pump();
				});
		}
	}
}

export const defaultPlantUmlRenderQueue = new BoundedRenderQueue(3, 32);
