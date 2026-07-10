import { categoryLabel, slugifyCategory } from '$lib/content/categories';
import {
	isIndexablePost,
	validatePublishedPostMetadata,
	type BlogPostMetadata
} from '$lib/content/posts';

export type PublishedPost = BlogPostMetadata & {
	slug: string;
	categorySlug: string;
	categoryLabel: string;
};

const metadataModules = import.meta.glob<BlogPostMetadata>('/src/lib/posts/*.md', {
	eager: true,
	import: 'metadata'
});

const publishedPosts: PublishedPost[] = [];

for (const [path, metadata] of Object.entries(metadataModules)) {
	const slug = path.split('/').pop()?.replace(/\.md$/, '') ?? '';
	if (!slug || !isIndexablePost(metadata, slug)) continue;

	validatePublishedPostMetadata(metadata, `${slug}.md`);
	const categorySlug = slugifyCategory(metadata.category);

	publishedPosts.push({
		...metadata,
		slug,
		categorySlug,
		categoryLabel: categoryLabel(categorySlug)
	});
}

publishedPosts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

const postsBySlug = new Map(publishedPosts.map((post) => [post.slug, post]));

export function getPublishedPosts() {
	return publishedPosts.slice();
}

export function getPublishedPost(slug: string) {
	return postsBySlug.get(slug);
}

export function getPublishedPostsByCategory(category: string) {
	const categorySlug = slugifyCategory(category);
	return publishedPosts.filter((post) => post.categorySlug === categorySlug);
}

export function getPostSearchFacets() {
	const categoryCounts = new Map<string, { label: string; count: number }>();
	const yearCounts = new Map<string, number>();

	for (const post of publishedPosts) {
		const category = categoryCounts.get(post.categorySlug);
		categoryCounts.set(post.categorySlug, {
			label: post.categoryLabel,
			count: (category?.count ?? 0) + 1
		});

		const year = /^\d{4}/.exec(post.date)?.[0];
		if (year) yearCounts.set(year, (yearCounts.get(year) ?? 0) + 1);
	}

	return {
		categories: Array.from(categoryCounts, ([slug, value]) => ({ slug, ...value })).sort((a, b) =>
			a.label.localeCompare(b.label)
		),
		years: Array.from(yearCounts, ([value, count]) => ({ value, count })).sort((a, b) =>
			b.value.localeCompare(a.value)
		)
	};
}

export function getRelatedPosts(slug: string, limit = 4) {
	const current = getPublishedPost(slug);
	if (!current) return [];

	const currentTags = new Set(current.tags ?? []);

	return publishedPosts
		.filter((post) => {
			if (post.slug === slug) return false;
			const sharedTags = (post.tags ?? []).some((tag) => currentTags.has(tag));
			return post.categorySlug === current.categorySlug || sharedTags;
		})
		.slice(0, limit)
		.map(({ title, slug: relatedSlug, categorySlug, date, thumbnail }) => ({
			title,
			slug: relatedSlug,
			category: categorySlug ?? 'uncategorized',
			date,
			thumbnail
		}));
}
