import type { PageLoad } from './$types';
import { slugifyCategory, categoryLabel } from '$lib/content/categories';
import {
	isIndexablePost,
	validatePublishedPostMetadata,
	type BlogPostSummary
} from '$lib/content/posts';

export const load: PageLoad = async () => {
	const postFiles = import.meta.glob<{ metadata: BlogPostSummary }>('/src/lib/posts/*.md');

	const postPromises = Object.entries(postFiles).map(async ([path, resolver]) => {
		const mod = await resolver();
		const { metadata } = mod;
		const slug = path.split('/').pop()?.replace('.md', '') ?? '';
		if (!isIndexablePost(metadata, slug)) return null;
		validatePublishedPostMetadata(metadata, `${slug}.md`);
		return { ...metadata, slug };
	});

	const posts = (await Promise.all(postPromises)).filter((post) => post !== null);
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
