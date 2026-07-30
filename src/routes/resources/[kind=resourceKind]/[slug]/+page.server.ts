import { error } from '@sveltejs/kit';
import type { EntryGenerator, PageServerLoad } from './$types';
import {
	absoluteUrl,
	breadcrumbSchema,
	resourceCreativeWorkSchema,
	siteUrl,
	withSiteGraph
} from '$lib/components/seo/SEO';
import {
	isResourceKindSegment,
	resourceKindFromSegment,
	resourceKindLabel
} from '$lib/content/resources';
import { getImageDimensions } from '$lib/server/image-metadata';
import {
	getAllPublishedResources,
	getPublishedResource,
	getRelatedResources
} from '$lib/server/content/resources';

export const prerender = true;

export const entries: EntryGenerator = () =>
	getAllPublishedResources().map(({ kindSegment: kind, slug }) => ({ kind, slug }));

export const load: PageServerLoad = ({ params }) => {
	if (!isResourceKindSegment(params.kind)) error(404, 'Resource not found');

	const kind = resourceKindFromSegment(params.kind);
	const resource = getPublishedResource(kind, params.slug);
	if (!resource) error(404, 'Resource not found');

	const canonicalUrl = `${siteUrl}${resource.path}`;
	const dimensions = getImageDimensions(resource.thumbnail);
	if (!dimensions) {
		throw new Error(`Field Kit image metadata is missing for ${resource.thumbnail}.`);
	}

	const categoryHash = resource.kind === 'prompt' ? '#prompts' : '#word-lists';
	const categoryLabel = resource.kind === 'prompt' ? 'Prompts' : 'Word Lists';
	const breadcrumbs = breadcrumbSchema([
		{ name: 'Home', url: siteUrl },
		{ name: 'The Field Kit', url: `${siteUrl}/resources` },
		{ name: categoryLabel, url: `${siteUrl}/resources${categoryHash}` },
		{ name: resource.title, url: canonicalUrl }
	]);

	return {
		resource,
		relatedResources: getRelatedResources(resource, 4),
		thumbnailWidth: dimensions.width,
		thumbnailHeight: dimensions.height,
		seo: {
			title: `${resource.title} | The Field Kit`,
			description: resource.description,
			canonicalUrl,
			ogImageUrl: absoluteUrl(resource.thumbnail),
			ogImageAlt: resource.thumbnailAlt,
			ogImageWidth: dimensions.width,
			ogImageHeight: dimensions.height,
			type: 'article' as const,
			publishedTime: resource.date,
			modifiedTime: resource.dateModified ?? resource.date,
			author: 'Suvro Ghosh',
			category: resourceKindLabel(resource.kind),
			tags: resource.tags,
			keywords: [...resource.tags, 'The Field Kit', resourceKindLabel(resource.kind)],
			schema: withSiteGraph([
				resourceCreativeWorkSchema({
					title: resource.title,
					description: resource.description,
					canonicalUrl,
					date: resource.date,
					dateModified: resource.dateModified,
					thumbnail: resource.thumbnail,
					tags: resource.tags,
					language: resource.language,
					genre: resourceKindLabel(resource.kind)
				}),
				breadcrumbs
			])
		}
	};
};
