import { error } from '@sveltejs/kit';
import type { Component } from 'svelte';
import type { PageLoad } from './$types';

export const prerender = false;

type PostModule = {
	default: Component;
};

const postModules = import.meta.glob<PostModule>(
	'/src/lib/posts/the-meaning-connection-map.md'
);

export const load: PageLoad = async ({ data }) => {
	const loader = postModules['/src/lib/posts/the-meaning-connection-map.md'];
	if (!loader) error(404, 'Essay not found');

	try {
		const post = await loader();
		return { ...data, content: post.default };
	} catch (cause) {
		console.error('Error loading post the-meaning-connection-map:', cause);
		error(404, 'Essay not found');
	}
};
