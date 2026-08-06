export type TuplePoint = readonly [x: number, y: number];

export type ObjectPoint = {
	readonly x: number;
	readonly y: number;
};

/** Visual components accept both the numerical core's tuple vectors and DOM-friendly objects. */
export type PointLike = TuplePoint | ObjectPoint;

export type DomainLike =
	| {
			readonly x: readonly [minimum: number, maximum: number];
			readonly y: readonly [minimum: number, maximum: number];
	  }
	| {
			readonly min: PointLike;
			readonly max: PointLike;
	  };

export type SampledGrid = {
	readonly width: number;
	readonly height: number;
	readonly values: ArrayLike<number>;
	/** True lower display bound: a declared minimum when available, otherwise the sampled minimum. */
	readonly rawFloor: number;
	/** Smallest finite value observed on the sampled grid. */
	readonly sampledMinimum: number;
	/** Robust upper display bound; values above it saturate without affecting calculations. */
	readonly displayCeiling: number;
	/** @deprecated Compatibility alias for rawFloor. */
	readonly min: number;
	/** @deprecated Compatibility alias for displayCeiling. */
	readonly max: number;
};

export type RunStatus =
	| 'ready'
	| 'running'
	| 'paused'
	| 'converged'
	| 'iteration-limit'
	| 'escaped-domain'
	| 'numerically-diverged'
	| 'stalled'
	| 'invalid-configuration'
	| string;

export type HistoryRecord = {
	readonly iteration: number;
	readonly optimizerUpdates?: number;
	readonly activeGradientComputations?: number;
	readonly additionalFullGradientComputations?: number;
	readonly activeGradientExamplesProcessed?: number | null;
	readonly diagnosticExamplesProcessed?: number | null;
	/** @deprecated Compatibility alias for activeGradientComputations. */
	readonly gradientEvaluations: number;
	readonly theta: PointLike;
	readonly loss: number;
	readonly gradient: PointLike | null;
	readonly fullGradient?: PointLike | null;
	readonly update: PointLike | null;
	readonly gradientNorm: number | null;
	readonly stepNorm: number | null;
	readonly status?: RunStatus;
	readonly optimizerState?: unknown;
	readonly optimizerDiagnostics?: unknown;
	/** Zero-based observations used by a genuine minibatch gradient, when applicable. */
	readonly batchIndices?: readonly number[] | null;
	/** Evaluation at this retained theta that ended the run without another transition. */
	readonly terminalEvaluation?: {
		readonly gradient: PointLike;
		readonly fullGradient: PointLike;
		readonly gradientNorm: number;
		readonly fullGradientNorm: number;
		readonly batchIndices: readonly number[] | null;
	} | null;
};

export type KnownMinimum = {
	readonly id?: string | number;
	readonly label?: string;
	readonly point?: PointLike;
	readonly theta?: PointLike;
	readonly loss?: number;
};

export type Eigensystem = {
	readonly values: readonly [number, number];
	readonly vectors: readonly [PointLike, PointLike];
	readonly classification?: string;
};

export type ProfilePoint = {
	readonly alpha: number;
	readonly loss: number;
};

export type BasinGridLike = {
	readonly width: number;
	readonly height: number;
	readonly outcomes?: ArrayLike<number>;
	readonly labels?: readonly string[];
	readonly cells?: readonly {
		readonly minimumIndex?: number | null;
		readonly start?: PointLike;
		readonly finalTheta?: PointLike;
		readonly status?: RunStatus;
	}[];
	readonly domain?: DomainLike;
};

export type GradientFieldSample = {
	readonly point: PointLike;
	readonly gradient: PointLike;
};

export type TerrainRun = {
	readonly id: string;
	readonly label: string;
	readonly history: readonly HistoryRecord[];
	readonly pattern?: 'solid' | 'dashed' | 'dotted' | 'dash-dot';
	readonly marker?: 'diamond' | 'square' | 'triangle' | 'circle';
};

export type RegressionDatum = {
	readonly id?: string;
	readonly x: number;
	readonly y: number;
	readonly isOutlier?: boolean;
};

export function pointX(point: PointLike): number {
	return 'x' in point ? point.x : point[0];
}

export function pointY(point: PointLike): number {
	return 'y' in point ? point.y : point[1];
}

export function objectPoint(point: PointLike): ObjectPoint {
	return { x: pointX(point), y: pointY(point) };
}

export function tuplePoint(point: PointLike): TuplePoint {
	return [pointX(point), pointY(point)];
}

export function domainBounds(domain: DomainLike) {
	if ('x' in domain) {
		return {
			xMin: Math.min(domain.x[0], domain.x[1]),
			xMax: Math.max(domain.x[0], domain.x[1]),
			yMin: Math.min(domain.y[0], domain.y[1]),
			yMax: Math.max(domain.y[0], domain.y[1])
		};
	}
	return {
		xMin: Math.min(pointX(domain.min), pointX(domain.max)),
		xMax: Math.max(pointX(domain.min), pointX(domain.max)),
		yMin: Math.min(pointY(domain.min), pointY(domain.max)),
		yMax: Math.max(pointY(domain.min), pointY(domain.max))
	};
}

export function minimumPoint(minimum: KnownMinimum): PointLike | null {
	return minimum.point ?? minimum.theta ?? null;
}

export function finitePoint(point: PointLike | null | undefined): point is PointLike {
	return Boolean(point && Number.isFinite(pointX(point)) && Number.isFinite(pointY(point)));
}

export function clampPoint(point: PointLike, domain: DomainLike): ObjectPoint {
	const bounds = domainBounds(domain);
	return {
		x: Math.min(bounds.xMax, Math.max(bounds.xMin, pointX(point))),
		y: Math.min(bounds.yMax, Math.max(bounds.yMin, pointY(point)))
	};
}

export function gridValue(grid: SampledGrid, column: number, row: number): number {
	const x = Math.max(0, Math.min(grid.width - 1, column));
	const y = Math.max(0, Math.min(grid.height - 1, row));
	const value = Number(grid.values[y * grid.width + x]);
	return Number.isFinite(value) ? value : grid.rawFloor;
}

export function sampleGrid(grid: SampledGrid, domain: DomainLike, point: PointLike): number {
	const bounds = domainBounds(domain);
	const u = (pointX(point) - bounds.xMin) / Math.max(Number.EPSILON, bounds.xMax - bounds.xMin);
	const v = (pointY(point) - bounds.yMin) / Math.max(Number.EPSILON, bounds.yMax - bounds.yMin);
	const x = Math.max(0, Math.min(grid.width - 1, u * (grid.width - 1)));
	const y = Math.max(0, Math.min(grid.height - 1, v * (grid.height - 1)));
	const x0 = Math.floor(x);
	const y0 = Math.floor(y);
	const x1 = Math.min(grid.width - 1, x0 + 1);
	const y1 = Math.min(grid.height - 1, y0 + 1);
	const tx = x - x0;
	const ty = y - y0;
	const top = gridValue(grid, x0, y0) * (1 - tx) + gridValue(grid, x1, y0) * tx;
	const bottom = gridValue(grid, x0, y1) * (1 - tx) + gridValue(grid, x1, y1) * tx;
	return top * (1 - ty) + bottom * ty;
}
