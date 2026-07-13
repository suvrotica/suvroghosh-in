import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { paginate, parsePageNumber } from '$lib/content/pagination';
import { canonicalTopicSlug, topicPath } from '$lib/content/topics';
import {
	getPublishedPostsByTopic,
	getPublishedTopic,
	getPublishedTopics
} from '$lib/server/content/posts';

export const load: PageServerLoad = ({ params, url }) => {
	const canonicalSlug = canonicalTopicSlug(params.topic);
	if (!canonicalSlug) {
		error(404, 'That topic address is not valid.');
	}
	if (params.topic !== canonicalSlug) {
		redirect(308, topicPath(canonicalSlug));
	}

	const topic = getPublishedTopic(canonicalSlug);
	if (!topic) {
		error(404, 'That tag has not yet become an established topic.');
	}

	const paginated = paginate(
		getPublishedPostsByTopic(canonicalSlug),
		parsePageNumber(url.searchParams.get('page'))
	);

	return {
		topic,
		posts: paginated.items,
		page: paginated.page,
		totalResults: paginated.totalItems,
		totalPages: paginated.totalPages,
		topics: getPublishedTopics()
	};
};
