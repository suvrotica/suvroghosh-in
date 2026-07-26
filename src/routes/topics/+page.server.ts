import type { PageServerLoad } from './$types';
import { getTopicHeadquartersSummaries } from '$lib/server/content/topic-headquarters';

export const prerender = true;

export const load: PageServerLoad = () => {
	const topics = getTopicHeadquartersSummaries().sort(
		(left, right) => left.group.localeCompare(right.group) || left.title.localeCompare(right.title)
	);

	return {
		topics,
		effectiveDateModified: topics.reduce(
			(latest, topic) =>
				topic.effectiveDateModified > latest ? topic.effectiveDateModified : latest,
			'1970-01-01'
		)
	};
};
