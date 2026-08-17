import { FORBIDDEN_CORPUS_TOPIC_PATTERNS } from '../data/forbidden-corpus-topics.ts';
import type { SurfaceText } from './types';

const DENIED_SURFACE_PHRASES = [
	'the claim',
	'the sentence',
	'the description',
	'the wording',
	'the pattern',
	'the apparent',
	'the qualifier',
	'independent evidence',
	'individualising',
	'individualizing',
	'editorial',
	'measurement',
	'semantic',
	'manifest',
	'reproducibility',
	'counterfactual',
	'probability',
	'comparison group',
	'surface fit',
	'qualified version',
	'one side of the description',
	'together with the fact that',
	'with the additional sense that',
	'alongside moments when',
	'stage dressing',
	'sealed claim',
	'direct echo',
	'feedback reuse',
	'semantic id',
	'provenance',
	'stage prop',
	'from your answer',
	'using only that selection'
] as const;

const FORBIDDEN_PUNCTUATION = /[;:—“”()/]/u;
const MALFORMED_PUNCTUATION = /(?:[,.!?]){2,}|\s+[,.!?]|[,.!?](?!\s|$)/u;
const SOFTENERS = new Set([
	'may',
	'might',
	'can',
	'could',
	'tend',
	'often',
	'sometimes',
	'usually'
]);
const SUBORDINATE_CONJUNCTION =
	/\b(?:although|because|before|after|when|whenever|since|unless|until|where|wherever|whether|if|though)\b|\bwhile\s+(?:you|the|a|an|it|they|we|other|hoping)\b|\bonce\s+(?:you|the|a|an|it|they|we|enough)\b/gu;
const BRITISH_SPELLING =
	/\b(?:behaviour|colour|favour|favourite|honour|labour|neighbour|centre|metre|theatre|defence|licence|organise|organised|organising|recognise|recognised|recognising|realise|realised|realising|individualising|travelling|cancelled)\b/iu;
const CONTENT_STOP_WORDS = new Set([
	'about',
	'after',
	'again',
	'against',
	'because',
	'before',
	'being',
	'between',
	'could',
	'deep',
	'down',
	'every',
	'from',
	'have',
	'into',
	'itself',
	'might',
	'often',
	'other',
	'people',
	'really',
	'should',
	'sometimes',
	'their',
	'there',
	'things',
	'through',
	'usually',
	'when',
	'where',
	'while',
	'with',
	'without',
	'would',
	'your',
	'yours',
	'yourself'
]);

export interface SurfaceTextValidationOptions {
	allowReviewedRainbowLength?: boolean;
}

export function surfaceWordCount(input: string): number {
	return input.match(/[A-Za-z]+(?:['’][A-Za-z]+)?|\d+/gu)?.length ?? 0;
}

function normalizedWords(input: string): readonly string[] {
	return (input.toLowerCase().match(/[a-z]+(?:['’][a-z]+)?/gu) ?? []).map((word) =>
		word.replace(/['’]s$/u, '')
	);
}

export function surfaceTextIssues(
	input: string,
	options: SurfaceTextValidationOptions = {}
): readonly string[] {
	const issues: string[] = [];
	const text = input.trim();
	const lower = text.toLowerCase();
	const words = normalizedWords(text);
	const wordCount = surfaceWordCount(text);
	const maximum = options.allowReviewedRainbowLength ? 24 : 22;

	if (text !== input || /\s{2,}/u.test(text)) issues.push('whitespace is not normalized');
	if (!text.endsWith('.') || /[.!?]/u.test(text.slice(0, -1))) {
		issues.push('surface text must contain exactly one sentence ending in a period');
	}
	if (wordCount < 5) issues.push('surface text is too short to carry one clear idea');
	if (wordCount > maximum) issues.push(`surface text exceeds ${maximum} words`);
	if (FORBIDDEN_PUNCTUATION.test(text)) issues.push('surface text contains forbidden punctuation');
	if (MALFORMED_PUNCTUATION.test(text)) issues.push('surface text contains malformed punctuation');
	if ((text.match(/,/gu) ?? []).length > 1)
		issues.push('surface text contains more than one comma');
	if (BRITISH_SPELLING.test(text)) issues.push('surface text must use American spelling');

	for (const phrase of DENIED_SURFACE_PHRASES) {
		if (lower.includes(phrase)) issues.push(`surface text contains denied phrase: ${phrase}`);
	}
	for (const pattern of FORBIDDEN_CORPUS_TOPIC_PATTERNS) {
		if (pattern.test(text))
			issues.push(`surface text enters a forbidden high-stakes topic: ${pattern}`);
	}

	const clauses = lower.split(/,|\bbut\b|\byet\b|\band still\b|\beven though\b/gu);
	for (const clause of clauses) {
		const clauseWords = normalizedWords(clause);
		const count = clauseWords.filter((word) => SOFTENERS.has(word)).length;
		if (count > 1) issues.push('surface clause stacks modal or softener words');
		const subordinateCount = clause.match(SUBORDINATE_CONJUNCTION)?.length ?? 0;
		if (subordinateCount > 1) {
			issues.push('surface clause contains more than one subordinate conjunction');
		}
	}

	const contentCounts = new Map<string, number>();
	for (const word of words) {
		if (word.length < 4 || CONTENT_STOP_WORDS.has(word)) continue;
		contentCounts.set(word, (contentCounts.get(word) ?? 0) + 1);
	}
	if ([...contentCounts.values()].some((count) => count > 1)) {
		issues.push('surface text repeats a content word');
	}

	return [...new Set(issues)];
}

export function assertSurfaceSafe(
	input: string,
	options: SurfaceTextValidationOptions = {}
): asserts input is SurfaceText {
	const issues = surfaceTextIssues(input, options);
	if (issues.length > 0) {
		throw new TypeError(`Unsafe surface text: ${issues.join('; ')} — ${JSON.stringify(input)}`);
	}
}

export function makeSurfaceText(
	input: string,
	options: SurfaceTextValidationOptions = {}
): SurfaceText {
	assertSurfaceSafe(input, options);
	return input;
}

export const SURFACE_TEXT_DENYLIST = DENIED_SURFACE_PHRASES;
