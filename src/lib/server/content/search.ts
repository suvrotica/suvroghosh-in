import { getPublishedPosts } from './posts';

const rawPostModules = import.meta.glob<string>('/src/lib/posts/*.md', {
	query: '?raw',
	import: 'default'
});

function articleBody(raw: string) {
	const frontmatterEnd = raw.indexOf('---', 4);
	return frontmatterEnd >= 0 ? raw.slice(frontmatterEnd + 3) : raw;
}

export async function searchPublishedPosts(query: string) {
	const posts = getPublishedPosts();
	const words = query.toLowerCase().split(/\s+/).filter(Boolean);
	if (words.length === 0) return posts;

	const results = await Promise.all(
		posts.map(async (post) => {
			const loader = rawPostModules[`/src/lib/posts/${post.slug}.md`];
			const body = loader ? articleBody(await loader()) : '';
			const haystack = [
				post.title,
				post.description,
				post.category,
				post.slug,
				post.tags.join(' '),
				body
			]
				.join(' ')
				.toLowerCase();

			return words.every((word) => haystack.includes(word)) ? post : null;
		})
	);

	return results.filter((post) => post !== null);
}
