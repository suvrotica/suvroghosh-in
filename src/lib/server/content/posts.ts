import { categoryLabel, slugifyCategory } from '$lib/content/categories';
import {
	SECTIONS,
	requireSectionSlug,
	sectionLabel as displaySectionLabel,
	type SectionSlug
} from '$lib/content/sections';
import {
	isIndexablePost,
	tagSearchPath,
	validatePublishedPostMetadata,
	type BlogPostMetadata
} from '$lib/content/posts';
import {
	canonicalTopicSlug,
	isNavigationalTopic,
	MIN_TOPIC_CATEGORIES,
	MIN_TOPIC_POSTS,
	promotedTopicPath,
	topicPath
} from '$lib/content/topics';
import { readingPathDefinitions, type ReadingPathSummary } from '$lib/content/reading-paths';
import { musicPostSlugs } from '$lib/generated/music-posts';

export type PublishedPost = BlogPostMetadata & {
	slug: string;
	categorySlug: string;
	categoryLabel: string;
	sectionSlug: SectionSlug;
	sectionLabel: string;
	derivedTopics: string[];
};

export type PublishedArchiveMonth = {
	year: string;
	month: string;
	count: number;
	lastModified: string;
};

const metadataModules = import.meta.glob<BlogPostMetadata>('/src/lib/posts/*.md', {
	eager: true,
	import: 'metadata'
});

const publishedPosts: PublishedPost[] = [];
const musicPostSlugSet = new Set<string>(musicPostSlugs);

for (const [path, metadata] of Object.entries(metadataModules)) {
	const slug = path.split('/').pop()?.replace(/\.md$/, '') ?? '';
	if (!slug || !isIndexablePost(metadata, slug)) continue;

	validatePublishedPostMetadata(metadata, `${slug}.md`);
	const categorySlug = slugifyCategory(metadata.category);
	const sectionSlug = requireSectionSlug(metadata.category, slug);

	publishedPosts.push({
		...metadata,
		slug,
		categorySlug,
		categoryLabel: categoryLabel(categorySlug),
		sectionSlug,
		sectionLabel: displaySectionLabel(sectionSlug),
		derivedTopics: musicPostSlugSet.has(slug) ? ['Music'] : []
	});
}

publishedPosts.sort((a, b) => {
	const dateDifference = new Date(b.date).getTime() - new Date(a.date).getTime();
	return dateDifference || a.slug.localeCompare(b.slug);
});

const archiveMonthAccumulators = new Map<
	string,
	{ year: string; month: string; count: number; lastModified: string }
>();

for (const post of publishedPosts) {
	const dateParts = /^(\d{4})-(\d{2})-\d{2}$/.exec(post.date);
	if (!dateParts) continue;

	const [, year, month] = dateParts;
	const key = `${year}-${month}`;
	const lastModified = post.dateModified ?? post.date;
	const archiveMonth = archiveMonthAccumulators.get(key) ?? {
		year,
		month,
		count: 0,
		lastModified
	};

	archiveMonth.count += 1;
	if (lastModified > archiveMonth.lastModified) archiveMonth.lastModified = lastModified;
	archiveMonthAccumulators.set(key, archiveMonth);
}

const publishedArchiveMonths: readonly PublishedArchiveMonth[] = Array.from(
	archiveMonthAccumulators.values()
).sort((a, b) => `${b.year}-${b.month}`.localeCompare(`${a.year}-${a.month}`));

const postsBySlug = new Map(publishedPosts.map((post) => [post.slug, post]));
const nonTopicalTags = new Set(['suvroghosh', 'suvro ghosh']);

function normalizeTag(tag: string) {
	return tag.trim().toLocaleLowerCase('en');
}

const tagDocumentFrequency = new Map<string, number>();

type TopicAccumulator = {
	posts: PublishedPost[];
	labels: Map<string, number>;
	categories: Set<string>;
	lastModified: string;
};

export type PublishedTopic = {
	slug: string;
	label: string;
	href: string;
	count: number;
	categoryCount: number;
	lastModified: string;
};

const topicAccumulators = new Map<string, TopicAccumulator>();

for (const post of publishedPosts) {
	const uniqueTags = new Set(
		[...(post.tags ?? []), ...(post.series ?? [])]
			.map(normalizeTag)
			.filter((tag) => tag && !nonTopicalTags.has(tag))
	);

	for (const tag of uniqueTags) {
		tagDocumentFrequency.set(tag, (tagDocumentFrequency.get(tag) ?? 0) + 1);
	}

	const seenTopics = new Set<string>();
	for (const rawTag of [...(post.tags ?? []), ...(post.series ?? []), ...post.derivedTopics]) {
		const label = rawTag.trim();
		const topicSlug = canonicalTopicSlug(label);
		if (!label || !isNavigationalTopic(label) || seenTopics.has(topicSlug)) continue;

		seenTopics.add(topicSlug);
		const lastModified = post.dateModified ?? post.date;
		const topic = topicAccumulators.get(topicSlug) ?? {
			posts: [],
			labels: new Map<string, number>(),
			categories: new Set<string>(),
			lastModified
		};

		topic.posts.push(post);
		topic.labels.set(label, (topic.labels.get(label) ?? 0) + 1);
		topic.categories.add(post.categorySlug);
		if (new Date(lastModified).getTime() > new Date(topic.lastModified).getTime()) {
			topic.lastModified = lastModified;
		}
		topicAccumulators.set(topicSlug, topic);
	}
}

function preferredTopicLabel(labels: Map<string, number>) {
	return Array.from(labels.entries()).sort(
		(a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'en', { sensitivity: 'base' })
	)[0]?.[0];
}

const publishedTopics: PublishedTopic[] = Array.from(topicAccumulators, ([slug, topic]) => ({
	slug,
	label: preferredTopicLabel(topic.labels) ?? slug,
	href: promotedTopicPath(slug) ?? topicPath(slug),
	count: topic.posts.length,
	categoryCount: topic.categories.size,
	lastModified: topic.lastModified
}))
	.filter(
		(topic) =>
			topic.slug === 'music' ||
			(topic.count >= MIN_TOPIC_POSTS && topic.categoryCount >= MIN_TOPIC_CATEGORIES)
	)
	.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

const publishedTopicsBySlug = new Map(publishedTopics.map((topic) => [topic.slug, topic]));

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

export function getCuratedReadingPaths() {
	return readingPathDefinitions.map(({ postSlugs, ...path }) => ({
		...path,
		posts: postSlugs.map((slug) => {
			const post = getPublishedPost(slug);
			if (!post) {
				throw new Error(
					`Curated reading path "${path.id}" references an unpublished post: ${slug}`
				);
			}

			return {
				slug: post.slug,
				title: post.title,
				description: post.description,
				date: post.date,
				dateModified: post.dateModified,
				readingTime: post.readingTime,
				categorySlug: post.categorySlug,
				categoryLabel: post.categoryLabel
			};
		})
	}));
}

export function getCuratedReadingPathSummaries(): ReadingPathSummary[] {
	return getCuratedReadingPaths().map(({ id, eyebrow, label, description }) => ({
		id,
		eyebrow,
		label,
		description
	}));
}

export function getPublishedPostsByCategory(category: string) {
	const categorySlug = slugifyCategory(category);
	return publishedPosts.filter((post) => post.categorySlug === categorySlug);
}

export function getPublishedPostsBySection(section: string) {
	return publishedPosts.filter((post) => post.sectionSlug === section);
}

export function getPublishedPostsByYear(year: string) {
	if (!/^\d{4}$/.test(year)) return [];
	return publishedPosts.filter((post) => post.date.startsWith(`${year}-`));
}

export function getPublishedPostsByMonth(year: string, month: string) {
	if (!/^\d{4}$/.test(year) || !/^(?:0[1-9]|1[0-2])$/.test(month)) return [];
	return publishedPosts.filter((post) => post.date.startsWith(`${year}-${month}-`));
}

export function getPublishedArchiveMonths(year?: string) {
	return publishedArchiveMonths
		.filter((archiveMonth) => !year || archiveMonth.year === year)
		.map((archiveMonth) => ({ ...archiveMonth }));
}

export function getPublishedTopics() {
	return publishedTopics.slice();
}

export function getPublishedTopic(topic: string) {
	return publishedTopicsBySlug.get(canonicalTopicSlug(topic));
}

export function getPublishedPostsByTopic(topic: string) {
	const slug = canonicalTopicSlug(topic);
	if (!publishedTopicsBySlug.has(slug)) return [];
	return topicAccumulators.get(slug)?.posts.slice() ?? [];
}

export function getPostTopicLinks(tags: string[]) {
	const seenDestinations = new Set<string>();

	return tags.flatMap((rawTag) => {
		const label = rawTag.trim();
		const slug = canonicalTopicSlug(label);
		if (!label || !slug) return [];

		const headquartersPath = promotedTopicPath(label);
		const topic = publishedTopicsBySlug.get(slug);
		const href = headquartersPath ?? (topic ? topicPath(topic.slug) : tagSearchPath(label));
		if (seenDestinations.has(href)) return [];

		seenDestinations.add(href);
		return [
			{
				label: topic?.label ?? label,
				href,
				hasLandingPage: Boolean(headquartersPath || topic),
				isHeadquarters: Boolean(headquartersPath)
			}
		];
	});
}

export function getPostSearchFacets() {
	const categoryCounts = new Map<string, { label: string; count: number }>();
	const sectionCounts = new Map<SectionSlug, number>();
	const yearCounts = new Map<string, number>();

	for (const post of publishedPosts) {
		const category = categoryCounts.get(post.categorySlug);
		categoryCounts.set(post.categorySlug, {
			label: post.categoryLabel,
			count: (category?.count ?? 0) + 1
		});
		sectionCounts.set(post.sectionSlug, (sectionCounts.get(post.sectionSlug) ?? 0) + 1);

		const year = /^\d{4}/.exec(post.date)?.[0];
		if (year) yearCounts.set(year, (yearCounts.get(year) ?? 0) + 1);
	}

	return {
		sections: (Object.keys(SECTIONS) as SectionSlug[]).map((slug) => ({
			slug,
			label: displaySectionLabel(slug),
			count: sectionCounts.get(slug) ?? 0
		})),
		categories: Array.from(categoryCounts, ([slug, value]) => ({ slug, ...value })).sort((a, b) =>
			a.label.localeCompare(b.label)
		),
		years: Array.from(yearCounts, ([value, count]) => ({ value, count })).sort((a, b) =>
			b.value.localeCompare(a.value)
		),
		topics: getPublishedTopics()
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
	for (const tag of [...(current.tags ?? []), ...(current.series ?? [])]) {
		const normalizedTag = normalizeTag(tag);
		if (normalizedTag && !nonTopicalTags.has(normalizedTag) && !currentTags.has(normalizedTag)) {
			currentTags.set(normalizedTag, tag.trim());
		}
	}

	const currentDate = new Date(current.date).getTime();

	return publishedPosts
		.filter((post) => post.slug !== slug)
		.map((post) => {
			const postTags = new Set([...(post.tags ?? []), ...(post.series ?? [])].map(normalizeTag));
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
				thumbnailAlt: post.thumbnailAlt,
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
				thumbnailAlt,
				sharedTags,
				sameCategory
			}) => ({
				title,
				slug,
				categorySlug,
				categoryLabel,
				date,
				thumbnail,
				thumbnailAlt,
				sharedTags,
				sameCategory
			})
		);
}
