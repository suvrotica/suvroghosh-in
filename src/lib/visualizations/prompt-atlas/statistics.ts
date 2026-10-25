/** Counts the unmodified editor value. Evidence offsets deliberately use UTF-16 instead. */
export function countText(text: string) {
	const hasSegmenter = typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function';
	let characters = 0;
	let withoutWhitespace = 0;
	// Do not retain one SegmentData object per character/word for long documents.
	// ASCII has one grapheme per unit except CRLF, which is one grapheme.
	if (/^[\x00-\x7f]*$/.test(text)) {
		characters = text.length - (text.match(/\r\n/g)?.length ?? 0);
		withoutWhitespace = text.replace(/\s/g, '').length;
	} else {
		const graphemes = hasSegmenter
			? new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(text)
			: fallbackGraphemes(text);
		for (const item of graphemes) {
			const value = typeof item === 'string' ? item : item.segment;
			characters += 1;
			if (!/^\s+$/u.test(value)) withoutWhitespace += 1;
		}
	}
	let words = 0;
	if (hasSegmenter) {
		for (const item of new Intl.Segmenter('en', { granularity: 'word' }).segment(text))
			if (item.isWordLike) words += 1;
	} else words = (text.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) ?? []).length;
	return {
		characters,
		withoutWhitespace,
		words,
		lines: text.length ? text.split(/\r\n|\r|\n/).length : 0,
		codePoints: Array.from(text).length,
		codeUnits: text.length,
		bytes: new TextEncoder().encode(text).length
	};
}

/** Best-effort older-browser fallback: combining marks, joined emoji, flags and CRLF. */
function fallbackGraphemes(text: string): string[] {
	const clusters: string[] = [];
	let regionalRun = 0;
	for (const point of text) {
		const last = clusters.at(-1);
		const regional = /[\u{1f1e6}-\u{1f1ff}]/u.test(point);
		const continuation =
			last !== undefined &&
			(/[\p{M}\u{fe00}-\u{fe0f}\u{1f3fb}-\u{1f3ff}\u{e0020}-\u{e007f}]/u.test(point) ||
				point === '\u200d' ||
				last.endsWith('\u200d') ||
				(point === '\n' && last === '\r') ||
				(regional && regionalRun % 2 === 1));
		if (continuation) clusters[clusters.length - 1] += point;
		else clusters.push(point);
		regionalRun = regional ? regionalRun + 1 : 0;
	}
	return clusters;
}
