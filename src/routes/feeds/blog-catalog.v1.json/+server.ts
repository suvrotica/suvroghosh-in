import {
	createPublicBlogCatalog,
	serializePublicBlogCatalog
} from '$lib/server/content/blog-catalog';
import { getPublishedPosts } from '$lib/server/content/posts';

export const prerender = true;

export function GET() {
	const { body, etag } = serializePublicBlogCatalog(createPublicBlogCatalog(getPublishedPosts()));
	return new Response(body, {
		headers: {
			'Content-Type': 'application/json; charset=utf-8',
			'Cache-Control': 'public, max-age=0, must-revalidate',
			'X-Content-Type-Options': 'nosniff',
			ETag: etag
		}
	});
}
