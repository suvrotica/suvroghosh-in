import type { PageServerLoad } from './$types';
import { getCuratedReadingPaths } from '$lib/server/content/posts';

export const load: PageServerLoad = () => ({
	paths: getCuratedReadingPaths()
});
