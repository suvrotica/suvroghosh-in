/// <reference lib="webworker" />

import {
	generateShell,
	type MeshResolution,
	type ShellGenerationResult
} from '$lib/visualizations/gastropod-shell-lab/shell/engine';
import type { ShellRecipe } from '$lib/visualizations/gastropod-shell-lab/shell/model';

export interface GeometryWorkerRequest {
	type: 'generate';
	requestId: number;
	recipe: ShellRecipe;
	resolution: MeshResolution;
	age: number;
}

export interface GeometryWorkerSuccess {
	type: 'result';
	requestId: number;
	result: ShellGenerationResult;
	durationMs: number;
}

export interface GeometryWorkerFailure {
	type: 'error';
	requestId: number;
	message: string;
}

export type GeometryWorkerResponse = GeometryWorkerSuccess | GeometryWorkerFailure;

const worker = self as unknown as DedicatedWorkerGlobalScope;

worker.onmessage = (event: MessageEvent<GeometryWorkerRequest>) => {
	const request = event.data;
	if (request.type !== 'generate') return;
	const start = performance.now();
	try {
		const result = generateShell(request.recipe, request.resolution, { age: request.age });
		const response: GeometryWorkerSuccess = {
			type: 'result',
			requestId: request.requestId,
			result,
			durationMs: performance.now() - start
		};
		const buffers = [
			result.mesh.positions.buffer,
			result.mesh.normals.buffer,
			result.mesh.uvs.buffer,
			result.mesh.indices.buffer,
			result.mesh.stripIndexEnds.buffer,
			result.history.centers.buffer,
			result.history.scales.buffer,
			result.history.ages.buffer,
			result.history.thetas.buffer,
			result.history.tangents.buffer,
			result.history.frameE1.buffer,
			result.history.frameE2.buffer,
			result.history.ringPositions.buffer,
			result.history.instabilityProxy.buffer
		];
		worker.postMessage(response, { transfer: buffers });
	} catch (error) {
		const response: GeometryWorkerFailure = {
			type: 'error',
			requestId: request.requestId,
			message: error instanceof Error ? error.message : 'Unknown geometry error.'
		};
		worker.postMessage(response);
	}
};

export {};
