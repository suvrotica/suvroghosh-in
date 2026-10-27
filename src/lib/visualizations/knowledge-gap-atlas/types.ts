/** All source offsets are UTF-16 code units in the unchanged original source. */
export type CorpusRole = 'target' | 'reference';
export type EvidenceRef = { sourceId: string; start: number; end: number };
export type SourceRecord = {
	id: string;
	projectId: string;
	name: string;
	role: CorpusRole;
	bytes: number;
	chars: number;
	words: number;
	processedBytes: number;
	status: 'queued' | 'processing' | 'complete' | 'paused' | 'error';
	error?: string;
	hash?: string;
};
export type AnalysisSettings = {
	window: number;
	minCount: number;
	resolution: number;
	excluded: string[];
	aliases: Record<string, string>;
	seed: number;
};
export const DEFAULT_SETTINGS: AnalysisSettings = {
	window: 5,
	minCount: 2,
	resolution: 1,
	excluded: [],
	aliases: {},
	seed: 1729
};
export type TermAggregate = {
	id: string;
	label: string;
	count: number;
	sources: Record<string, number>;
	evidence: EvidenceRef[];
	phrase: boolean;
};
export type EdgeAggregate = {
	id: string;
	source: string;
	target: string;
	count: number;
	sources: Record<string, number>;
	evidence: EvidenceRef[];
};
export type AnalysisDelta = { terms: TermAggregate[]; edges: EdgeAggregate[]; words: number };
export type Concept = TermAggregate & {
	score: number;
	degree: number;
	community: number;
	targetCount: number;
	referenceCount: number;
};
export type Association = EdgeAggregate & { weight: number };
export type Topic = {
	id: number;
	label: string;
	terms: string[];
	count: number;
	sources: Record<string, number>;
	targetCount: number;
	referenceCount: number;
};
export type FindingKind =
	| 'gap'
	| 'bridge'
	| 'fragile'
	| 'peripheral'
	| 'coverage'
	| 'concentration';
export type Finding = {
	id: string;
	kind: FindingKind;
	title: string;
	explanation: string;
	question: string;
	concepts: string[];
	topics: number[];
	evidence: EvidenceRef[];
	priority: number;
	factors: { relevance: number; deficit: number; support: number };
	caveat: string;
};
export type AnalysisResult = {
	version: 1;
	concepts: Concept[];
	edges: Association[];
	topics: Topic[];
	findings: Finding[];
	settings: AnalysisSettings;
	words: number;
	totalTerms: number;
	totalEdges: number;
	analysedAt: string;
	scope: string;
	sources: SourceRecord[];
};
export type ResearchQuestion = {
	id: string;
	text: string;
	note: string;
	status: 'investigate' | 'addressed' | 'dismissed';
	findingId?: string;
	evidence: EvidenceRef[];
};
export type AtlasProject = {
	id: string;
	name: string;
	createdAt: string;
	updatedAt: string;
	settings: AnalysisSettings;
	questions: ResearchQuestion[];
	dismissed: string[];
	pins: string[];
	topicNames: Record<string, string>;
	result?: AnalysisResult;
};
export type AtlasProgress = {
	phase: string;
	bytes: number;
	totalBytes: number;
	words: number;
	sourceName?: string;
};
export type ImportSource = { name: string; role: CorpusRole; file?: File; text?: string };
export type WorkerRequest =
	| { type: 'analyse'; jobId: string; projectId: string; settings: AnalysisSettings }
	| { type: 'cancel'; jobId: string };
export type WorkerResponse =
	| { type: 'progress'; jobId: string; progress: AtlasProgress }
	| { type: 'complete'; jobId: string; result: AnalysisResult }
	| { type: 'error'; jobId: string; message: string }
	| { type: 'cancelled'; jobId: string };
