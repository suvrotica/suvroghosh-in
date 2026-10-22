/** Browser-independent learning material and occurrence-keyed recall bookkeeping. */
export type InputMode = 'words' | 'concepts';
export type Delimiter = 'auto' | 'comma' | 'newline' | 'space';

export interface MemoryUnit {
	id: string;
	label: string;
	meaning: string;
	source: string;
	scene: string;
	why: string;
	prop: string;
	relationship: string;
	/** Global position: 0–11 in batch one, 12–23 in batch two, and so on. */
	locus: number;
}

export const MAX_INPUT = 6000;
export const MAX_LABEL = 600;
export const MAX_UNITS = 48;
export const LOCI_PER_ROUTE = 12;

export const LANDMARKS = [
	{ name: 'Gate', hint: 'The iron gate opens onto the house.' },
	{ name: 'Front steps', hint: 'Three broad steps lead up from the garden.' },
	{ name: 'Veranda', hint: 'A striped awning shades the open veranda.' },
	{ name: 'Entrance table', hint: 'A small round table stands just inside the door.' },
	{ name: 'Armchair', hint: 'A deep upholstered chair faces the sitting room.' },
	{ name: 'Bookshelf', hint: 'A tall shelf holds several rows of books.' },
	{ name: 'Dining table', hint: 'A long table marks the centre of the dining room.' },
	{ name: 'Stove', hint: 'A broad stove stands against the kitchen wall.' },
	{ name: 'Staircase', hint: 'The staircase turns upwards to the first floor.' },
	{ name: 'Landing', hint: 'A window lights the space at the top of the stairs.' },
	{ name: 'Study desk', hint: 'A writing desk waits in the quiet study.' },
	{ name: 'Terrace', hint: 'The open roof terrace looks out across the neighbourhood.' }
] as const;

export type RecallResult = 'remembered' | 'partial' | 'missed';

export interface Attempt {
	unitId: string;
	answer: string;
	/** A response was committed before seeing the target (owned by the practice UI). */
	submitted: boolean;
	hinted: boolean;
	/** Whether the target has been shown, including feedback after a committed attempt. */
	revealed: boolean;
	result: RecallResult | null;
}

/** Delimiter detection is explicit and deterministic, never semantic inference. */
export function detectDelimiter(text: string): Exclude<Delimiter, 'auto'> {
	if (text.includes(',')) return 'comma';
	if (/[\r\n]/u.test(text)) return 'newline';
	return 'space';
}

/**
 * Paragraph fragments retain exact substrings of the original, including conditions
 * and negation. This is only sentence/semicolon segmentation, not concept extraction.
 */
export function suggestFragments(text: string): string[] {
	return (text.match(/[^.!?;]+(?:[.!?;]+|$)/gu) ?? [])
		.map((fragment) => fragment.trim())
		.filter(Boolean);
}

export function parseInput(
	text: string,
	mode: InputMode,
	delimiter: Delimiter = 'auto'
): MemoryUnit[] {
	if (text.length > MAX_INPUT) {
		throw new Error(
			`Use at most ${MAX_INPUT.toLocaleString('en-GB')} characters. Nothing has been discarded.`
		);
	}
	if (!text.trim()) throw new Error('Add a word list or a paragraph before continuing.');
	const selected = delimiter === 'auto' ? detectDelimiter(text) : delimiter;
	const separator = selected === 'comma' ? /,/u : selected === 'newline' ? /[\r\n]+/u : /\s+/u;
	const items =
		mode === 'concepts'
			? suggestFragments(text)
			: text
					.split(separator)
					.map((item) => item.trim())
					.filter(Boolean);
	if (!items.length)
		throw new Error('No items were found. Add text between the selected separators.');
	if (items.length > MAX_UNITS) {
		throw new Error(
			`This practice supports at most ${MAX_UNITS} units. Split the material into smaller sessions; nothing has been discarded.`
		);
	}
	if (mode === 'words' && items.some((item) => item.length > MAX_LABEL)) {
		throw new Error(
			`Keep each word or phrase to at most ${MAX_LABEL} characters. Split long material into meaningful units; nothing has been discarded.`
		);
	}
	return items.map((source, index) => ({
		id: `unit-${index + 1}`,
		label: mode === 'words' ? source : conceptLabel(source),
		meaning: source,
		source,
		scene: '',
		why: '',
		prop: 'object',
		relationship: '',
		locus: index
	}));
}

/** Labels can be shortened; source and explanation must retain all original material. */
function conceptLabel(source: string): string {
	const label = source.split(/\s+/u).slice(0, 7).join(' ');
	return label.length > MAX_LABEL
		? `${label.slice(0, MAX_LABEL - 1).replace(/[\uD800-\uDBFF]$/u, '')}…`
		: label;
}

/** NFC keeps canonically equivalent Unicode spellings comparable, without losing accents. */
export function normaliseAnswer(answer: string): string {
	return answer.normalize('NFC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('en-GB');
}

/** Deliberately exact apart from case, Unicode normalisation and whitespace. */
export function gradeWord(answer: string, target: string): boolean {
	return normaliseAnswer(answer) !== '' && normaliseAnswer(answer) === normaliseAnswer(target);
}

export function createAttempts(units: readonly MemoryUnit[]): Attempt[] {
	return units.map(({ id }) => ({
		unitId: id,
		answer: '',
		submitted: false,
		hinted: false,
		revealed: false,
		result: null
	}));
}

/** Unknown IDs cannot create phantom results; repeated words remain distinct occurrences. */
export function recordAttempt(
	attempts: readonly Attempt[],
	unitId: string,
	patch: Partial<Omit<Attempt, 'unitId'>>
): Attempt[] {
	return attempts.map((attempt) =>
		attempt.unitId === unitId ? { ...attempt, ...patch } : { ...attempt }
	);
}

/** Editing the source, mapping or association clears the corresponding stale result. */
export function invalidateAttempts(
	attempts: readonly Attempt[],
	unitIds: readonly string[]
): Attempt[] {
	const changed = new Set(unitIds);
	return attempts.map((attempt) =>
		changed.has(attempt.unitId)
			? {
					unitId: attempt.unitId,
					answer: '',
					submitted: false,
					hinted: false,
					revealed: false,
					result: null
				}
			: { ...attempt }
	);
}

export function practiceResults(attempts: readonly Attempt[]) {
	return {
		total: attempts.length,
		attempted: attempts.filter((attempt) => attempt.result !== null).length,
		remembered: attempts.filter((attempt) => attempt.result === 'remembered').length,
		partial: attempts.filter((attempt) => attempt.result === 'partial').length,
		missed: attempts.filter((attempt) => attempt.result === 'missed').length,
		unassisted: attempts.filter(
			(attempt) => attempt.result === 'remembered' && attempt.submitted && !attempt.hinted
		).length,
		hinted: attempts.filter((attempt) => attempt.hinted).length,
		revealed: attempts.filter((attempt) => attempt.revealed).length
	};
}

/** Retry selection keeps original units and their global loci, rather than renumbering. */
export function weakUnits(
	units: readonly MemoryUnit[],
	attempts: readonly Attempt[]
): MemoryUnit[] {
	const weak = new Set(
		attempts
			.filter((attempt) => attempt.result === 'partial' || attempt.result === 'missed')
			.map((attempt) => attempt.unitId)
	);
	return units.filter((unit) => weak.has(unit.id)).map((unit) => ({ ...unit }));
}

/** A study sheet is a text download; escaping also keeps user HTML inert in Markdown readers. */
function sheetText(value: string): string {
	return value
		.replace(/&/gu, '&amp;')
		.replace(/</gu, '&lt;')
		.replace(/>/gu, '&gt;')
		.replace(/([\\`*_{}[\]#])/gu, '\\$1')
		.replace(/\r?\n/gu, '\n  ');
}

export function exportStudySheet(units: readonly MemoryUnit[], mode: InputMode): string {
	const lines = [
		'# My memory palace',
		'',
		`Mode: ${mode === 'words' ? 'ordered word list' : 'concepts (meaning, not exact wording)'}`,
		'',
		'Learn the landmark order, rehearse each association, then attempt recall before checking this sheet.',
		'Batches reuse this house as separate practice sessions; study one batch at a time to reduce interference.',
		''
	];
	const ordered = [...units].sort((left, right) => left.locus - right.locus);
	for (const unit of ordered) {
		const landmark = LANDMARKS[((unit.locus % LOCI_PER_ROUTE) + LOCI_PER_ROUTE) % LOCI_PER_ROUTE];
		lines.push(
			`## Batch ${Math.floor(unit.locus / LOCI_PER_ROUTE) + 1}, ${(unit.locus % LOCI_PER_ROUTE) + 1}. ${landmark.name}`,
			'',
			`Target: ${sheetText(unit.label)}`,
			`Meaning: ${sheetText(unit.meaning)}`,
			`Source: ${sheetText(unit.source)}`,
			`Scene: ${sheetText(unit.scene) || '(add your own scene)'}`,
			`Why it reminds me: ${sheetText(unit.why) || '(add your own association)'}`,
			`Relationship: ${sheetText(unit.relationship) || '(none recorded)'}`,
			''
		);
	}
	return lines.join('\n');
}
