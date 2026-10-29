import { LIMITS, newId, sourceSchema } from './model';
import type { Evidence, SourceKind, StudioSource } from './types';

export interface TranscriptCue {
	markerStart: number;
	startTime: string;
	endTime?: string;
	start: number;
	end: number;
	text: string;
	locator: string;
}
export interface SourceSegment {
	id: string;
	title: string;
	evidence: Evidence;
}

/** Keep the original bytes-as-text: evidence offsets never refer to a cleaned transcript. */
export function ingestText(
	text: string,
	title = 'Untitled source',
	kind: SourceKind = 'text',
	url?: string
): StudioSource {
	if (!text.trim()) throw new Error('Paste source text or a transcript before creating a map.');
	if (text.length > LIMITS.sourceCharacters)
		throw new Error('Each source can contain up to 100,000 characters. Select a smaller excerpt.');
	if (/^https?:\/\/\S+$/i.test(text.trim()))
		throw new Error(
			'A link alone does not contain source evidence. Paste the article text or video transcript; no content has been retrieved.'
		);
	const result = sourceSchema.safeParse({
		id: newId('source'),
		title: title.trim() || 'Untitled source',
		kind,
		text,
		...(url?.trim() ? { url: url.trim() } : {})
	});
	if (!result.success) throw new Error(result.error.issues[0].message);
	return result.data;
}

/** SRT, WebVTT and [mm:ss]/hh:mm:ss transcript markers are retained as source locators. */
export function parseTranscriptCues(text: string): TranscriptCue[] {
	const stamp =
		/^(?:\[)?((?:\d{1,3}:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?)(?:\])?(?:\s*-->\s*((?:\d{1,3}:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?)[^\r\n]*)?[ \t]*(?:\r?\n|[ \t]+|$)/gm;
	const matches = [...text.matchAll(stamp)];
	return matches
		.map((match, index) => {
			const start = match.index! + match[0].length;
			let end = matches[index + 1]?.index ?? text.length;
			const trailingSequence = text.slice(start, end).match(/\r?\n\s*\d+\s*\r?\n$/);
			if (trailingSequence) end -= trailingSequence[0].length;
			while (end > start && /\s/.test(text[end - 1])) end--;
			return {
				markerStart: match.index!,
				startTime: match[1],
				...(match[2] ? { endTime: match[2] } : {}),
				start,
				end,
				text: text.slice(start, end),
				locator: match[2] ? `${match[1]}–${match[2]}` : match[1]
			};
		})
		.filter((cue) => cue.end > cue.start);
}

function rangesWithin(
	text: string,
	start: number,
	end: number
): Array<{ start: number; end: number }> {
	const ranges: Array<{ start: number; end: number }> = [];
	let cursor = start;
	while (cursor < end) {
		while (cursor < end && /\s/.test(text[cursor])) cursor++;
		if (cursor === end) break;
		let stop = Math.min(cursor + LIMITS.quoteCharacters, end);
		if (stop < end) {
			const boundary = text.lastIndexOf(' ', stop);
			if (boundary > cursor + 500) stop = boundary;
			if (/[\uD800-\uDBFF]/.test(text[stop - 1])) stop--;
		}
		while (stop > cursor && /\s/.test(text[stop - 1])) stop--;
		ranges.push({ start: cursor, end: stop });
		cursor = stop;
	}
	return ranges;
}

export function segmentSource(source: StudioSource): SourceSegment[] {
	const cues = source.kind === 'transcript' ? parseTranscriptCues(source.text) : [];
	const preface = cues.length
		? [...source.text.slice(0, cues[0].markerStart).matchAll(/\S[^\r\n]*/g)]
				.filter((match) => !/^(?:\d+|WEBVTT(?: .*)?|Kind:.*|Language:.*)$/i.test(match[0].trim()))
				.map((match) => ({
					start: match.index!,
					end: match.index! + match[0].length,
					locator: 'Transcript preface (before timestamped captions)'
				}))
		: [];
	const pageMarkers =
		source.kind === 'pdf'
			? [...source.text.matchAll(/^\[PDF page (\d+)\][ \t]*(?:\r?\n|$)/gm)]
			: [];
	const raw: Array<{ start: number; end: number; locator: string }> = cues.length
		? [...preface, ...cues.map((cue) => ({ start: cue.start, end: cue.end, locator: cue.locator }))]
		: [...source.text.matchAll(/\S[^\r\n]*(?:(?:\r?\n)(?![ \t]*\r?\n)[^\r\n]*)*/g)].map(
				(match, index) => ({
					start: match.index!,
					end: match.index! + match[0].length,
					locator: `Paragraph ${index + 1}`
				})
			);
	return raw.flatMap((originalRange) => {
		const range = { ...originalRange };
		if (pageMarkers.length) {
			const marker = pageMarkers.filter((item) => item.index! <= range.start).at(-1);
			if (marker) {
				range.locator = `PDF page ${marker[1]} (physical page)`;
				if (marker.index === range.start) range.start += marker[0].length;
			}
			if (source.text.slice(range.start, range.end).trim() === '[No extractable text on this page]')
				return [];
		}
		return rangesWithin(source.text, range.start, range.end).map((part) => {
			const quote = source.text.slice(part.start, part.end);
			return {
				id: `${source.id}-${part.start}`,
				title: quote
					.replace(/^#+\s*/, '')
					.split(/[\r\n]/)[0]
					.slice(0, 100),
				evidence: { sourceId: source.id, ...part, quote, locator: range.locator }
			};
		});
	});
}
