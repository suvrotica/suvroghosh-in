import { describe, expect, it } from 'vitest';
import { renderCpuFractal } from '../render/cpu';
import { FRACTAL_STATE_VERSION, type ColoringMode, type FractalViewState } from '../types';
import { FractalProgressiveWorkerClient, type FractalWorkerLike } from './client';
import { FractalWorkerHandler } from './handler';
import {
	FRACTAL_WORKER_LIMITS,
	FRACTAL_WORKER_PROTOCOL_VERSION,
	isFractalWorkerRequest,
	isFractalWorkerResponse,
	responseTransferables,
	type BarnsleyFernTaskConfig,
	type DensityFrame,
	type DensityTaskConfig,
	type FractalWorkerRequest,
	type FractalWorkerRequestBody,
	type FractalWorkerResponse,
	type RasterTaskConfig,
	type RasterTileFrame
} from './protocol';

function densityConfig(overrides: Partial<DensityTaskConfig> = {}): DensityTaskConfig {
	return {
		mode: 'buddhabrot',
		width: 28,
		height: 20,
		seed: 0xdecafbad,
		targetSamples: 900,
		samplesPerBatch: 97,
		maxIterations: 90,
		bailout: 2,
		sampleBounds: { minRe: -2, maxRe: 1, minIm: -1.4, maxIm: 1.4 },
		orbitBounds: { minRe: -2, maxRe: 1, minIm: -1.4, maxIm: 1.4 },
		minEscapeIterations: 2,
		exposure: 1,
		gamma: 1,
		percentileClip: 0.99,
		publishEveryBatches: 1,
		...overrides
	};
}

function fernConfig(overrides: Partial<BarnsleyFernTaskConfig> = {}): BarnsleyFernTaskConfig {
	return {
		seed: 'fern-specimen',
		targetPoints: 12,
		pointsPerBatch: 4,
		burnIn: 8,
		...overrides
	};
}

function rasterState(coloring: ColoringMode = 'smooth'): FractalViewState {
	return {
		version: FRACTAL_STATE_VERSION,
		family: 'mandelbrot',
		plane: 'parameter',
		center: { re: -0.5, im: 0 },
		centerDecimal: { re: '-0.5', im: '0' },
		spanY: 2.8,
		rotation: 0,
		maxIterations: 72,
		bailout: 2,
		exponent: 2,
		juliaC: { re: -0.8, im: 0.156 },
		juliaCDecimal: { re: '-0.8', im: '0.156' },
		phoenixP: { re: -0.5, im: 0 },
		phoenixPrevious: { re: 0, im: 0 },
		newtonRelaxation: 1,
		coloring,
		paletteId: 'observatory',
		paletteOffset: 0,
		paletteCycles: 1,
		interiorColor: '#05070D',
		seed: 20_260_731,
		renderQuality: 'balanced',
		precisionMode: 'auto',
		flipY: false,
		analyticInteriorTests: true,
		convergenceTolerance: 1e-6
	};
}

function rasterConfig(overrides: Partial<RasterTaskConfig> = {}): RasterTaskConfig {
	return {
		state: rasterState(),
		width: 40,
		height: 24,
		preview: false,
		maxPixels: 960,
		maxIterations: 72,
		tileWidth: 13,
		tileHeight: 7,
		...overrides
	};
}

function request(body: FractalWorkerRequestBody, taskId = 1, generation = 1): FractalWorkerRequest {
	return {
		protocolVersion: FRACTAL_WORKER_PROTOCOL_VERSION,
		taskId,
		generation,
		...body
	} as FractalWorkerRequest;
}

function finishDensity(config: DensityTaskConfig): {
	frame: DensityFrame;
	frames: DensityFrame[];
	responses: FractalWorkerResponse[];
} {
	const handler = new FractalWorkerHandler();
	const responses = handler.handle(request({ type: 'START_DENSITY', config, autoStart: true }));
	while (handler.isRunning) responses.push(...handler.processNextBatch());
	const frames = responses
		.filter((response) => response.type === 'DENSITY_FRAME')
		.map((response) => response.frame);
	const frame = frames.at(-1);
	if (!frame) throw new Error('Expected a final density frame.');
	return { frame, frames, responses };
}

function finishRaster(config: RasterTaskConfig): {
	frames: RasterTileFrame[];
	responses: FractalWorkerResponse[];
	pixels: Uint8ClampedArray;
} {
	const handler = new FractalWorkerHandler();
	const responses = handler.handle(request({ type: 'START_RASTER', config, autoStart: true }));
	while (handler.isRunning) responses.push(...handler.processNextBatch());
	const frames = responses
		.filter((response) => response.type === 'RASTER_TILE')
		.map((response) => response.frame);
	const pixels = new Uint8ClampedArray(config.width * config.height * 4);
	for (const frame of frames) {
		for (let localY = 0; localY < frame.height; localY += 1) {
			const sourceStart = localY * frame.width * 4;
			const targetStart = ((frame.y + localY) * config.width + frame.x) * 4;
			pixels.set(frame.pixels.subarray(sourceStart, sourceStart + frame.width * 4), targetStart);
		}
	}
	return { frames, responses, pixels };
}

describe('bounded raster tiles', () => {
	it('reconstructs the synchronous CPU bytes through progressive bounded tiles', () => {
		const config = rasterConfig();
		const tiled = finishRaster(config);
		const synchronous = renderCpuFractal(config.state, config.width, config.height, {
			maxPixels: config.maxPixels,
			maxIterations: config.maxIterations
		});

		expect(tiled.frames.length).toBeGreaterThan(1);
		expect(tiled.frames.at(-1)).toMatchObject({
			complete: true,
			phase: 'complete',
			progress: 1
		});
		expect(
			tiled.frames.every(
				(frame) => frame.width * frame.height <= config.tileWidth * config.tileHeight
			)
		).toBe(true);
		expect(tiled.pixels).toEqual(synchronous.data);
		expect(tiled.responses.at(-1)).toMatchObject({ type: 'COMPLETE', task: 'raster' });
	});

	it('keeps histogram CDF analysis global before publishing equivalent colour tiles', () => {
		const config = rasterConfig({ state: rasterState('histogram') });
		const tiled = finishRaster(config);
		const firstFrameIndex = tiled.responses.findIndex(
			(response) => response.type === 'RASTER_TILE'
		);
		const analysisStatuses = tiled.responses
			.slice(0, firstFrameIndex)
			.filter((response) => response.type === 'STATUS' && response.task === 'raster');
		const synchronous = renderCpuFractal(config.state, config.width, config.height, {
			maxPixels: config.maxPixels,
			maxIterations: config.maxIterations
		});

		expect(analysisStatuses.length).toBeGreaterThan(1);
		expect(tiled.frames[0].progress).toBeGreaterThanOrEqual(0.5);
		expect(tiled.pixels).toEqual(synchronous.data);
	});

	it('replaces an in-flight raster generation before another tile can be accepted', () => {
		const handler = new FractalWorkerHandler();
		handler.handle(request({ type: 'START_RASTER', config: rasterConfig(), autoStart: true }));
		expect(handler.processNextBatch()[0]).toMatchObject({ type: 'RASTER_TILE', generation: 1 });

		const replacement = handler.handle(
			request(
				{
					type: 'START_RASTER',
					config: rasterConfig({ state: { ...rasterState(), center: { re: -0.75, im: 0 } } }),
					autoStart: true
				},
				2,
				2
			)
		);
		expect(replacement[0]).toMatchObject({ type: 'READY', task: 'raster', generation: 2 });
		expect(handler.processNextBatch()[0]).toMatchObject({ type: 'RASTER_TILE', generation: 2 });
	});

	it('accepts a large requested viewport while bounding the actual Worker frame', () => {
		const config = rasterConfig({
			width: 2_000,
			height: 1_000,
			maxPixels: 49_152
		});
		const start = request({ type: 'START_RASTER', config, autoStart: true });
		expect(isFractalWorkerRequest(start)).toBe(true);
		const handler = new FractalWorkerHandler();
		handler.handle(start);
		const firstTile = handler
			.processNextBatch()
			.find((response) => response.type === 'RASTER_TILE');
		expect(firstTile?.type).toBe('RASTER_TILE');
		if (firstTile?.type !== 'RASTER_TILE') return;
		expect(firstTile.frame.renderWidth * firstTile.frame.renderHeight).toBeLessThanOrEqual(
			config.maxPixels
		);
	});
});

describe('progressive density accumulation', () => {
	it('replays Buddhabrot deterministically across different batch boundaries', () => {
		const first = finishDensity(densityConfig({ samplesPerBatch: 97 }));
		const replay = finishDensity(densityConfig({ samplesPerBatch: 131 }));

		expect(first.frames.length).toBeGreaterThan(1);
		expect(first.frame.complete).toBe(true);
		expect(first.frame.running).toBe(false);
		expect(first.frame.samplesProcessed).toBe(900);
		expect(first.frame.escapingOrbits).toBeGreaterThan(0);
		expect(first.frame.accumulatedOrbits).toBeGreaterThan(0);
		expect(first.frame.plottedOrbitPoints).toBeGreaterThan(0);
		expect(first.frame.histogramBytes).toBe(28 * 20 * Uint32Array.BYTES_PER_ELEMENT);
		expect(first.frame.pixels).toEqual(replay.frame.pixels);
		expect(first.frame.clipCounts).toEqual(replay.frame.clipCounts);
		expect(first.frame.accumulatedOrbits).toBe(replay.frame.accumulatedOrbits);
		expect(first.responses.at(-1)).toMatchObject({
			type: 'COMPLETE',
			generation: 1,
			taskId: 1
		});
	});

	it('uses three bounded deterministic channels for Nebulabrot', () => {
		const config = densityConfig({
			mode: 'nebulabrot',
			targetSamples: 1_500,
			maxIterations: 120,
			iterationWindows: [
				[1, 8],
				[9, 30],
				[31, 120]
			]
		});
		const first = finishDensity(config).frame;
		const replay = finishDensity(config).frame;

		expect(first.histogramBytes).toBe(
			config.width * config.height * 3 * Uint32Array.BYTES_PER_ELEMENT
		);
		expect(first.pixels).toEqual(replay.pixels);
		expect(first.clipCounts).toEqual(replay.clipCounts);
		expect(first.pixels.some((value, index) => index % 4 !== 3 && value > 0)).toBe(true);
	});
});

describe('Barnsley fern batches', () => {
	it('stays paused for manual one-batch steps and reports the active transform', () => {
		const handler = new FractalWorkerHandler();
		const ready = handler.handle(
			request({ type: 'START_FERN', config: fernConfig(), autoStart: false })
		);
		expect(ready[0]).toMatchObject({ type: 'READY', phase: 'paused' });
		expect(handler.processNextBatch()).toEqual([]);

		const responses = handler.handle(request({ type: 'STEP' }, 2));
		const frame = responses.find((response) => response.type === 'FERN_FRAME');
		expect(frame?.type).toBe('FERN_FRAME');
		if (frame?.type !== 'FERN_FRAME') return;
		expect(frame.frame.points).toHaveLength(8);
		expect(frame.frame.transformIndices).toHaveLength(4);
		expect(frame.frame.totalPoints).toBe(4);
		expect(frame.frame.running).toBe(false);
		expect(frame.frame.activeTransform).toBe(frame.frame.transformIndices.at(-1));
		expect(frame.frame.transformIndices.every((index) => index < 4)).toBe(true);
	});

	it('is seeded, progressive, and can emit exactly one decision per step', () => {
		const runOne = () => {
			const handler = new FractalWorkerHandler();
			handler.handle(
				request({
					type: 'START_FERN',
					config: fernConfig({ targetPoints: 3, pointsPerBatch: 4 }),
					autoStart: false
				})
			);
			return [2, 3, 4].map((taskId) => {
				const response = handler
					.handle(request({ type: 'STEP', batchSize: 1 }, taskId))
					.find((entry) => entry.type === 'FERN_FRAME');
				if (response?.type !== 'FERN_FRAME') throw new Error('Expected a fern frame.');
				return {
					points: [...response.frame.points],
					transform: response.frame.activeTransform,
					complete: response.frame.complete
				};
			});
		};

		const first = runOne();
		expect(first).toEqual(runOne());
		expect(first.every((batch) => batch.points.length === 2)).toBe(true);
		expect(first.at(-1)?.complete).toBe(true);
	});
});

describe('handler lifecycle and generation barriers', () => {
	it('pauses cooperatively, rejects stale generations, cancels, and disposes terminally', () => {
		const handler = new FractalWorkerHandler();
		handler.handle(
			request({ type: 'START_DENSITY', config: densityConfig(), autoStart: true }, 1, 2)
		);
		expect(handler.processNextBatch().some((response) => response.type === 'DENSITY_FRAME')).toBe(
			true
		);

		const paused = handler.handle(request({ type: 'PAUSE' }, 2, 2))[0];
		expect(paused).toMatchObject({ type: 'STATUS', phase: 'paused' });
		expect(handler.processNextBatch()).toEqual([]);

		const stale = handler.handle(request({ type: 'RUN' }, 3, 1))[0];
		expect(stale).toMatchObject({ type: 'STALE', activeGeneration: 2 });

		const resumed = handler.handle(request({ type: 'RUN' }, 4, 2))[0];
		expect(resumed).toMatchObject({ type: 'STATUS', phase: 'running' });
		expect(handler.isRunning).toBe(true);

		expect(handler.handle(request({ type: 'CANCEL' }, 5, 2))[0].type).toBe('CANCELLED');
		expect(handler.isRunning).toBe(false);
		expect(handler.processNextBatch()).toEqual([]);

		expect(
			handler.handle(
				request({ type: 'START_FERN', config: fernConfig(), autoStart: false }, 6, 3)
			)[0].type
		).toBe('READY');
		expect(handler.handle(request({ type: 'DISPOSE' }, 7, 3))[0].type).toBe('DISPOSED');
		const afterDispose = handler.handle(request({ type: 'STEP' }, 8, 3))[0];
		expect(afterDispose.type).toBe('ERROR');
		if (afterDispose.type === 'ERROR') expect(afterDispose.message).toMatch(/disposed/i);
	});
});

class FakeWorker implements FractalWorkerLike {
	messages: FractalWorkerRequest[] = [];
	terminated = false;
	terminationCount = 0;
	private messageListener?: (event: MessageEvent<unknown>) => void;
	private errorListener?: (event: ErrorEvent) => void;

	postMessage(message: FractalWorkerRequest): void {
		this.messages.push(message);
	}

	addEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
	addEventListener(type: 'error', listener: (event: ErrorEvent) => void): void;
	addEventListener(
		type: 'message' | 'error',
		listener: ((event: MessageEvent<unknown>) => void) | ((event: ErrorEvent) => void)
	): void {
		if (type === 'message') {
			this.messageListener = listener as (event: MessageEvent<unknown>) => void;
		} else {
			this.errorListener = listener as (event: ErrorEvent) => void;
		}
	}

	removeEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
	removeEventListener(type: 'error', listener: (event: ErrorEvent) => void): void;
	removeEventListener(type: 'message' | 'error'): void {
		if (type === 'message') this.messageListener = undefined;
		else this.errorListener = undefined;
	}

	terminate(): void {
		this.terminated = true;
		this.terminationCount += 1;
	}

	emit(response: unknown): void {
		this.messageListener?.({ data: response } as MessageEvent<unknown>);
	}

	emitError(message: string): void {
		this.errorListener?.({ message } as ErrorEvent);
	}
}

describe('FractalProgressiveWorkerClient', () => {
	it('filters stale generations and pre-command frames, then terminates exactly once', () => {
		const worker = new FakeWorker();
		const client = new FractalProgressiveWorkerClient(worker);
		const accepted: FractalWorkerResponse[] = [];
		client.subscribe((response) => accepted.push(response));

		expect(client.startDensity(densityConfig())).toBe(1);
		client.pause();
		worker.emit({
			protocolVersion: FRACTAL_WORKER_PROTOCOL_VERSION,
			taskId: 1,
			generation: 1,
			type: 'READY',
			task: 'density',
			phase: 'running',
			progress: { completed: 0, total: 900, progress: 0 }
		});
		worker.emit({
			protocolVersion: FRACTAL_WORKER_PROTOCOL_VERSION,
			taskId: 2,
			generation: 1,
			type: 'STATUS',
			task: 'density',
			phase: 'paused',
			progress: { completed: 0, total: 900, progress: 0 }
		});
		expect(accepted.map((response) => response.type)).toEqual(['STATUS']);

		expect(client.startFern(fernConfig())).toBe(2);
		worker.emit({
			protocolVersion: FRACTAL_WORKER_PROTOCOL_VERSION,
			taskId: 2,
			generation: 1,
			type: 'CANCELLED'
		});
		worker.emit({
			protocolVersion: FRACTAL_WORKER_PROTOCOL_VERSION,
			taskId: 3,
			generation: 2,
			type: 'READY',
			task: 'barnsley-fern',
			phase: 'running',
			progress: { completed: 0, total: 12, progress: 0 }
		});
		expect(accepted.map((response) => response.type)).toEqual(['STATUS', 'READY']);

		client.dispose();
		client.dispose();
		expect(worker.messages.at(-1)?.type).toBe('DISPOSE');
		expect(worker.terminated).toBe(true);
		expect(worker.terminationCount).toBe(1);
		expect(() => client.run()).toThrow(/disposed/i);
	});

	it('snapshots raster state before posting it to the Worker', () => {
		const worker = new FakeWorker();
		const client = new FractalProgressiveWorkerClient(worker);
		const config = rasterConfig();
		client.startRaster(config);
		config.state.center.re = 9;

		const posted = worker.messages[0];
		expect(posted.type).toBe('START_RASTER');
		if (posted.type !== 'START_RASTER') return;
		expect(posted.config.state.center.re).toBe(-0.5);
		client.dispose();
	});

	it('surfaces an asynchronous module Worker failure to subscribers', () => {
		const worker = new FakeWorker();
		const client = new FractalProgressiveWorkerClient(worker);
		const accepted: FractalWorkerResponse[] = [];
		client.subscribe((response) => accepted.push(response));
		client.startRaster(rasterConfig());
		worker.emitError('Module graph failed to load');

		expect(accepted.at(-1)).toMatchObject({
			type: 'ERROR',
			generation: 1,
			taskId: 1,
			message: 'Module graph failed to load'
		});
		client.dispose();
	});
});

describe('protocol validation and transfer lists', () => {
	it('rejects unsafe allocations and malformed partial frames', () => {
		const unsafe = request({
			type: 'START_DENSITY',
			config: densityConfig({
				width: FRACTAL_WORKER_LIMITS.maxDensityDimension,
				height: FRACTAL_WORKER_LIMITS.maxDensityDimension
			})
		});
		expect(isFractalWorkerRequest(unsafe)).toBe(false);
		expect(
			isFractalWorkerRequest(
				request({
					type: 'START_RASTER',
					config: rasterConfig({
						width: FRACTAL_WORKER_LIMITS.maxRasterPixels + 1,
						height: 1,
						maxPixels: FRACTAL_WORKER_LIMITS.maxRasterPixels + 1
					}),
					autoStart: true
				})
			)
		).toBe(false);
		expect(
			isFractalWorkerRequest(
				request({
					type: 'START_RASTER',
					config: rasterConfig({ maxPixels: FRACTAL_WORKER_LIMITS.maxRasterPixels + 1 }),
					autoStart: true
				})
			)
		).toBe(false);

		expect(
			isFractalWorkerResponse({
				protocolVersion: FRACTAL_WORKER_PROTOCOL_VERSION,
				taskId: 1,
				generation: 1,
				type: 'FERN_FRAME',
				frame: {
					sequence: 1,
					points: new Float32Array(4),
					transformIndices: new Uint8Array(1),
					batchStart: 0,
					totalPoints: 2,
					targetPoints: 10,
					progress: 0.2,
					activeTransform: 1,
					running: true,
					complete: false
				}
			})
		).toBe(false);
	});

	it('returns only the partial-frame buffers as transferables', () => {
		const response = finishDensity(densityConfig({ targetSamples: 20 })).responses.find(
			(entry) => entry.type === 'DENSITY_FRAME'
		);
		expect(response?.type).toBe('DENSITY_FRAME');
		if (response?.type !== 'DENSITY_FRAME') return;
		expect(responseTransferables(response)).toEqual([response.frame.pixels.buffer]);
		expect(new Set(responseTransferables(response)).size).toBe(1);

		const raster = finishRaster(rasterConfig()).responses.find(
			(entry) => entry.type === 'RASTER_TILE'
		);
		expect(raster?.type).toBe('RASTER_TILE');
		if (raster?.type !== 'RASTER_TILE') return;
		expect(responseTransferables(raster)).toEqual([raster.frame.pixels.buffer]);
	});
});
