export type EpistemicStatus = 'explicit' | 'inferred' | 'speculative';
export type SourceKind = 'text' | 'transcript' | 'pdf' | 'url';
export type AnalysisDepth = 'overview' | 'detailed' | 'research';
export interface StudioSource {
	id: string;
	title: string;
	kind: SourceKind;
	text: string;
	url?: string;
	scope?: string;
}
/** Offsets are UTF-16 indices into the exact, unmodified source text. */
export interface Evidence {
	sourceId: string;
	start: number;
	end: number;
	quote: string;
	locator?: string;
}
export interface StudioNode {
	id: string;
	parentId: string | null;
	label: string;
	description: string;
	category: string;
	status: EpistemicStatus;
	evidence: Evidence[];
	notes: string;
	reviewed: boolean;
	collapsed: boolean;
	color?: string;
}
export interface StudioEdge {
	id: string;
	from: string;
	to: string;
	type: string;
	status: EpistemicStatus;
	evidence: Evidence[];
	rationale: string;
}
export interface AnalysisSection {
	id: string;
	title: string;
	body: string;
}
export interface StudioProject {
	schemaVersion: 1;
	id: string;
	title: string;
	createdAt: string;
	updatedAt: string;
	sources: StudioSource[];
	nodes: StudioNode[];
	edges: StudioEdge[];
	rootId: string;
	analysis: AnalysisSection[];
	coverage: { total: number; completed: number; limitations: string[] };
	generation: { mode: 'example' | 'manual' | 'local' | 'ai' | 'import'; model?: string };
	theme: 'paper' | 'night';
}
