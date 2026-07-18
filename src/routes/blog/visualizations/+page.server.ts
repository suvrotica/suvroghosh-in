import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getPublishedPostsByCategory } from '$lib/server/content/posts';

export const load: PageServerLoad = () => {
	const posts = getPublishedPostsByCategory('visualizations');
	if (posts.length === 0) error(404, 'No published visualizations found.');

	return {
		posts,
		totalResults: posts.length
	};
};
