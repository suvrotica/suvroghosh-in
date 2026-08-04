export const DENSITY_GRID_LIMITS = {
	maxPositionCount: 2_000_000,
	maxDimension: 1024,
	maxCellCount: 1_048_576
} as const;

export interface DensityGridOptions {
	x: Float64Array;
	y: Float64Array;
	gridWidth: number;
	gridHeight: number;
	minX: number;
	maxX: number;
	minY: number;
	maxY: number;
}

export interface DensityGridResult {
	gridWidth: number;
	gridHeight: number;
	minX: number;
	maxX: number;
	minY: number;
	maxY: number;
	cellWidth: number;
	cellHeight: number;
	/** Row-major integer observations; row zero corresponds to minY. */
	counts: Uint32Array;
	/** Count / (includedCount * cell area), integrating to one when non-empty. */
	probabilityDensity: Float32Array;
	includedCount: number;
	outsideCount: number;
	maxCount: number;
}

export class DensityGridRunner {
	readonly options: DensityGridOptions;
	readonly counts: Uint32Array;

	private completedPositionCount = 0;
	private includedPositionCount = 0;
	private outsidePositionCount = 0;

	constructor(options: DensityGridOptions) {
		this.options = validateDensityGridOptions(options);
		this.counts = new Uint32Array(this.options.gridWidth * this.options.gridHeight);
	}

	step(maxPositionCount = 16_384): number {
		if (!Number.isSafeInteger(maxPositionCount) || maxPositionCount < 1) {
			throw new RangeError('A density-grid batch must contain at least one position.');
		}
		const stop = Math.min(this.options.x.length, this.completedPositionCount + maxPositionCount);
		const { minX, maxX, minY, maxY, gridWidth, gridHeight } = this.options;
		const inverseCellWidth = gridWidth / (maxX - minX);
		const inverseCellHeight = gridHeight / (maxY - minY);
		for (let index = this.completedPositionCount; index < stop; index += 1) {
			const x = this.options.x[index];
			const y = this.options.y[index];
			if (x < minX || x > maxX || y < minY || y > maxY) {
				this.outsidePositionCount += 1;
				continue;
			}
			const column = Math.min(gridWidth - 1, Math.floor((x - minX) * inverseCellWidth));
			const row = Math.min(gridHeight - 1, Math.floor((y - minY) * inverseCellHeight));
			this.counts[row * gridWidth + column] += 1;
			this.includedPositionCount += 1;
		}
		this.completedPositionCount = stop;
		return stop;
	}

	completed(): number {
		return this.completedPositionCount;
	}

	isComplete(): boolean {
		return this.completedPositionCount === this.options.x.length;
	}

	result(): DensityGridResult {
		if (!this.isComplete()) {
			throw new Error('A density grid is unavailable until all positions have been measured.');
		}
		const cellWidth = (this.options.maxX - this.options.minX) / this.options.gridWidth;
		const cellHeight = (this.options.maxY - this.options.minY) / this.options.gridHeight;
		const probabilityDensity = new Float32Array(this.counts.length);
		const divisor = this.includedPositionCount * cellWidth * cellHeight;
		let maxCount = 0;
		for (let index = 0; index < this.counts.length; index += 1) {
			const count = this.counts[index];
			maxCount = Math.max(maxCount, count);
			probabilityDensity[index] = divisor > 0 ? count / divisor : 0;
		}
		return {
			gridWidth: this.options.gridWidth,
			gridHeight: this.options.gridHeight,
			minX: this.options.minX,
			maxX: this.options.maxX,
			minY: this.options.minY,
			maxY: this.options.maxY,
			cellWidth,
			cellHeight,
			counts: this.counts,
			probabilityDensity,
			includedCount: this.includedPositionCount,
			outsideCount: this.outsidePositionCount,
			maxCount
		};
	}
}

export function measureDensityGrid(options: DensityGridOptions): DensityGridResult {
	const runner = new DensityGridRunner(options);
	if (runner.options.x.length > 0) runner.step(runner.options.x.length);
	return runner.result();
}

export function validateDensityGridOptions(value: DensityGridOptions): DensityGridOptions {
	if (!value || typeof value !== 'object') {
		throw new TypeError('Density-grid options must be an object.');
	}
	if (!(value.x instanceof Float64Array) || !(value.y instanceof Float64Array)) {
		throw new TypeError('Density-grid coordinates must be Float64Array instances.');
	}
	if (value.x.length !== value.y.length) {
		throw new RangeError('Density-grid x and y coordinates must have the same length.');
	}
	if (value.x.length > DENSITY_GRID_LIMITS.maxPositionCount) {
		throw new RangeError('The density-grid position count exceeds the supported limit.');
	}
	for (let index = 0; index < value.x.length; index += 1) {
		if (!Number.isFinite(value.x[index]) || !Number.isFinite(value.y[index])) {
			throw new RangeError(`Density-grid coordinate ${index} is not finite.`);
		}
	}
	assertGridDimension(value.gridWidth, 'Density-grid width');
	assertGridDimension(value.gridHeight, 'Density-grid height');
	if (value.gridWidth * value.gridHeight > DENSITY_GRID_LIMITS.maxCellCount) {
		throw new RangeError('The requested density grid has too many cells.');
	}
	assertFinite(value.minX, 'Density-grid minimum x');
	assertFinite(value.maxX, 'Density-grid maximum x');
	assertFinite(value.minY, 'Density-grid minimum y');
	assertFinite(value.maxY, 'Density-grid maximum y');
	if (value.maxX <= value.minX || value.maxY <= value.minY) {
		throw new RangeError('Density-grid maxima must be greater than their corresponding minima.');
	}
	return value;
}

export function isDensityGridOptions(value: unknown): value is DensityGridOptions {
	try {
		validateDensityGridOptions(value as DensityGridOptions);
		return true;
	} catch {
		return false;
	}
}

function assertGridDimension(value: number, label: string): void {
	if (!Number.isSafeInteger(value) || value < 1 || value > DENSITY_GRID_LIMITS.maxDimension) {
		throw new RangeError(
			`${label} must be an integer from 1 to ${DENSITY_GRID_LIMITS.maxDimension}.`
		);
	}
}

function assertFinite(value: number, label: string): void {
	if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite.`);
}
