import type { PageServerLoad } from './$types';
import { professionalProjects } from '$lib/content/professional-projects';
import { getPublishedPost } from '$lib/server/content/posts';

export const prerender = true;

export const load: PageServerLoad = () => ({
	projects: professionalProjects.map(({ relatedPostSlugs, ...project }) => ({
		...project,
		relatedPosts: relatedPostSlugs.map((slug) => {
			const post = getPublishedPost(slug);
			if (!post) throw new Error(`Project ${project.id} references an unpublished post: ${slug}`);

			return {
				slug: post.slug,
				title: post.title,
				description: post.description,
				categorySlug: post.categorySlug,
				categoryLabel: post.categoryLabel
			};
		})
	}))
});
