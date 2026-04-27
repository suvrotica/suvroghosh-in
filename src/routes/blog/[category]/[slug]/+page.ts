import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';
import { siteUrl, defaultOgImage, blogPostingSchema } from '$lib/components/seo/SEO';
import { slugifyCategory, categoryLabel } from '$lib/content/categories';

export const load: PageLoad = async ({ params }) => {
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
			schema: blogPostingSchema({
				...metadata,
				slug: slug.toLowerCase(),
				category: normalizedCategory,
				canonicalUrl
			})
		};

		return {
			content,
			metadata: {
				...metadata,
				categorySlug: normalizedCategory,
				categoryLabel: categoryLabel(normalizedCategory),
			},
			seo
		};
	} catch (e) {
		console.error(`Error loading post ${slug}:`, e);
		error(404, 'Essay not found');
	}
};