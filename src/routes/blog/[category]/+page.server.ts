import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
// IMPORT our centralized taxonomy handlers
import { slugifyCategory, categoryLabel } from '$lib/content/categories';

interface Post {
    slug: string;
    title: string;
    date: string;
    description?: string;
    thumbnail?: string;
    category: string;
    published?: boolean;
}

export const load: PageServerLoad = async ({ params }) => {
    try {
        // 1. Normalize the URL parameter using our central function
        const normalizedRouteCategory = slugifyCategory(params.category);
        
        // 2. Fetch all posts eagerly
        const postFiles = import.meta.glob('/src/lib/posts/*.md', { eager: true });
        let posts: Post[] = [];

        for (const path in postFiles) {
            const file = postFiles[path] as any;
            const slug = path.split('/').pop()?.replace('.md', '');

            if (file && file.metadata && slug && file.metadata.published !== false) {
                posts.push({
                    ...file.metadata,
                    slug,
                    category: file.metadata.category || 'uncategorized'
                });
            }
        }

        // 3. Filter using the exact same slugify logic
        const filteredPosts = posts.filter(post => {
            const normalizedPostCategory = slugifyCategory(post.category);
            return normalizedPostCategory === normalizedRouteCategory;
        });

        if (filteredPosts.length === 0) {
            error(404, `No posts found for category: ${params.category}`);
        }

        // 4. Sort posts by newest first
        filteredPosts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        // Return the clean data AND the proper human-readable label
        return {
            categorySlug: normalizedRouteCategory,
            categoryDisplay: categoryLabel(normalizedRouteCategory),
            posts: filteredPosts
        };
    } catch (e) {
        console.error(e);
        error(404, 'Failed to load category.');
    }
};
