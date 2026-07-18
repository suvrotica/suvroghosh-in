import type { PageServerLoad } from './$types';
import { categoryLabel } from '$lib/content/categories';
import { getPublishedPosts } from '$lib/server/content/posts';

function postSummary(post: ReturnType<typeof getPublishedPosts>[number]) {
	return {
		slug: post.slug,
		title: post.title,
		description: post.description,
		date: post.date,
		categorySlug: post.categorySlug,
		categoryLabel: post.categoryLabel
	};
}

export const load: PageServerLoad = () => {
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
			posts: articles.slice(0, 3).map(postSummary)
		}))
		.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

	const visualizations = categories.find((category) => category.slug === 'visualizations');
	const majorCategories = categories
		.filter((category) => category.slug !== 'visualizations')
		.slice(0, visualizations ? 11 : 12);
	if (visualizations) majorCategories.unshift(visualizations);

	return {
		recentPosts: posts.slice(0, 6).map(postSummary),
		majorCategories,
		categoryCount: categories.length
	};
};
