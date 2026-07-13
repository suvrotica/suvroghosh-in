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

publishedPosts.sort((a, b) => {
	const dateDifference = new Date(b.date).getTime() - new Date(a.date).getTime();
	return dateDifference || a.slug.localeCompare(b.slug);
});

const postsBySlug = new Map(publishedPosts.map((post) => [post.slug, post]));
const nonTopicalTags = new Set(['suvroghosh', 'suvro ghosh']);

function normalizeTag(tag: string) {
	return tag.trim().toLocaleLowerCase('en');
}

const tagDocumentFrequency = new Map<string, number>();

for (const post of publishedPosts) {
	const uniqueTags = new Set(
		(post.tags ?? []).map(normalizeTag).filter((tag) => tag && !nonTopicalTags.has(tag))
	);

	for (const tag of uniqueTags) {
		tagDocumentFrequency.set(tag, (tagDocumentFrequency.get(tag) ?? 0) + 1);
	}
}

function postLink(post: PublishedPost) {
	return {
		title: post.title,
		slug: post.slug,
		categorySlug: post.categorySlug,
		categoryLabel: post.categoryLabel,
		date: post.date
	};
}

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

export function getPublishedPostsByYear(year: string) {
	if (!/^\d{4}$/.test(year)) return [];
	return publishedPosts.filter((post) => post.date.startsWith(`${year}-`));
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

export function getPostNavigation(slug: string) {
	const currentIndex = publishedPosts.findIndex((post) => post.slug === slug);
	if (currentIndex === -1) return { newer: null, older: null };

	return {
		newer: currentIndex > 0 ? postLink(publishedPosts[currentIndex - 1]) : null,
		older:
			currentIndex < publishedPosts.length - 1 ? postLink(publishedPosts[currentIndex + 1]) : null
	};
}

export function getRelatedPosts(slug: string, limit = 4) {
	const current = getPublishedPost(slug);
	if (!current) return [];

	const currentTags = new Map<string, string>();
	for (const tag of current.tags ?? []) {
		const normalizedTag = normalizeTag(tag);
		if (normalizedTag && !nonTopicalTags.has(normalizedTag) && !currentTags.has(normalizedTag)) {
			currentTags.set(normalizedTag, tag.trim());
		}
	}

	const currentDate = new Date(current.date).getTime();

	return publishedPosts
		.filter((post) => post.slug !== slug)
		.map((post) => {
			const postTags = new Set((post.tags ?? []).map(normalizeTag));
			const sharedTags = Array.from(currentTags, ([normalizedTag, label]) => ({
				label,
				weight:
					Math.log(
						(publishedPosts.length + 1) / ((tagDocumentFrequency.get(normalizedTag) ?? 0) + 1)
					) + 1,
				shared: postTags.has(normalizedTag)
			}))
				.filter((tag) => tag.shared)
				.sort((a, b) => b.weight - a.weight || a.label.localeCompare(b.label));
			const sameCategory = post.categorySlug === current.categorySlug;
			const sharedTagScore = sharedTags.slice(0, 5).reduce((total, tag) => total + tag.weight, 0);

			return {
				...postLink(post),
				thumbnail: post.thumbnail,
				sharedTags: sharedTags.slice(0, 2).map((tag) => tag.label),
				sameCategory,
				score: sharedTagScore + (sameCategory ? 1.5 : 0),
				dateDistance: Math.abs(new Date(post.date).getTime() - currentDate)
			};
		})
		.filter((post) => post.score > 0)
		.sort(
			(a, b) =>
				b.score - a.score ||
				a.dateDistance - b.dateDistance ||
				new Date(b.date).getTime() - new Date(a.date).getTime() ||
				a.slug.localeCompare(b.slug)
		)
		.slice(0, limit)
		.map(
			({
				title,
				slug,
				categorySlug,
				categoryLabel,
				date,
				thumbnail,
				sharedTags,
				sameCategory
			}) => ({
				title,
				slug,
				categorySlug,
				categoryLabel,
				date,
				thumbnail,
				sharedTags,
				sameCategory
			})
		);
}
