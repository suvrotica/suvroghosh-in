import { describe, expect, it } from 'vitest';
import { postcardCaption, postcardExcerpt, renderPostcardSvg, wrapPostcardText } from './postcard';
import type { PostcardInput } from './postcard';
import { connections, events } from './data';

const input: PostcardInput = {
	year: 1947,
	left: {
		id: 'calcutta',
		side: 'calcutta',
		date: { kind: 'point', value: '1947-08-15', precision: 'day' },
		title: 'A new country & a divided province',
		scope: 'Calcutta, Bengal / India',
		summary: 'A documented event with a precise civil date.',
		theme: 'Belonging',
		sourceIds: ['archive']
	},
	right: {
		id: 'america',
		side: 'america',
		date: { kind: 'point', value: '1947', precision: 'year' },
		title: 'Another record in the same year',
		scope: 'United States',
		summary: 'A record whose evidence supports the year only.',
		theme: 'Belonging',
		sourceIds: ['museum']
	},
	connection: {
		id: 'comparison',
		leftId: 'calcutta',
		rightId: 'america',
		kind: 'thematic',
		title: 'Citizenship',
		rationale: 'These records prompt a comparison. They do not establish a causal connection.'
	},
	sources: [
		{
			id: 'archive',
			title: 'The archive record',
			institution: 'National Archive',
			url: 'https://example.org/archive'
		},
		{
			id: 'museum',
			title: 'The museum record',
			institution: 'History Museum',
			url: 'https://example.org/museum'
		},
		{
			id: 'unrelated',
			title: 'Unrelated',
			institution: 'Other',
			url: 'https://example.org/unrelated'
		}
	],
	url: 'https://suvroghosh.in/visualizations/two-calendars?year=1947&connection=comparison'
};

describe('standalone historical postcard', () => {
	it('fits every authored observation and relationship as complete sentences in the postcard text areas', () => {
		for (const event of events) {
			const excerpt = postcardExcerpt(event.summary);
			const longer = wrapPostcardText(excerpt, 50).length > 3;
			expect(wrapPostcardText(excerpt, longer ? 55 : 50).length, event.id).toBeLessThanOrEqual(
				longer ? 4 : 3
			);
			expect(excerpt, event.id).toMatch(/[.!?]$/);
		}
		for (const connection of connections) {
			const excerpt = postcardExcerpt(connection.rationale, 230, true);
			expect(wrapPostcardText(excerpt, 125).length, connection.id).toBeLessThanOrEqual(2);
			expect(excerpt, connection.id).toMatch(/[.!?]$/);
		}
	});

	it('shortens at complete sentences while preserving initials, case names and qualifications', () => {
		expect(
			postcardExcerpt('A first observation. A second observation. An unrelated third sentence.', 45)
		).toBe('A first observation. A second observation.');
		expect(
			postcardExcerpt(
				'In Brown v. Board of Education, the Court ruled. A longer second sentence that will not fit.',
				60
			)
		).toBe('In Brown v. Board of Education, the Court ruled.');
		expect(
			postcardExcerpt('A. Philip Randolph organised a campaign. Another observation.', 45)
		).toBe('A. Philip Randolph organised a campaign.');
		const qualified =
			'Food allocation reached everyday life in both places in 1943, with profoundly unequal conditions. US rationing and Bengal’s famine are compared as questions of access and public responsibility; they are not equivalent experiences or a claim of direct causation.';
		expect(postcardExcerpt(qualified, 230, true)).toBe(
			'US rationing and Bengal’s famine are compared as questions of access and public responsibility; they are not equivalent experiences or a claim of direct causation.'
		);
	});

	it('exports an opaque, accessible SVG with explicit event dates and provenance', () => {
		const svg = renderPostcardSvg(input);
		expect(svg).toContain('width="1600" height="1000"');
		expect(svg).toContain('aria-labelledby="postcard-title postcard-description"');
		expect(svg).toContain('fill="#f5f0e3"');
		expect(svg).toContain('15 August 1947');
		expect(svg).toContain('THEMATIC COMPARISON');
		expect(svg).toContain('https://example.org/archive');
		expect(svg).toContain('History Museum');
		expect(svg).not.toContain('https://example.org/unrelated');
		expect(svg).not.toContain('<foreignObject');
		expect(svg).not.toContain('@font-face');
		expect(svg).toContain(
			'>suvroghosh.in/visualizations/two-calendars?year=1947&amp;connection=comparison</text></a>'
		);
	});

	it('escapes source and editorial text instead of allowing SVG injection', () => {
		const hostile = '<script>alert("x")</script> & "quoted"';
		const svg = renderPostcardSvg({ ...input, left: { ...input.left!, title: hostile } });
		expect(svg).not.toContain('<script>');
		expect(svg).toContain('&lt;script&gt;');
		expect(svg).toContain('&amp;');
		expect(svg).toContain('&quot;');
		expect(renderPostcardSvg({ ...input, url: 'javascript:alert(1)' })).toContain('<a href="#">');
	});

	it('wraps long observations as native SVG text and retains complete prose in accessible metadata', () => {
		expect(wrapPostcardText('One two three four five six seven eight nine', 14)).toEqual([
			'One two three',
			'four five six',
			'seven eight',
			'nine'
		]);
		expect(wrapPostcardText('One two three four five six seven eight nine', 14, 2)).toEqual([
			'One two three',
			'four five six…'
		]);
		const title =
			'An unusually long editorial headline with enough words to require careful line wrapping';
		const svg = renderPostcardSvg({ ...input, left: { ...input.left!, title } });
		expect(svg).toContain(title);
		expect(svg).toContain('<tspan');
	});

	it('describes the available precision without claiming identical days or invented clock times', () => {
		const caption = postcardCaption(input);
		expect(caption).toContain('1947: a year in two worlds');
		expect(caption).toContain('15 August 1947');
		expect(caption).toContain('Thematic comparison');
		expect(caption).not.toContain('same instant');
		expect(caption).not.toContain('00:00');
		expect(caption).toContain(input.url);
	});

	it('retains an honest empty state instead of filling a missing year with nearby history', () => {
		const svg = renderPostcardSvg({
			...input,
			year: 1959,
			left: null,
			right: null,
			connection: null
		});
		expect(svg).toContain('No record selected for this year');
		expect(svg).toContain('An honest space in the record');
		expect(svg).not.toContain('A new country');
		expect(svg).not.toContain('Two selections from the same year');
	});

	it('describes a one-sided year as a partial selection with an explicit gap', () => {
		const partial = {
			...input,
			year: 1940,
			left: null,
			right: {
				...input.right!,
				date: { kind: 'point' as const, value: '1940', precision: 'year' as const }
			},
			connection: null
		};
		const svg = renderPostcardSvg(partial);
		const caption = postcardCaption(partial);
		expect(svg).toContain('A PARTIAL SELECTION');
		expect(svg).toContain('no Calcutta / India record is selected');
		expect(caption).toContain('a partial year selection');
		expect(caption).toContain('no Calcutta / India record is selected');
		expect(svg).not.toContain('Two selections from the same year');
		expect(caption).not.toContain('a year in two worlds');
	});

	it('labels cross-year thematic comparisons and renders uncertainty separately from duration', () => {
		const crossYear = {
			...input,
			right: {
				...input.right!,
				date: { kind: 'point' as const, value: '1954', precision: 'year' as const }
			}
		};
		expect(postcardCaption(crossYear)).toContain('an editorial comparison across years');
		expect(renderPostcardSvg(crossYear)).toContain('AN EDITORIAL COMPARISON');
		const uncertain = renderPostcardSvg({
			...input,
			left: {
				...input.left!,
				date: {
					kind: 'uncertain',
					earliest: '1946',
					latest: '1948',
					precision: 'year',
					note: 'Unknown date.'
				}
			}
		});
		expect(uncertain).toContain('Uncertain date window');
		expect(uncertain).toContain('stroke-dasharray="3 5"');
		expect(uncertain).not.toContain('Documented duration');
		const duration = renderPostcardSvg({
			...input,
			left: {
				...input.left!,
				date: { kind: 'duration', start: '1946', end: '1948', precision: 'year' }
			}
		});
		expect(duration).toContain('Documented duration');
		expect(duration).not.toContain('Uncertain date window');
	});
});
