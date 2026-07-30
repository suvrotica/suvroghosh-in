import { error } from '@sveltejs/kit';
import type { Component } from 'svelte';
import type { PageLoad } from './$types';

type ResourceModule = {
	default: Component;
};

const promptModules = import.meta.glob<ResourceModule>('/src/lib/prompts/*.md');
const listModules = import.meta.glob<ResourceModule>('/src/lib/lists/*.md');

export const load: PageLoad = async ({ data, params }) => {
	const modules = params.kind === 'prompts' ? promptModules : listModules;
	const sourcePath = `/src/lib/${params.kind}/${params.slug}.md`;
	const loader = modules[sourcePath];
	if (!loader || data.resource.kindSegment !== params.kind) error(404, 'Resource not found');

	try {
		const resourceModule = await loader();
		return {
			...data,
			content: resourceModule.default
		};
	} catch {
		error(404, 'Resource not found');
	}
};
