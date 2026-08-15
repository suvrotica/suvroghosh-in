export type EvidenceStatus =
	| 'reported'
	| 'reported-range'
	| 'reported-maximum'
	| 'derived'
	| 'schematic';

export type Evidence<T> = {
	value: T;
	status: EvidenceStatus;
	sourceLabel: string;
	sourceUrl: string;
	sample?: string;
	method?: string;
	note?: string;
};

export type CalciumPattern = 'single-wave' | 'repetitive-waves' | 'rapid-pulses';

export type PulseTrainModel = {
	kind: 'pulse-train';
	startSec: number;
	intervalSec: number;
	pulseWidthSec: number;
	pulseCount: number;
};

export type SingleWaveModel = {
	kind: 'single-wave';
	onsetSec: number;
	riseEndSec: number;
	returnEndSec: number;
};

export type InitialAndTrainModel = {
	kind: 'initial-and-train';
	initialRiseEndSec: number;
	initialReturnEndSec: number;
	laterStartSec: number;
	intervalSec: number;
	pulseWidthSec: number;
	pulseCount: number;
	laterAmplitude: number;
};

export type VisualModel = {
	windowSec: Evidence<number>;
	curve: PulseTrainModel | SingleWaveModel | InitialAndTrainModel;
	spatialMode: 'propagating-wave' | 'whole-cell-schematic';
	spatialDirection: 'left-to-right' | 'top-to-bottom';
	spatialCrossSec?: Evidence<number>;
	laterSpatialCrossSec?: Evidence<number>;
	basis: Evidence<string>;
};

export type CalciumProfile = {
	id: string;
	commonName: string;
	scientificName: string;
	pattern: CalciumPattern;
	baselineUM?: Evidence<number>;
	peakUM?: Evidence<number>;
	laterPeakUM?: Evidence<[number, number]>;
	intervalMin?: Evidence<[number, number] | number>;
	transientSec?: Evidence<[number, number] | number>;
	riseSec?: Evidence<[number, number] | number>;
	recoverySec?: Evidence<[number, number] | number>;
	waveSpeedUMs?: Evidence<[number, number] | number>;
	laterWaveSpeedUMs?: Evidence<[number, number] | number>;
	waveCrossSec?: Evidence<[number, number] | number>;
	laterWaveCrossSec?: Evidence<[number, number] | number>;
	onsetSec?: Evidence<[number, number] | number>;
	spikeFrequencyPerHour?: Evidence<{ mean: number; sem: number }>;
	pulseCount?: Evidence<[number, number]>;
	stopMin?: Evidence<number>;
	methodSummary: string;
	sampleSummary: string;
	caveats: string[];
	visualModel: VisualModel;
};

export type MeasurementRow = {
	label: string;
	display: string;
	evidence: Evidence<unknown>;
};

export type SpatialSnapshot = {
	intensity: number;
	front: number;
	active: boolean;
	label: string;
	note: string;
};
