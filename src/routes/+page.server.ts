import type { PageServerLoad } from './$types';
import { getCuratedReadingPathSummaries, getPublishedPosts } from '$lib/server/content/posts';

export const prerender = true;

export const load: PageServerLoad = () => ({
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
});
