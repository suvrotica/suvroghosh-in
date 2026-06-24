import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';
import { siteUrl, defaultOgImage, blogPostingSchema, breadcrumbSchema } from '$lib/components/seo/SEO';
import { slugifyCategory, categoryLabel } from '$lib/content/categories';

export const load: PageLoad = async ({ params }) => {
	const { category, slug } = params;

	try {
		const post = await import(`../../../../../src/lib/posts/${slug}.md`);

		const metadata = post.metadata;
		const content = post.default;

		const normalizedCategory = slugifyCategory(metadata.category ?? category);
		const canonicalUrl = `${siteUrl}/blog/${normalizedCategory}/${slug.toLowerCase()}`;
		const catLabel = categoryLabel(normalizedCategory);

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

		const breadcrumbs = breadcrumbSchema([
			{ name: 'Home', url: siteUrl },
			{ name: 'Blog', url: `${siteUrl}/blog` },
			{ name: catLabel, url: `${siteUrl}/blog/${normalizedCategory}` },
			{ name: metadata.title, url: canonicalUrl }
		]);

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

		const postModules = import.meta.glob('/src/lib/posts/*.md', { import: 'metadata' });

		const relatedPosts: { title: string; slug: string; category: string; date?: string; thumbnail?: string }[] = [];

		for (const path in postModules) {
			const fileName = path.split('/').pop()?.slice(0, -3).toLowerCase();
			if (!fileName || fileName === slug.toLowerCase()) continue;

			const loader = postModules[path] as () => Promise<any>;
			const meta = await loader();

			if (meta.published === false || !meta.title) continue;

			const postCat = slugifyCategory(meta.category || 'uncategorized');
			if (postCat === normalizedCategory) {
				relatedPosts.push({
					title: meta.title,
					slug: fileName,
					category: postCat,
					date: meta.date,
					thumbnail: meta.thumbnail
				});
			}
		}

		relatedPosts.sort((a, b) => {
			const dateA = a.date ? new Date(a.date).getTime() : 0;
			const dateB = b.date ? new Date(b.date).getTime() : 0;
			return dateB - dateA;
		});

		return {
			relatedPosts: relatedPosts.slice(0, 4),
			content,
			metadata: {
				...metadata,
				categorySlug: normalizedCategory,
				categoryLabel: catLabel
			},
			seo
		};
	} catch (e) {
		console.error(`Error loading post ${slug}:`, e);
		error(404, 'Essay not found');
	}
};