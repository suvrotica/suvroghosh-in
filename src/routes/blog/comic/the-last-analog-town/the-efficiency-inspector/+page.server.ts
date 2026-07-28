import type { PageServerLoad } from './$types';
import { getComicEpisode, getComicSeriesSource } from '$lib/server/comics/catalog';
import { getPublishedPosts } from '$lib/server/content/posts';

export const prerender = true;

export const load: PageServerLoad = () => {
	const episode = getComicEpisode();
	const episodeTags = new Set(
		episode.metadata.tags.map((tag) => tag.trim().toLocaleLowerCase('en'))
	);
	const related = getPublishedPosts()
		.map((post) => {
			const sharedTags = post.tags.filter((tag) =>
				episodeTags.has(tag.trim().toLocaleLowerCase('en'))
			);
			return { post, sharedTags };
		})
		.filter(({ sharedTags }) => sharedTags.length > 0)
		.sort(
			(a, b) =>
				b.sharedTags.length - a.sharedTags.length ||
				new Date(b.post.date).getTime() - new Date(a.post.date).getTime()
		)
		.slice(0, 4)
		.map(({ post, sharedTags }) => ({
			title: post.title,
			description: post.description,
			categorySlug: post.categorySlug,
			slug: post.slug,
			label: post.categoryLabel,
			sharedTags: sharedTags.slice(0, 3)
		}));

	return {
		episode,
		series: getComicSeriesSource(),
		related
	};
};
