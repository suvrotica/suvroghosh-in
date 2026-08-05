import type { MomentumStabilityGrid, ParticleTrajectory, StabilitySweepEntry } from './analysis';
import type {
	BasinGrid,
	Domain2D,
	GradientMode,
	LandscapeSelection,
	OptimizerConfig
} from './types';

export type BasinAnalysisPayload = {
	readonly landscape: LandscapeSelection;
	readonly optimizer: OptimizerConfig;
	readonly gradientMode?: GradientMode;
	readonly seed?: string;
	readonly width?: number;
	readonly height?: number;
	readonly domain?: Domain2D;
	readonly maximumIterations?: number;
	readonly gradientTolerance?: number;
	readonly stepTolerance?: number;
	readonly stallPatience?: number;
	readonly classificationTolerance?: number;
};

export type StabilityAnalysisPayload = {
	readonly landscape: LandscapeSelection;
	readonly start?: readonly [number, number];
	readonly optimizer: Omit<OptimizerConfig, 'learningRate'>;
	readonly learningRates: readonly number[];
	readonly gradientMode?: GradientMode;
	readonly seed?: string;
	readonly maximumIterations?: number;
	readonly gradientTolerance?: number;
	readonly stepTolerance?: number;
	readonly stallPatience?: number;
};

export type MomentumStabilityAnalysisPayload = {
	readonly landscape: LandscapeSelection;
	readonly start?: readonly [number, number];
	readonly learningRates: readonly number[];
	readonly betaValues: readonly number[];
	readonly gradientMode?: GradientMode;
	readonly seed?: string;
	readonly maximumIterations?: number;
	readonly gradientTolerance?: number;
	readonly stepTolerance?: number;
	readonly stallPatience?: number;
};

export type ParticleFlowAnalysisPayload = {
	readonly landscape: LandscapeSelection;
	readonly optimizer: OptimizerConfig;
	readonly starts: readonly (readonly [number, number])[];
	readonly gradientMode?: GradientMode;
	readonly seed?: string;
	readonly maximumIterations?: number;
	readonly gradientTolerance?: number;
	readonly stepTolerance?: number;
	readonly stallPatience?: number;
	readonly classificationTolerance?: number;
};

export type AnalysisWorkerRequest =
	| {
			readonly type: 'basin-grid';
			readonly generation: number;
			readonly payload: BasinAnalysisPayload;
	  }
	| {
			readonly type: 'stability-sweep';
			readonly generation: number;
			readonly payload: StabilityAnalysisPayload;
	  }
	| {
			readonly type: 'momentum-stability-sweep';
			readonly generation: number;
			readonly payload: MomentumStabilityAnalysisPayload;
	  }
	| {
			readonly type: 'particle-flow';
			readonly generation: number;
			readonly payload: ParticleFlowAnalysisPayload;
	  }
	| { readonly type: 'cancel'; readonly generation: number };

export type AnalysisWorkerResponse =
	| { readonly type: 'basin-grid-result'; readonly generation: number; readonly result: BasinGrid }
	| {
			readonly type: 'stability-sweep-result';
			readonly generation: number;
			readonly result: readonly StabilitySweepEntry[];
	  }
	| {
			readonly type: 'momentum-stability-sweep-result';
			readonly generation: number;
			readonly result: MomentumStabilityGrid;
	  }
	| {
			readonly type: 'particle-flow-result';
			readonly generation: number;
			readonly result: readonly ParticleTrajectory[];
	  }
	| { readonly type: 'cancelled'; readonly generation: number }
	| { readonly type: 'error'; readonly generation: number; readonly message: string };

export function isAnalysisWorkerResponse(value: unknown): value is AnalysisWorkerResponse {
	if (!value || typeof value !== 'object') return false;
	const candidate = value as { type?: unknown; generation?: unknown };
	return (
		typeof candidate.generation === 'number' &&
		Number.isSafeInteger(candidate.generation) &&
		[
			'basin-grid-result',
			'stability-sweep-result',
			'momentum-stability-sweep-result',
			'particle-flow-result',
			'cancelled',
			'error'
		].includes(String(candidate.type))
	);
}
