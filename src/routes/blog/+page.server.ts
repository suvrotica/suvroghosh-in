import type { PageServerLoad } from './$types';
import { slugifyCategory } from '$lib/content/categories';
import { getPostSearchFacets, getPublishedPosts } from '$lib/server/content/posts';
import { searchPublishedPosts, type PostSearchSort } from '$lib/server/content/search';

const searchSorts = new Set<PostSearchSort>(['relevance', 'newest', 'oldest']);

export const load: PageServerLoad = async ({ url }) => {
	const search = url.searchParams.get('search')?.trim() ?? '';
	const rawCategory = url.searchParams.get('category')?.trim() ?? '';
	const category = rawCategory ? slugifyCategory(rawCategory) : '';
	const rawYear = url.searchParams.get('year')?.trim() ?? '';
	const year = /^\d{4}$/.test(rawYear) ? rawYear : '';
	const rawSort = url.searchParams.get('sort')?.trim() as PostSearchSort | undefined;
	const sort = rawSort && searchSorts.has(rawSort) ? rawSort : 'relevance';
	const isSearching = Boolean(search || category || year);
	const posts = isSearching
		? await searchPublishedPosts({ query: search, category, year, sort })
		: getPublishedPosts();

	return {
		posts,
		search,
		category,
		year,
		sort,
		isSearching,
		facets: getPostSearchFacets()
	};
};
