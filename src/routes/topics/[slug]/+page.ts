import { error } from '@sveltejs/kit';
import type { Component } from 'svelte';
import type { PageLoad } from './$types';

type TopicModule = {
	default: Component;
};

const topicModules = import.meta.glob<TopicModule>([
	'/src/lib/topics/*.md',
	'!/src/lib/topics/README.md'
]);

export const load: PageLoad = async ({ data, params }) => {
	const loader = topicModules[`/src/lib/topics/${params.slug}.md`];
	if (!loader) error(404, 'That Topic Headquarters does not exist.');

	try {
		const topic = await loader();
		return {
			...data,
			content: topic.default
		};
	} catch (cause) {
		console.error(`Error loading Topic Headquarters ${params.slug}:`, cause);
		error(404, 'That Topic Headquarters does not exist.');
	}
};
