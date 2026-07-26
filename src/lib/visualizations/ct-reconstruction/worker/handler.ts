import {
	accumulateBackprojection,
	clonePhantom,
	computeMetrics,
	createProjectionGeometry,
	createProjector,
	filterProjection,
	phantomToAttenuation,
	sampleGridBilinear,
	type CTProjector,
	type Phantom,
	type ProjectionGeometry,
	type ReconstructionMetrics,
	type ReconstructionSettings
} from '../index';
import {
	CT_WORKER_PROTOCOL_VERSION,
	type CTWorkerRequest,
	type CTWorkerResponse,
	type InitializeScanPayload,
	type ReconstructionMetricPair
} from './protocol';

interface ScanState {
	jobId: number;
	phantom: Phantom;
	projector: CTProjector;
	geometry: ProjectionGeometry;
	reconstruction: ReconstructionSettings;
	imageSize: number;
	actualProjectionCount: number;
	cursor: number;
	acquiredProjectionCount: number;
	currentAngleIndex: number;
	currentAngle: number;
	currentProjection: Float32Array;
	sinogram: Float32Array;
	rawBackprojection: Float32Array;
	rawFilteredBackprojection: Float32Array;
}

export class CTWorkerHandler {
	private state: ScanState | null = null;
	private disposed = false;

	handle(request: CTWorkerRequest): CTWorkerResponse {
		try {
			if (this.disposed && request.type !== 'DISPOSE') {
				throw new Error('The CT reconstruction Worker has been disposed.');
			}
			switch (request.type) {
				case 'INITIALIZE':
					return this.initialize(request, request.payload);
				case 'PROCESS_BATCH':
					return this.processBatch(request, request.batchSize, request.includePreview);
				case 'RECONSTRUCT':
					return this.reconstruct(request, request.reconstruction);
				case 'CANCEL':
					this.state = null;
					return { ...envelope(request), type: 'CANCELLED' };
				case 'DISPOSE':
					this.state = null;
					this.disposed = true;
					return { ...envelope(request), type: 'DISPOSED' };
			}
		} catch (error) {
			return {
				...envelope(request),
				type: 'ERROR',
				message: error instanceof Error ? error.message : 'Unknown CT Worker error.',
				stack: error instanceof Error ? error.stack : undefined
			};
		}
	}

	private initialize(request: CTWorkerRequest, payload: InitializeScanPayload): CTWorkerResponse {
		const phantom = clonePhantom(payload.phantom);
		const geometry = createProjectionGeometry(payload.acquisition);
		const projector = createProjector(phantom, payload.acquisition);
		const imageSize = payload.reconstruction.imageSize ?? phantom.size;
		const actualProjectionCount = countAcquired(geometry.acquired);
		const pixelCount = imageSize * imageSize;
		const sinogram = new Float32Array(geometry.projectionCount * geometry.detectorCount);
		sinogram.fill(Number.NaN);
		this.state = {
			jobId: request.jobId,
			phantom,
			projector,
			geometry,
			reconstruction: { ...payload.reconstruction, imageSize },
			imageSize,
			actualProjectionCount,
			cursor: 0,
			acquiredProjectionCount: 0,
			currentAngleIndex: -1,
			currentAngle: 0,
			currentProjection: new Float32Array(0),
			sinogram,
			rawBackprojection: new Float32Array(pixelCount),
			rawFilteredBackprojection: new Float32Array(pixelCount)
		};
		return {
			...envelope(request),
			type: 'READY',
			projectionCount: geometry.projectionCount,
			detectorCount: geometry.detectorCount,
			imageSize,
			actualProjectionCount,
			angles: new Float64Array(geometry.angles),
			acquiredMask: new Uint8Array(geometry.acquired)
		};
	}

	private processBatch(
		request: CTWorkerRequest,
		batchSize: number,
		includePreview = false
	): CTWorkerResponse {
		const state = this.requireState(request.jobId);
		const rowIndices: number[] = [];
		const rows: Float32Array[] = [];

		while (rowIndices.length < batchSize && state.cursor < state.geometry.projectionCount) {
			const angleIndex = state.cursor;
			state.cursor += 1;
			if (state.geometry.acquired[angleIndex] === 0) continue;

			const angle = state.geometry.angles[angleIndex];
			const result = state.projector.projectAngle(angle, angleIndex, false);
			const filtered = filterProjection(
				result.measured,
				state.reconstruction.filter,
				state.reconstruction.cutoff,
				state.geometry.detectorSpacing
			);
			const offset = angleIndex * state.geometry.detectorCount;
			state.sinogram.set(result.measured, offset);
			accumulateBackprojection(state.rawBackprojection, result.measured, {
				size: state.imageSize,
				angle,
				detectorMin: state.geometry.detectorMin,
				detectorMax: state.geometry.detectorMax
			});
			accumulateBackprojection(state.rawFilteredBackprojection, filtered, {
				size: state.imageSize,
				angle,
				detectorMin: state.geometry.detectorMin,
				detectorMax: state.geometry.detectorMax
			});
			state.acquiredProjectionCount += 1;
			state.currentAngleIndex = angleIndex;
			state.currentAngle = angle;
			state.currentProjection = new Float32Array(result.measured);
			rowIndices.push(angleIndex);
			rows.push(new Float32Array(result.measured));
		}

		const complete = state.cursor >= state.geometry.projectionCount;
		const shouldIncludePreview = includePreview || complete;
		const backprojection = shouldIncludePreview
			? normalizedPreview(state.rawBackprojection, state.acquiredProjectionCount)
			: undefined;
		const filteredBackprojection = shouldIncludePreview
			? normalizedPreview(state.rawFilteredBackprojection, state.acquiredProjectionCount)
			: undefined;
		const progress =
			state.actualProjectionCount === 0
				? 1
				: state.acquiredProjectionCount / state.actualProjectionCount;
		const preview =
			backprojection && filteredBackprojection
				? {
						backprojection,
						filteredBackprojection,
						metrics: complete
							? metricsForState(state, backprojection, filteredBackprojection)
							: undefined
					}
				: {};
		return {
			...envelope(request),
			type: 'BATCH',
			rowIndices: Uint16Array.from(rowIndices),
			rowValues: flattenRows(rows, state.geometry.detectorCount),
			currentProjection: new Float32Array(state.currentProjection),
			currentAngleIndex: state.currentAngleIndex,
			currentAngle: state.currentAngle,
			revealedThroughAngleIndex: state.cursor - 1,
			acquiredProjectionCount: state.acquiredProjectionCount,
			actualProjectionCount: state.actualProjectionCount,
			progress,
			complete,
			...preview
		};
	}

	private reconstruct(
		request: CTWorkerRequest,
		reconstruction: ReconstructionSettings
	): CTWorkerResponse {
		const state = this.requireState(request.jobId);
		state.reconstruction = { ...reconstruction, imageSize: state.imageSize };
		state.rawFilteredBackprojection.fill(0);

		for (let angleIndex = 0; angleIndex < state.cursor; angleIndex += 1) {
			if (state.geometry.acquired[angleIndex] === 0) continue;
			const offset = angleIndex * state.geometry.detectorCount;
			const projection = state.sinogram.subarray(offset, offset + state.geometry.detectorCount);
			if (!allFinite(projection)) continue;
			const filtered = filterProjection(
				projection,
				state.reconstruction.filter,
				state.reconstruction.cutoff,
				state.geometry.detectorSpacing
			);
			accumulateBackprojection(state.rawFilteredBackprojection, filtered, {
				size: state.imageSize,
				angle: state.geometry.angles[angleIndex],
				detectorMin: state.geometry.detectorMin,
				detectorMax: state.geometry.detectorMax
			});
		}

		const backprojection = normalizedPreview(
			state.rawBackprojection,
			state.acquiredProjectionCount
		);
		const filteredBackprojection = normalizedPreview(
			state.rawFilteredBackprojection,
			state.acquiredProjectionCount
		);
		const progress =
			state.actualProjectionCount === 0
				? 1
				: state.acquiredProjectionCount / state.actualProjectionCount;
		const complete = state.cursor >= state.geometry.projectionCount;
		return {
			...envelope(request),
			type: 'RECONSTRUCTED',
			reconstruction: { ...state.reconstruction },
			acquiredProjectionCount: state.acquiredProjectionCount,
			actualProjectionCount: state.actualProjectionCount,
			progress,
			backprojection,
			filteredBackprojection,
			metrics: complete ? metricsForState(state, backprojection, filteredBackprojection) : undefined
		};
	}

	private requireState(jobId: number): ScanState {
		if (!this.state) throw new Error('Initialize a CT scan before requesting computation.');
		if (this.state.jobId !== jobId) {
			throw new Error(
				`Ignored a stale CT Worker request for job ${jobId}; active job is ${this.state.jobId}.`
			);
		}
		return this.state;
	}
}

function envelope(request: CTWorkerRequest) {
	return {
		protocolVersion: CT_WORKER_PROTOCOL_VERSION,
		requestId: request.requestId,
		jobId: request.jobId
	} as const;
}

function countAcquired(mask: Uint8Array): number {
	let count = 0;
	for (const value of mask) count += value === 0 ? 0 : 1;
	return count;
}

function normalizedPreview(raw: Float32Array, acquiredProjectionCount: number): Float32Array {
	const output = new Float32Array(raw.length);
	if (acquiredProjectionCount === 0) return output;
	const scale = Math.PI / acquiredProjectionCount;
	for (let index = 0; index < raw.length; index += 1) output[index] = raw[index] * scale;
	return output;
}

function flattenRows(rows: Float32Array[], detectorCount: number): Float32Array {
	const values = new Float32Array(rows.length * detectorCount);
	for (let row = 0; row < rows.length; row += 1) values.set(rows[row], row * detectorCount);
	return values;
}

function allFinite(values: Float32Array): boolean {
	for (const value of values) if (!Number.isFinite(value)) return false;
	return true;
}

function metricsForState(
	state: ScanState,
	backprojection: Float32Array,
	filteredBackprojection: Float32Array
): ReconstructionMetricPair {
	const reference = phantomToAttenuation(state.phantom);
	const referenceInside: number[] = [];
	const backprojectionInside: number[] = [];
	const filteredInside: number[] = [];
	for (let row = 0; row < state.imageSize; row += 1) {
		const y = 1 - ((row + 0.5) * 2) / state.imageSize;
		for (let column = 0; column < state.imageSize; column += 1) {
			const x = ((column + 0.5) * 2) / state.imageSize - 1;
			if (x * x + y * y > 1) continue;
			const index = row * state.imageSize + column;
			referenceInside.push(
				state.imageSize === state.phantom.size
					? reference[index]
					: sampleGridBilinear(reference, state.phantom.size, x, y)
			);
			backprojectionInside.push(backprojection[index]);
			filteredInside.push(filteredBackprojection[index]);
		}
	}
	return {
		backprojection: finiteMetrics(computeMetrics(referenceInside, backprojectionInside)),
		filteredBackprojection: finiteMetrics(computeMetrics(referenceInside, filteredInside))
	};
}

function finiteMetrics(metrics: ReconstructionMetrics): ReconstructionMetrics {
	return {
		...metrics,
		peakSignalToNoiseRatio: Number.isNaN(metrics.peakSignalToNoiseRatio)
			? 0
			: metrics.peakSignalToNoiseRatio
	};
}
