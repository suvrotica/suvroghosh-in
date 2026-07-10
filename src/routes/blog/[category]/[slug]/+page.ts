import { error } from '@sveltejs/kit';
import type { Component } from 'svelte';
import type { PageLoad } from './$types';

type PostModule = {
	default: Component;
};

const postModules = import.meta.glob<PostModule>('/src/lib/posts/*.md');

export const load: PageLoad = async ({ data, params }) => {
	const loader = postModules[`/src/lib/posts/${params.slug}.md`];
	if (!loader) error(404, 'Essay not found');

	try {
		const post = await loader();
		return {
			...data,
			content: post.default
		};
	} catch (cause) {
		console.error(`Error loading post ${params.slug}:`, cause);
		error(404, 'Essay not found');
	}
};
