export const CITY_GENERATOR_VERSION = 1 as const;

export const DIRECTIONS = [0, 1, 2, 3] as const;
export type Direction = (typeof DIRECTIONS)[number];
export type Rotation = Direction;
export type CityPass = 'fabric' | 'occupation' | 'infrastructure';

export type Passage = 'closed' | 'foot' | 'lane' | 'road' | 'tram';
export type WaterEdge = 'dry' | 'pond' | 'bank';
export type DrainEdge = 'none' | 'channel' | 'culvert';
export type BoundaryFace = 'neutral' | 'wall' | 'entrance' | 'shopfront' | 'garage-door';

export interface EdgeSignature {
	passage: Passage;
	water: WaterEdge;
	drain: DrainEdge;
	face: BoundaryFace;
	clearance: 0 | 1 | 2;
}

export interface TilePrototype {
	id: string;
	pass: CityPass;
	weight: number;
	rotations: readonly Rotation[];
	edges: readonly [EdgeSignature, EdgeSignature, EdgeSignature, EdgeSignature];
	tags: readonly string[];
	allowedSubstrates?: readonly string[];
	forbiddenSubstrates?: readonly string[];
	rarityGroup?: string;
	renderer: string;
	/** A direction on the unrotated prototype that carries its principal frontage. */
	orientation?: Direction;
}

export interface TileVariant {
	index: number;
	id: string;
	prototypeId: string;
	pass: CityPass;
	weight: number;
	rotation: Rotation;
	edges: readonly [EdgeSignature, EdgeSignature, EdgeSignature, EdgeSignature];
	tags: readonly string[];
	allowedSubstrates?: readonly string[];
	forbiddenSubstrates?: readonly string[];
	rarityGroup?: string;
	renderer: string;
	orientation?: Direction;
}

export interface CityTile {
	id: string;
	prototypeId: string;
	rotation: Rotation;
	renderer: string;
	tags: readonly string[];
	edges: readonly [EdgeSignature, EdgeSignature, EdgeSignature, EdgeSignature];
}

export type CitySizePreset = 'small' | 'standard' | 'large';
export type CivicPatience = 'patient' | 'familiar' | 'impulsive' | 'none';
export type BuildingDensity = 'open' | 'balanced' | 'dense';
export type LandmarkFrequency = 'scarce' | 'balanced' | 'frequent';
export type AnomalyAppetite = 'restrained' | 'balanced' | 'enthusiastic';
export type TramPreference = 'ordinary' | 'high';

export type AnchorId =
	| 'sweet-shop'
	| 'tea-stall'
	| 'old-house'
	| 'temple'
	| 'pond'
	| 'garage'
	| 'tram-stop'
	| 'banyan-tree'
	| 'flyover-pillar'
	| 'sand-pile';

export interface CellCoordinate {
	x: number;
	y: number;
}

export interface AnchorPlacement extends CellCoordinate {
	id: AnchorId;
	rotation: Rotation;
}

export interface CityConfig {
	generatorVersion: typeof CITY_GENERATOR_VERSION;
	seed: string;
	size: CitySizePreset;
	anchor: AnchorPlacement;
	civicPatience: CivicPatience;
	minimumGuarantees: boolean;
	density: BuildingDensity;
	landmarkFrequency: LandmarkFrequency;
	anomalyAppetite: AnomalyAppetite;
	tramPreference: TramPreference;
}

export interface AnchorFootprintCell {
	dx: number;
	dy: number;
	role: string;
}

export interface AnchorDefinition {
	id: AnchorId;
	label: string;
	shortLabel: string;
	pass: CityPass;
	rotations: readonly Rotation[];
	footprint: readonly AnchorFootprintCell[];
	requiredSubstrate?: readonly string[];
	forcedPrototypeId?: string;
	frontageRequired: boolean;
	description: string;
	possibilityEffect: string;
}

export interface GuidedTrial {
	id: string;
	title: string;
	description: string;
	learningPoint: string;
	config: CityConfig;
	challenge?: 'functional' | 'calamity';
}

export type AnomalyType =
	| 'balcony-over-lane'
	| 'lane-through-bedroom'
	| 'pole-through-verandah'
	| 'uphill-drain'
	| 'tram-through-garage'
	| 'pond-lane-bridge'
	| 'permanent-sand-occupation'
	| 'building-around-pillar'
	| 'construction-tarpaulin';

export interface MunicipalPatch {
	id: string;
	cell: CellCoordinate;
	pass: CityPass;
	demandedEdges: readonly EdgeSignature[];
	selectedEdges: readonly EdgeSignature[];
	anomalyType: AnomalyType;
	severity: number;
	violatedRules: readonly string[];
	narrativeKey: string;
	renderVariant: string;
}

export type InfrastructureKind =
	| 'drain'
	| 'culvert'
	| 'electric-pole'
	| 'overhead-wire'
	| 'tram-wire'
	| 'steps'
	| 'bridge'
	| 'ghat';

export interface InfrastructureDetail {
	id: string;
	kind: InfrastructureKind;
	cell: CellCoordinate;
	from?: Direction;
	to?: Direction;
	connectsToOutlet?: boolean;
	uphill?: boolean;
	tags: readonly string[];
}

export interface Portal extends CellCoordinate {
	direction: Direction;
	passage: Exclude<Passage, 'closed' | 'foot'>;
	drainOutlet: boolean;
}

export interface GenerationTiming {
	totalMs: number;
	fabricMs: number;
	occupationMs: number;
	infrastructureMs: number;
	analysisMs: number;
}

export interface GenerationStatistics {
	steps: number;
	fabricSteps: number;
	occupationSteps: number;
	backtracks: number;
	contradictions: number;
	propagatedCells: number;
	removedCandidates: number;
	hardStepBudget: number;
}

export type GenerationEvent =
	| {
			type: 'phase';
			pass: CityPass | 'analysis';
			message: string;
			progress: number;
	  }
	| {
			type: 'observe';
			pass: 'fabric' | 'occupation';
			step: number;
			cell: CellCoordinate;
			entropy: number;
			candidateCount: number;
			chosenVariantId: string;
			chosenWeight: number;
			candidateFamilies: readonly string[];
			exclusionReasons: readonly string[];
			progress: number;
	  }
	| {
			type: 'propagate';
			pass: 'fabric' | 'occupation';
			step: number;
			changedCells: readonly CellCoordinate[];
			forcedCells: readonly CellCoordinate[];
			removedCandidates: number;
			progress: number;
	  }
	| {
			type: 'contradiction';
			pass: 'fabric' | 'occupation';
			step: number;
			cell: CellCoordinate;
			message: string;
			progress: number;
	  }
	| {
			type: 'backtrack';
			pass: 'fabric' | 'occupation';
			step: number;
			cell: CellCoordinate;
			removedVariantId: string;
			remainingCandidates: number;
			message: string;
			progress: number;
	  }
	| {
			type: 'patch';
			pass: CityPass;
			step: number;
			patch: MunicipalPatch;
			message: string;
			progress: number;
	  }
	| {
			type: 'complete';
			progress: 1;
			fingerprint: string;
			functionalScore: number;
			calamityScore: number;
	  };

export type GenerationProgressCallback = (event: GenerationEvent) => void;

export interface WalkableAnalysis {
	cellCount: number;
	componentCount: number;
	largestComponent: number;
	largestComponentRatio: number;
	borderExits: number;
	reachedBorderExits: number;
	deadEnds: number;
}

export interface FrontageAnalysis {
	occupiedCount: number;
	accessibleCount: number;
	accessibleRatio: number;
	isolatedCount: number;
	reachableServices: number;
	serviceCount: number;
	reachableServiceVariety: number;
	serviceVariety: number;
}

export interface DrainageAnalysis {
	segmentCount: number;
	connectedToOutlet: number;
	internallyTrapped: number;
	broken: number;
	uphill: number;
	missing: boolean;
}

export interface TramAnalysis {
	segmentCount: number;
	continuous: boolean;
	strandedSegments: number;
	reachesBorder: boolean;
}

export interface CityAnalysis {
	walkable: WalkableAnalysis;
	frontage: FrontageAnalysis;
	drainage: DrainageAnalysis;
	tram: TramAnalysis;
	routeObstructions: number;
	exceptionCount: number;
	exceptionSeverity: number;
	exceptionDiversity: number;
	treeCount: number;
	openSpaceCount: number;
	pondAccessPoints: number;
	occupiedDensity: number;
}

export interface ScoreComponent {
	key: string;
	label: string;
	value: number;
	maximum: number;
	explanation: string;
}

export interface CityScores {
	functional: number;
	functionalLabel: string;
	calamity: number;
	calamityLabel: string;
	functionalComponents: readonly ScoreComponent[];
	calamityComponents: readonly ScoreComponent[];
}

export interface CityResult {
	schema: 'suvro-city-result-v1';
	generatorVersion: typeof CITY_GENERATOR_VERSION;
	config: CityConfig;
	seed: string;
	cityName: string;
	width: number;
	height: number;
	anchor: AnchorPlacement;
	portals: readonly Portal[];
	fabricTiles: readonly CityTile[];
	occupationTiles: readonly CityTile[];
	infrastructure: readonly InfrastructureDetail[];
	elevation: readonly number[];
	municipalPatches: readonly MunicipalPatch[];
	analysis: CityAnalysis;
	scores: CityScores;
	report: string;
	fingerprint: string;
	events: readonly GenerationEvent[];
	statistics: GenerationStatistics;
	timing: GenerationTiming;
}

export interface CityExportV1 {
	schema: 'suvro-city-v1';
	generatorVersion: typeof CITY_GENERATOR_VERSION;
	seed: string;
	cityName: string;
	width: number;
	height: number;
	anchor: AnchorPlacement;
	settings: Omit<CityConfig, 'seed' | 'anchor' | 'generatorVersion'>;
	fabricTiles: Array<Pick<CityTile, 'id' | 'rotation'>>;
	occupationTiles: Array<Pick<CityTile, 'id' | 'rotation'>>;
	infrastructure: InfrastructureDetail[];
	municipalPatches: MunicipalPatch[];
	scores: {
		functional: number;
		functionalLabel: string;
		calamity: number;
		calamityLabel: string;
		components: {
			functional: ScoreComponent[];
			calamity: ScoreComponent[];
		};
	};
	analysis: CityAnalysis;
	report: string;
	fingerprint: string;
}

export interface CityConfigIssue {
	parameter: string;
	value: string | null;
	message: string;
	severity: 'warning' | 'error';
}

export interface CityConfigParseResult {
	config: CityConfig;
	issues: readonly CityConfigIssue[];
	unsupportedVersion: boolean;
}

export interface CompatibilityExplanation {
	compatible: boolean;
	direction: Direction;
	reasons: readonly string[];
}
