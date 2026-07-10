import type { PageServerLoad } from './$types';
import { categoryLabel } from '$lib/content/categories';
import { getPublishedPosts } from '$lib/server/content/posts';

export const load: PageServerLoad = async () => {
	const posts = getPublishedPosts();
	const groups = new Map<string, typeof posts>();

	for (const post of posts) {
		const categorySlug = post.categorySlug ?? 'uncategorized';
		if (!groups.has(categorySlug)) groups.set(categorySlug, []);
		groups.get(categorySlug)!.push(post);
	}

	const categories = Array.from(groups.entries())
		.map(([slug, articles]) => ({
			slug,
			label: categoryLabel(slug),
			count: articles.length,
			posts: articles.slice(0, 3)
		}))
		.sort((a, b) => a.label.localeCompare(b.label));

	return {
		recentPosts: posts.filter((post) => post.categorySlug === 'healthcare-it').slice(0, 6),
		categories
	};
};
