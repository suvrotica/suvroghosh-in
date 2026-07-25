import { error } from '@sveltejs/kit';
import type { EntryGenerator, PageServerLoad } from './$types';
import {
	absoluteUrl,
	blogPostingSchema,
	breadcrumbSchema,
	personId,
	siteTitle,
	siteUrl,
	websiteId,
	withSiteGraph
} from '$lib/components/seo/SEO';
import { gameBySlug, gamePath, gamesCatalog } from '$lib/games/catalog';
import { getPublishedPost } from '$lib/server/content/posts';

export const prerender = true;

export const entries: EntryGenerator = () => gamesCatalog.map(({ slug }) => ({ slug }));

export const load: PageServerLoad = ({ params }) => {
	const game = gameBySlug(params.slug);
	const metadata = getPublishedPost(params.slug);
	if (!game || !metadata || metadata.categorySlug !== 'games') {
		error(404, 'Game not found');
	}

	const canonicalUrl = `${siteUrl}${gamePath(game.slug)}`;
	const imageUrl = absoluteUrl(game.socialCover);
	const breadcrumbs = breadcrumbSchema([
		{ name: 'Home', url: siteUrl },
		{ name: 'Games', url: `${siteUrl}/blog/games` },
		{ name: game.title, url: canonicalUrl }
	]);
	const gameSchema = {
		'@type': 'VideoGame',
		'@id': `${canonicalUrl}#game`,
		name: game.title,
		description: metadata.description,
		url: canonicalUrl,
		image: imageUrl,
		author: { '@id': personId },
		publisher: { '@id': personId },
		isPartOf: { '@id': websiteId },
		applicationCategory: 'Game',
		operatingSystem: 'Any modern web browser',
		gamePlatform: ['Web browser', 'Desktop', 'Mobile', 'Tablet'],
		playMode: 'SinglePlayer',
		isAccessibleForFree: true,
		inLanguage: 'en',
		datePublished: metadata.date,
		keywords: metadata.tags
	};

	return {
		game,
		metadata,
		seo: {
			title: `${game.title} | ${siteTitle}`,
			description: metadata.description,
			canonicalUrl,
			ogImageUrl: imageUrl,
			ogImageAlt: game.coverAlt,
			ogImageWidth: 1200,
			ogImageHeight: 800,
			type: 'article' as const,
			publishedTime: metadata.date,
			modifiedTime: metadata.dateModified,
			category: 'Games',
			tags: metadata.tags,
			keywords: [...metadata.tags, 'Calcutta game', 'Kolkata game', 'Suvro Ghosh'],
			schema: withSiteGraph([
				blogPostingSchema({
					...metadata,
					slug: game.slug,
					category: 'Games',
					canonicalUrl
				}),
				gameSchema,
				breadcrumbs
			])
		}
	};
};
