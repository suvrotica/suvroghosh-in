// File: src/routes/blog/[category]/[slug]/+page.server.ts
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

interface PostMetadata {
    title: string;
    description: string;
    date?: string;
    thumbnail?: string;
    published?: boolean;
    keywords?: string[];
    category?: string;
    [key: string]: unknown;
}

export const load: PageServerLoad = async ({ params, url }) => {
    const { slug, category } = params;

    try {
        const postModules = import.meta.glob('/src/lib/posts/*.md', { import: 'metadata' });
        
        const matchingPath = Object.keys(postModules).find((path) => {
            const fileName = path.split('/').pop()?.slice(0, -3).toLowerCase();
            return fileName === slug.toLowerCase();
        });

        if (!matchingPath) {
            error(404, { message: `Could not find post: ${slug}` });
        }

        const metadataLoader = postModules[matchingPath];
        const post = (await metadataLoader()) as PostMetadata;

        if (post.published === false) {
            error(404, { message: 'This post is not available.' });
        }

        const canonicalUrl = `${url.origin}/blog/${category}/${slug}`;
        const fallbackImage = `${url.origin}/images/photo.jpeg`; // Ensure this image exists in your static folder
        
        const seo = {
            title: `${post.title} | SuvroGhosh.In`, 
            description: post.description,
            canonicalUrl,
            ogImageUrl: post.thumbnail ? `${url.origin}${post.thumbnail}` : fallbackImage,
            ogImageAlt: post.title,
            keywords: post.keywords || []
        };
        
        return { 
            metadata: post, 
            seo, 
            resolvedPath: matchingPath 
        };

    } catch (err: any) {
        if (err?.status === 404) throw err;
        console.error(`[Blog Load Error] Failed to load post ${slug}:`, err);
        error(500, { message: 'Internal Server Error' });
    }
};