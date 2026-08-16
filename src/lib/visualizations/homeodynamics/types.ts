export type EvidenceKind =
	| 'authoritative-range'
	| 'measured-summary'
	| 'derived-conversion'
	| 'model-derived';

export type RhythmWindow = '20s' | '2h' | '24h';

export type RhythmDatum = {
	id: string;
	label: string;
	unit: string;
	period: string;
	kind: EvidenceKind;
	supportKinds?: readonly EvidenceKind[];
	sourceLabel: string;
	sourceUrl: string;
	additionalSources?: readonly { label: string; url: string }[];
	doi?: string;
	population?: string;
	conditions?: string;
	limitations: string[];
};

export type RhythmPoint = {
	t: number;
	value: number;
	label?: string;
};

export type RhythmSeries = {
	id: string;
	label: string;
	unit: string;
	window: RhythmWindow;
	kind: EvidenceKind;
	markDescription: string;
	sourceId: string;
	points: RhythmPoint[];
	domain?: readonly [number, number];
	stroke: string;
	dash?: string;
	connect?: boolean;
	note: string;
};

export type FeedbackParameters = {
	a: number;
	b: number;
	K: number;
	n: number;
	delay: number;
	perturbation: number;
	perturbationTime: number;
	dt: number;
	duration: number;
};

export type FeedbackSample = {
	t: number;
	x: number;
	delayed: number;
};

export type FeedbackPresetId = 'monotonic' | 'damped' | 'sustained';

export type FeedbackPreset = {
	id: FeedbackPresetId;
	label: string;
	description: string;
	parameters: FeedbackParameters;
};

export type LotkaVolterraParameters = {
	delta: number;
	p: number;
	beta: number;
	q: number;
	sharks0: number;
	tuna0: number;
	dt: number;
	duration: number;
};

export type EcosystemSample = {
	t: number;
	sharks: number;
	tuna: number;
};

export type InterventionKind = 'sharks' | 'tuna';

export type Intervention = {
	kind: InterventionKind;
	time: number;
	amount: number;
};

export type InterventionFork = {
	baseline: EcosystemSample[];
	intervention: EcosystemSample[];
	interventionIndex: number;
};
