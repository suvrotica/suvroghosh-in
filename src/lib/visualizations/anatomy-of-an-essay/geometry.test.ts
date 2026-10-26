import { describe, expect, it } from 'vitest';
import { analyzeEssay } from './model';
import { buildSpecimen, GEOMETRY_LIMITS, specimenInner } from './geometry';
import { renderPortrait } from './render';

const sample = () =>
	analyzeEssay(
		'A sentence remembers its beginning. A sentence remembers its ending.\n\nThe second paragraph has a different rhythm: a parenthesis (with another aside) bends the structure; the sentence continues.',
		{ id: 'test', title: 'A small specimen', format: 'text' }
	);

describe('essay specimen geometry', () => {
	it('repeats exactly for an identical model, independent of title or genre', () => {
		const doc = sample();
		expect(buildSpecimen(doc)).toEqual(buildSpecimen(doc));
		expect(buildSpecimen({ ...doc, title: 'Technical genre label' })).toEqual(buildSpecimen(doc));
	});
	it('maps every rendered rib to a real sentence and paragraph', () => {
		const doc = sample();
		const inner = specimenInner(buildSpecimen(doc));
		for (const paragraph of doc.paragraphs)
			for (const sentence of paragraph.sentences) {
				expect(inner).toContain(`data-sentence="${sentence.id}" data-paragraph="${paragraph.id}"`);
			}
		expect(inner).not.toMatch(/NaN|Infinity|undefined/);
	});
	it('changes the morphology with the measured writing and uses an explicit normalized view', () => {
		const short = sample();
		const long = analyzeEssay(
			Array.from(
				{ length: 35 },
				(_, i) =>
					`Paragraph ${i} contains a sequence of remembered words; the sequence runs in a much longer sentence than the small specimen, because its construction contains elaboration, pauses, digressions, and a final return to the original idea, which has waited patiently until every other idea has found its place.`
			).join('\n\n'),
			{ format: 'text' }
		);
		expect(buildSpecimen(long).bodyHeight).toBeGreaterThan(buildSpecimen(short).bodyHeight);
		expect(buildSpecimen(long).outline).not.toBe(buildSpecimen(short).outline);
		expect(buildSpecimen(short, true).layers.organs).toContain('scale(');
		expect(buildSpecimen(long).layers.coils).toContain('ea-coil');
	});
	it('bounds dense artwork and discloses every omitted rib and chamber', () => {
		const doc = analyzeEssay(
			Array.from(
				{ length: 125 },
				() => 'One short sentence. Another small sentence. A third. A fourth. A fifth.'
			).join('\n\n'),
			{ format: 'text' }
		);
		const geometry = buildSpecimen(doc);
		expect(geometry.omitted.organs).toBe(doc.paragraphs.length - GEOMETRY_LIMITS.organs);
		expect(geometry.omitted.ribs).toBe(doc.measurements.sentences - GEOMETRY_LIMITS.ribs);
		expect(geometry.layers.organs.match(/class="ea-organ"/g)?.length).toBe(GEOMETRY_LIMITS.organs);
	});
	it('renders self-contained SVG with escaped labels and exact social dimensions', () => {
		const doc = {
			...sample(),
			title: '<script>alert("x")</script>',
			author: '<owner>',
			canonicalUrl: 'https://example.org/?a=1&b=2'
		};
		const svg = renderPortrait(doc, { social: true });
		expect(svg).toContain('width="1200" height="630"');
		expect(svg).toContain('&lt;script&gt;');
		expect(svg).not.toContain('<script>');
		expect(svg).toContain('a=1&amp;b=2');
		expect(svg).not.toContain('<image');
		expect(svg).toContain(specimenInner(buildSpecimen(doc)));
	});
});
