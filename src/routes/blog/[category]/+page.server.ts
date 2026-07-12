import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { slugifyCategory, categoryLabel } from '$lib/content/categories';
import { paginate, parsePageNumber } from '$lib/content/pagination';
import { getPublishedPostsByCategory } from '$lib/server/content/posts';

export const load: PageServerLoad = async ({ params, url }) => {
	try {
		const normalizedRouteCategory = slugifyCategory(params.category);
		if (params.category !== normalizedRouteCategory) {
			redirect(308, `/blog/${normalizedRouteCategory}`);
		}

		const filteredPosts = getPublishedPostsByCategory(normalizedRouteCategory);

		if (filteredPosts.length === 0) {
			error(404, `No posts found for category: ${params.category}`);
		}

		const paginated = paginate(filteredPosts, parsePageNumber(url.searchParams.get('page')));

		return {
			categorySlug: normalizedRouteCategory,
			categoryDisplay: categoryLabel(normalizedRouteCategory),
			posts: paginated.items,
			page: paginated.page,
			totalResults: paginated.totalItems,
			totalPages: paginated.totalPages
		};
	} catch (e) {
		if (e && typeof e === 'object' && 'status' in e && 'location' in e) {
			throw e;
		}
		console.error(e);
		error(404, 'Failed to load category.');
	}
};
