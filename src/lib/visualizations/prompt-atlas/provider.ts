import type { PromptOntology } from './types';

/** A future remote adapter must return this same validated, evidence-backed contract.
 * No narration credential is reused and no public paid endpoint is installed. */
export interface AnalysisProvider {
	id: string;
	label: string;
	remote: boolean;
	analyze(text: string, signal: AbortSignal): Promise<PromptOntology>;
}

export const ANALYSIS_MODE = {
	id: 'local',
	label: 'Local · rules-based',
	remote: false,
	description:
		'Your text stays in this browser. Rules identify common prompt and modeling patterns; review ambiguous or unusual language.'
} as const;
