import {
	ANALYSIS_VERSION,
	MORPHOLOGY_VERSION,
	MAX_INPUT_LENGTH,
	MAX_PARAGRAPHS,
	MAX_SENTENCES,
	LONG_SENTENCE_WORDS,
	type AnalyzeOptions,
	type EssayCitation,
	type EssayDocument,
	type EssayParagraph,
	type EssaySentence,
	type WordCluster,
	type WordOccurrence
} from './types.ts';

/** These rules intentionally describe a small, safe prose subset, not a Svelte compiler. */
export const ANALYSIS_RULES = {
	paragraphs:
		'Prose paragraphs, block quotations and list items count. Headings label the next blocks; code, HTML/component blocks and footnote definitions do not count.',
	words:
		'Unicode letter/number runs with internal apostrophes or hyphens. Displayed Markdown link labels count; destinations, bare URLs and inline code do not.',
	nesting:
		'English only: maximum parentheses/brackets depth plus one for a subordinate connective, plus one when three or more occur; capped at six. This is an estimate, not a syntactic parse.',
	clusters:
		'Exact case-folded Unicode tokens of at least three letters, occurring twice or more, after English/Bengali stop-word filtering. The eight most frequent are shown; ties use code-point order.',
	citations:
		'Only explicit Markdown footnote references with definitions, or reference-style links whose identifier begins cite: or ref:, create citation struts. Other links are not citations.',
	longSentences: `More than ${LONG_SENTENCE_WORDS} words; the same threshold applies to every specimen.`
} as const;

const STOP_WORDS = new Set(
	'a an the and or but if then than so as at by for from in into of on onto to up upon with without through during over under is am are was were be being been have has had do does did can could should would will may might must shall it its itself this that these those there here they them their theirs we us our ours you your yours he him his she her hers i me my mine who whom whose which what when where why how not no nor yes all any each every either neither some more most much many few such same other another also just very still only even already too about after before between both once again out own get got well said says say one two new now really quite'.split(
		' '
	)
);
for (const word of [
	'এই',
	'ওই',
	'সেই',
	'এক',
	'করে',
	'করা',
	'কিন্তু',
	'এবং',
	'আর',
	'বা',
	'তার',
	'তাদের',
	'আমি',
	'আমার',
	'সে',
	'হয়',
	'হবে',
	'থেকে',
	'জন্য',
	'সঙ্গে',
	'যে',
	'না',
	'কি',
	'সব',
	'হল',
	'ছিল'
])
	STOP_WORDS.add(word);

const ABBREVIATIONS = new Set([
	'dr',
	'mr',
	'mrs',
	'ms',
	'prof',
	'sr',
	'jr',
	'st',
	'vs',
	'etc',
	'e.g',
	'i.e',
	'fig',
	'no',
	'rs',
	'dept',
	'inc',
	'approx',
	'vol',
	'pp',
	'p'
]);
const WORD_PATTERN = /[\p{L}\p{N}][\p{L}\p{M}\p{N}]*(?:['’\-][\p{L}\p{N}][\p{L}\p{M}\p{N}]*)*/gu;
interface SourceLine {
	text: string;
	start: number;
	end: number;
}
interface Block {
	text: string;
	start: number;
	end: number;
	kind: EssayParagraph['kind'];
	heading?: string;
}
interface PendingReference {
	label: string;
	target: string;
	at: number;
}
interface InlineResult {
	text: string;
	references: PendingReference[];
}

/** Browser-safe synchronous SHA-256, used for deterministic content identity, not authentication. */
export function contentHash(text: string): string {
	const bytes = new TextEncoder().encode(text);
	const length = Math.ceil((bytes.length + 9) / 64) * 64;
	const data = new Uint8Array(length);
	data.set(bytes);
	data[bytes.length] = 0x80;
	const view = new DataView(data.buffer);
	view.setUint32(length - 4, bytes.length * 8);
	const k = [
		0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
		0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
		0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
		0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
		0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
		0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
		0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
		0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
	];
	const h = [
		0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
	];
	const rotate = (x: number, n: number) => (x >>> n) | (x << (32 - n));
	for (let offset = 0; offset < length; offset += 64) {
		const w = new Int32Array(64);
		for (let i = 0; i < 16; i++) w[i] = view.getInt32(offset + i * 4);
		for (let i = 16; i < 64; i++) {
			const a = w[i - 15],
				b = w[i - 2];
			w[i] =
				(rotate(a, 7) ^ rotate(a, 18) ^ (a >>> 3)) +
				w[i - 16] +
				(rotate(b, 17) ^ rotate(b, 19) ^ (b >>> 10)) +
				w[i - 7];
		}
		let [a, b, c, d, e, f, g, j] = h;
		for (let i = 0; i < 64; i++) {
			const t1 =
				j + (rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25)) + ((e & f) ^ (~e & g)) + k[i] + w[i];
			const t2 = (rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22)) + ((a & b) ^ (a & c) ^ (b & c));
			j = g;
			g = f;
			f = e;
			e = (d + t1) | 0;
			d = c;
			c = b;
			b = a;
			a = (t1 + t2) | 0;
		}
		[a, b, c, d, e, f, g, j].forEach((value, i) => {
			h[i] = (h[i] + value) | 0;
		});
	}
	return h.map((value) => (value >>> 0).toString(16).padStart(8, '0')).join('');
}

function sourceLines(source: string): SourceLine[] {
	const lines: SourceLine[] = [];
	let start = 0;
	while (start < source.length) {
		const newline = source.indexOf('\n', start);
		const end = newline < 0 ? source.length : newline + 1;
		lines.push({ text: source.slice(start, end).replace(/\r?\n$/, ''), start, end });
		start = end;
	}
	return lines;
}

/** Balanced delimiters allow nested labels and parenthesised Markdown destinations. */
function closing(text: string, start: number, open: string, close: string): number {
	let depth = 1;
	for (let i = start + 1; i < text.length; i++) {
		if (text[i] === '\\') {
			i++;
			continue;
		}
		if (text[i] === open) depth++;
		if (text[i] === close && --depth === 0) return i;
	}
	return -1;
}

function inlineText(input: string, definitions: Map<string, string>, depth = 0): InlineResult {
	if (depth > 12) return { text: input, references: [] };
	let text = '';
	const references: PendingReference[] = [];
	for (let i = 0; i < input.length; ) {
		const char = input[i];
		if (char === '\\' && i + 1 < input.length) {
			text += input[i + 1];
			i += 2;
			continue;
		}
		if (char === '`') {
			let count = 1;
			while (input[i + count] === '`') count++;
			const end = input.indexOf('`'.repeat(count), i + count);
			if (end >= 0) {
				text += ' ';
				i = end + count;
				continue;
			}
		}
		if (
			input.startsWith('http://', i) ||
			input.startsWith('https://', i) ||
			input.startsWith('www.', i)
		) {
			const start = i;
			while (i < input.length && !/\s/.test(input[i])) i++;
			text += input.slice(start, i).match(/[.,;:!?]+$/)?.[0] ?? '';
			continue;
		}
		if (char === '<') {
			const end = input.indexOf('>', i + 1);
			if (end >= 0) {
				i = end + 1;
				continue;
			}
		}
		const image = char === '!' && input[i + 1] === '[';
		const bracket = image ? i + 1 : i;
		if (input[bracket] === '[') {
			const end = closing(input, bracket, '[', ']');
			if (end >= 0) {
				const label = input.slice(bracket + 1, end);
				if (label.startsWith('^')) {
					const target = definitions.get(label.toLowerCase());
					if (target) {
						references.push({ label: label.slice(1), target, at: text.length });
						i = end + 1;
						continue;
					}
				}
				let after = end + 1;
				let reference = '';
				let validLink = false;
				if (input[after] === '(') {
					const targetEnd = closing(input, after, '(', ')');
					if (targetEnd >= 0) {
						after = targetEnd + 1;
						validLink = true;
					}
				} else if (input[after] === '[') {
					const targetEnd = closing(input, after, '[', ']');
					if (targetEnd >= 0) {
						reference = input.slice(after + 1, targetEnd) || label;
						if (definitions.has(reference.toLowerCase())) {
							after = targetEnd + 1;
							validLink = true;
						}
					}
				} else if (definitions.has(label.toLowerCase())) {
					reference = label;
					validLink = true;
				}
				if (!validLink) {
					text += char;
					i++;
					continue;
				}
				const inner = inlineText(label, definitions, depth + 1);
				if (!image) {
					const offset = text.length;
					text += inner.text;
					references.push(...inner.references.map((ref) => ({ ...ref, at: ref.at + offset })));
					if (/^(?:cite|ref):/i.test(reference)) {
						const target = definitions.get(reference.toLowerCase());
						if (target) references.push({ label: reference, target, at: offset });
					}
				}
				i = after;
				continue;
			}
		}
		if (char === '*' || char === '_' || input.startsWith('~~', i)) {
			let run = 1;
			while (input[i + run] === char) run++;
			const delimiter = char.repeat(run);
			const before = input[i - 1] ?? '';
			const after = input[i + run] ?? '';
			const intraword = char === '_' && /[\p{L}\p{N}]/u.test(before) && /[\p{L}\p{N}]/u.test(after);
			let end = !after || /\s/.test(after) || intraword ? -1 : input.indexOf(delimiter, i + run);
			while (
				end >= 0 &&
				(input[end - 1] === '\\' ||
					/\s/.test(input[end - 1]) ||
					(char === '_' && /[\p{L}\p{N}]/u.test(input[end + run] ?? '')))
			)
				end = input.indexOf(delimiter, end + run);
			if (end >= 0) {
				const inner = inlineText(input.slice(i + run, end), definitions, depth + 1);
				const offset = text.length;
				text += inner.text;
				references.push(
					...inner.references.map((reference) => ({ ...reference, at: reference.at + offset }))
				);
				i = end + run;
				continue;
			}
			text += delimiter;
			i += run;
			continue;
		}
		if (char === '&') {
			const entity = input
				.slice(i)
				.match(/^&(?:amp|lt|gt|quot|apos|nbsp|#\d{1,6}|#x[0-9a-f]{1,6});/i)?.[0];
			if (entity) {
				const named: Record<string, string> = {
					'&amp;': '&',
					'&lt;': '<',
					'&gt;': '>',
					'&quot;': '"',
					'&apos;': "'",
					'&nbsp;': ' '
				};
				const numeric = entity.startsWith('&#')
					? parseInt(
							entity.slice(entity[2].toLowerCase() === 'x' ? 3 : 2, -1),
							entity[2].toLowerCase() === 'x' ? 16 : 10
						)
					: 0;
				text +=
					named[entity.toLowerCase()] ??
					(numeric > 0 && numeric <= 0x10ffff ? String.fromCodePoint(numeric) : '�');
				i += entity.length;
				continue;
			}
		}
		text += char === '\n' || char === '\r' ? ' ' : char;
		i++;
	}
	// Keep whitespace as displayed so sentence and occurrence positions never drift.
	return { text, references };
}

function markdownBlocks(source: string): {
	blocks: Block[];
	definitions: Map<string, string>;
	warnings: string[];
} {
	const lines = sourceLines(source);
	const definitions = new Map<string, string>();
	const blocks: Block[] = [];
	const warnings: string[] = [];
	let heading: string | undefined;
	let fence = '';
	let htmlTag = '';
	let footnoteContinuation = false;
	let current: Block | undefined;
	const flush = () => {
		if (current) blocks.push(current);
		current = undefined;
	};
	let startLine = 0;
	if (lines[0]?.text.replace(/^\uFEFF/, '').trim() === '---') {
		const end = lines.findIndex((line, i) => i > 0 && /^(---|\.\.\.)\s*$/.test(line.text));
		startLine = end < 0 ? lines.length : end + 1;
		if (end < 0) warnings.push('Unclosed front matter: no prose was analysed.');
	}
	for (let i = startLine; i < lines.length; i++) {
		const line = lines[i];
		const trimmed = line.text.trim();
		if (fence) {
			if (new RegExp(`^${fence[0]}{${fence.length},}\\s*$`).test(trimmed)) fence = '';
			continue;
		}
		const openingFence = trimmed.match(/^(`{3,}|~{3,})/);
		if (openingFence) {
			flush();
			fence = openingFence[1];
			continue;
		}
		if (htmlTag) {
			if (
				htmlTag === '!--'
					? trimmed.includes('-->')
					: new RegExp(`</${htmlTag}\\s*>`, 'i').test(trimmed)
			)
				htmlTag = '';
			continue;
		}
		if (!trimmed) {
			flush();
			footnoteContinuation = false;
			continue;
		}
		const definition = line.text.match(/^ {0,3}\[([^\]]+)\]:\s*(.*)$/);
		if (definition) {
			flush();
			definitions.set(definition[1].toLowerCase(), definition[2]);
			footnoteContinuation = definition[1].startsWith('^');
			continue;
		}
		if (footnoteContinuation && /^( {2,}|\t)/.test(line.text)) continue;
		footnoteContinuation = false;
		if (/^(?: {4}|\t)/.test(line.text)) {
			flush();
			continue;
		}
		if (/^(?:import|export)\s/.test(trimmed)) {
			flush();
			continue;
		}
		if (/^<!--/.test(trimmed)) {
			flush();
			if (!trimmed.includes('-->')) htmlTag = '!--';
			continue;
		}
		const html = trimmed.match(/^<([A-Za-z][\w:.-]*)\b/);
		if (html) {
			flush();
			if (
				!trimmed.endsWith('/>') &&
				!new RegExp(`</${html[1]}\\s*>`, 'i').test(trimmed) &&
				!/^(?:img|br|hr|input|meta|link)$/i.test(html[1])
			)
				htmlTag = html[1];
			continue;
		}
		if (/^<\/|^\{[#:/@]/.test(trimmed)) {
			flush();
			continue;
		}
		const headingMatch = trimmed.match(/^#{1,6}\s+(.*?)(?:\s+#+)?$/);
		if (headingMatch) {
			flush();
			heading = inlineText(headingMatch[1], definitions).text;
			continue;
		}
		if (/^(?:={3,}|-{3,})$/.test(trimmed) && current) {
			heading = current.text;
			current = undefined;
			continue;
		}
		if (/^(?:\*\s*){3,}$|^(?:-\s*){3,}$|^(?:_\s*){3,}$/.test(trimmed)) {
			flush();
			continue;
		}
		const quote = line.text.match(/^\s*>\s?(.*)$/);
		const list = line.text.match(/^\s*(?:[-+*]|\d+[.)])\s+(.*)$/);
		const continuation = !quote && !list && current?.kind === 'list' && /^\s{2,}/.test(line.text);
		const kind: Block['kind'] = quote ? 'quote' : list || continuation ? 'list' : 'paragraph';
		const prose = quote?.[1] ?? list?.[1] ?? trimmed;
		if (list || (current && current.kind !== kind)) flush();
		if (!current) current = { text: prose, start: line.start, end: line.end, kind, heading };
		else {
			current.text += '\n' + prose;
			current.end = line.end;
		}
	}
	flush();
	if (fence) warnings.push('An unclosed code fence was excluded from the analysis.');
	if (htmlTag) warnings.push('An unclosed HTML/component block was excluded from the analysis.');
	return { blocks, definitions, warnings };
}

function urlRanges(text: string): Array<[number, number]> {
	return [...text.matchAll(/\b(?:https?:\/\/|www\.)[^\s<>]+/gu)].map((match) => [
		match.index!,
		match.index! + match[0].replace(/[.,;:!?]+$/, '').length
	]);
}

function wordMatches(text: string): RegExpMatchArray[] {
	const urls = urlRanges(text);
	let urlIndex = 0;
	return [...text.matchAll(WORD_PATTERN)].filter((match) => {
		while (urlIndex < urls.length && match.index! >= urls[urlIndex][1]) urlIndex++;
		return !urls[urlIndex] || match.index! < urls[urlIndex][0];
	});
}

export function countWords(text: string): number {
	return wordMatches(text).length;
}

function sentenceRanges(text: string): Array<[number, number]> {
	const result: Array<[number, number]> = [];
	const urls = urlRanges(text);
	let urlIndex = 0;
	let start = 0;
	const append = (end: number) => {
		while (start < end && /\s/.test(text[start])) start++;
		while (end > start && /\s/.test(text[end - 1])) end--;
		if (end > start) result.push([start, end]);
		start = end;
	};
	for (let i = 0; i < text.length; i++) {
		while (urlIndex < urls.length && i >= urls[urlIndex][1]) urlIndex++;
		if (urls[urlIndex] && i >= urls[urlIndex][0]) {
			i = urls[urlIndex][1] - 1;
			continue;
		}
		if (!/[.!?…।॥]/.test(text[i])) continue;
		const char = text[i];
		if (char === '.' && /\d/.test(text[i - 1] ?? '') && /\d/.test(text[i + 1] ?? '')) continue;
		let end = i + 1;
		while (end < text.length && /[.!?…।॥]/.test(text[end])) end++;
		while (end < text.length && /["'’”»\])}]/.test(text[end])) end++;
		if (end < text.length && !/\s/.test(text[end])) continue;
		const word = text.slice(Math.max(start, i - 32), i).match(/([\p{L}.]+)$/u)?.[1] ?? '';
		const next = text.slice(end).trimStart();
		if (
			/["’”»]/.test(text.slice(i + 1, end)) &&
			/^(?:he|she|they|I|we|you)\s+(?:said|asked|replied|whispered|shouted|murmured|answered)\b/.test(
				next
			)
		)
			continue;
		if (char === '.' && ABBREVIATIONS.has(word.toLowerCase()) && next) continue;
		if (char === '.' && /^[A-Z]$/.test(word) && /^[A-Z\p{L}]/u.test(next)) continue;
		if ((text.slice(i, end).includes('..') || char === '…') && /^\p{Ll}/u.test(next)) {
			i = end - 1;
			continue;
		}
		append(end);
		i = end - 1;
	}
	append(text.length);
	return result;
}

function nestingEstimate(text: string): number {
	let depth = 0,
		maximum = 0;
	for (const char of text) {
		if ('([{'.includes(char)) {
			depth++;
			maximum = Math.max(maximum, depth);
		}
		if (')]}'.includes(char)) depth = Math.max(0, depth - 1);
	}
	const subordinates =
		text.match(
			/\b(?:although|because|whereas|unless|until|while|whenever|wherever|whether|which|whose|that)\b/gi
		)?.length ?? 0;
	return Math.min(6, maximum + (subordinates > 0 ? 1 : 0) + (subordinates >= 3 ? 1 : 0));
}

export function analyzeEssay(source: string, options: AnalyzeOptions = {}): EssayDocument {
	if (typeof source !== 'string') throw new Error('Supply text to grow a specimen.');
	if (source.length > MAX_INPUT_LENGTH)
		throw new Error(
			`Use at most ${MAX_INPUT_LENGTH.toLocaleString('en-GB')} characters. This specimen has ${source.length.toLocaleString('en-GB')}.`
		);
	if (!source.trim()) throw new Error('Add a paragraph of writing to grow a specimen.');
	const hash = contentHash(source);
	const id = (options.id ?? `local-${hash.slice(0, 10)}`)
		.replace(/[^a-zA-Z0-9_-]/g, '-')
		.slice(0, 100);
	const parsed =
		options.format === 'markdown'
			? markdownBlocks(source)
			: {
					blocks: sourceLines(source).reduce<Block[]>((blocks, line) => {
						if (!line.text.trim()) return blocks;
						const previous = blocks[blocks.length - 1];
						if (previous && !/\r?\n\s*\r?\n/.test(source.slice(previous.end - 1, line.start))) {
							previous.text += '\n' + line.text;
							previous.end = line.end;
						} else
							blocks.push({ text: line.text, start: line.start, end: line.end, kind: 'paragraph' });
						return blocks;
					}, []),
					definitions: new Map<string, string>(),
					warnings: [] as string[]
				};
	const texts = parsed.blocks.map((block) =>
		options.format === 'markdown'
			? inlineText(block.text, parsed.definitions)
			: { text: block.text.replace(/\r?\n/g, ' '), references: [] as PendingReference[] }
	);
	const combined = texts.map((value) => value.text).join(' ');
	const bengali = (combined.match(/\p{Script=Bengali}/gu) ?? []).length;
	const latin = (combined.match(/\p{Script=Latin}/gu) ?? []).length;
	const language: EssayDocument['language'] =
		bengali > 0 ? (latin > 0 ? 'mixed' : 'bn') : latin > 0 ? 'en' : 'other';
	const supportedNesting = language === 'en';
	const paragraphs: EssayParagraph[] = [];
	const citations: EssayCitation[] = [];
	let sentenceCount = 0;
	for (let blockIndex = 0; blockIndex < parsed.blocks.length; blockIndex++) {
		const block = parsed.blocks[blockIndex];
		const value = texts[blockIndex];
		if (!countWords(value.text)) continue;
		if (paragraphs.length >= MAX_PARAGRAPHS)
			throw new Error(
				`Use at most ${MAX_PARAGRAPHS.toLocaleString('en-GB')} paragraphs. Split this text into smaller specimens.`
			);
		const index = paragraphs.length;
		const paragraphId = `${id}-p${index + 1}`;
		const ranges = sentenceRanges(value.text);
		sentenceCount += ranges.length;
		if (sentenceCount > MAX_SENTENCES)
			throw new Error(
				`Use at most ${MAX_SENTENCES.toLocaleString('en-GB')} sentences. Split this text into smaller specimens.`
			);
		const sentences: EssaySentence[] = ranges.map(([start, end], sentenceIndex) => {
			const text = value.text.slice(start, end);
			return {
				id: `${paragraphId}-s${sentenceIndex + 1}`,
				paragraphId,
				text,
				start,
				end,
				wordCount: countWords(text),
				nesting: supportedNesting ? nestingEstimate(text) : null,
				punctuation: text.match(/[,;:.!?—–()[\]{}…।॥]/gu) ?? []
			};
		});
		paragraphs.push({
			id: paragraphId,
			index,
			kind: block.kind,
			heading: block.heading,
			text: value.text,
			sourceStart: block.start,
			sourceEnd: block.end,
			wordCount: countWords(value.text),
			sentences
		});
		for (const reference of value.references) {
			const sentence =
				sentences.find((item) => reference.at <= item.end) ?? sentences[sentences.length - 1];
			if (sentence)
				citations.push({
					id: `${paragraphId}-c${citations.length + 1}`,
					paragraphId,
					sentenceId: sentence.id,
					label: reference.label,
					target: reference.target
				});
		}
	}
	if (!paragraphs.length)
		throw new Error(
			'No prose was found. Add ordinary paragraphs outside code, front matter, or component blocks.'
		);
	const occurrences = new Map<string, WordOccurrence[]>();
	for (const paragraph of paragraphs) {
		let sentenceIndex = 0;
		for (const match of wordMatches(paragraph.text)) {
			const word = match[0].normalize('NFC').toLocaleLowerCase('en-GB');
			if ([...word].length < 3 || STOP_WORDS.has(word) || !/\p{L}/u.test(word)) continue;
			const start = match.index!;
			while (
				sentenceIndex < paragraph.sentences.length - 1 &&
				start >= paragraph.sentences[sentenceIndex].end
			)
				sentenceIndex++;
			const sentence = paragraph.sentences[sentenceIndex];
			if (!sentence) continue;
			const list = occurrences.get(word) ?? [];
			list.push({
				paragraphId: paragraph.id,
				sentenceId: sentence.id,
				start,
				end: start + match[0].length
			});
			occurrences.set(word, list);
		}
	}
	const allClusters: WordCluster[] = [...occurrences.entries()]
		.filter(([, value]) => value.length > 1)
		.map(([word, value]) => ({ word, count: value.length, occurrences: value }))
		.sort((a, b) => b.count - a.count || (a.word < b.word ? -1 : a.word > b.word ? 1 : 0));
	const sentences = paragraphs.flatMap((paragraph) => paragraph.sentences);
	const lengths = sentences.map((sentence) => sentence.wordCount).sort((a, b) => a - b);
	const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
	const middle = Math.floor(lengths.length / 2);
	const medianSentence =
		lengths.length % 2 ? lengths[middle] : (lengths[middle - 1] + lengths[middle]) / 2;
	const warnings = [...parsed.warnings];
	if (!supportedNesting)
		warnings.push(
			'Estimated nesting is available for English prose only; this specimen retains words, sentences, punctuation and repetition.'
		);
	return {
		schemaVersion: 1,
		analysisVersion: ANALYSIS_VERSION,
		morphologyVersion: MORPHOLOGY_VERSION,
		id,
		title: options.title?.trim().slice(0, 240) || 'An unnamed essay',
		author: options.author?.trim().slice(0, 120) || 'Your writing',
		...(options.canonicalUrl ? { canonicalUrl: options.canonicalUrl } : {}),
		contentHash: hash,
		language,
		paragraphs,
		citations,
		clusters: allClusters.slice(0, 8),
		omittedClusters: Math.max(0, allClusters.length - 8),
		warnings,
		measurements: {
			words: paragraphs.reduce((sum, paragraph) => sum + paragraph.wordCount, 0),
			paragraphs: paragraphs.length,
			sentences: sentences.length,
			medianSentence,
			longestSentence: Math.max(...lengths),
			sentenceVariation:
				Math.round(
					Math.sqrt(lengths.reduce((sum, value) => sum + (value - mean) ** 2, 0) / lengths.length) *
						10
				) / 10,
			estimatedNesting: supportedNesting
				? Math.max(...sentences.map((sentence) => sentence.nesting ?? 0))
				: null,
			citations: citations.length,
			longSentences: sentences.filter((sentence) => sentence.wordCount > LONG_SENTENCE_WORDS).length
		}
	};
}
