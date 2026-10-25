import { MAX_CODE_POINTS, type PromptOntology } from './types';
import { validateOntology } from './validation';

/** Both adapters return the same evidence-backed interpretation contract. */
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

export const SEMANTIC_TIMEOUT_MS = 65_000;
export const MAX_SEMANTIC_RESPONSE_BYTES = 4 * 1024 * 1024;
export type AnalysisMode = 'local' | 'semantic';
export type SemanticConfig = {
	available: boolean;
	provider: string;
	model: string | null;
	reason: string | null;
	freeOnly: true;
	maxCodePoints: number;
	timeoutMs: number;
};

export const UNAVAILABLE_SEMANTIC_CONFIG: SemanticConfig = {
	available: false,
	provider: 'Vercel AI Gateway',
	model: null,
	reason: 'AI availability has not been checked. Local analysis is ready to use.',
	freeOnly: true,
	maxCodePoints: MAX_CODE_POINTS,
	timeoutMs: SEMANTIC_TIMEOUT_MS
};

export class SemanticAnalysisError extends Error {
	constructor(
		message: string,
		public readonly code: string,
		public readonly retryAfterSeconds?: number
	) {
		super(message);
		this.name = 'SemanticAnalysisError';
	}
}

function record(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value))
		throw new Error('The AI service returned an invalid response.');
	return value as Record<string, unknown>;
}

async function boundedJson(response: Response, signal: AbortSignal): Promise<unknown> {
	if (!response.body) throw new Error('The AI service returned an empty response.');
	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let size = 0;
	let text = '';
	try {
		for (;;) {
			signal.throwIfAborted();
			const next = await reader.read();
			if (next.done) break;
			size += next.value.byteLength;
			if (size > MAX_SEMANTIC_RESPONSE_BYTES)
				throw new Error('The AI response is too large to inspect safely.');
			text += decoder.decode(next.value, { stream: true });
		}
		text += decoder.decode();
		return JSON.parse(text);
	} catch (cause) {
		await reader.cancel().catch(() => {});
		throw cause;
	} finally {
		reader.releaseLock();
	}
}

export async function fetchSemanticConfig(signal: AbortSignal): Promise<SemanticConfig> {
	const response = await fetch('/api/prompt-atlas', {
		signal,
		cache: 'no-store',
		credentials: 'same-origin',
		headers: { Accept: 'application/json' }
	});
	if (!response.ok)
		throw new Error('AI availability could not be checked. Local analysis is ready.');
	const value = record(await boundedJson(response, signal));
	if (
		typeof value.available !== 'boolean' ||
		typeof value.provider !== 'string' ||
		!value.provider.trim() ||
		value.provider.length > 200 ||
		(value.model !== null &&
			(typeof value.model !== 'string' || !value.model.trim() || value.model.length > 200)) ||
		(value.reason !== null && (typeof value.reason !== 'string' || value.reason.length > 1000)) ||
		value.freeOnly !== true ||
		value.maxCodePoints !== MAX_CODE_POINTS ||
		value.timeoutMs !== SEMANTIC_TIMEOUT_MS ||
		(value.available && value.model === null)
	)
		throw new Error(
			'The AI service did not confirm the free-credits-only configuration. Local analysis is ready.'
		);
	return value as SemanticConfig;
}

export async function analyzeSemantically(
	text: string,
	signal: AbortSignal
): Promise<PromptOntology> {
	const response = await fetch('/api/prompt-atlas', {
		method: 'POST',
		signal,
		cache: 'no-store',
		credentials: 'same-origin',
		headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
		body: JSON.stringify({ text, consent: true })
	});
	const value = record(await boundedJson(response, signal));
	if (!response.ok) {
		const message =
			typeof value.error === 'string' && value.error.length <= 1000
				? value.error
				: 'AI analysis could not finish. You can choose local analysis instead.';
		throw new SemanticAnalysisError(
			message,
			typeof value.code === 'string' ? value.code : 'analysis_failed',
			typeof value.retryAfterSeconds === 'number' && Number.isFinite(value.retryAfterSeconds)
				? Math.max(0, Math.ceil(value.retryAfterSeconds))
				: undefined
		);
	}
	const ontology = validateOntology(value.ontology);
	if (ontology.mode !== 'semantic' || ontology.source.text !== text || !ontology.analysisMetadata)
		throw new Error(
			'The AI interpretation did not match this prompt and analysis mode. It was not applied.'
		);
	return ontology;
}
