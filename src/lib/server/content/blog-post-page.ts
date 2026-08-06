import { error, redirect } from '@sveltejs/kit';
import {
	absoluteUrl,
	blogPostingSchema,
	blogPostUrl,
	breadcrumbSchema,
	defaultOgImage,
	faqPageSchema,
	siteTitle,
	siteUrl,
	withSiteGraph
} from '$lib/components/seo/SEO';
import { categoryLabel, slugifyCategory } from '$lib/content/categories';
import { postPath, redirectedPostPath, sanitizeEssayInk } from '$lib/content/posts';
import { getImageDimensions } from '$lib/server/image-metadata';
import {
	getPostNavigation,
	getPostTopicLinks,
	getPublishedPost,
	getRelatedPosts
} from '$lib/server/content/posts';

export function loadPublishedBlogPost(category: string, slug: string) {
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
	const visibleTopicLabels = metadata.pinnedTags?.length
		? metadata.pinnedTags.slice(0, 5)
		: topicLabels;
	const keywords = [...topicLabels, metadata.category, 'Suvro Ghosh'].filter(Boolean).slice(0, 15);
	const ogImageDimensions = metadata.thumbnail
		? getImageDimensions(metadata.thumbnail)
		: { width: 1200, height: 800 };
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
		postTopics: getPostTopicLinks(visibleTopicLabels),
		relatedPosts: getRelatedPosts(slug),
		metadata: {
			...metadata,
			categorySlug: normalizedCategory,
			categoryLabel: catLabel
		},
		seo: {
			title: metadata.seoTitle ?? `${metadata.title} | ${siteTitle}`,
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
}
