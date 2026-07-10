import { getPublishedPosts } from './posts';

export type PostSearchSort = 'relevance' | 'newest' | 'oldest';

type PostSearchOptions = {
	query?: string;
	category?: string;
	year?: string;
	sort?: PostSearchSort;
};

export function searchPublishedPosts({
	query = '',
	category = '',
	year = '',
	sort = 'relevance'
}: PostSearchOptions) {
	let posts = getPublishedPosts().filter((post) => {
		if (category && post.categorySlug !== category) return false;
		if (year && !post.date.startsWith(year)) return false;
		return true;
	});

	const words = query.toLowerCase().split(/\s+/).filter(Boolean);

	if (words.length > 0) {
		posts = posts.filter((post) => {
			const haystack = [post.title, post.description, post.category, post.slug, post.tags.join(' ')]
				.join(' ')
				.toLowerCase();

			return words.every((word) => haystack.includes(word));
		});
	}

	if (sort === 'oldest') {
		posts.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
	} else if (sort === 'newest') {
		posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
	}

	return posts;
}
