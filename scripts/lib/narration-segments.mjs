export const SEGMENTATION_POLICY = 'bounded-6000-v2';
export const LEGACY_SEGMENTATION_POLICY = 'bounded-1800-v1';
export const MAX_SEGMENT_CHARACTERS = 6000;
export const MAX_SEGMENT_UTF8_BYTES = 7000;
export const MAX_SEGMENT_WORDS = 900;

export function segmentWithinBounds(text) {
	return (
		typeof text === 'string' &&
		text.length <= MAX_SEGMENT_CHARACTERS &&
		Buffer.byteLength(text, 'utf8') <= MAX_SEGMENT_UTF8_BYTES &&
		(text.match(/\S+/gu)?.length ?? 0) <= MAX_SEGMENT_WORDS
	);
}

function completeCodePoint(text, end) {
	return /[\uD800-\uDBFF]/u.test(text[end - 1]) && /[\uDC00-\uDFFF]/u.test(text[end])
		? end - 1
		: end;
}

/** Contiguous UTF-16 ranges, bounded by characters, UTF-8 bytes and spoken-word count. */
export function segmentNarration(text, maximum = MAX_SEGMENT_CHARACTERS) {
	if (!Number.isInteger(maximum) || maximum < 16 || maximum > MAX_SEGMENT_CHARACTERS)
		throw new Error('Segment bound must be 16–6000 characters.');
	if (typeof text !== 'string') throw new Error('Narration must be text.');
	const segments = [];
	for (let start = 0; start < text.length; ) {
		let end = Math.min(text.length, start + maximum);
		if (Buffer.byteLength(text.slice(start, end), 'utf8') > MAX_SEGMENT_UTF8_BYTES) {
			let lower = start;
			let upper = end;
			while (lower < upper) {
				const middle = Math.ceil((lower + upper) / 2);
				if (Buffer.byteLength(text.slice(start, middle), 'utf8') <= MAX_SEGMENT_UTF8_BYTES)
					lower = middle;
				else upper = middle - 1;
			}
			end = completeCodePoint(text, lower);
		}
		let words = 0;
		for (const word of text.slice(start, end).matchAll(/\S+/gu)) {
			words += 1;
			if (words > MAX_SEGMENT_WORDS) {
				end = start + word.index;
				break;
			}
		}
		if (end < text.length) {
			const candidate = text.slice(start, end);
			const floor = Math.floor((maximum <= 1800 ? maximum : candidate.length) * 0.4);
			const paragraph = candidate.lastIndexOf('\n\n');
			const sentences = Array.from(candidate.matchAll(/[.!?।][”’"')\]]*\s+/gu));
			const last = sentences.at(-1);
			const sentence = last ? last.index + last[0].length : -1;
			const word = candidate.lastIndexOf(' ');
			const boundary =
				paragraph >= floor
					? paragraph + 2
					: sentence >= floor
						? sentence
						: word >= floor
							? word + 1
							: candidate.length;
			end = completeCodePoint(text, start + boundary);
		}
		const part = text.slice(start, end);
		if (!part.trim()) {
			const previous = segments.at(-1);
			if (
				!previous ||
				previous.text.length + part.length > maximum ||
				!segmentWithinBounds(previous.text + part)
			)
				throw new Error('Normalize oversized whitespace before segmenting narration.');
			previous.text += part;
			previous.textEnd = end;
		} else segments.push({ text: part, textStart: start, textEnd: end });
		start = end;
	}
	return segments;
}
