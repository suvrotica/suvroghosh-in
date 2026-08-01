import type { LSystemDefinition, LSystemState, LineSegment, Point2D } from './types';

export const LSYSTEM_MAX_GENERATIONS = 10;
export const LSYSTEM_MAX_SYMBOLS = 1_000_000;
export const LSYSTEM_MAX_SEGMENTS = 250_000;
export const LSYSTEM_SVG_SEGMENT_LIMIT = 40_000;

const SYMBOL_PATTERN = /^[A-Za-z+\-[\]|&^\\/]*$/u;
const RULE_KEY_PATTERN = /^[A-Za-z]$/u;

export interface LSystemValidationResult {
	valid: boolean;
	definition?: LSystemDefinition;
	issues: string[];
}

export interface LSystemEstimate {
	generations: number;
	symbolCount: number;
	segmentCount: number;
	exceedsSymbolLimit: boolean;
	exceedsSegmentLimit: boolean;
	svgSafe: boolean;
}

export interface TurtleOptions {
	origin?: Point2D;
	startAngleDegrees?: number;
	stepLength?: number;
	maxSegments?: number;
	depth?: number;
}

export class LSystemLimitError extends RangeError {
	constructor(message: string) {
		super(message);
		this.name = 'LSystemLimitError';
	}
}

export const LSYSTEM_PRESETS = [
	{
		id: 'koch-curve',
		label: 'Koch curve',
		axiom: 'F',
		rules: { F: 'F+F--F+F' },
		angleDegrees: 60,
		stepLength: 1,
		startAngleDegrees: 0
	},
	{
		id: 'koch-snowflake',
		label: 'Koch snowflake',
		axiom: 'F--F--F',
		rules: { F: 'F+F--F+F' },
		angleDegrees: 60,
		stepLength: 1,
		startAngleDegrees: 0
	},
	{
		id: 'dragon-curve',
		label: 'Dragon curve',
		axiom: 'FX',
		rules: { X: 'X+YF+', Y: '-FX-Y' },
		angleDegrees: 90,
		stepLength: 1,
		startAngleDegrees: 0
	},
	{
		id: 'hilbert-curve',
		label: 'Hilbert curve',
		axiom: 'A',
		rules: { A: '+BF-AFA-FB+', B: '-AF+BFB+FA-' },
		angleDegrees: 90,
		stepLength: 1,
		startAngleDegrees: 0
	},
	{
		id: 'recursive-plant',
		label: 'Recursive plant',
		axiom: 'X',
		rules: { X: 'F+[[X]-X]-F[-FX]+X', F: 'FF' },
		angleDegrees: 25,
		stepLength: 1,
		startAngleDegrees: -90
	}
] as const satisfies readonly ({ id: string; label: string } & LSystemDefinition)[];

export function getLSystemPreset(id: string): (typeof LSYSTEM_PRESETS)[number] {
	return LSYSTEM_PRESETS.find((preset) => preset.id === id) ?? LSYSTEM_PRESETS[0];
}

/**
 * Parse one restricted production per line, such as `F -> F+F`.
 * Keys are single alphabetic symbols and replacements contain only turtle/L-system symbols.
 */
export function parseProductionRules(source: string): Record<string, string> {
	if (typeof source !== 'string' || source.length > 8_192) {
		throw new SyntaxError('L-system production text is missing or too long.');
	}
	const rules: Record<string, string> = {};
	const lines = source
		.split(/\r?\n|;/u)
		.map((line) => line.trim())
		.filter(Boolean);
	for (const [index, line] of lines.entries()) {
		const match = /^([A-Za-z])\s*(?:->|=|:)\s*([A-Za-z+\-[\]|&^\\/]*)$/u.exec(line);
		if (!match) {
			throw new SyntaxError(`Invalid L-system production on line ${index + 1}.`);
		}
		if (Object.hasOwn(rules, match[1])) {
			throw new SyntaxError(`Duplicate L-system production for ${match[1]}.`);
		}
		rules[match[1]] = match[2];
	}
	if (lines.length === 0) throw new SyntaxError('At least one production rule is required.');
	return rules;
}

export function validateLSystemDefinition(value: unknown): LSystemValidationResult {
	const issues: string[] = [];
	if (!isRecord(value)) return { valid: false, issues: ['L-system definition must be an object.'] };

	const axiom = typeof value.axiom === 'string' ? value.axiom.trim() : '';
	if (!axiom || axiom.length > 4_096 || !SYMBOL_PATTERN.test(axiom)) {
		issues.push('The axiom must contain 1–4,096 permitted L-system symbols.');
	} else if (!hasBalancedBranches(axiom)) {
		issues.push('The axiom contains unbalanced branch brackets.');
	}

	const rawRules = value.rules;
	const rules: Record<string, string> = {};
	if (
		!isRecord(rawRules) ||
		Object.keys(rawRules).length === 0 ||
		Object.keys(rawRules).length > 52
	) {
		issues.push('Rules must be a non-empty object containing at most 52 productions.');
	} else {
		for (const [symbol, replacement] of Object.entries(rawRules)) {
			if (!RULE_KEY_PATTERN.test(symbol)) {
				issues.push(`Rule key "${symbol}" must be one alphabetic symbol.`);
				continue;
			}
			if (
				typeof replacement !== 'string' ||
				replacement.length > 4_096 ||
				!SYMBOL_PATTERN.test(replacement)
			) {
				issues.push(`Rule ${symbol} contains an invalid or overlong replacement.`);
				continue;
			}
			if (!hasBalancedBranches(replacement)) {
				issues.push(`Rule ${symbol} contains unbalanced branch brackets.`);
				continue;
			}
			rules[symbol] = replacement;
		}
	}

	const angleDegrees = finiteNumber(value.angleDegrees);
	const stepLength = finiteNumber(value.stepLength);
	const startAngleDegrees =
		value.startAngleDegrees === undefined ? 0 : finiteNumber(value.startAngleDegrees);
	if (angleDegrees === null || Math.abs(angleDegrees) > 360) {
		issues.push('Turn angle must be finite and between −360 and 360 degrees.');
	}
	if (stepLength === null || stepLength <= 0 || stepLength > 1_000) {
		issues.push('Step length must be finite, positive, and no greater than 1,000.');
	}
	if (startAngleDegrees === null || Math.abs(startAngleDegrees) > 36_000) {
		issues.push('Starting angle must be finite and reasonably bounded.');
	}

	if (issues.length > 0) return { valid: false, issues };
	return {
		valid: true,
		definition: {
			axiom,
			rules,
			angleDegrees: angleDegrees!,
			stepLength: stepLength!,
			startAngleDegrees: startAngleDegrees!
		},
		issues
	};
}

export function estimateLSystem(
	definition: LSystemDefinition,
	generations: number,
	limits: { maxSymbols?: number; maxSegments?: number } = {}
): LSystemEstimate {
	const validation = validateLSystemDefinition(definition);
	if (!validation.valid || !validation.definition) {
		throw new SyntaxError(validation.issues.join(' '));
	}
	const safeDefinition = validation.definition;
	const safeGenerations = clampInteger(generations, 0, LSYSTEM_MAX_GENERATIONS, 0);
	const maxSymbols = clampInteger(
		limits.maxSymbols ?? LSYSTEM_MAX_SYMBOLS,
		1,
		LSYSTEM_MAX_SYMBOLS,
		LSYSTEM_MAX_SYMBOLS
	);
	const maxSegments = clampInteger(
		limits.maxSegments ?? LSYSTEM_MAX_SEGMENTS,
		1,
		LSYSTEM_MAX_SEGMENTS,
		LSYSTEM_MAX_SEGMENTS
	);

	let counts = countSymbols(safeDefinition.axiom);
	for (let generation = 0; generation < safeGenerations; generation += 1) {
		const next = new Map<string, number>();
		for (const [symbol, count] of counts) {
			const replacement = safeDefinition.rules[symbol] ?? symbol;
			for (const replacementSymbol of replacement) {
				const previous = next.get(replacementSymbol) ?? 0;
				next.set(replacementSymbol, cappedAdd(previous, count, LSYSTEM_MAX_SYMBOLS + 1));
			}
		}
		counts = next;
	}

	const symbolCount = cappedSum(counts.values(), LSYSTEM_MAX_SYMBOLS + 1);
	const segmentCount = cappedAdd(
		counts.get('F') ?? 0,
		counts.get('G') ?? 0,
		LSYSTEM_MAX_SEGMENTS + 1
	);
	return {
		generations: safeGenerations,
		symbolCount,
		segmentCount,
		exceedsSymbolLimit: symbolCount > maxSymbols,
		exceedsSegmentLimit: segmentCount > maxSegments,
		svgSafe: segmentCount <= LSYSTEM_SVG_SEGMENT_LIMIT
	};
}

export function expandLSystem(
	definition: LSystemDefinition,
	generations: number,
	limits: { maxSymbols?: number; maxSegments?: number } = {}
): string {
	const validation = validateLSystemDefinition(definition);
	if (!validation.valid || !validation.definition) {
		throw new SyntaxError(validation.issues.join(' '));
	}
	const safeDefinition = validation.definition;
	const maxSymbols = Math.min(LSYSTEM_MAX_SYMBOLS, limits.maxSymbols ?? LSYSTEM_MAX_SYMBOLS);
	const maxSegments = Math.min(LSYSTEM_MAX_SEGMENTS, limits.maxSegments ?? LSYSTEM_MAX_SEGMENTS);
	const estimate = estimateLSystem(safeDefinition, generations, { maxSymbols, maxSegments });
	if (estimate.exceedsSymbolLimit) {
		throw new LSystemLimitError(
			`Expansion would exceed the ${maxSymbols.toLocaleString('en')} symbol limit.`
		);
	}
	if (estimate.exceedsSegmentLimit) {
		throw new LSystemLimitError(
			`Expansion would exceed the ${maxSegments.toLocaleString('en')} segment limit.`
		);
	}

	let sequence = safeDefinition.axiom;
	for (let generation = 0; generation < estimate.generations; generation += 1) {
		const chunks: string[] = [];
		let length = 0;
		for (const symbol of sequence) {
			const replacement = safeDefinition.rules[symbol] ?? symbol;
			length += replacement.length;
			if (length > maxSymbols) {
				throw new LSystemLimitError('L-system expansion exceeded its symbol budget.');
			}
			chunks.push(replacement);
		}
		sequence = chunks.join('');
	}
	return sequence;
}

export function lSystemSegments(
	sequence: string,
	angleDegrees: number,
	options: TurtleOptions = {}
): LineSegment[] {
	if (typeof sequence !== 'string' || sequence.length > LSYSTEM_MAX_SYMBOLS) {
		throw new LSystemLimitError('The turtle sequence is absent or exceeds the symbol limit.');
	}
	if (!SYMBOL_PATTERN.test(sequence) || !hasBalancedBranches(sequence)) {
		throw new SyntaxError('The turtle sequence contains invalid symbols or unbalanced branches.');
	}
	const turnRadians = (finiteOr(angleDegrees, 0) * Math.PI) / 180;
	const stepLength = clampFinite(options.stepLength ?? 1, Number.EPSILON, 1_000, 1);
	const maxSegments = clampInteger(
		options.maxSegments ?? LSYSTEM_MAX_SEGMENTS,
		1,
		LSYSTEM_MAX_SEGMENTS,
		LSYSTEM_MAX_SEGMENTS
	);
	const depth = clampInteger(options.depth ?? 0, 0, LSYSTEM_MAX_GENERATIONS, 0);
	let position = { ...(options.origin ?? { x: 0, y: 0 }) };
	let angle = ((options.startAngleDegrees ?? 0) * Math.PI) / 180;
	const stack: { position: Point2D; angle: number }[] = [];
	const segments: LineSegment[] = [];

	for (const symbol of sequence) {
		if (symbol === 'F' || symbol === 'G' || symbol === 'f') {
			const next = {
				x: position.x + Math.cos(angle) * stepLength,
				y: position.y + Math.sin(angle) * stepLength
			};
			if (symbol !== 'f') {
				if (segments.length >= maxSegments) {
					throw new LSystemLimitError('The turtle renderer exceeded its segment budget.');
				}
				segments.push({ from: { ...position }, to: { ...next }, depth });
			}
			position = next;
		} else if (symbol === '+') {
			angle += turnRadians;
		} else if (symbol === '-') {
			angle -= turnRadians;
		} else if (symbol === '|') {
			angle += Math.PI;
		} else if (symbol === '[') {
			stack.push({ position: { ...position }, angle });
		} else if (symbol === ']') {
			const restored = stack.pop();
			if (!restored) throw new SyntaxError('A branch closes without a matching opening bracket.');
			position = restored.position;
			angle = restored.angle;
		}
		/* Alphabetic variables and 3D turtle symbols are safe no-ops in this 2D interpreter. */
	}
	return segments;
}

export function expandLSystemState(state: LSystemState): {
	sequence: string;
	segments: LineSegment[];
	estimate: LSystemEstimate;
} {
	const estimate = estimateLSystem(state, state.generations);
	const sequence = expandLSystem(state, state.generations);
	const segments = lSystemSegments(sequence, state.angleDegrees, {
		startAngleDegrees: state.startAngleDegrees,
		stepLength: state.stepLength,
		depth: state.generations
	});
	return { sequence, segments, estimate };
}

function countSymbols(value: string): Map<string, number> {
	const counts = new Map<string, number>();
	for (const symbol of value) counts.set(symbol, (counts.get(symbol) ?? 0) + 1);
	return counts;
}

function hasBalancedBranches(value: string): boolean {
	let depth = 0;
	for (const symbol of value) {
		if (symbol === '[') depth += 1;
		else if (symbol === ']') depth -= 1;
		if (depth < 0 || depth > 1_024) return false;
	}
	return depth === 0;
}

function cappedAdd(left: number, right: number, cap: number): number {
	return Math.min(cap, left + right);
}

function cappedSum(values: Iterable<number>, cap: number): number {
	let total = 0;
	for (const value of values) total = cappedAdd(total, value, cap);
	return total;
}

function clampInteger(value: number, minimum: number, maximum: number, fallback: number): number {
	if (!Number.isFinite(value)) return fallback;
	return Math.min(maximum, Math.max(minimum, Math.floor(value)));
}

function clampFinite(value: number, minimum: number, maximum: number, fallback: number): number {
	if (!Number.isFinite(value)) return fallback;
	return Math.min(maximum, Math.max(minimum, value));
}

function finiteNumber(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function finiteOr(value: unknown, fallback: number): number {
	return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}
