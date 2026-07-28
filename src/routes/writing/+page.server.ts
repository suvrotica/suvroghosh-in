import type { PageServerLoad } from './$types';
import { categoryLabel } from '$lib/content/categories';
import { getPublishedPosts } from '$lib/server/content/posts';

export const prerender = true;

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

	const featuredShelves = categories.filter((category) =>
		['games', 'visualizations'].includes(category.slug)
	);
	const majorCategories = categories
		.filter((category) => !featuredShelves.some((featured) => featured.slug === category.slug))
		.slice(0, 12 - featuredShelves.length);
	majorCategories.unshift(...featuredShelves);

	return {
		recentPosts: posts.slice(0, 6).map(postSummary),
		majorCategories,
		categoryCount: categories.length
	};
};
