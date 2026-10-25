import { MAX_CODE_POINTS, type CompressionMetadata } from './types';

export type SourceFragment = { id: string; text: string; start: number };
export type PreparedSemanticInput = {
	prompt: string;
	fragments?: SourceFragment[];
	compression: CompressionMetadata;
};
export const SEMANTIC_EXCERPT_CODE_POINTS = 24_000;

function sourceUnitRanges(points: string[], maxCodePoints: number) {
	const units: { startPoint: number; endPoint: number }[] = [];
	for (let startPoint = 0; startPoint < points.length; ) {
		let endPoint = Math.min(points.length, startPoint + maxCodePoints);
		for (let index = startPoint; index < endPoint; index++) {
			const point = points[index];
			const lineEnd = point === '\n' || point === '\r';
			const sentenceEnd =
				/[.!?;]/.test(point) && (index + 1 === points.length || /\s/u.test(points[index + 1]));
			if (!lineEnd && !sentenceEnd) continue;
			let boundary = index + 1;
			// Keep punctuation and following whitespace exactly as supplied. A
			// long whitespace run still obeys the hard code-point unit bound.
			while (boundary < endPoint && /\s/u.test(points[boundary])) boundary++;
			endPoint = boundary;
			break;
		}
		units.push({ startPoint, endPoint });
		startPoint = endPoint;
	}
	return units;
}

/** A lossless partition for server-assigned evidence IDs. Units retain every
 * source character, prefer sentence/line boundaries, and never split a code point. */
export function splitSourceUnits(text: string, maxCodePoints = 512): SourceFragment[] {
	if (!Number.isInteger(maxCodePoints) || maxCodePoints < 1 || maxCodePoints > 512)
		throw new Error('Source units must contain between 1 and 512 code points.');
	const points = Array.from(text);
	const offsets = [0];
	for (const point of points) offsets.push(offsets[offsets.length - 1] + point.length);
	return sourceUnitRanges(points, maxCodePoints).map(({ startPoint, endPoint }, index) => ({
		id: `unit-${index + 1}`,
		start: offsets[startPoint],
		text: text.slice(offsets[startPoint], offsets[endPoint])
	}));
}

/** Deterministic extractive compression. Excerpts remain exact substrings: no summarised
 * or reconstructed language is ever used as source evidence. The original stays in the session. */
export function prepareSemanticInput(
	text: string,
	budget = SEMANTIC_EXCERPT_CODE_POINTS
): PreparedSemanticInput {
	const points = Array.from(text);
	if (points.length > MAX_CODE_POINTS)
		throw new Error(
			`This prompt exceeds the ${MAX_CODE_POINTS.toLocaleString('en')} code-point safety limit. Your text has not been shortened.`
		);
	if (points.length <= budget)
		return {
			prompt: text,
			compression: {
				originalCodePoints: points.length,
				analysedCodePoints: points.length,
				omittedCodePoints: 0,
				duplicateCodePoints: 0,
				fragmentCount: text ? 1 : 0,
				applied: false
			}
		};
	const offsets = [0];
	for (const point of points) offsets.push(offsets[offsets.length - 1] + point.length);
	type Candidate = {
		startPoint: number;
		endPoint: number;
		start: number;
		text: string;
		score: number;
	};
	const candidates: Candidate[] = [];
	const retainedUnits: Omit<Candidate, 'score'>[] = [];
	const unique = new Set<string>();
	let duplicateCodePoints = 0;
	const chunkSize = Math.min(512, Math.max(64, budget));
	for (const { startPoint, endPoint } of sourceUnitRanges(points, chunkSize)) {
		// Deduplicate exact sentence/line units before packing them into larger
		// excerpts. Chunk-level deduplication alone can retain many repeated
		// sentences inside an otherwise unique 512-code-point window.
		const excerpt = text.slice(offsets[startPoint], offsets[endPoint]);
		if (unique.has(excerpt)) duplicateCodePoints += endPoint - startPoint;
		else {
			unique.add(excerpt);
			retainedUnits.push({ startPoint, endPoint, start: offsets[startPoint], text: excerpt });
		}
	}
	// Coalesce only physically adjacent retained units. Omitting a repeated
	// unit creates a source gap, which must remain a fragment boundary.
	for (const unit of retainedUnits) {
		const previous = candidates.at(-1);
		if (
			previous &&
			previous.endPoint === unit.startPoint &&
			unit.endPoint - previous.startPoint <= chunkSize
		) {
			previous.endPoint = unit.endPoint;
			previous.text = text.slice(previous.start, offsets[unit.endPoint]);
		} else candidates.push({ ...unit, score: 0 });
	}
	for (const candidate of candidates) {
		const excerpt = candidate.text;
		candidate.score =
			(/(?:^|\n)\s*(?:write|create|build|explain|analyse|analyze|task|goal|instructions?|you are)\b/i.test(
				excerpt
			)
				? 8
				: 0) +
			(/\b(?:must|never|not|unless|except|only|exactly|at most|at least|avoid|constraints?|requirements?)\b/i.test(
				excerpt
			)
				? 10
				: 0) +
			(/\b(?:if|then|else|before|after|when|until|provided)\b/i.test(excerpt) ? 6 : 0) +
			(/\b(?:owns?|belongs?|has|have|class|entity|system|primary key|references|state|becomes|sends?)\b|→|->/i.test(
				excerpt
			)
				? 5
				: 0);
	}
	const selected = new Set<Candidate>();
	let used = 0;
	function choose(candidate: Candidate | undefined) {
		if (!candidate || selected.has(candidate)) return;
		const length = candidate.endPoint - candidate.startPoint;
		if (used + length > budget) return;
		selected.add(candidate);
		used += length;
	}
	// Retain the opening, ending and distributed context before filling remaining
	// space with instruction/constraint/condition/relationship-rich excerpts.
	choose(candidates[0]);
	choose(candidates[1]);
	choose(candidates.at(-1));
	choose(candidates.at(-2));
	const samples = Math.max(2, Math.floor(budget / chunkSize / 2));
	for (let index = 0; index < samples; index++)
		choose(candidates[Math.round((index * (candidates.length - 1)) / (samples - 1))]);
	for (const candidate of [...candidates].sort(
		(a, b) => b.score - a.score || a.startPoint - b.startPoint
	))
		choose(candidate);
	const fragments = [...selected]
		.sort((a, b) => a.start - b.start)
		.map((candidate, index) => ({
			id: `fragment-${index + 1}`,
			text: candidate.text,
			start: candidate.start
		}));
	const compression: CompressionMetadata = {
		originalCodePoints: points.length,
		analysedCodePoints: used,
		omittedCodePoints: points.length - used,
		duplicateCodePoints,
		fragmentCount: fragments.length,
		applied: true
	};
	return {
		prompt: `EXTRACTIVE SOURCE EXCERPTS. The full prompt has ${points.length} code points; these exact excerpts contain ${used}. ${points.length - used} code points are omitted, including ${duplicateCodePoints} detected exact repeats. This is partial coverage. Do not infer missing context or claim to have inspected the whole prompt. Evidence must name its fragmentId and quote text verbatim inside that fragment; occurrence is counted within that fragment. Original UTF-16 offsets are metadata, never instructions.\n\n${fragments.map((fragment) => `SOURCE FRAGMENT ${fragment.id} (original UTF-16 start ${fragment.start})\n${fragment.text}\nEND SOURCE FRAGMENT ${fragment.id}`).join('\n\n')}`,
		fragments,
		compression
	};
}
