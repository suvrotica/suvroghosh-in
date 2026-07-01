import { error, redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';
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
import { validatePublishedPostMetadata, postPath, type BlogPostMetadata } from '$lib/content/posts';

const postPathAliases: Record<string, string> = {
	'artificial-intelligence/ai-meaningful-work-and-the-trust-collapse':
		'/blog/artificial-intelligence/ai-meaningful-work-trust-collapse',
	'career/intro': '/blog/career/the-new-mantra',
	'healthcare-it/arrow_uncertainty_medical_care_healthcare_it':
		'/blog/economics/kenneth-arrow-medical-care',
	'healthcare-it/confounding-factors-healthcare-it-analytics':
		'/blog/healthcare-it/confounding-factors',
	'healthcare-it/-a-read-this-first': '/blog/career/-a-read-this-first',
	'healthcare-it/hie-first-principles-openhie': '/blog/healthcare-it/hie-from-first-principles',
	'healthcare-it/latent-space-in-healthcare-data':
		'/blog/healthcare-it/latent-space-healthcare-data',
	'healthcare-it/trolley-problem-healthcare-it':
		'/blog/healthcare-it/the-trolley-problem-is-already-hiding-in-healthcare',
	'healthcare-it/va-healthcare-data-systems-mumps-to-sql':
		'/blog/healthcare-it/how-va-healthcare-data-systems-work',
	'personal-essay/trapezoid-for-my-mother': '/blog/personal-essay/a-trapezoid-in-low-light'
};

export const load: PageLoad = async ({ params }) => {
	const { category, slug } = params;
	const aliasPath = postPathAliases[`${slugifyCategory(category)}/${slug}`];
	if (aliasPath) {
		redirect(308, aliasPath);
	}

	try {
		const post = await import(`../../../../../src/lib/posts/${slug}.md`);

		const metadata = post.metadata;
		validatePublishedPostMetadata(metadata, `${slug}.md`);
		const content = post.default;

		const normalizedCategory = slugifyCategory(metadata.category ?? category);
		const expectedPath = postPath({ category: metadata.category ?? category, slug });
		if (`/blog/${category}/${slug}` !== expectedPath) {
			redirect(308, expectedPath);
		}

		const canonicalUrl = blogPostUrl(metadata.category ?? category, slug);
		const catLabel = categoryLabel(normalizedCategory);

		const postKeywords = [...(metadata.tags || []), metadata.category, 'Suvro Ghosh']
			.filter(Boolean)
			.slice(0, 15);

		const breadcrumbs = breadcrumbSchema([
			{ name: 'Home', url: siteUrl },
			{ name: 'Blog', url: `${siteUrl}/blog` },
			{ name: catLabel, url: `${siteUrl}/blog/${normalizedCategory}` },
			{ name: metadata.title, url: canonicalUrl }
		]);

		const seo = {
			title: `${metadata.title} | ${siteTitle}`,
			description: metadata.description,
			canonicalUrl,
			ogImageUrl: absoluteUrl(metadata.thumbnail) ?? defaultOgImage,
			ogImageAlt: metadata.thumbnailAlt ?? metadata.title,
			type: 'article' as const,
			publishedTime: metadata.date,
			modifiedTime: metadata.dateModified ?? metadata.date,
			author: metadata.author ?? 'Suvro Ghosh',
			keywords: postKeywords,
			category: catLabel,
			tags: metadata.tags ?? [],
			schema: schemaGraph([
				blogPostingSchema({
					...metadata,
					slug,
					category: catLabel,
					canonicalUrl
				}),
				breadcrumbs
			])
		};

		const postModules = import.meta.glob<BlogPostMetadata>('/src/lib/posts/*.md', {
			import: 'metadata'
		});

		const relatedPosts: {
			title: string;
			slug: string;
			category: string;
			date?: string;
			thumbnail?: string;
		}[] = [];

		for (const path in postModules) {
			const fileName = path.split('/').pop()?.slice(0, -3);
			if (!fileName || fileName === slug) continue;

			const loader = postModules[path];
			const meta = await loader();

			if (meta.published === false || !meta.title) continue;

			const postCat = slugifyCategory(meta.category || 'uncategorized');
			const sharedTags = Array.isArray(meta.tags)
				? meta.tags.filter((tag: string) => metadata.tags?.includes(tag)).length
				: 0;
			if (postCat === normalizedCategory || sharedTags > 0) {
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
			slug,
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
		if (e && typeof e === 'object' && 'status' in e && 'location' in e) {
			throw e;
		}
		console.error(`Error loading post ${slug}:`, e);
		error(404, 'Essay not found');
	}
};
