import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { promotedTopicPath } from '$lib/content/topics';

export const prerender = false;

export const GET: RequestHandler = ({ params }) => {
	const headquartersPath = promotedTopicPath(params.slug);
	if (!headquartersPath) {
		error(404, 'That tag does not have a Topic Headquarters.');
	}

	redirect(308, headquartersPath);
};
