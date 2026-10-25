import type { PageServerLoad } from './$types';
import { getPublishedPostsByCollection } from '$lib/server/content/posts';

export const prerender = true;

export const load: PageServerLoad = () => ({
	posts: getPublishedPostsByCollection('apps')
});
