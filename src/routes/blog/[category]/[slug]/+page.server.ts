import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import {
	siteUrl,
	siteTitle,
	defaultOgImage,
	absoluteUrl,
	blogPostUrl,
	blogPostingSchema,
	breadcrumbSchema,
	schemaGraph
} from '$lib/components/seo/SEO';
import { slugifyCategory, categoryLabel } from '$lib/content/categories';
import { postPath, redirectedPostPath } from '$lib/content/posts';
import {
	getPostNavigation,
	getPostTopicLinks,
	getPublishedPost,
	getRelatedPosts
} from '$lib/server/content/posts';

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
	const keywords = [...metadata.tags, metadata.category, 'Suvro Ghosh']
		.filter(Boolean)
		.slice(0, 15);

	const breadcrumbs = breadcrumbSchema([
		{ name: 'Home', url: siteUrl },
		{ name: 'Blog', url: `${siteUrl}/blog` },
		{ name: catLabel, url: `${siteUrl}/blog/${normalizedCategory}` },
		{ name: metadata.title, url: canonicalUrl }
	]);

	return {
		slug,
		postNavigation: getPostNavigation(slug),
		postTopics: getPostTopicLinks(metadata.tags),
		relatedPosts: getRelatedPosts(slug),
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
			type: 'article' as const,
			publishedTime: metadata.date,
			modifiedTime: metadata.dateModified ?? metadata.date,
			author: metadata.author ?? 'Suvro Ghosh',
			keywords,
			category: catLabel,
			tags: metadata.tags,
			schema: schemaGraph([
				blogPostingSchema({
					...metadata,
					slug,
					category: catLabel,
					canonicalUrl
				}),
				breadcrumbs
			])
		}
	};
};
