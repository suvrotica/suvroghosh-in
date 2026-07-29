import { describe, expect, it } from 'vitest';
import {
	INITIAL_TOPIC_HEADQUARTERS_SLUGS,
	PROMOTED_TOPIC_TAGS,
	promotedTopicPath,
	promotedTopicSlug,
	topicHeadquartersPath
} from '$lib/content/topics';
import { faqPageSchema } from '$lib/components/seo/SEO';
import {
	effectiveTopicDateModified,
	getTopicHeadquarters,
	getTopicHeadquartersBySlug,
	getTopicHeadquartersSummaries,
	getTopicResource,
	resolveTopicMembership,
	sortTopicResourcesByFreshness,
	type TopicResourceRecord
} from '$lib/server/content/topic-headquarters';
import { getPublishedTopics } from '$lib/server/content/posts';
import type { TopicMetadata } from './schema';
import { load as topicPageLoad } from '../../routes/topics/[slug]/+page.server';
import { GET as tagRedirect } from '../../routes/tags/[slug]/+server';
import { load as legacyTopicLoad } from '../../routes/blog/topics/[topic]/+page.server';

const requiredTopicSlugs = [
	'sketch',
	'songs',
	'hl7-fhir',
	'healthcare-ai',
	'calcutta',
	'bipolar-depression',
	'interactive-mathematics',
	'codex-desktop'
] as const;

function resource(
	path: string,
	options: {
		date?: string;
		dateModified?: string;
		categorySlug?: string;
		topicTags?: string[];
	} = {}
): TopicResourceRecord {
	return {
		path,
		title: `Resource at ${path}`,
		description: `A test resource used to verify Topic Headquarters membership for ${path}.`,
		contentType: 'Article',
		date: options.date ?? '2026-01-01',
		dateModified: options.dateModified,
		category: 'Test category',
		categorySlug: options.categorySlug ?? 'other',
		topicTags: options.topicTags ?? []
	};
}

function captureThrown(action: () => unknown) {
	try {
		action();
	} catch (error) {
		return error;
	}
	throw new Error('Expected the action to throw.');
}

describe('Topic Headquarters inventory and curation', () => {
	it('publishes exactly the required initial set with unique slugs', () => {
		const topics = getTopicHeadquarters();
		const slugs = topics.map((topic) => topic.slug);

		expect(slugs).toHaveLength(requiredTopicSlugs.length);
		expect(new Set(slugs).size).toBe(slugs.length);
		expect([...slugs].sort()).toEqual([...requiredTopicSlugs].sort());
		expect([...INITIAL_TOPIC_HEADQUARTERS_SLUGS].sort()).toEqual([...requiredTopicSlugs].sort());
	});

	it('resolves every promoted tag to one of the initial headquarters', () => {
		const required = new Set<string>(requiredTopicSlugs);

		for (const [tag, slug] of Object.entries(PROMOTED_TOPIC_TAGS)) {
			expect(required.has(slug), `${tag} maps to a published headquarters`).toBe(true);
			expect(promotedTopicSlug(tag)).toBe(slug);
			expect(promotedTopicPath(tag)).toBe(`/topics/${slug}`);
		}

		for (const topic of getTopicHeadquarters()) {
			expect(promotedTopicSlug(topic.primaryTag)).toBe(topic.slug);
		}
		expect(promotedTopicSlug('an-ordinary-unpromoted-tag')).toBeUndefined();
		expect(promotedTopicPath('an-ordinary-unpromoted-tag')).toBeUndefined();
	});

	it('combines tag, category, and explicit membership without duplicates, then applies excludes', () => {
		const records = [
			resource('/automatic-both', {
				categorySlug: 'included-category',
				topicTags: ['included-tag']
			}),
			resource('/automatic-tag', { topicTags: ['included-tag'] }),
			resource('/automatic-category', { categorySlug: 'included-category' }),
			resource('/manual'),
			resource('/excluded', { topicTags: ['included-tag'] }),
			resource('/irrelevant')
		];
		const topic = {
			slug: 'fixture',
			sourceTags: ['included-tag'],
			sourceCategories: ['included-category'],
			includePaths: ['/manual', '/automatic-both'],
			excludePaths: ['/excluded']
		} as unknown as TopicMetadata;

		const paths = resolveTopicMembership(topic, records, 'fixture.md').map((member) => member.path);

		expect(paths).toHaveLength(new Set(paths).size);
		expect(new Set(paths)).toEqual(
			new Set(['/automatic-both', '/automatic-tag', '/automatic-category', '/manual'])
		);
	});

	it('rejects an explicit include that is missing or unpublished', () => {
		const topic = {
			slug: 'fixture',
			sourceTags: ['included-tag'],
			sourceCategories: [],
			includePaths: ['/not-in-the-published-registry'],
			excludePaths: []
		} as unknown as TopicMetadata;

		expect(() => resolveTopicMembership(topic, [], 'fixture.md')).toThrow(
			'includePaths[0] references an unknown or unpublished resource'
		);
	});

	it('keeps every curated path inside the resolved, deduplicated topic membership', () => {
		for (const topic of getTopicHeadquarters()) {
			const members = new Set(topic.allMaterial.map((item) => item.path));
			const curated = [
				topic.bestStartingArticle.path,
				...topic.readingPaths.beginner.items.map((item) => item.path),
				...topic.readingPaths.intermediate.items.map((item) => item.path),
				...topic.readingPaths.deep.items.map((item) => item.path),
				...topic.relatedResources.visualizations.map((item) => item.path),
				...topic.relatedResources.games.map((item) => item.path),
				...topic.relatedResources.other.map((item) => item.path),
				...topic.glossary.flatMap((entry) => (entry.relatedPath ? [entry.relatedPath] : []))
			];

			expect(topic.resourceCount, topic.slug).toBe(topic.allMaterial.length);
			expect(new Set(topic.allMaterial.map((item) => item.path)).size, topic.slug).toBe(
				topic.allMaterial.length
			);
			for (const path of curated) {
				expect(members.has(path), `${topic.slug} should contain curated path ${path}`).toBe(true);
			}
		}
	});

	it('keeps summary relationships in parity with the validated topic metadata', () => {
		const topicsBySlug = new Map(getTopicHeadquarters().map((topic) => [topic.slug, topic]));
		const summaries = getTopicHeadquartersSummaries();

		for (const summary of summaries) {
			expect(summary.relatedTopicSlugs, summary.slug).toEqual(
				topicsBySlug.get(summary.slug)?.relatedTopics
			);
			for (const relatedSlug of summary.relatedTopicSlugs) {
				expect(topicsBySlug.has(relatedSlug), `${summary.slug} links to ${relatedSlug}`).toBe(true);
			}
		}
	});

	it('sorts recent material by modification date first and computes the effective topic date', () => {
		const olderPublicationWithNewerEdit = resource('/edited', {
			date: '2026-01-01',
			dateModified: '2026-07-03'
		});
		const newerPublication = resource('/newer-publication', { date: '2026-07-02' });
		const older = resource('/older', {
			date: '2026-05-01',
			dateModified: '2026-06-15'
		});

		expect(
			sortTopicResourcesByFreshness([older, newerPublication, olderPublicationWithNewerEdit]).map(
				(item) => item.path
			)
		).toEqual(['/edited', '/newer-publication', '/older']);
		expect(
			effectiveTopicDateModified('2026-07-01', [
				older,
				newerPublication,
				olderPublicationWithNewerEdit
			])
		).toBe('2026-07-03');
		expect(effectiveTopicDateModified('2026-08-01', [olderPublicationWithNewerEdit])).toBe(
			'2026-08-01'
		);
	});

	it('does not expose a known unpublished source through the topic resource registry', () => {
		expect(
			getTopicResource('/blog/artificial-intelligence/ai-meaningful-work-and-the-trust-collapse')
		).toBeUndefined();
	});
});

describe('Topic Headquarters schema and route compatibility', () => {
	it('generates FAQ schema with exact question-and-answer parity', () => {
		for (const topic of getTopicHeadquarters()) {
			const canonicalUrl = `https://www.suvroghosh.in${topicHeadquartersPath(topic.slug)}`;
			const schema = faqPageSchema(topic.faqs, canonicalUrl);
			const schemaFaqs = schema.mainEntity.map((question) => ({
				question: question.name,
				answer: question.acceptedAnswer.text
			}));

			expect(schema['@id'], topic.slug).toBe(`${canonicalUrl}#faq`);
			expect(schemaFaqs, topic.slug).toEqual(topic.faqs);
		}
	});

	it('returns canonical Topic Headquarters data and a real 404 for an unknown slug', () => {
		const result = (
			topicPageLoad as unknown as (event: { params: { slug: string } }) => {
				topic: { slug: string };
				seo: { canonicalUrl: string };
			}
		)({ params: { slug: 'calcutta' } });

		expect(result.topic.slug).toBe('calcutta');
		expect(new URL(result.seo.canonicalUrl).pathname).toBe('/topics/calcutta');
		expect(getTopicHeadquartersBySlug('does-not-exist')).toBeUndefined();

		const missing = captureThrown(() =>
			(topicPageLoad as unknown as (event: { params: { slug: string } }) => unknown)({
				params: { slug: 'does-not-exist' }
			})
		);
		expect(missing).toMatchObject({
			status: 404,
			body: { message: 'That Topic Headquarters does not exist.' }
		});
	});

	it('redirects promoted tag and legacy archive URLs directly to their headquarters', () => {
		const tagResult = captureThrown(() =>
			(tagRedirect as unknown as (event: { params: { slug: string } }) => unknown)({
				params: { slug: 'hl7' }
			})
		);
		expect(tagResult).toMatchObject({ status: 308, location: '/topics/hl7-fhir' });

		const legacyResult = captureThrown(() =>
			(legacyTopicLoad as unknown as (event: { params: { topic: string }; url: URL }) => unknown)({
				params: { topic: 'calcutta' },
				url: new URL('https://www.suvroghosh.in/blog/topics/calcutta')
			})
		);
		expect(legacyResult).toMatchObject({ status: 308, location: '/topics/calcutta' });
	});

	it('preserves the legacy archive for an established unpromoted topic', () => {
		const ordinaryTopic = getPublishedTopics().find(
			(topic) => promotedTopicPath(topic.slug) === undefined
		);
		expect(ordinaryTopic).toBeDefined();

		const result = (
			legacyTopicLoad as unknown as (event: { params: { topic: string }; url: URL }) => {
				topic: { slug: string };
			}
		)({
			params: { topic: ordinaryTopic!.slug },
			url: new URL(`https://www.suvroghosh.in/blog/topics/${ordinaryTopic!.slug}`)
		});

		expect(result.topic.slug).toBe(ordinaryTopic!.slug);
	});
});
