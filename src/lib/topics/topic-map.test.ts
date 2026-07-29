import { describe, expect, it } from 'vitest';
import { getTopicHeadquartersSummaries } from '$lib/server/content/topic-headquarters';
import type { TopicHeadquartersSummary } from './types';
import { buildTopicMapModel, TOPIC_MAP_MAX_PRINCIPAL_EDGES, wrapTopicMapLabel } from './topic-map';

function topic(
	slug: string,
	group: string,
	relatedTopicSlugs: readonly string[] = [],
	resourceCount = 10
): TopicHeadquartersSummary {
	return {
		slug,
		title: `${slug} full title`,
		shortTitle: slug
			.split('-')
			.map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
			.join(' '),
		group,
		description: `A deterministic fixture for ${slug}.`,
		resourceCount,
		effectiveDateModified: '2026-07-29',
		bestStartingArticle: { path: `/blog/fixture/${slug}`, title: `Start ${slug}` },
		relatedTopicSlugs
	};
}

describe('Living Topic Map model', () => {
	it('builds the exact current inventory and curated graph', () => {
		const model = buildTopicMapModel(getTopicHeadquartersSummaries());

		expect(model.nodes).toHaveLength(8);
		expect(model.territories).toHaveLength(6);
		expect(model.edges).toHaveLength(13);
		expect(model.edges.filter((edge) => edge.reciprocal)).toHaveLength(9);
		expect(model.edges.filter((edge) => !edge.reciprocal)).toHaveLength(4);
		expect(model.edges.filter((edge) => edge.principal).length).toBeLessThanOrEqual(
			TOPIC_MAP_MAX_PRINCIPAL_EDGES
		);
		expect(
			model.nodes.find((node) => node.slug === 'interactive-mathematics')?.relatedNodeSlugs
		).toHaveLength(5);
	});

	it('is independent of input order and repeated calls', () => {
		const summaries = getTopicHeadquartersSummaries();
		const first = buildTopicMapModel(summaries);
		const second = buildTopicMapModel([...summaries].reverse());

		expect(second).toEqual(first);
		expect(buildTopicMapModel(structuredClone(summaries))).toEqual(first);
	});

	it('keeps current nodes finite, bounded, unique, and non-overlapping within territories', () => {
		const model = buildTopicMapModel(getTopicHeadquartersSummaries());
		const nodeIds = new Set(model.nodes.map((node) => node.slug));

		expect(nodeIds.size).toBe(model.nodes.length);
		for (const node of model.nodes) {
			expect(Number.isFinite(node.x)).toBe(true);
			expect(Number.isFinite(node.y)).toBe(true);
			expect(node.x - node.width / 2).toBeGreaterThanOrEqual(0);
			expect(node.x + node.width / 2).toBeLessThanOrEqual(model.width);
			expect(node.y - node.height / 2).toBeGreaterThanOrEqual(0);
			expect(node.y + node.height / 2).toBeLessThanOrEqual(model.height);
			expect(node.width).toBeGreaterThanOrEqual(132);
			expect(node.height).toBeGreaterThanOrEqual(60);
			expect(node.href).toBe(`/topics/${node.slug}`);
		}

		for (const territory of model.territories) {
			const territoryNodes = model.nodes.filter((node) => node.groupId === territory.id);
			for (const [index, node] of territoryNodes.entries()) {
				for (const other of territoryNodes.slice(index + 1)) {
					const overlapsHorizontally = Math.abs(node.x - other.x) < (node.width + other.width) / 2;
					const overlapsVertically = Math.abs(node.y - other.y) < (node.height + other.height) / 2;
					expect(overlapsHorizontally && overlapsVertically).toBe(false);
				}
			}
		}
	});

	it('deduplicates reciprocal declarations and preserves asymmetric relations', () => {
		const model = buildTopicMapModel([
			topic('alpha', 'Future group', ['beta']),
			topic('beta', 'Other group', ['alpha', 'gamma']),
			topic('gamma', 'Other group')
		]);

		expect(model.edges).toHaveLength(2);
		expect(model.edges.find((edge) => edge.id === 'alpha::beta')).toMatchObject({
			reciprocal: true
		});
		expect(model.edges.find((edge) => edge.id === 'beta::gamma')).toMatchObject({
			reciprocal: false
		});
		expect(model.nodes.find((node) => node.slug === 'beta')?.relatedNodeSlugs).toEqual([
			'alpha',
			'gamma'
		]);
	});

	it('places a future group and disconnected topic deterministically', () => {
		const model = buildTopicMapModel([
			topic('future-topic', 'A future territory', [], 42),
			topic('calcutta', 'Calcutta and culture')
		]);

		expect(model.territories.map((territory) => territory.label)).toEqual([
			'Calcutta and culture',
			'A future territory'
		]);
		expect(model.nodes.find((node) => node.slug === 'future-topic')).toMatchObject({
			importance: 'major',
			relatedNodeSlugs: []
		});
		expect(model.edges).toEqual([]);
	});

	it('expands a future crowded territory without overlapping landmarks or later rows', () => {
		const crowdedTopics = Array.from({ length: 10 }, (_, index) =>
			topic(
				`future-${String(index + 1).padStart(2, '0')}`,
				'Healthcare and technology',
				[],
				30 - index
			)
		);
		const input = [...crowdedTopics, topic('following-row', 'Mind and lived experience')];
		const model = buildTopicMapModel(input);
		const crowdedTerritory = model.territories.find(
			(territory) => territory.label === 'Healthcare and technology'
		)!;
		const followingTerritory = model.territories.find(
			(territory) => territory.label === 'Mind and lived experience'
		)!;
		const crowdedNodes = model.nodes.filter((node) => node.groupId === crowdedTerritory.id);

		expect(crowdedTerritory.height).toBeGreaterThan(250);
		expect(model.height).toBeGreaterThan(620);
		expect(followingTerritory.y).toBeGreaterThan(crowdedTerritory.y + crowdedTerritory.height);
		expect(buildTopicMapModel([...input].reverse())).toEqual(model);

		for (const [index, node] of crowdedNodes.entries()) {
			expect(node.x - node.width / 2).toBeGreaterThanOrEqual(crowdedTerritory.x);
			expect(node.x + node.width / 2).toBeLessThanOrEqual(
				crowdedTerritory.x + crowdedTerritory.width
			);
			expect(node.y - node.height / 2).toBeGreaterThanOrEqual(crowdedTerritory.y);
			expect(node.y + node.height / 2).toBeLessThanOrEqual(
				crowdedTerritory.y + crowdedTerritory.height
			);

			for (const other of crowdedNodes.slice(index + 1)) {
				const overlapsHorizontally = Math.abs(node.x - other.x) < (node.width + other.width) / 2;
				const overlapsVertically = Math.abs(node.y - other.y) < (node.height + other.height) / 2;
				expect(overlapsHorizontally && overlapsVertically).toBe(false);
			}
		}
	});

	it('rejects duplicate, self-referential, dangling, and colliding input', () => {
		expect(() =>
			buildTopicMapModel([topic('duplicate', 'Group'), topic('duplicate', 'Group')])
		).toThrow('duplicate topic slug');
		expect(() => buildTopicMapModel([topic('self', 'Group', ['self'])])).toThrow(
			'cannot relate to itself'
		);
		expect(() => buildTopicMapModel([topic('source', 'Group', ['missing'])])).toThrow(
			'references unknown topic'
		);
		expect(() =>
			buildTopicMapModel([topic('one', 'Words & symbols'), topic('two', 'Words and symbols')])
		).toThrow('resolve to the same id');
	});

	it('wraps visible labels deterministically into at most two lines', () => {
		expect(wrapTopicMapLabel('Interactive Mathematics')).toEqual(['Interactive', 'Mathematics']);
		expect(wrapTopicMapLabel('HL7 & FHIR')).toEqual(['HL7 & FHIR']);
		expect(wrapTopicMapLabel('')).toEqual([]);
	});
});
