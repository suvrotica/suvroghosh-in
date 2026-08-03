/// <reference lib="webworker" />

import { LightningAtlasWorkerHandler } from './handler';
import type { AtlasWorkerRequest, AtlasWorkerResponse } from '../types';

const workerScope = self as unknown as DedicatedWorkerGlobalScope;
const handler = new LightningAtlasWorkerHandler();

workerScope.addEventListener('message', (event: MessageEvent<AtlasWorkerRequest>) => {
	void handler.handleAsync(event.data).then((response) => {
		if (!response) return;
		const transfer: Transferable[] = [];
		if (response.type === 'flash') {
			transfer.push(
				response.terrain.heights.buffer,
				response.terrain.waterMask.buffer,
				response.terrain.materialMask.buffer,
				response.terrain.wetness.buffer
			);
		}
		workerScope.postMessage(response satisfies AtlasWorkerResponse, transfer);
	});
});
