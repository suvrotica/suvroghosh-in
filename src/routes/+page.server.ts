import type { PageServerLoad } from './$types';
import { getPublishedPosts } from '$lib/server/content/posts';
import { getComicEpisodeMetadata, getComicSeriesSource } from '$lib/server/comics/catalog';

export const prerender = true;

export const load: PageServerLoad = () => {
	const comicSeries = getComicSeriesSource();
	const comicEpisode = getComicEpisodeMetadata();
	return {
		recentPosts: getPublishedPosts()
			.slice(0, 4)
			.map(({ slug, title, description, date, categorySlug, categoryLabel, sectionLabel }) => ({
				slug,
				title,
				description,
				date,
				categorySlug,
				categoryLabel,
				sectionLabel
			})),
		comic: {
			seriesTitle: comicSeries.title,
			title: comicEpisode.title,
			description: comicEpisode.description,
			pageCount: comicEpisode.storyPageCount,
			href: comicEpisode.canonicalPath,
			published: comicEpisode.published
		}
	};
};
