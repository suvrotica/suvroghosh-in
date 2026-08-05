export const EVIDENCE_STATUSES = [
	'well-established',
	'context-sensitive',
	'construct-overlap',
	'debated',
	'popular-label'
] as const;

export type EvidenceStatus = (typeof EVIDENCE_STATUSES)[number];

export const RELATION_TYPES = [
	'shared-mechanism',
	'near-overlap',
	'same-effect-different-mechanism',
	'cascade',
	'mirror',
	'alias'
] as const;

export type BiasRelationType = (typeof RELATION_TYPES)[number];

export const RELATION_STRENGTHS = ['strong', 'moderate', 'tentative'] as const;

export type BiasRelationStrength = (typeof RELATION_STRENGTHS)[number];

export const BIAS_LENSES = ['none', 'mechanism', 'task', 'lineage', 'scale', 'conditions'] as const;

export type BiasLens = (typeof BIAS_LENSES)[number];

export interface BiasLineage {
	tradition: string;
	weight: number;
	note?: string;
}

/** The complete, curated record used by the atlas and its static index. */
export interface Bias {
	id: string;
	name: string;
	aliases: string[];
	definition: string;
	example: string;
	mechanisms: string[];
	tasks: string[];
	triggers: string[];
	targets: string[];
	manifestations: string[];
	temporalStage: string[];
	scale: string[];
	conditions: string[];
	lineages: BiasLineage[];
	evidenceNote: string;
	evidenceStatus: EvidenceStatus;
	firstAssociatedYear?: number;
	canonicalSources: string[];
	family: string;
}

export interface BiasRelation {
	source: string;
	target: string;
	type: BiasRelationType;
	strength: BiasRelationStrength;
	explanation: string;
	sourceIds: string[];
}

export interface BiasScenarioStep {
	biasIds: string[];
	text: string;
}

export interface BiasScenario {
	id: string;
	title: string;
	introduction: string;
	steps: BiasScenarioStep[];
	interpretation: string;
	sourceIds?: string[];
}

export interface VocabularyEntry {
	id: string;
	name?: string;
	label?: string;
	description?: string;
	color?: string;
	colour?: string;
	symbol?: TaxonomySymbol;
	formation?: string;
}

export type VocabularyValue = string | VocabularyEntry;

export interface BiasVocabulary {
	formations: VocabularyValue[];
	families: VocabularyValue[];
	mechanisms: VocabularyValue[];
	tasks: VocabularyValue[];
	triggers: VocabularyValue[];
	targets: VocabularyValue[];
	manifestations: VocabularyValue[];
	temporalStages: VocabularyValue[];
	scales: VocabularyValue[];
	conditions: VocabularyValue[];
	evidenceStatuses: VocabularyValue[];
	relationTypes: VocabularyValue[];
	relationStrengths: VocabularyValue[];
}

export interface LineageDefinition {
	id: string;
	name?: string;
	label?: string;
	description: string;
	color?: string;
	colour?: string;
	symbol: TaxonomySymbol;
}

export type TaxonomySymbol = 'circle' | 'diamond' | 'triangle' | 'square' | 'cross';

export interface TaxonomyRecord {
	id: string;
	label: string;
	colour: string;
	symbol: TaxonomySymbol;
	description?: string;
}

export interface PeakMarker {
	colour: string;
	symbol: TaxonomySymbol;
	label: string;
}

export interface BiasDataBundle {
	biases: Bias[];
	relations: BiasRelation[];
	vocabulary: BiasVocabulary;
	lineages: LineageDefinition[];
	scenarios: BiasScenario[];
}

export interface BiasSimilarityWeights {
	mechanisms: number;
	tasks: number;
	triggers: number;
	manifestations: number;
	targets: number;
	temporalStage: number;
}

export interface BiasNeighbour {
	id: string;
	similarity: number;
}

export interface BiasPoint {
	id: string;
	x: number;
	y: number;
	elevation: number;
	labelPriority: 0 | 1 | 2;
	neighbours: BiasNeighbour[];
	family: string;
}

export interface LegendItem {
	id: string;
	label: string;
	description?: string;
	colour: string;
	symbol: string;
	/** Compatibility alias for source catalogues that use American spelling. */
	color?: string;
}

export interface LayoutLabel extends LegendItem {
	x: number;
	y: number;
	members: string[];
}

export interface TerrainGrid {
	width: number;
	height: number;
	sigma: number;
	values: number[];
	min: number;
	max: number;
	meaning: string;
}

export interface BiasLayout {
	version: 2;
	seed: string;
	algorithm: {
		name: 'weighted-jaccard-stress-v2';
		iterations: number;
		weights: BiasSimilarityWeights;
		pinnedIds: string[];
	};
	points: BiasPoint[];
	families: LayoutLabel[];
	formations: LayoutLabel[];
	terrain: TerrainGrid;
}
