/** Counts the unmodified editor value. Evidence offsets deliberately use UTF-16 instead. */
export function countText(text: string) {
	const hasSegmenter = typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function';
	const graphemes = hasSegmenter
		? Array.from(
				new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(text),
				(item) => item.segment
			)
		: fallbackGraphemes(text);
	const words = hasSegmenter
		? Array.from(new Intl.Segmenter('en', { granularity: 'word' }).segment(text)).filter(
				(item) => item.isWordLike
			).length
		: (text.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) ?? []).length;
	return {
		characters: graphemes.length,
		withoutWhitespace: graphemes.filter((value) => !/^\s+$/u.test(value)).length,
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
