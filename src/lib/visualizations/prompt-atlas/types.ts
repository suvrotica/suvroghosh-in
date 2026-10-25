/** Source offsets use JavaScript UTF-16 units into the unmodified editor text. */
export type Evidence = { start: number; end: number; quote: string };
export type Provenance = 'explicit' | 'inferred' | 'user-confirmed';
export type NodeKind =
	| 'task'
	| 'audience'
	| 'output'
	| 'constraint'
	| 'example'
	| 'actor'
	| 'object'
	| 'concept'
	| 'system'
	| 'action'
	| 'state'
	| 'table';
export type Attribute = {
	name: string;
	value?: string;
	dataType?: string;
	primaryKey?: boolean;
	unique?: boolean;
	foreignKey?: string;
	provenance: Provenance;
	evidence: Evidence[];
};
export type OntologyNode = {
	id: string;
	label: string;
	kind: NodeKind;
	layer: 'instruction' | 'subject';
	provenance: Provenance;
	evidence: Evidence[];
	rationale?: string;
	attributes: Attribute[];
};
export type RelationKind =
	| 'association'
	| 'dependency'
	| 'transition'
	| 'message'
	| 'owns'
	| 'inheritance'
	| 'contains'
	| 'condition';
export type OntologyRelation = {
	id: string;
	from: string;
	to: string;
	label: string;
	kind: RelationKind;
	provenance: Provenance;
	evidence: Evidence[];
	rationale?: string;
	guard?: string;
	cardinality?: string;
};
export type OntologyIssue = {
	id: string;
	kind: 'ambiguity' | 'contradiction' | 'missing-detail' | 'limit' | 'unsupported';
	description: string;
	evidence: Evidence[];
	alternatives?: string[];
	resolved?: boolean;
};
export type PromptOntology = {
	schemaVersion: 1;
	source: { text: string; revision: string };
	mode: 'local';
	language: 'en' | 'mixed' | 'unknown';
	nodes: OntologyNode[];
	relations: OntologyRelation[];
	issues: OntologyIssue[];
	databaseTarget?: string;
};
export type ModelId =
	| 'mindmap'
	| 'concept'
	| 'flowchart'
	| 'conceptual-er'
	| 'logical'
	| 'physical'
	| 'class'
	| 'sequence'
	| 'state'
	| 'usecase';
export type ModelFit = {
	id: ModelId;
	label: string;
	family: string;
	level: string;
	description: string;
	eligible: boolean;
	score: number;
	reason: string;
};
export type DiagramNode = {
	id: string;
	label: string;
	x: number;
	y: number;
	width: number;
	height: number;
	shape: 'box' | 'rounded' | 'diamond' | 'ellipse' | 'actor' | 'class' | 'table';
	kind: string;
	sourceId?: string;
	lines?: string[];
	provenance: Provenance;
};
export type DiagramEdge = {
	id: string;
	from: string;
	to: string;
	label: string;
	points: { x: number; y: number }[];
	provenance: Provenance;
	sourceId?: string;
};
export type Diagram = {
	model: ModelId;
	title: string;
	width: number;
	height: number;
	nodes: DiagramNode[];
	edges: DiagramEdge[];
	notes: string[];
	analysisMode?: 'local';
	ontologySchemaVersion?: 1;
	unresolvedIssues?: string[];
};
export const MAX_CODE_POINTS = 20_000;
export const MAX_NODES = 200;
export const MAX_RELATIONS = 400;
