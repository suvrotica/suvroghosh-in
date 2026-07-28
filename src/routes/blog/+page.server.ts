import type { PageServerLoad } from './$types';
import { slugifyCategory } from '$lib/content/categories';
import { isSectionSlug } from '$lib/content/sections';
import { getPostSearchFacets, getPublishedPosts } from '$lib/server/content/posts';
import { searchPublishedPosts, type PostSearchSort } from '$lib/server/content/search';
import { paginate, parsePageNumber } from '$lib/content/pagination';
import { getComicEpisodeMetadata } from '$lib/server/comics/catalog';

const searchSorts = new Set<PostSearchSort>(['relevance', 'newest', 'oldest']);

export const load: PageServerLoad = async ({ url }) => {
	const search = url.searchParams.get('search')?.trim() ?? '';
	const rawSection = url.searchParams.get('section')?.trim() ?? '';
	const section = isSectionSlug(rawSection) ? rawSection : '';
	const rawCategory = url.searchParams.get('category')?.trim() ?? '';
	const category = rawCategory ? slugifyCategory(rawCategory) : '';
	const tag = url.searchParams.get('tag')?.trim() ?? '';
	const rawYear = url.searchParams.get('year')?.trim() ?? '';
	const year = /^\d{4}$/.test(rawYear) ? rawYear : '';
	const rawSort = url.searchParams.get('sort')?.trim() as PostSearchSort | undefined;
	const sort = rawSort && searchSorts.has(rawSort) ? rawSort : 'relevance';
	const requestedPage = parsePageNumber(url.searchParams.get('page'));
	const isSearching = Boolean(search || section || category || tag || year || sort !== 'relevance');
	const matchingPosts = isSearching
		? await searchPublishedPosts({ query: search, section, category, tag, year, sort })
		: getPublishedPosts();
	const paginated = paginate(matchingPosts, requestedPage);
	const comic = getComicEpisodeMetadata();

	return {
		posts: paginated.items,
		search,
		section,
		category,
		tag,
		year,
		sort,
		isSearching,
		page: paginated.page,
		totalResults: paginated.totalItems,
		totalPages: paginated.totalPages,
		facets: getPostSearchFacets(),
		comic: {
			title: comic.title,
			description: comic.description,
			href: comic.canonicalPath,
			pageCount: comic.storyPageCount,
			published: comic.published
		}
	};
};
