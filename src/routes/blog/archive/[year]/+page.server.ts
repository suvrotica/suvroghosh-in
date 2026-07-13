import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { paginate, parsePageNumber } from '$lib/content/pagination';
import { getPostSearchFacets, getPublishedPostsByYear } from '$lib/server/content/posts';

export const load: PageServerLoad = ({ params, url }) => {
	if (!/^\d{4}$/.test(params.year)) {
		error(404, 'That year is not a valid archive.');
	}

	const posts = getPublishedPostsByYear(params.year);
	if (posts.length === 0) {
		error(404, `No published writing was found for ${params.year}.`);
	}

	const paginated = paginate(posts, parsePageNumber(url.searchParams.get('page')));

	return {
		year: params.year,
		posts: paginated.items,
		page: paginated.page,
		totalResults: paginated.totalItems,
		totalPages: paginated.totalPages,
		years: getPostSearchFacets().years
	};
};
