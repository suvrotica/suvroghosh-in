import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

interface Post {
    slug: string;
    title: string;
    date: string;
    description: string;
    thumbnail?: string;
    category: string;
    published?: boolean;
}

// 🚨 FIX 1: We explicitly request ({ params }) so SvelteKit knows to re-run this when the URL changes
export const load: PageServerLoad = async ({ params }) => {
    // Extract the category from the URL (e.g., "Healthcare")
    const { category } = params;
    const targetCategory = category.toLowerCase();

    const postFiles = import.meta.glob('/src/lib/posts/*.md', { eager: true });

    try {
        const posts = Object.entries(postFiles)
            .map(([path, file]): Post | null => {
                const slug = path.split('/').pop()?.slice(0, -3);

                if (file && typeof file === 'object' && 'metadata' in file && slug) {
                    const metadata = file.metadata as Omit<Post, 'slug'>;
                    if (metadata.published === false) return null;
                    
                    const postCategory = (metadata.category || 'uncategorized').toLowerCase();
                    
                    // 🚨 FIX 2: Actually filter the posts so it ONLY returns posts for this category
                    if (postCategory === targetCategory) {
                        return {
                            ...metadata,
                            slug,
                            thumbnail: metadata.thumbnail,
                            category: metadata.category || 'uncategorized',
                            date: metadata.date || new Date(0).toISOString() // Safety fallback for missing dates
                        };
                    }
                }
                return null; // Skip posts that don't match the category
            })
            .filter((post): post is Post => post !== null);

        // Sort earliest first
        posts.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        // Return the filtered posts AND the category name back to the UI
        return { 
            posts,
            category // This passes the category name (e.g., "Healthcare") to your +page.svelte
        };
    } catch (e) {
        console.error(e);
        error(500, 'Could not load category posts.');
    }
};