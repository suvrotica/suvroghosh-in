import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { paginate, parsePageNumber } from '$lib/content/pagination';
import { getPublishedArchiveMonths, getPublishedPostsByMonth } from '$lib/server/content/posts';

export const load: PageServerLoad = ({ params, url }) => {
	if (!/^\d{4}$/.test(params.year) || !/^(?:0[1-9]|1[0-2])$/.test(params.month)) {
		error(404, 'That month is not a valid archive.');
	}

	const posts = getPublishedPostsByMonth(params.year, params.month);
	if (posts.length === 0) {
		error(404, `No published writing was found for ${params.year}-${params.month}.`);
	}

	const paginated = paginate(posts, parsePageNumber(url.searchParams.get('page')));

	return {
		year: params.year,
		month: params.month,
		posts: paginated.items,
		page: paginated.page,
		totalResults: paginated.totalItems,
		totalPages: paginated.totalPages,
		months: getPublishedArchiveMonths(params.year)
	};
};
