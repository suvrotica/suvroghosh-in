import type { EntryGenerator, PageServerLoad } from './$types';
import { loadPublishedBlogPost } from '$lib/server/content/blog-post-page';
import { getPublishedPosts } from '$lib/server/content/posts';

// Canonical posts are static, while the server fallback preserves legacy/category redirects.
export const prerender = 'auto';

export const entries: EntryGenerator = () =>
	getPublishedPosts()
		.filter(
			({ categorySlug, slug }) =>
				categorySlug !== 'games' &&
				slug !== 'the-bias-archipelago' &&
				slug !== 'the-profile-that-knows-almost-nothing-about-you'
		)
		.map(({ categorySlug, slug }) => ({ category: categorySlug, slug }));

export const load: PageServerLoad = ({ params }) =>
	loadPublishedBlogPost(params.category, params.slug);
