import type { PageServerLoad } from './$types';
import { loadPublishedBlogPost } from '$lib/server/content/blog-post-page';

export const prerender = false;

export const load: PageServerLoad = () =>
	loadPublishedBlogPost('visualizations', 'the-profile-that-knows-almost-nothing-about-you');
