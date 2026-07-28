import { error, redirect } from '@sveltejs/kit';
import type { EntryGenerator, PageServerLoad } from './$types';
import {
	siteUrl,
	siteTitle,
	defaultOgImage,
	absoluteUrl,
	blogPostUrl,
	blogPostingSchema,
	breadcrumbSchema,
	faqPageSchema,
	withSiteGraph
} from '$lib/components/seo/SEO';
import { slugifyCategory, categoryLabel } from '$lib/content/categories';
import { postPath, redirectedPostPath, sanitizeEssayInk } from '$lib/content/posts';
import { getImageDimensions } from '$lib/server/image-metadata';
import {
	getPostNavigation,
	getPostTopicLinks,
	getPublishedPost,
	getPublishedPosts,
	getRelatedPosts
} from '$lib/server/content/posts';
import { getComicEpisodeMetadata } from '$lib/server/comics/catalog';

// Canonical posts are static, while the server fallback preserves legacy/category redirects.
export const prerender = 'auto';

export const entries: EntryGenerator = () =>
	getPublishedPosts()
		.filter(({ categorySlug }) => categorySlug !== 'games')
		.map(({ categorySlug, slug }) => ({ category: categorySlug, slug }));

export const load: PageServerLoad = async ({ params }) => {
	const { category, slug } = params;
	const aliasPath = redirectedPostPath(category, slug);
	if (aliasPath) redirect(308, aliasPath);

	const metadata = getPublishedPost(slug);
	if (!metadata) error(404, 'Essay not found');

	const normalizedCategory = slugifyCategory(metadata.category);
	const expectedPath = postPath({ category: metadata.category, slug });
	if (`/blog/${category}/${slug}` !== expectedPath) redirect(308, expectedPath);

	const canonicalUrl = blogPostUrl(metadata.category, slug);
	const catLabel = categoryLabel(normalizedCategory);
	const topicLabels = [...metadata.tags, ...(metadata.series ?? []), ...metadata.derivedTopics];
	const keywords = [...topicLabels, metadata.category, 'Suvro Ghosh'].filter(Boolean).slice(0, 15);
	const ogImageDimensions = metadata.thumbnail
		? getImageDimensions(metadata.thumbnail)
		: { width: 1200, height: 800 };
	const comicEpisode = getComicEpisodeMetadata();
	const comicTags = new Set(comicEpisode.tags.map((tag) => tag.toLocaleLowerCase('en')));
	const sharedComicTags = topicLabels.filter((tag) => comicTags.has(tag.toLocaleLowerCase('en')));

	const breadcrumbs = breadcrumbSchema([
		{ name: 'Home', url: siteUrl },
		{ name: 'Blog', url: `${siteUrl}/blog` },
		{ name: catLabel, url: `${siteUrl}/blog/${normalizedCategory}` },
		{ name: metadata.title, url: canonicalUrl }
	]);

	return {
		slug,
		essayInk: sanitizeEssayInk(metadata.color),
		postNavigation: getPostNavigation(slug),
		postTopics: getPostTopicLinks(topicLabels),
		relatedPosts: getRelatedPosts(slug),
		relatedComic:
			sharedComicTags.length > 0
				? {
						title: comicEpisode.title,
						description: comicEpisode.description,
						href: comicEpisode.canonicalPath,
						label: comicEpisode.published ? 'Comic episode' : 'Comic production edition',
						sharedTags: sharedComicTags.slice(0, 3)
					}
				: null,
		metadata: {
			...metadata,
			categorySlug: normalizedCategory,
			categoryLabel: catLabel
		},
		seo: {
			title: `${metadata.title} | ${siteTitle}`,
			description: metadata.description,
			canonicalUrl,
			ogImageUrl: absoluteUrl(metadata.thumbnail) ?? defaultOgImage,
			ogImageAlt: metadata.thumbnailAlt ?? metadata.title,
			ogImageWidth: ogImageDimensions?.width ?? 0,
			ogImageHeight: ogImageDimensions?.height ?? 0,
			type: 'article' as const,
			publishedTime: metadata.date,
			modifiedTime: metadata.dateModified,
			author: metadata.author ?? 'Suvro Ghosh',
			keywords,
			category: catLabel,
			tags: topicLabels,
			schema: withSiteGraph([
				blogPostingSchema({
					...metadata,
					tags: topicLabels,
					slug,
					category: catLabel,
					canonicalUrl
				}),
				breadcrumbs,
				...(metadata.faq?.length ? [faqPageSchema(metadata.faq, canonicalUrl)] : [])
			])
		}
	};
};
