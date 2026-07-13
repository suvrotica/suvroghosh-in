import type { PageServerLoad } from './$types';
import { getPublishedTopics } from '$lib/server/content/posts';

export const load: PageServerLoad = () => ({
	topics: getPublishedTopics()
});
