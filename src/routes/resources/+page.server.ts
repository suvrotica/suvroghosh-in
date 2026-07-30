import type { PageServerLoad } from './$types';
import {
	collectionPageSchema,
	itemListSchema,
	personId,
	siteUrl,
	withSiteGraph
} from '$lib/components/seo/SEO';
import type { ResourceCardRecord } from '$lib/content/resources';
import { getImageDimensions } from '$lib/server/image-metadata';
import {
	getAllPublishedResources,
	getRelatedResources,
	getResourcesByKind,
	newestPublishedResourceDate
} from '$lib/server/content/resources';

export const prerender = true;

const title = 'Useful Prompts, Word Lists, Templates and Reference Guides';
const description =
	'A practical collection of reusable prompts, word lists, checklists, templates and compact reference material.';
const canonicalUrl = `${siteUrl}/resources`;
const fieldKitImage = '/images/resources/field-kit.webp';

function catalogueRecord(
	resource: ReturnType<typeof getAllPublishedResources>[number]
): ResourceCardRecord {
	const dimensions = getImageDimensions(resource.thumbnail);
	if (!dimensions) {
		throw new Error(`Field Kit image metadata is missing for ${resource.thumbnail}.`);
	}

	return {
		...resource,
		tags: [...resource.tags],
		...(resource.related ? { related: [...resource.related] } : {}),
		thumbnailWidth: dimensions.width,
		thumbnailHeight: dimensions.height,
		relatedResources: getRelatedResources(resource, 2)
	};
}

export const load: PageServerLoad = () => {
	const prompts = getResourcesByKind('prompt').map(catalogueRecord);
	const lists = getResourcesByKind('list').map(catalogueRecord);
	const displayedResources = [...prompts, ...lists];
	const imageDimensions = getImageDimensions(fieldKitImage);
	if (!imageDimensions) {
		throw new Error(`Field Kit image metadata is missing for ${fieldKitImage}.`);
	}

	const collectionSchema = {
		...collectionPageSchema({
			name: 'The Field Kit',
			description,
			url: canonicalUrl,
			datePublished: '2026-07-30',
			dateModified: newestPublishedResourceDate()
		}),
		creator: { '@id': personId },
		author: { '@id': personId }
	};

	return {
		prompts,
		lists,
		fieldKitImage: {
			src: fieldKitImage,
			alt: 'A labelled field notebook with prompt cards, word slips and precise index marks',
			width: imageDimensions.width,
			height: imageDimensions.height
		},
		seo: {
			title,
			description,
			canonicalUrl,
			ogImageUrl: `${siteUrl}${fieldKitImage}`,
			ogImageAlt: 'A labelled field notebook with prompt cards, word slips and precise index marks',
			ogImageWidth: imageDimensions.width,
			ogImageHeight: imageDimensions.height,
			type: 'website' as const,
			modifiedTime: newestPublishedResourceDate(),
			keywords: [
				'reusable prompts',
				'word lists',
				'writing templates',
				'reference guides',
				'The Field Kit'
			],
			schema: withSiteGraph([
				collectionSchema,
				itemListSchema({
					name: 'The Field Kit resources',
					url: canonicalUrl,
					items: displayedResources.map((resource) => ({
						name: resource.title,
						description: resource.description,
						url: `${siteUrl}${resource.path}`
					}))
				})
			])
		}
	};
};
