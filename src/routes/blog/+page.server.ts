import type { PageServerLoad } from './$types';
import { getPublishedPosts } from '$lib/server/content/posts';
import { searchPublishedPosts } from '$lib/server/content/search';

export const load: PageServerLoad = async ({ url }) => {
	const search = url.searchParams.get('search')?.trim() ?? '';
	const posts = search ? await searchPublishedPosts(search) : getPublishedPosts();

	return {
		posts,
		search
	};
};
