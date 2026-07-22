import type { PageServerLoad } from './$types';
import { getPublishedPosts } from '$lib/server/content/posts';

export const prerender = true;

export const load: PageServerLoad = () => ({
	recentPosts: getPublishedPosts()
		.slice(0, 4)
		.map(({ slug, title, description, date, categorySlug, categoryLabel }) => ({
			slug,
			title,
			description,
			date,
			categorySlug,
			categoryLabel
		}))
});
