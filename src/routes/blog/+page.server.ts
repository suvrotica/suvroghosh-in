import type { PageServerLoad } from './$types';
import { validatePublishedPostMetadata, type BlogPostSummary } from '$lib/content/posts';

export const load: PageServerLoad = async ({ url }) => {
	const postFiles = import.meta.glob<BlogPostSummary>('/src/lib/posts/**/*.md', {
		import: 'metadata'
	});

	const postPromises = Object.entries(postFiles).map(async ([path, resolver]) => {
		const metadata = await resolver();
		const slug = path.split('/').pop()?.replace('.md', '') ?? '';
		if (!metadata || metadata.published === false) return null;
		validatePublishedPostMetadata(metadata, `${slug}.md`);

		return {
			...metadata,
			slug
		};
	});

	let posts: BlogPostSummary[] = (await Promise.all(postPromises)).filter((post) => post !== null);

	posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

	const search = url.searchParams.get('search')?.trim() ?? '';

	if (search) {
		const rawFiles = import.meta.glob('/src/lib/posts/**/*.md', {
			query: '?raw',
			import: 'default'
		});

		const words = search.toLowerCase().split(/\s+/).filter(Boolean);

		const searchablePromises = posts.map(async (post) => {
			const key = `/src/lib/posts/${post.slug}.md`;
			const loader = rawFiles[key];
			let bodyText = '';
			if (loader) {
				const raw = (await loader()) as string;
				const bodyStart = raw.indexOf('---', 4);
				bodyText = bodyStart >= 0 ? raw.slice(bodyStart + 3) : raw;
			}
			const haystack = [
				post.title ?? '',
				post.description ?? '',
				post.category ?? '',
				post.slug ?? '',
				Array.isArray(post.tags) ? post.tags.join(' ') : '',
				bodyText
			]
				.join(' ')
				.toLowerCase();

			return { post, matches: words.every((w) => haystack.includes(w)) };
		});

		const results = await Promise.all(searchablePromises);
		posts = results.filter((r) => r.matches).map((r) => r.post);
	}

	return {
		posts,
		search
	};
};
