import { getPublishedPost } from '$lib/server/content/posts';
import type { PageServerLoad } from './$types';

export const prerender = true;

const selectedAnalysis = [
	{
		slug: 'fhir-the-universal-language-of-health-data',
		focus: 'Interoperability & standards'
	},
	{
		slug: 'va-healthcare-data-systems-mumps-to-sql',
		focus: 'Legacy clinical data'
	},
	{
		slug: 'confounding-factors-healthcare-it-analytics',
		focus: 'Clinical analytics'
	},
	{
		slug: 'latent-space-in-healthcare-data',
		focus: 'AI data readiness'
	}
] as const;

export const load: PageServerLoad = () => {
	return {
		selectedAnalysis: selectedAnalysis.map(({ slug, focus }) => {
			const post = getPublishedPost(slug);
			if (!post) throw new Error(`Selected healthcare analysis is missing or unpublished: ${slug}`);

			return {
				slug: post.slug,
				title: post.title,
				description: post.description,
				date: post.date,
				categorySlug: post.categorySlug,
				focus
			};
		})
	};
};
