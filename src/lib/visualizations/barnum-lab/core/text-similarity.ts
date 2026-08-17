const STOPWORDS = new Set([
	'a',
	'an',
	'and',
	'are',
	'as',
	'at',
	'be',
	'but',
	'by',
	'can',
	'do',
	'for',
	'from',
	'have',
	'in',
	'is',
	'it',
	'of',
	'on',
	'or',
	'that',
	'the',
	'this',
	'to',
	'when',
	'while',
	'with',
	'you',
	'your'
]);

export function normalizeText(text: string): string {
	return text
		.normalize('NFKC')
		.toLocaleLowerCase('en')
		.replace(/[’']/g, '')
		.replace(/[^\p{L}\p{N}]+/gu, ' ')
		.trim()
		.replace(/\s+/g, ' ');
}

export function tokenize(text: string): readonly string[] {
	const normalized = normalizeText(text);
	return normalized ? normalized.split(' ') : [];
}

export function contentWords(text: string): ReadonlySet<string> {
	return new Set(tokenize(text).filter((word) => !STOPWORDS.has(word)));
}

export function trigramSet(text: string): ReadonlySet<string> {
	const normalized = `  ${normalizeText(text)}  `;
	const values = new Set<string>();
	for (let index = 0; index <= normalized.length - 3; index += 1) {
		values.add(normalized.slice(index, index + 3));
	}
	return values;
}

export function setJaccard(left: ReadonlySet<string>, right: ReadonlySet<string>): number {
	if (left.size === 0 && right.size === 0) return 1;
	let intersection = 0;
	for (const value of left) {
		if (right.has(value)) intersection += 1;
	}
	return intersection / (left.size + right.size - intersection);
}

export function trigramJaccard(left: string, right: string): number {
	return setJaccard(trigramSet(left), trigramSet(right));
}

export function setOverlapBySmaller(left: ReadonlySet<string>, right: ReadonlySet<string>): number {
	if (left.size === 0 || right.size === 0) return 0;
	let intersection = 0;
	for (const value of left) {
		if (right.has(value)) intersection += 1;
	}
	return intersection / Math.min(left.size, right.size);
}

export function contentWordOverlap(left: string, right: string): number {
	const leftWords = contentWords(left);
	const rightWords = contentWords(right);
	return setOverlapBySmaller(leftWords, rightWords);
}

export const SIMILARITY_THRESHOLDS = Object.freeze({
	trigramJaccard: 0.45,
	contentWordOverlap: 0.6
});
