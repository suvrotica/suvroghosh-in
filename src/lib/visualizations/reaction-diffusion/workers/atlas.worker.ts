/// <reference lib="webworker" />

import { ReactionDiffusionCpuEngine } from '../engine';
import { calculateFieldMetrics } from '../metrics';
import { calculateRadialSpectrum } from '../spectrum';
import type { GrayScottSetup } from '../types';
import {
	ATLAS_WORKER_PROTOCOL_VERSION,
	atlasResponseTransferables,
	type AtlasTileDefinition,
	type AtlasWorkerInput,
	type AtlasWorkerRequest,
	type AtlasWorkerResponse
} from './atlas-protocol';

const scope = self as unknown as DedicatedWorkerGlobalScope;
const CHUNK_STEPS = 12;

interface ActiveRun {
	readonly generation: number;
	readonly input: AtlasWorkerInput;
	readonly definitions: readonly AtlasTileDefinition[];
	readonly setup: GrayScottSetup;
	readonly stepsPerTile: number;
	readonly totalWork: number;
	tileIndex: number;
	currentTileStep: number;
	engine: ReactionDiffusionCpuEngine | null;
	paused: boolean;
	lastProgressWork: number;
}

let active: ActiveRun | null = null;
let pumpScheduled = false;
let disposed = false;

scope.addEventListener('message', (event: MessageEvent<AtlasWorkerRequest>) => {
	const request = event.data;
	if (!validEnvelope(request)) return;
	if (request.type === 'DISPOSE') {
		disposed = true;
		active = null;
		scope.close();
		return;
	}
	if (request.type === 'START') {
		try {
			active = createRun(request.generation, request.input);
			post({
				protocolVersion: ATLAS_WORKER_PROTOCOL_VERSION,
				generation: request.generation,
				type: 'STARTED',
				definitions: active.definitions,
				stepsPerTile: active.stepsPerTile,
				totalWork: active.totalWork
			});
			schedulePump();
		} catch (error) {
			postError(request.generation, error);
		}
		return;
	}
	if (!active || request.generation !== active.generation) return;
	if (request.type === 'PAUSE') {
		active.paused = true;
		post({
			protocolVersion: ATLAS_WORKER_PROTOCOL_VERSION,
			generation: active.generation,
			type: 'PAUSED',
			completedWork: completedWork(active),
			totalWork: active.totalWork
		});
	} else if (request.type === 'RESUME') {
		active.paused = false;
		schedulePump();
	} else if (request.type === 'CANCEL') {
		const generation = active.generation;
		active = null;
		post({
			protocolVersion: ATLAS_WORKER_PROTOCOL_VERSION,
			generation,
			type: 'CANCELLED'
		});
	}
});

function validEnvelope(value: unknown): value is AtlasWorkerRequest {
	if (!value || typeof value !== 'object') return false;
	const candidate = value as Record<string, unknown>;
	return (
		candidate.protocolVersion === ATLAS_WORKER_PROTOCOL_VERSION &&
		Number.isSafeInteger(candidate.generation) &&
		typeof candidate.type === 'string'
	);
}

function interpolate(minimum: number, maximum: number, index: number, count: number): number {
	return minimum + ((maximum - minimum) * index) / Math.max(1, count - 1);
}

function createRun(generation: number, input: AtlasWorkerInput): ActiveRun {
	if (!Number.isInteger(input.gridCount) || input.gridCount < 2 || input.gridCount > 12) {
		throw new RangeError('Atlas grid count must be an integer from 2 through 12.');
	}
	if (!Number.isFinite(input.modelTime) || input.modelTime <= 0) {
		throw new RangeError('Atlas model time must be positive and finite.');
	}
	const f0 = Math.min(input.feedMinimum, input.feedMaximum);
	const f1 = Math.max(input.feedMinimum, input.feedMaximum);
	const k0 = Math.min(input.killMinimum, input.killMaximum);
	const k1 = Math.max(input.killMinimum, input.killMaximum);
	const definitions: AtlasTileDefinition[] = [];
	for (let row = 0; row < input.gridCount; row += 1) {
		const kill = interpolate(k1, k0, row, input.gridCount);
		for (let column = 0; column < input.gridCount; column += 1) {
			definitions.push({
				id: `${row}-${column}`,
				row,
				column,
				feed: interpolate(f0, f1, column, input.gridCount),
				kill
			});
		}
	}
	const setup: GrayScottSetup = {
		...input.setup,
		gridSize: 32,
		domainWidth: 32,
		boundary: 'periodic',
		maskPreset: 'open-square',
		initialCondition: 'central-soft-disk',
		integrator: 'heun'
	};
	const stepsPerTile = Math.max(1, Math.round(input.modelTime / setup.timestep));
	return {
		generation,
		input,
		definitions,
		setup,
		stepsPerTile,
		totalWork: stepsPerTile * definitions.length,
		tileIndex: 0,
		currentTileStep: 0,
		engine: null,
		paused: false,
		lastProgressWork: 0
	};
}

function schedulePump(): void {
	if (pumpScheduled || disposed || !active || active.paused) return;
	pumpScheduled = true;
	scope.setTimeout(() => {
		pumpScheduled = false;
		pump();
	}, 0);
}

function pump(): void {
	const run = active;
	if (!run || run.paused || disposed) return;
	try {
		if (run.tileIndex >= run.definitions.length) {
			post({
				protocolVersion: ATLAS_WORKER_PROTOCOL_VERSION,
				generation: run.generation,
				type: 'COMPLETE',
				totalTiles: run.definitions.length,
				modelTime: run.stepsPerTile * run.setup.timestep
			});
			active = null;
			return;
		}
		const definition = run.definitions[run.tileIndex];
		if (!run.engine) {
			run.engine = new ReactionDiffusionCpuEngine({
				...run.setup,
				feed: definition.feed,
				kill: definition.kill
			});
			run.currentTileStep = 0;
		}
		const count = Math.min(CHUNK_STEPS, run.stepsPerTile - run.currentTileStep);
		run.engine.step(count);
		run.currentTileStep += count;
		const work = completedWork(run);
		const progressInterval = Math.max(1, Math.floor(run.totalWork / 160));
		if (work - run.lastProgressWork >= progressInterval) {
			run.lastProgressWork = work;
			postProgress(run);
		}
		if (run.currentTileStep >= run.stepsPerTile) {
			const state = run.engine.state;
			const v = new Float64Array(state.v);
			post({
				protocolVersion: ATLAS_WORKER_PROTOCOL_VERSION,
				generation: run.generation,
				type: 'TILE_RESULT',
				tile: {
					...definition,
					size: state.size,
					v,
					modelTime: run.stepsPerTile * run.setup.timestep,
					metrics: calculateFieldMetrics(state),
					spectrum: calculateRadialSpectrum(state.v, state.size, run.setup.domainWidth, {
						mask: state.mask,
						window: 'none'
					})
				}
			});
			run.tileIndex += 1;
			run.currentTileStep = 0;
			run.engine = null;
			postProgress(run);
		}
		schedulePump();
	} catch (error) {
		postError(run.generation, error);
		active = null;
	}
}

function completedWork(run: ActiveRun): number {
	return Math.min(run.totalWork, run.tileIndex * run.stepsPerTile + run.currentTileStep);
}

function postProgress(run: ActiveRun): void {
	post({
		protocolVersion: ATLAS_WORKER_PROTOCOL_VERSION,
		generation: run.generation,
		type: 'PROGRESS',
		completedWork: completedWork(run),
		totalWork: run.totalWork,
		completedTiles: run.tileIndex,
		totalTiles: run.definitions.length,
		currentTileStep: run.currentTileStep,
		stepsPerTile: run.stepsPerTile
	});
}

function postError(generation: number, error: unknown): void {
	post({
		protocolVersion: ATLAS_WORKER_PROTOCOL_VERSION,
		generation,
		type: 'ERROR',
		message: error instanceof Error ? error.message : 'The atlas Worker stopped unexpectedly.'
	});
}

function post(response: AtlasWorkerResponse): void {
	scope.postMessage(response, atlasResponseTransferables(response));
}
