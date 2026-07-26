import { error } from '@sveltejs/kit';
import type { EntryGenerator, PageServerLoad } from './$types';
import {
	absoluteUrl,
	breadcrumbSchema,
	collectionPageSchema,
	definedTermSetSchema,
	faqPageSchema,
	itemListSchema,
	siteTitle,
	siteUrl,
	withSiteGraph
} from '$lib/components/seo/SEO';
import { topicHeadquartersPath } from '$lib/content/topics';
import {
	getTopicHeadquarters,
	getTopicHeadquartersBySlug,
	getTopicHeadquartersSummaries
} from '$lib/server/content/topic-headquarters';

export const prerender = 'auto';

export const entries: EntryGenerator = () =>
	getTopicHeadquarters().map((topic) => ({ slug: topic.slug }));

export const load: PageServerLoad = ({ params }) => {
	const topic = getTopicHeadquartersBySlug(params.slug);
	if (!topic) {
		error(404, 'That Topic Headquarters does not exist.');
	}

	const canonicalPath = topicHeadquartersPath(topic.slug);
	const canonicalUrl = `${siteUrl}${canonicalPath}`;
	const curatedResources = [
		topic.bestStartingArticle,
		...topic.readingPaths.beginner.items,
		...topic.readingPaths.intermediate.items,
		...topic.readingPaths.deep.items
	];
	const uniqueCuratedResources = Array.from(
		new Map(curatedResources.map((resource) => [resource.path, resource])).values()
	);
	const summariesBySlug = new Map(
		getTopicHeadquartersSummaries().map((summary) => [summary.slug, summary])
	);
	const relatedTopics = topic.relatedTopics.flatMap((slug) => {
		const summary = summariesBySlug.get(slug);
		return summary ? [summary] : [];
	});

	return {
		topic,
		relatedTopics,
		seo: {
			title: `${topic.title} Topic Headquarters | ${siteTitle}`,
			description: topic.description,
			canonicalUrl,
			ogImageUrl: absoluteUrl(topic.bestStartingArticle.thumbnail),
			ogImageAlt: topic.bestStartingArticle.thumbnailAlt ?? topic.bestStartingArticle.title,
			ogImageWidth: topic.bestStartingArticle.thumbnailWidth,
			ogImageHeight: topic.bestStartingArticle.thumbnailHeight,
			type: 'website' as const,
			modifiedTime: topic.effectiveDateModified,
			keywords: [topic.title, ...topic.sourceTags, 'Topic Headquarters', 'Suvro Ghosh'],
			schema: withSiteGraph([
				collectionPageSchema({
					name: `${topic.title} Topic Headquarters`,
					description: topic.description,
					url: canonicalUrl,
					about: topic.title,
					datePublished: topic.date,
					dateModified: topic.effectiveDateModified
				}),
				breadcrumbSchema([
					{ name: 'Home', url: siteUrl },
					{ name: 'Topic Headquarters', url: `${siteUrl}/topics` },
					{ name: topic.title, url: canonicalUrl }
				]),
				itemListSchema({
					name: `${topic.title} curated reading sequence`,
					url: canonicalUrl,
					items: uniqueCuratedResources.map((resource) => ({
						name: resource.title,
						url: absoluteUrl(resource.path) ?? canonicalUrl
					}))
				}),
				faqPageSchema(topic.faqs, canonicalUrl),
				definedTermSetSchema({
					name: `${topic.title} glossary`,
					url: canonicalUrl,
					items: topic.glossary.map((entry) => ({
						term: entry.term,
						definition: entry.definition,
						url: entry.relatedPath ? absoluteUrl(entry.relatedPath) : undefined
					}))
				})
			])
		}
	};
};
