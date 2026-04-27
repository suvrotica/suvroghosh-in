import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
    try {
        // 1. Decode the URL parameter safely (handles spaces and special chars)
        const currentCategory = decodeURIComponent(params.category);

        // 2. Fetch all posts using Vite's eager glob import
        const paths = import.meta.glob('/src/lib/posts/*.md', { eager: true });
        let posts = [];

        for (const path in paths) {
            const file = paths[path];
            const slug = path.split('/').pop()?.replace('.md', '');

            if (file && typeof file === 'object' && 'metadata' in file && slug) {
                const metadata = file.metadata as { 
                    title: string; 
                    date: string; 
                    categories: string[]; 
                    published: boolean; 
                    description?: string;
                };
                
                if (metadata.published) {
                    posts.push({ ...metadata, slug });
                }
            }
        }

        // 3. Filter posts case-insensitively to prevent Windows vs Vercel mismatches
        const filteredPosts = posts.filter(post =>
            post.categories?.some(c => c.toLowerCase() === currentCategory.toLowerCase())
        );

        if (filteredPosts.length === 0) {
            error(404, `No posts found for category: ${currentCategory}`);
        }

        // 4. Sort by date descending
        filteredPosts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        return {
            category: currentCategory,
            posts: filteredPosts
        };
    } catch (e) {
        error(404, 'Category route failed to load.');
    }
};
