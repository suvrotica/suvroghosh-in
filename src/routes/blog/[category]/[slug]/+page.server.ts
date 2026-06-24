// File: src/routes/blog/[category]/[slug]/+page.server.ts
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { slugifyCategory } from '$lib/content/categories';

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

interface RelatedPost {
    title: string;
    slug: string;
    category: string;
    date?: string;
    thumbnail?: string;
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

        // Fetch related posts from the same category (excluding current post)
        const normalizedCategory = slugifyCategory(post.category ?? category);
        const relatedPosts: RelatedPost[] = [];

        for (const path in postModules) {
            const fileName = path.split('/').pop()?.slice(0, -3).toLowerCase();
            if (!fileName || fileName === slug.toLowerCase()) continue;

            const loader = postModules[path];
            const meta = (await loader()) as PostMetadata;

            if (meta.published === false || !meta.title) continue;

            const postCat = slugifyCategory(meta.category || 'uncategorized');
            if (postCat === normalizedCategory) {
                relatedPosts.push({
                    title: meta.title,
                    slug: fileName,
                    category: postCat,
                    date: meta.date,
                    thumbnail: meta.thumbnail
                });
            }
        }

        // Sort related posts by date, newest first, limit to 4
        relatedPosts.sort((a, b) => {
            const dateA = a.date ? new Date(a.date).getTime() : 0;
            const dateB = b.date ? new Date(b.date).getTime() : 0;
            return dateB - dateA;
        });

        const canonicalUrl = `${url.origin}/blog/${category}/${slug}`;
        const fallbackImage = `${url.origin}/images/photo.jpeg`;
        
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
            resolvedPath: matchingPath,
            relatedPosts: relatedPosts.slice(0, 4)
        };

    } catch (err: any) {
        if (err?.status === 404) throw err;
        console.error(`[Blog Load Error] Failed to load post ${slug}:`, err);
        error(500, { message: 'Internal Server Error' });
    }
};