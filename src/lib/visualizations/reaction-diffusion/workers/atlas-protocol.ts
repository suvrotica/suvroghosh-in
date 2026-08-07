import type { FieldMetrics, GrayScottSetup, SpectrumReading } from '../types';

export const ATLAS_WORKER_PROTOCOL_VERSION = 1 as const;

export interface AtlasWorkerInput {
	readonly setup: GrayScottSetup;
	readonly feedMinimum: number;
	readonly feedMaximum: number;
	readonly killMinimum: number;
	readonly killMaximum: number;
	readonly gridCount: number;
	readonly modelTime: number;
}

export interface AtlasTileDefinition {
	readonly id: string;
	readonly row: number;
	readonly column: number;
	readonly feed: number;
	readonly kill: number;
}

export interface AtlasTileResult extends AtlasTileDefinition {
	readonly size: number;
	readonly v: Float64Array;
	readonly modelTime: number;
	readonly metrics: FieldMetrics;
	readonly spectrum: SpectrumReading;
}

interface AtlasEnvelope {
	readonly protocolVersion: typeof ATLAS_WORKER_PROTOCOL_VERSION;
	readonly generation: number;
}

export type AtlasWorkerRequest = AtlasEnvelope &
	(
		| { readonly type: 'START'; readonly input: AtlasWorkerInput }
		| { readonly type: 'PAUSE' }
		| { readonly type: 'RESUME' }
		| { readonly type: 'CANCEL' }
		| { readonly type: 'DISPOSE' }
	);

export type AtlasWorkerResponse = AtlasEnvelope &
	(
		| {
				readonly type: 'STARTED';
				readonly definitions: readonly AtlasTileDefinition[];
				readonly stepsPerTile: number;
				readonly totalWork: number;
		  }
		| {
				readonly type: 'PROGRESS';
				readonly completedWork: number;
				readonly totalWork: number;
				readonly completedTiles: number;
				readonly totalTiles: number;
				readonly currentTileStep: number;
				readonly stepsPerTile: number;
		  }
		| { readonly type: 'TILE_RESULT'; readonly tile: AtlasTileResult }
		| { readonly type: 'PAUSED'; readonly completedWork: number; readonly totalWork: number }
		| { readonly type: 'CANCELLED' }
		| { readonly type: 'COMPLETE'; readonly totalTiles: number; readonly modelTime: number }
		| { readonly type: 'ERROR'; readonly message: string }
	);

export function isAtlasWorkerResponse(value: unknown): value is AtlasWorkerResponse {
	if (!value || typeof value !== 'object') return false;
	const candidate = value as Record<string, unknown>;
	return (
		candidate.protocolVersion === ATLAS_WORKER_PROTOCOL_VERSION &&
		Number.isSafeInteger(candidate.generation) &&
		typeof candidate.type === 'string'
	);
}

export function atlasResponseTransferables(response: AtlasWorkerResponse): Transferable[] {
	return response.type === 'TILE_RESULT' ? [response.tile.v.buffer] : [];
}
