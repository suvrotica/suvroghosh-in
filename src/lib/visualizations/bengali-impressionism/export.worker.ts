/// <reference lib="webworker" />

import { buildPainting, prepareBrushwork, renderPainting } from './brush';
import type { PaintingExportReply, PaintingExportRequest } from './export-image';
import { generateScene } from './scene';

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.addEventListener('message', async ({ data }: MessageEvent<PaintingExportRequest>) => {
	let reply: PaintingExportReply;
	try {
		const { width, height, family, seed, settings, frame } = data;
		if (![width, height].every((side) => Number.isInteger(side) && side >= 1 && side <= 4096)) {
			throw new RangeError('The requested PNG dimensions are out of range.');
		}

		const canvas = new OffscreenCanvas(width, height);
		if (!canvas.getContext('2d')) throw new Error('Offscreen drawing is unavailable.');
		const scene = generateScene(family, seed);
		const painting = buildPainting(prepareBrushwork(scene), settings);
		renderPainting(canvas, painting, frame);
		reply = { blob: await canvas.convertToBlob({ type: 'image/png' }) };
	} catch (error) {
		reply = { error: error instanceof Error ? error.message : 'The PNG could not be encoded.' };
	}
	scope.postMessage(reply);
});
