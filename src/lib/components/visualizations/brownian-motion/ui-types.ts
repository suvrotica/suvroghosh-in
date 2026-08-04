import type { SimulationMetrics } from '$lib/visualizations/brownian-motion/types';
import type { PotentialFieldParameters } from '$lib/visualizations/brownian-motion/models/potential-diffusion';

export type ProcessFamily = 'brownian' | 'conditioned' | 'active' | 'cousin' | 'arrival';

export interface ProcessChoice {
	readonly id: string;
	readonly label: string;
	readonly shortLabel: string;
	readonly family: ProcessFamily;
	readonly description: string;
	readonly equation: string;
	readonly interpretation: string;
	readonly whatToWatch: string;
}

export type DiagnosticId =
	| 'trajectory'
	| 'distribution'
	| 'msd'
	| 'autocorrelation'
	| 'phase-space'
	| 'first-passage';

export interface MetricSample extends SimulationMetrics {
	readonly theoreticalMsd: number | null;
	readonly theoreticalMeanX: number | null;
	readonly theoreticalMeanY: number | null;
	readonly measuredExponent: number | null;
}

export interface ChartPoint {
	readonly x: number;
	readonly y: number;
}

export interface HistogramBin {
	readonly minimum: number;
	readonly maximum: number;
	readonly count: number;
	readonly theoreticalDensity?: number;
}

export interface CameraState {
	readonly centreX: number;
	readonly centreY: number;
	readonly zoom: number;
	readonly autoFit: boolean;
}

export interface TheoryOverlay {
	readonly meanX: number;
	readonly meanY: number;
	readonly varianceX: number;
	readonly varianceY: number;
	readonly covarianceXY: number;
	readonly label: string;
}

/** The exact conservative field parameters rendered behind potential-diffusion particles. */
export type PotentialOverlay = Readonly<PotentialFieldParameters>;

export interface ObstacleOverlay {
	readonly x: number;
	readonly y: number;
	readonly radius: number;
}

export interface SelectOption {
	readonly value: string;
	readonly label: string;
}

interface ControlBase {
	readonly key: string;
	readonly label: string;
	readonly help: string;
	readonly section: 'physical' | 'advanced' | 'appearance' | 'camera';
	readonly unit?: string;
	readonly locked?: boolean;
	readonly resetsSimulation?: boolean;
}

export type LaboratoryControl =
	| (ControlBase & {
			readonly kind: 'range' | 'number';
			readonly minimum: number;
			readonly maximum: number;
			readonly step: number;
	  })
	| (ControlBase & {
			readonly kind: 'select';
			readonly options: readonly SelectOption[];
	  })
	| (ControlBase & {
			readonly kind: 'toggle';
	  });

export interface StoryPresetChoice {
	readonly id: string;
	readonly label: string;
	readonly description: string;
	readonly processId: string;
	readonly seed: string;
}
