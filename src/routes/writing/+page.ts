import type { PageLoad } from './$types';
import { slugifyCategory, categoryLabel } from '$lib/content/categories';

export const load: PageLoad = async () => {
	const postFiles = import.meta.glob('/src/lib/posts/*.md');

	const postPromises = Object.entries(postFiles).map(async ([path, resolver]) => {
		const mod: any = await resolver();
		const { metadata } = mod;
		const slug = path.split('/').pop()?.replace('.md', '') ?? '';
		return { ...metadata, slug };
	});

	let posts = await Promise.all(postPromises);
	posts = posts.filter((post) => post.published !== false);
	posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

	const groups = new Map<string, typeof posts>();
	for (const post of posts) {
		const cat = slugifyCategory(post.category || 'uncategorized');
		if (!groups.has(cat)) groups.set(cat, []);
		groups.get(cat)!.push(post);
	}

	const categories = Array.from(groups.entries())
		.map(([slug, articles]) => ({
			slug,
			label: categoryLabel(slug),
			count: articles.length,
			posts: articles.slice(0, 3)
		}))
		.sort((a, b) => a.label.localeCompare(b.label));

	const healthcareItPosts = posts.filter(
		(post) => slugifyCategory(post.category || 'uncategorized') === 'healthcare-it'
	);

	return {
		recentPosts: healthcareItPosts.slice(0, 6),
		categories
	};
};