export const ANALYSIS_VERSION = 1;
export const MORPHOLOGY_VERSION = 1;
export const MAX_INPUT_LENGTH = 60000;
export const MAX_PARAGRAPHS = 2000;
export const MAX_SENTENCES = 6000;
export const LONG_SENTENCE_WORDS = 45;

export type AnatomyLayer = 'organs' | 'ribs' | 'vessels' | 'neurons' | 'citations' | 'coils';
export const ANATOMY_LAYERS: AnatomyLayer[] = [
	'organs',
	'ribs',
	'vessels',
	'neurons',
	'citations',
	'coils'
];

export interface EssaySentence {
	id: string;
	paragraphId: string;
	text: string;
	/** UTF-16 offsets into the paragraph's displayed text. */
	start: number;
	end: number;
	wordCount: number;
	nesting: number | null;
	punctuation: string[];
}

export interface EssayParagraph {
	id: string;
	index: number;
	kind: 'paragraph' | 'quote' | 'list';
	heading?: string;
	text: string;
	/** Source positions in the original supplied Markdown or plain text. */
	sourceStart: number;
	sourceEnd: number;
	wordCount: number;
	sentences: EssaySentence[];
}

export interface EssayCitation {
	id: string;
	paragraphId: string;
	sentenceId: string;
	label: string;
	target: string;
}

export interface WordOccurrence {
	paragraphId: string;
	sentenceId: string;
	start: number;
	end: number;
}

export interface WordCluster {
	word: string;
	count: number;
	occurrences: WordOccurrence[];
}

export interface EssayMeasurements {
	words: number;
	paragraphs: number;
	sentences: number;
	medianSentence: number;
	longestSentence: number;
	sentenceVariation: number;
	estimatedNesting: number | null;
	citations: number;
	longSentences: number;
}

export interface EssayDocument {
	schemaVersion: 1;
	analysisVersion: number;
	morphologyVersion: number;
	id: string;
	title: string;
	author: string;
	canonicalUrl?: string;
	contentHash: string;
	language: 'en' | 'bn' | 'mixed' | 'other';
	paragraphs: EssayParagraph[];
	citations: EssayCitation[];
	clusters: WordCluster[];
	omittedClusters: number;
	measurements: EssayMeasurements;
	warnings: string[];
}

export interface AnalyzeOptions {
	id?: string;
	title?: string;
	author?: string;
	canonicalUrl?: string;
	format?: 'markdown' | 'text';
}

export interface SpecimenEntry {
	id: string;
	title: string;
	label: string;
	url: string;
	modelUrl: string;
	portrait: string;
	measurements: EssayMeasurements;
}
