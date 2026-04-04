import type { ServerLoad } from '@sveltejs/kit';
import { siteSEO, websiteSchema } from '$lib/components/seo/SEO';

export type Article = {
	title: string;
	slug: string;
	category: string;
	published?: boolean;
};

export type Category = {
	name: string;
	articles: Article[];
};

export const load: ServerLoad = async () => {
    // Eagerly import all markdown files
	const modules = import.meta.glob('/src/lib/posts/*.md', { eager: true });
	const posts: Article[] = [];
    
	for (const path in modules) {
		const file = modules[path] as any;
		const slug = path.split('/').pop()?.slice(0, -3).toLowerCase();

		if (file && file.metadata && slug) {
			const metadata = file.metadata;
			if (metadata.published !== false && metadata.title) {
				posts.push({
					...metadata,
					slug,
					category: (metadata.category || 'uncategorized').toLowerCase()
				});
			}
		}
	}

    // Group posts by category
	const categoriesMap: Map<string, Article[]> = new Map();
	posts.forEach((post) => {
		const category = post.category;
		if (!categoriesMap.has(category)) {
			categoriesMap.set(category, []);
		}
		categoriesMap.get(category)?.push(post);
	});
	
    const categories: Category[] = Array.from(categoriesMap.entries()).map(([name, articles]) => ({
		name,
		articles: articles.sort((a, b) => a.title.localeCompare(b.title))
	}));

	categories.sort((a, b) => a.name.localeCompare(b.name));

	return {
		categories,
		seo: siteSEO,
		schema: websiteSchema
	};
};