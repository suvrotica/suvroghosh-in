import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';
import type { Component } from 'svelte';

export const load: PageLoad = async ({ data }) => {
    // 1. Cast data to 'any' to bypass the lagging SvelteKit type generator 
    // that incorrectly thinks this data is coming from the category page.
    const serverData = data as any; 

    // 2. Tell Vite to map all markdown files as dynamic imports
    const modules = import.meta.glob('/src/lib/posts/*.md');
    
    // 3. Safety check: Ensure the server passed a valid resolvedPath
    if (!serverData.resolvedPath || !modules[serverData.resolvedPath]) {
        const title = serverData.metadata?.title || 'this post';
        error(404, `Could not load Markdown content for: ${title}`);
    }

    try {
        // 4. Resolve the dynamic import to get the parsed MDSvex Svelte component
        const resolver = modules[serverData.resolvedPath];
        const post = await resolver() as { default: Component };
        
        return {
            ...serverData, // Keep the metadata, SEO, and schema passed from +page.server.ts
            content: post.default // The renderable Svelte component
        };
    } catch (err) {
        console.error(`[Markdown Parse Error] Failed to load component for ${serverData.resolvedPath}:`, err);
        error(500, "Failed to render the markdown content.");
    }
};