import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ data }) => {
    const modules = import.meta.glob('/src/lib/posts/*.md');
    const resolver = modules[data.resolvedPath];

    if (!resolver) error(404, `Could not load content for: ${data.metadata.title}`);

    const post: any = await resolver();
    return {
        content: post.default,
        ...data 
    };
};