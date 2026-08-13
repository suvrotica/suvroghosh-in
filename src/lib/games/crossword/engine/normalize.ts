const GRID_FORMATTING_CHARACTERS = /[\s\-\u2010-\u2015'\u2019.]/gu;
const SUPPORTED_GRID_CHARACTER = /^[\p{L}\p{N}]$/u;

/**
 * Turn an authored answer into the sequence stored in grid cells.
 *
 * Spaces, hyphens, apostrophes and full stops are presentation characters. Other
 * punctuation is deliberately retained so validation can reject it instead of
 * silently changing a technically meaningful spelling.
 */
export function normalizeAnswer(answer: string): string {
	return answer
		.normalize('NFKC')
		.toLocaleUpperCase('en-US')
		.replace(GRID_FORMATTING_CHARACTERS, '');
}

export function answerCharacters(answer: string): string[] {
	return Array.from(normalizeAnswer(answer));
}

/** Return a single supported grid character, or an empty string for invalid input. */
export function normalizeLetter(input: string): string {
	const characters = answerCharacters(input);
	return characters.length === 1 && SUPPORTED_GRID_CHARACTER.test(characters[0])
		? characters[0]
		: '';
}

export function isSupportedGridCharacter(character: string): boolean {
	return Array.from(character).length === 1 && SUPPORTED_GRID_CHARACTER.test(character);
}

export function findUnsupportedAnswerCharacters(answer: string): string[] {
	const normalised = answer.normalize('NFKC').toLocaleUpperCase('en-US');
	const withoutFormatting = normalised.replace(GRID_FORMATTING_CHARACTERS, '');
	return [
		...new Set(
			Array.from(withoutFormatting).filter((character) => !isSupportedGridCharacter(character))
		)
	];
}

export function answerEquals(left: string, right: string): boolean {
	return normalizeAnswer(left) === normalizeAnswer(right);
}
