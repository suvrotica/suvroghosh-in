import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';
import { siteUrl, defaultOgImage, blogPostingSchema, breadcrumbSchema } from '$lib/components/seo/SEO';
import { slugifyCategory, categoryLabel } from '$lib/content/categories';

export const load: PageLoad = async ({ params, data: serverData }) => {
	const { category, slug } = params;

	try {
		// Dynamically import the markdown file
		const post = await import(`../../../../../src/lib/posts/${slug}.md`);
		
		const metadata = post.metadata;
		// This is the compiled Svelte component from your markdown
		const content = post.default; 

		// Ensure the category matches our normalized taxonomy
		const normalizedCategory = slugifyCategory(metadata.category ?? category);
		const canonicalUrl = `${siteUrl}/blog/${normalizedCategory}/${slug.toLowerCase()}`;
		const catLabel = categoryLabel(normalizedCategory);

		// Build page-specific keywords from post tags + title words
		const titleWords = (metadata.title || '')
			.split(/\s+/)
			.filter((w: string) => w.length > 3)
			.map((w: string) => w.replace(/[^a-zA-Z]/g, ''));
		const postKeywords = [
			...(metadata.tags || []),
			...titleWords,
			metadata.category,
			'Suvro Ghosh'
		].filter(Boolean).slice(0, 15);

		// Breadcrumb schema for rich SERP breadcrumbs
		const breadcrumbs = breadcrumbSchema([
			{ name: 'Home', url: siteUrl },
			{ name: 'Blog', url: `${siteUrl}/blog` },
			{ name: catLabel, url: `${siteUrl}/blog/${normalizedCategory}` },
			{ name: metadata.title, url: canonicalUrl }
		]);

		// Build robust SEO data tailored for an Article
		const seo = {
			title: `${metadata.title} | SuvroGhosh.In`,
			description: metadata.description,
			canonicalUrl,
			ogImageUrl: metadata.thumbnail ? `${siteUrl}${metadata.thumbnail}` : defaultOgImage,
			ogImageAlt: metadata.thumbnailAlt ?? metadata.title,
			type: 'article' as const,
			publishedTime: metadata.date,
			modifiedTime: metadata.dateModified ?? metadata.date,
			author: metadata.author ?? 'Suvro Ghosh',
			keywords: postKeywords,
			schema: {
				'@context': 'https://schema.org',
				'@graph': [
					blogPostingSchema({
						...metadata,
						slug: slug.toLowerCase(),
						category: normalizedCategory,
						canonicalUrl
					}),
					breadcrumbs
				]
			}
		};

		return {
			relatedPosts: serverData.relatedPosts ?? [],
			content,
			metadata: {
				...metadata,
				categorySlug: normalizedCategory,
				categoryLabel: catLabel,
			},
			seo
		};
	} catch (e) {
		console.error(`Error loading post ${slug}:`, e);
		error(404, 'Essay not found');
	}
};