import type { PageServerLoad } from './$types';
import { getSeriesDefinition } from '$lib/content/series';
import {
	getCuratedReadingPathSummaries,
	getPublishedPosts,
	getPublishedSeries
} from '$lib/server/content/posts';
import { getImageDimensions } from '$lib/server/image-metadata';

export const prerender = true;

const FEATURED_SERIES_ID = 'patient-through-machine';

export const load: PageServerLoad = () => {
	const definition = getSeriesDefinition(FEATURED_SERIES_ID);
	if (!definition) throw new Error(`Missing series definition: ${FEATURED_SERIES_ID}`);

	const featuredParts = getPublishedSeries(FEATURED_SERIES_ID).map((post) => {
		if (!post.thumbnail) {
			throw new Error(`Featured series post is missing a thumbnail: ${post.slug}`);
		}

		const dimensions = getImageDimensions(post.thumbnail);
		if (!dimensions) {
			throw new Error(`Featured series thumbnail is missing image metadata: ${post.thumbnail}`);
		}

		return {
			slug: post.slug,
			categorySlug: post.categorySlug,
			title: post.title,
			description: post.description,
			date: post.date,
			readingTime: post.readingTime,
			thumbnail: post.thumbnail,
			imageWidth: dimensions.width,
			imageHeight: dimensions.height,
			part: post.seriesPart,
			chapter: post.seriesChapter
		};
	});

	if (featuredParts.length === 0) {
		throw new Error(`Featured series has no published installments: ${FEATURED_SERIES_ID}`);
	}

	return {
		featuredSeries: {
			id: definition.id,
			title: definition.title,
			eyebrow: definition.eyebrow,
			description: definition.description,
			parts: featuredParts
		},
		recentPosts: getPublishedPosts()
			.slice(0, 4)
			.map(({ slug, title, description, date, categorySlug, categoryLabel, sectionLabel }) => ({
				slug,
				title,
				description,
				date,
				categorySlug,
				categoryLabel,
				sectionLabel
			})),
		readingPaths: getCuratedReadingPathSummaries()
	};
};
