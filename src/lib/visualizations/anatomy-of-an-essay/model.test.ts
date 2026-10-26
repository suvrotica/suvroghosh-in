import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { analyzeEssay, contentHash } from './model';
import { MAX_INPUT_LENGTH, MAX_PARAGRAPHS, MAX_SENTENCES } from './types';

describe('essay source model', () => {
	it('uses reproducible SHA-256 and reproducible IDs without rewriting the source', () => {
		const source = 'A strange organ. Another organ, patiently waiting.\r\n\r\nA second room.';
		expect(contentHash(source)).toBe(createHash('sha256').update(source).digest('hex'));
		const first = analyzeEssay(source, { id: 'specimen' });
		expect(analyzeEssay(source, { id: 'specimen' })).toEqual(first);
		expect(first.paragraphs).toHaveLength(2);
		for (const paragraph of first.paragraphs) {
			expect(source.slice(paragraph.sourceStart, paragraph.sourceEnd).trim()).toBe(paragraph.text);
			for (const sentence of paragraph.sentences) {
				expect(paragraph.text.slice(sentence.start, sentence.end)).toBe(sentence.text);
			}
		}
	});

	it('excludes structural Markdown rather than counting metadata, code or components as prose', () => {
		const source = [
			'---',
			'title: Secret metadata',
			'---',
			'<script>',
			"import X from 'elsewhere';",
			'</script>',
			'',
			'# A heading',
			'',
			'An **actual** [organ](https://example.com/body) has `code words` inside.',
			'',
			'```typescript',
			'const hidden = "many words";',
			'```',
			'',
			'<Widget title="also hidden" />',
			'',
			'> A quoted sentence.',
			'',
			'- A list item.',
			'  Its continuation.',
			'',
			'    indented code stays excluded'
		].join('\n');
		const model = analyzeEssay(source, { format: 'markdown' });
		expect(model.paragraphs.map((item) => item.kind)).toEqual(['paragraph', 'quote', 'list']);
		expect(model.paragraphs[0].heading).toBe('A heading');
		expect(model.paragraphs[0].text).toBe('An actual organ has   inside.');
		expect(model.paragraphs[2].text).toBe('A list item. Its continuation.');
		expect(model.measurements.words).toBe(13);
		expect(model.citations).toHaveLength(0);
	});

	it('keeps emphasis, nested link labels, entities and Unicode readable with exact display offsets', () => {
		const model = analyzeEssay(
			'A *small* [nested [label]](https://example.com/a_(b)) &amp; an _organ_. Café’s river—quiet, strange.',
			{ format: 'markdown' }
		);
		expect(model.paragraphs[0].text).toBe(
			'A small nested [label] & an organ. Café’s river—quiet, strange.'
		);
		expect(model.paragraphs[0].sentences.map((value) => value.text)).toEqual([
			'A small nested [label] & an organ.',
			'Café’s river—quiet, strange.'
		]);
	});

	it('preserves literal brackets, intraword underscores and unpaired emphasis marks', () => {
		const source =
			'The wild_card [as noted] comes back. A literal * symbol and an unmatched ** stay. [^missing] remains visible.';
		const model = analyzeEssay(source, { format: 'markdown' });
		expect(model.paragraphs[0].text).toBe(source);
		expect(model.paragraphs[0].sentences[0].nesting).toBe(1);
		expect(model.citations).toHaveLength(0);
	});

	it('removes paired emphasis while retaining literal nested brackets inside link labels', () => {
		const model = analyzeEssay(
			'An **important _inner_ word** and ~~old words~~ follow [a [bracketed] label](https://example.com).',
			{ format: 'markdown' }
		);
		expect(model.paragraphs[0].text).toBe(
			'An important inner word and old words follow a [bracketed] label.'
		);
	});

	it('separates explicit footnotes and citation references from ordinary links', () => {
		const model = analyzeEssay(
			'The claim needs support.[^1] A [source][cite:ware] explains it. An [ordinary](https://example.com) link.\n\n[^1]: A footnote definition.\n\n[cite:ware]: https://example.com/book\n\n[ordinary]: https://example.com',
			{ format: 'markdown' }
		);
		expect(model.citations).toHaveLength(2);
		expect(model.citations[0]).toMatchObject({
			label: '1',
			sentenceId: model.paragraphs[0].sentences[0].id,
			target: 'A footnote definition.'
		});
		expect(model.citations[1].target).toBe('https://example.com/book');
		expect(model.paragraphs[0].text).toBe(
			'The claim needs support. A source explains it. An ordinary link.'
		);
		expect(model.measurements.citations).toBe(2);
	});

	it('does not break initials, common abbreviations or decimals into false sentences', () => {
		const model = analyzeEssay(
			'Dr. A. K. Sen paid Rs. 4.50 for tea. “Wait... really?” he asked. It worked!'
		);
		expect(model.paragraphs[0].sentences.map((value) => value.text)).toEqual([
			'Dr. A. K. Sen paid Rs. 4.50 for tea.',
			'“Wait... really?” he asked.',
			'It worked!'
		]);
	});

	it('keeps pasted URLs visible while excluding their words and internal dots from measurements', () => {
		const model = analyzeEssay('See https://example.com/a.page. The river waits.');
		expect(model.paragraphs[0].text).toBe('See https://example.com/a.page. The river waits.');
		expect(model.measurements.words).toBe(4);
		expect(model.paragraphs[0].sentences.map((value) => value.text)).toEqual([
			'See https://example.com/a.page.',
			'The river waits.'
		]);
	});

	it('retains literal pasted markup as inert text rather than interpreting it as Markdown', () => {
		const source = '<script>alert("hello")</script> **Literal words** [link](javascript:alert(1)).';
		const model = analyzeEssay(source, { format: 'text' });
		expect(model.paragraphs[0].text).toBe(source);
		expect(model.citations).toHaveLength(0);
		expect(model.paragraphs[0].sourceStart).toBe(0);
		expect(model.paragraphs[0].sourceEnd).toBe(source.length);
	});

	it('keeps mixed Bengali prose measurable while withholding unsupported nesting', () => {
		const model = analyzeEssay(
			'আমি নদীর কাছে যাই। নদীর আলো দেখি।\n\nThe river waits (because rain returns).'
		);
		expect(model.language).toBe('mixed');
		expect(model.paragraphs).toHaveLength(2);
		expect(model.paragraphs[0].sentences).toHaveLength(2);
		expect(model.measurements.estimatedNesting).toBeNull();
		expect(model.paragraphs.flatMap((p) => p.sentences).every((s) => s.nesting === null)).toBe(
			true
		);
		expect(model.clusters.some((cluster) => cluster.word === 'নদীর' && cluster.count === 2)).toBe(
			true
		);
	});

	it('bounds recurring clusters while retaining exact occurrence ranges', () => {
		const source = 'amber birch cedar delta ember forest garden harbour island jasmine. '.repeat(3);
		const model = analyzeEssay(source);
		expect(model.clusters).toHaveLength(8);
		expect(model.omittedClusters).toBe(2);
		for (const cluster of model.clusters) {
			expect(cluster.count).toBe(3);
			for (const occurrence of cluster.occurrences) {
				const paragraph = model.paragraphs.find((p) => p.id === occurrence.paragraphId)!;
				expect(paragraph.text.slice(occurrence.start, occurrence.end).toLowerCase()).toBe(
					cluster.word
				);
				expect(paragraph.sentences.some((s) => s.id === occurrence.sentenceId)).toBe(true);
			}
		}
	});

	it('uses one long-sentence threshold and truthful medians and standard deviation', () => {
		const model = analyzeEssay('One two. Three four five six. ' + 'word '.repeat(46) + '.');
		expect(model.measurements.sentences).toBe(3);
		expect(model.measurements.words).toBe(52);
		expect(model.measurements.medianSentence).toBe(4);
		expect(model.measurements.longestSentence).toBe(46);
		expect(model.measurements.longSentences).toBe(1);
		expect(model.measurements.sentenceVariation).toBeGreaterThan(20);
	});

	it('rejects empty, non-prose and oversized input with actionable errors', () => {
		expect(() => analyzeEssay(' \n\t ')).toThrow(/Add a paragraph/);
		expect(() => analyzeEssay('x'.repeat(MAX_INPUT_LENGTH + 1))).toThrow(/at most 60,000/);
		expect(() =>
			analyzeEssay('---\ntitle: no prose\n---\n```js\nhello()\n```', { format: 'markdown' })
		).toThrow(/No prose/);
	});

	it('handles unclosed code and components predictably without interpreting their contents', () => {
		const model = analyzeEssay('An actual sentence.\n\n<Widget>\nHidden component data', {
			format: 'markdown'
		});
		expect(model.measurements.sentences).toBe(1);
		expect(model.warnings).toContain(
			'An unclosed HTML/component block was excluded from the analysis.'
		);
	});

	it('bounds paragraph and sentence counts before generating excessively dense specimens', () => {
		expect(() => analyzeEssay('Word.\n\n'.repeat(MAX_PARAGRAPHS + 1))).toThrow(
			/at most 2,000 paragraphs/
		);
		expect(() => analyzeEssay('Word. '.repeat(MAX_SENTENCES + 1))).toThrow(
			/at most 6,000 sentences/
		);
		expect(analyzeEssay('Word. '.repeat(MAX_SENTENCES)).measurements.sentences).toBe(MAX_SENTENCES);
	});
});
