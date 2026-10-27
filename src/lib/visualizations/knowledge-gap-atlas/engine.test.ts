import { describe, expect, it } from 'vitest';
import { analyseAggregates, mergeAggregates, StreamingExtractor } from './engine';
import { EXAMPLES } from './examples';
import { DEFAULT_SETTINGS } from './types';
import type { AnalysisSettings, EdgeAggregate, SourceRecord, TermAggregate } from './types';

function aggregate(
	text: string,
	chunk = text.length || 1,
	settings = DEFAULT_SETTINGS,
	sourceId = 'source-1'
) {
	const extractor = new StreamingExtractor(sourceId, settings);
	const terms = new Map<string, TermAggregate>();
	const edges = new Map<string, EdgeAggregate>();
	let words = 0;
	for (let offset = 0; offset < text.length; offset += chunk) {
		const delta = extractor.push(text.slice(offset, offset + chunk));
		words += delta.words;
		for (const term of delta.terms) terms.set(term.id, mergeAggregates(terms.get(term.id), term));
		for (const edge of delta.edges) edges.set(edge.id, mergeAggregates(edges.get(edge.id), edge));
	}
	const delta = extractor.push('', true);
	words += delta.words;
	for (const term of delta.terms) terms.set(term.id, mergeAggregates(terms.get(term.id), term));
	for (const edge of delta.edges) edges.set(edge.id, mergeAggregates(edges.get(edge.id), edge));
	return {
		terms: [...terms.values()].sort((a, b) => a.id.localeCompare(b.id)),
		edges: [...edges.values()].sort((a, b) => a.id.localeCompare(b.id)),
		words
	};
}

function source(
	id: string,
	text: string,
	words: number,
	role: 'target' | 'reference' = 'target'
): SourceRecord {
	return {
		id,
		projectId: 'project',
		name: id,
		role,
		bytes: new TextEncoder().encode(text).length,
		chars: text.length,
		words,
		processedBytes: new TextEncoder().encode(text).length,
		status: 'complete'
	};
}

function analyseSources(
	input: { id: string; text: string; role?: 'target' | 'reference' }[],
	settings: AnalysisSettings = DEFAULT_SETTINGS
) {
	const terms = new Map<string, TermAggregate>();
	const edges = new Map<string, EdgeAggregate>();
	const sources: SourceRecord[] = [];
	for (const item of input) {
		const result = aggregate(item.text, 31, settings, item.id);
		sources.push(source(item.id, item.text, result.words, item.role));
		for (const term of result.terms) terms.set(term.id, mergeAggregates(terms.get(term.id), term));
		for (const edge of result.edges) edges.set(edge.id, mergeAggregates(edges.get(edge.id), edge));
	}
	return analyseAggregates([...terms.values()], [...edges.values()], sources, settings);
}

describe('streaming concept extraction', () => {
	it('produces identical counts, phrases, edges and offsets at every chunk width', () => {
		const text =
			'Street trees shade bus stops. Street trees support cooling; safer housing supports health.\nপথে গাছ ছায়া দেয়। Green café cafe\u0301. 𐐀𐐨 letters and warm nights. housing—health; warm nights!';
		const expected = aggregate(text);
		for (let width = 1; width <= 43; width++) expect(aggregate(text, width)).toEqual(expected);
	});

	it('normalizes combining marks while preserving exact original source offsets', () => {
		const text = 'cafe\u0301 café বাংলা ভাষা';
		const result = aggregate(text, 1);
		const term = result.terms.find((item) => item.id === 'café')!;
		expect(term.count).toBe(2);
		expect(term.evidence.map((ref) => text.slice(ref.start, ref.end))).toEqual([
			'cafe\u0301',
			'café'
		]);
		expect(result.terms.some((item) => item.id === 'বাংলা')).toBe(true);
	});

	it('does not create edges across sentence or document boundaries', () => {
		const result = aggregate('bananas. telescopes! Mangoes\nSatellites');
		expect(result.edges).toEqual([]);
		const analysis = analyseSources([
			{ id: 'one', text: 'bananas bananas.' },
			{ id: 'two', text: 'telescopes telescopes.' }
		]);
		expect(analysis.edges).toEqual([]);
		expect(analysis.findings.filter((item) => item.kind === 'gap')).toEqual([]);
	});

	it('measures windows in original words, including stopwords', () => {
		const result = aggregate('trees and the many other houses', 3, {
			...DEFAULT_SETTINGS,
			window: 2
		});
		expect(result.edges).toEqual([]);
		expect(result.words).toBe(6);
	});

	it('limits only evidence samples, never occurrence counts', () => {
		const text = 'street trees shade homes. '.repeat(100);
		const result = aggregate(text, 7);
		const term = result.terms.find((item) => item.id === 'trees')!;
		expect(term.count).toBe(100);
		expect(term.sources['source-1']).toBe(100);
		expect(term.evidence).toHaveLength(6);
		expect(
			result.edges.find((item) => item.source === 'street' && item.target === 'trees')?.count
		).toBe(100);
	});

	it('keeps an unbroken huge token bounded and chunk-invariant without discarding its source span', () => {
		const text = 'a'.repeat(400_000);
		const small = aggregate(text, 137);
		const batch = aggregate(text);
		expect(small).toEqual(batch);
		expect(small.words).toBe(1);
		expect(small.terms[0].id).toMatch(/^long:/);
		expect(small.terms[0].evidence[0]).toEqual({
			sourceId: 'source-1',
			start: 0,
			end: text.length
		});
		const extractor = new StreamingExtractor('source-1', DEFAULT_SETTINGS);
		extractor.push(text);
		expect(JSON.stringify(extractor.snapshot()).length).toBeLessThan(1500);
	});

	it('resumes an interrupted token and window exactly from a serialized checkpoint', () => {
		const text = 'Street trees shade homes. Street trees shade schools and clinics.';
		const before = new StreamingExtractor('source-1', DEFAULT_SETTINGS);
		const a = before.push(text.slice(0, 13));
		const after = new StreamingExtractor('source-1', DEFAULT_SETTINGS);
		after.restore(JSON.parse(JSON.stringify(before.snapshot())));
		const b = after.push(text.slice(13), true);
		const terms = new Map<string, TermAggregate>();
		const edges = new Map<string, EdgeAggregate>();
		for (const delta of [a, b]) {
			for (const term of delta.terms) terms.set(term.id, mergeAggregates(terms.get(term.id), term));
			for (const edge of delta.edges) edges.set(edge.id, mergeAggregates(edges.get(edge.id), edge));
		}
		const expected = aggregate(text);
		expect([...terms.values()].sort((x, y) => x.id.localeCompare(y.id))).toEqual(expected.terms);
		expect([...edges.values()].sort((x, y) => x.id.localeCompare(y.id))).toEqual(expected.edges);
		expect(a.words + b.words).toBe(expected.words);
	});

	it('applies aliases and exclusions without rewriting evidence', () => {
		const settings = { ...DEFAULT_SETTINGS, aliases: { trees: 'canopy' }, excluded: ['noise'] };
		const text = 'trees shade. noise noise.';
		const result = aggregate(text, 2, settings);
		expect(result.terms.find((term) => term.id === 'canopy')?.evidence[0]).toEqual({
			sourceId: 'source-1',
			start: 0,
			end: 5
		});
		expect(result.terms.find((term) => term.id === 'trees')).toBeUndefined();
		expect(result.terms.find((term) => term.id === 'noise')).toBeUndefined();
	});

	it('handles empty, punctuation-only, numeric, and short sources without fabricated topics', () => {
		for (const text of ['', '! . —', '123 456', 'I am a']) {
			const result = analyseSources([{ id: 'empty', text }]);
			expect(result.concepts).toEqual([]);
			expect(result.findings).toEqual([]);
		}
	});

	it('processes messy implementation prose completely without turning instructions into sentence-fragment labels', () => {
		const paragraph = `Their implementation should use available algorithms. Please provide accessible navigation and source evidence. Ensure that their source evidence remains available. The knowledge map should preserve source evidence. Local storage keeps source evidence private. Accessible navigation helps readers inspect the knowledge map. No API should receive source evidence. `;
		const text = paragraph.repeat(120);
		const extracted = aggregate(text, 29);
		const analysis = analyseSources([{ id: 'instructions', text }]);
		expect(analysis.words).toBe(extracted.words);
		expect(analysis.words).toBeGreaterThan(5000);
		for (const term of ['their', 'should', 'use', 'available', 'please', 'provide', 'ensure']) {
			expect(analysis.concepts.some((concept) => concept.id === term)).toBe(false);
		}
		expect(analysis.concepts.some((concept) => concept.id === 'source evidence')).toBe(true);
		expect(analysis.concepts.some((concept) => concept.id === 'knowledge map')).toBe(true);
		expect(analysis.concepts.every((concept) => concept.label.split(' ').length <= 2)).toBe(true);
		expect(analysis.concepts.find((concept) => concept.id === 'evidence')?.count).toBe(600);
	});
});

describe('evidence-linked graph analysis', () => {
	it('is deterministic for a fixed seed and labels communities from extracted language', () => {
		const inputs = EXAMPLES[0].sources.map((item, index) => ({
			id: `s${index}`,
			text: item.text!,
			role: item.role
		}));
		const a = analyseSources(inputs);
		const b = analyseSources(inputs);
		expect(a.topics).toEqual(b.topics);
		expect(a.concepts).toEqual(b.concepts);
		expect(a.findings).toEqual(b.findings);
		expect(a.topics.length).toBeGreaterThan(2);
		expect(a.findings.length).toBeGreaterThan(0);
		for (const item of a.findings) {
			expect(item.priority).toBeGreaterThanOrEqual(0);
			expect(item.priority).toBeLessThanOrEqual(100);
			expect(item.evidence.length).toBeGreaterThan(0);
			for (const ref of item.evidence) {
				const text = inputs.find((input) => input.id === ref.sourceId)!.text;
				expect(ref.start).toBeGreaterThanOrEqual(0);
				expect(ref.end).toBeLessThanOrEqual(text.length);
				expect(text.slice(ref.start, ref.end).length).toBeGreaterThan(0);
			}
		}
	});

	it('does not call two disconnected subjects a missing bridge', () => {
		const result = analyseSources([
			{
				id: 'food',
				text: 'apples pears cherries fruit. apples pears cherries fruit. apples pears cherries fruit.'
			},
			{
				id: 'space',
				text: 'planets moons nebulae astronomy. planets moons nebulae astronomy. planets moons nebulae astronomy.'
			}
		]);
		expect(result.findings.filter((item) => item.kind === 'gap')).toEqual([]);
		expect(result.findings.filter((item) => item.kind === 'coverage')).toEqual([]);
	});

	it('finds reference-relative coverage using word-normalized counts', () => {
		const result = analyseSources([
			{ id: 'target', text: 'garden soil plants. garden soil plants.', role: 'target' },
			{
				id: 'reference',
				text: 'garden access paths. garden access paths. garden access paths. garden access paths.',
				role: 'reference'
			}
		]);
		expect(result.findings.some((item) => item.id === 'coverage:access')).toBe(true);
		expect(result.findings.some((item) => item.id === 'coverage:garden')).toBe(false);
		expect(result.findings.find((item) => item.id === 'coverage:access')?.explanation).toContain(
			'not found'
		);
	});

	it('retains reference evidence even after many target sources have filled their sample lists', () => {
		const inputs = Array.from({ length: 8 }, (_, index) => ({
			id: `target-${index}`,
			text: `${'garden '.repeat(8)}${'different vocabulary '.repeat(80)}`,
			role: 'target' as const
		}));
		const result = analyseSources([
			...inputs,
			{
				id: 'reference-last',
				text: 'garden garden garden garden garden garden.',
				role: 'reference'
			}
		]);
		const finding = result.findings.find((item) => item.id === 'coverage:garden');
		expect(finding).toBeDefined();
		expect(finding!.evidence.some((ref) => ref.sourceId === 'reference-last')).toBe(true);
	});

	it('keeps meaningful phrases while suppressing standalone modifier fragments', () => {
		const result = analyseSources([
			{
				id: 'health',
				text: 'Public health needs accessible paths. Public health needs accessible paths. Public health needs accessible paths.'
			}
		]);
		expect(result.concepts.some((concept) => concept.id === 'public health')).toBe(true);
		expect(result.concepts.some((concept) => concept.id === 'accessible paths')).toBe(true);
		expect(result.concepts.some((concept) => concept.id === 'public')).toBe(false);
		expect(result.concepts.some((concept) => concept.id === 'accessible')).toBe(false);
	});

	it('reduces generic academic scaffolding without deleting meaningful technical phrases or actions', () => {
		const text = `Their recommendation can help with this problem. An issue needs advice.
Medical advice informs policy. Recommendation systems need evaluation. Map projection changes geometry.
Language learning involves practice. Conservation requires repair. Policy guides conservation. `.repeat(
			3
		);
		const result = analyseSources([{ id: 'academic', text }]);
		for (const generic of ['help', 'problem', 'issue', 'can']) {
			expect(result.concepts.some((concept) => concept.id === generic)).toBe(false);
		}
		for (const meaningful of [
			'medical advice',
			'recommendation systems',
			'map projection',
			'language learning',
			'policy',
			'repair',
			'learning'
		]) {
			expect(
				result.concepts.some((concept) => concept.id === meaningful),
				meaningful
			).toBe(true);
		}
		expect(result.topics.some((topic) => topic.label === 'recommendation')).toBe(false);
		expect(result.concepts.find((concept) => concept.id === 'recommendation')!.score).toBeLessThan(
			result.concepts.find((concept) => concept.id === 'recommendation systems')!.score
		);
		expect(result.words).toBe(aggregate(text).words);
	});

	it('prefers a meaningful repeated phrase at minimum support over a fragment label', () => {
		const result = analyseSources([
			{
				id: 'sleep',
				text: 'Hot nights disrupt sleep. Hot nights disturb sleep. Sleep restores energy. Sleep improves recovery.'
			}
		]);
		expect(result.concepts.some((concept) => concept.id === 'hot nights')).toBe(true);
		expect(result.topics.some((topic) => topic.label === 'hot nights')).toBe(true);
	});

	it('does not let overlapping-label subdivisions dominate a useful investigation', () => {
		const result = analyseSources(
			EXAMPLES[0].sources.map((item, index) => ({
				id: `s${index}`,
				text: item.text!,
				role: item.role
			}))
		);
		const strongest = result.findings.find((item) => item.kind === 'gap')!;
		expect(strongest).toBeDefined();
		const roots = (label: string) =>
			new Set(label.split(/\W+/).map((word) => word.replace(/s$/, '')));
		const [a, b] = strongest.topics.map((id) =>
			roots(result.topics.find((topic) => topic.id === id)!.label)
		);
		expect([...a].some((word) => b.has(word))).toBe(false);
		for (const term of ['help', 'problem', 'issues', 'advice', 'recommendation', 'can', 'map']) {
			expect(result.concepts.some((concept) => concept.id === term)).toBe(false);
		}
	});

	it('identifies an articulation concept using the complete eligible graph', () => {
		const result = analyseSources([
			{ id: 'chain', text: 'alpha beta. alpha beta. beta gamma. beta gamma.' }
		]);
		expect(result.findings.some((item) => item.id === 'fragile:beta')).toBe(true);
	});

	it('does not cap the number of eligible concepts', () => {
		const text = Array.from(
			{ length: 2200 },
			(_, index) => `concept${index}. concept${index}.`
		).join(' ');
		const result = analyseSources([{ id: 'large', text }]);
		expect(result.concepts).toHaveLength(2200);
		expect(result.totalTerms).toBe(2200);
	});
});
