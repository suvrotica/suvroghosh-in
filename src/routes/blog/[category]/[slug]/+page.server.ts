import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, url }) => {
	try {
        const { slug, category } = params;
		const postModules = import.meta.glob('/src/lib/posts/*.md', { import: 'metadata' });
		
        const matchingPath = Object.keys(postModules).find((path) => {
            const fileName = path.split('/').pop()?.replace('.md', '').toLowerCase();
            return fileName === slug.toLowerCase();
        });

		if (!matchingPath) error(404, { message: `Could not find post: ${slug}` });

		const metadataLoader = postModules[matchingPath];
		const post = (await metadataLoader()) as any;

		if (post.published === false) error(404, { message: 'This post is not available' });

		const canonicalUrl = `${url.origin}/blog/${category}/${slug}`;
		const seo = {
			title: `${post.title} | SuvroGhosh.In`, 
			description: post.description,
			canonicalUrl: canonicalUrl,
			ogImageUrl: post.thumbnail ? `${url.origin}${post.thumbnail}` : `${url.origin}/images/placeholders/default.png`,
		};

		return { metadata: post, seo, resolvedPath: matchingPath };
	} catch (e: any) {
		if (e?.status === 404) throw e;
		error(500, { message: 'Internal Server Error' });
	}
};