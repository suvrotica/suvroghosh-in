export type UmlFamily = 'structural' | 'behavioral';
export type UmlSubfamily = 'interaction';
export type UmlFamilyFilter = 'all' | 'structural' | 'behavioral' | 'interaction';

export const STRUCTURAL_DIAGRAM_TYPES = [
	'class',
	'object',
	'package',
	'component',
	'composite-structure',
	'deployment',
	'profile'
] as const;

export const BEHAVIORAL_CORE_DIAGRAM_TYPES = ['use-case', 'activity', 'state-machine'] as const;

export const INTERACTION_DIAGRAM_TYPES = [
	'sequence',
	'communication',
	'interaction-overview',
	'timing'
] as const;

export const BEHAVIORAL_DIAGRAM_TYPES = [
	...BEHAVIORAL_CORE_DIAGRAM_TYPES,
	...INTERACTION_DIAGRAM_TYPES
] as const;

export const ALL_UML_DIAGRAM_TYPES = [
	...STRUCTURAL_DIAGRAM_TYPES,
	...BEHAVIORAL_DIAGRAM_TYPES
] as const;

export type StructuralDiagramType = (typeof STRUCTURAL_DIAGRAM_TYPES)[number];
export type BehavioralCoreDiagramType = (typeof BEHAVIORAL_CORE_DIAGRAM_TYPES)[number];
export type InteractionDiagramType = (typeof INTERACTION_DIAGRAM_TYPES)[number];
export type BehavioralDiagramType = (typeof BEHAVIORAL_DIAGRAM_TYPES)[number];
export type UmlDiagramType = (typeof ALL_UML_DIAGRAM_TYPES)[number];

export type UmlGenerationMode = 'recommended' | 'selected' | 'all14';
export type UmlDetailLevel = 'simple' | 'detailed';
export type UmlAnalysisEngine = 'local' | 'ai';

export type UmlGenerationStatus = 'generated' | 'needs_more_info' | 'not_applicable' | 'failed';

export type UmlValidationStatus = 'valid' | 'repaired' | 'invalid' | 'skipped';
export type UmlRenderStatus = 'rendered' | 'error' | 'not_rendered';
export type UmlProvenance = 'ai' | 'local' | 'example' | 'edited';

export type UmlDomainKind = 'software' | 'conceptual' | 'process' | 'scientific' | 'organizational';

export type RendererSupportLevel = 'native' | 'composed';

export interface UmlLegendSymbol {
	symbol: string;
	label: string;
	meaning: string;
}

export interface UmlDiagramTypeMeta {
	type: UmlDiagramType;
	number: number;
	label: string;
	shortLabel: string;
	family: UmlFamily;
	subfamily?: UmlSubfamily;
	familyBadge: string;
	summary: string;
	readerValue: string;
	requiredEvidence: string[];
	disambiguationNote: string;
	rendererSupport: RendererSupportLevel;
	rendererNotes: string;
	notationLimitations: string[];
	legend: UmlLegendSymbol[];
}

export interface UmlParagraphSpan {
	id: string;
	index: number;
	heading?: string;
	text: string;
	start: number;
	end: number;
}

export interface UmlSupportingReference {
	id: string;
	paragraphIndex: number;
	quote: string;
	elementLabel: string;
}

export interface SharedUmlEntity {
	id: string;
	name: string;
	stereotype: string;
	attributes: string[];
	operations: string[];
	packageGroup: string;
	paragraphIndex: number;
	quote: string;
}

export interface SharedUmlRelationship {
	id: string;
	from: string;
	to: string;
	kind: 'inheritance' | 'composition' | 'aggregation' | 'association' | 'dependency';
	label: string;
	fromMultiplicity?: string;
	toMultiplicity?: string;
	paragraphIndex: number;
	quote: string;
	isAssumption?: boolean;
}

export interface SharedUmlInstance {
	id: string;
	instanceName: string;
	classifierName: string;
	slots: { key: string; value: string }[];
	paragraphIndex: number;
	quote: string;
	isAssumption?: boolean;
}

export interface SharedUmlInstanceLink {
	fromInstance: string;
	toInstance: string;
	label: string;
}

export interface SharedUmlPackage {
	id: string;
	name: string;
	stereotype?: string;
	members: string[];
	dependsOn: string[];
	paragraphIndex: number;
	quote: string;
}

export interface SharedUmlComponent {
	id: string;
	name: string;
	stereotype?: string;
	providedInterfaces: string[];
	requiredInterfaces: string[];
	dependsOn: string[];
	paragraphIndex: number;
	quote: string;
}

export interface SharedUmlCompositeStructure {
	classifierName: string;
	stereotype: string;
	ports: { id: string; name: string; direction: 'in' | 'out' | 'inout'; protocol: string }[];
	parts: { id: string; name: string; roleType: string; multiplicity: string }[];
	connectors: { from: string; to: string; label: string; kind: 'delegation' | 'assembly' }[];
	paragraphIndex: number;
	quote: string;
	isAssumption?: boolean;
}

export interface SharedUmlDeploymentNode {
	id: string;
	name: string;
	nodeKind: 'node' | 'device' | 'executionEnvironment' | 'database' | 'cloud';
	artifacts: string[];
	connections: { targetNode: string; protocol: string }[];
	paragraphIndex: number;
	quote: string;
	isAssumption?: boolean;
}

export interface SharedUmlProfileStereotype {
	id: string;
	stereotypeName: string;
	metaclass:
		| 'Class'
		| 'Component'
		| 'Action'
		| 'State'
		| 'Package'
		| 'Node'
		| 'Artifact'
		| 'Operation';
	taggedValues: string[];
	constraint?: string;
	paragraphIndex: number;
	quote: string;
}

export interface SharedUmlActor {
	id: string;
	name: string;
	role: string;
	paragraphIndex: number;
	quote: string;
}

export interface SharedUmlUseCase {
	id: string;
	name: string;
	actorIds: string[];
	includes: string[];
	extendsCase?: string;
	paragraphIndex: number;
	quote: string;
}

export interface SharedUmlActivityStep {
	id: string;
	label: string;
	lane?: string;
	kind: 'action' | 'decision' | 'fork' | 'merge';
	branchYes?: string;
	branchNo?: string;
	parallelActions?: string[];
	paragraphIndex: number;
	quote: string;
}

export interface SharedUmlState {
	id: string;
	name: string;
	entryAction?: string;
	doActivity?: string;
	exitAction?: string;
	paragraphIndex: number;
	quote: string;
}

export interface SharedUmlTransition {
	fromState: string;
	toState: string;
	trigger: string;
	guard?: string;
	effect?: string;
	paragraphIndex: number;
	quote: string;
}

export interface SharedUmlMessage {
	order: string;
	from: string;
	to: string;
	message: string;
	kind: 'sync' | 'async' | 'return';
	guard?: string;
	fragmentLabel?: string;
	paragraphIndex: number;
	quote: string;
}

export interface SharedUmlInteractionNode {
	id: string;
	refName: string;
	summary: string;
	participants: string[];
	condition?: string;
	paragraphIndex: number;
	quote: string;
}

export interface SharedUmlTimingTrack {
	participant: string;
	kind: 'robust' | 'concise';
	states: string[];
	events: { tick: string; state: string; note?: string }[];
	constraints: { fromTick: string; toTick: string; label: string }[];
	paragraphIndex: number;
	quote: string;
	isAssumption?: boolean;
}

export interface SharedUmlModel {
	title: string;
	domainKind: UmlDomainKind;
	isConceptualModel: boolean;
	conceptualRationale: string;
	totalCharacters: number;
	totalWords: number;
	sectionedAnalysis: boolean;
	sectionCount: number;
	paragraphs: UmlParagraphSpan[];
	terminology: string[];
	entities: SharedUmlEntity[];
	relationships: SharedUmlRelationship[];
	instances: SharedUmlInstance[];
	instanceLinks: SharedUmlInstanceLink[];
	packages: SharedUmlPackage[];
	components: SharedUmlComponent[];
	compositeStructure: SharedUmlCompositeStructure | null;
	deploymentNodes: SharedUmlDeploymentNode[];
	profileStereotypes: SharedUmlProfileStereotype[];
	systemBoundaryName: string;
	actors: SharedUmlActor[];
	useCases: SharedUmlUseCase[];
	activities: SharedUmlActivityStep[];
	states: SharedUmlState[];
	transitions: SharedUmlTransition[];
	messages: SharedUmlMessage[];
	interactionNodes: SharedUmlInteractionNode[];
	timingTracks: SharedUmlTimingTrack[];
	hasExplicitInstances: boolean;
	hasExplicitDeployment: boolean;
	hasExplicitTiming: boolean;
	hasExplicitCompositeParts: boolean;
	hasExplicitStates: boolean;
	hasExplicitInteractions: boolean;
}

export interface UmlDiagramRecord {
	id: string;
	type: UmlDiagramType;
	family: UmlFamily;
	subfamily?: UmlSubfamily;
	title: string;
	explanation: string;
	sourceLanguage: 'plantuml';
	sourceCode: string;
	caption: string;
	altText: string;
	isConceptual: boolean;
	supportingReferences: UmlSupportingReference[];
	assumptions: string[];
	missingInformation: string[];
	notationLimitations: string[];
	generationStatus: UmlGenerationStatus;
	statusReason?: string;
	validationStatus: UmlValidationStatus;
	renderStatus: UmlRenderStatus;
	renderError?: string;
	repairAttempts: number;
	svg?: string;
	lastValidSvg?: string;
	lastValidSourceCode?: string;
	provenance: UmlProvenance;
}

export interface UmlGenerationRequest {
	text: string;
	title?: string;
	mode: UmlGenerationMode;
	selectedTypes?: UmlDiagramType[];
	detailLevel: UmlDetailLevel;
	allowAssumptions: boolean;
	engine?: UmlAnalysisEngine;
	postSlug?: string;
}

export interface UmlRecommendationSummary {
	recommendedTypes: UmlDiagramType[];
	rationale: string;
}

export interface UmlGenerationResponse {
	id: string;
	title: string;
	slug: string;
	createdAt: string;
	engine: UmlAnalysisEngine;
	modelLabel: string;
	mode: UmlGenerationMode;
	detailLevel: UmlDetailLevel;
	allowAssumptions: boolean;
	sharedModel: SharedUmlModel;
	recommendation: UmlRecommendationSummary;
	diagrams: UmlDiagramRecord[];
	warnings: string[];
}

export interface UmlBlogPostOption {
	slug: string;
	title: string;
	categoryLabel: string;
	date: string;
	description: string;
}

export interface UmlAiAvailability {
	available: boolean;
	provider: string;
	model: string;
	reason: string;
	configurationSteps: string[];
}
