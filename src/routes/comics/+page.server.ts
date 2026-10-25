import type { PageServerLoad } from './$types';
import { comicCatalog, comicPath } from '$lib/content/comics';
import {
	collectionPageSchema,
	itemListSchema,
	siteUrl,
	withSiteGraph
} from '$lib/components/seo/SEO';

export const prerender = true;

export const load: PageServerLoad = () => {
	const title = 'Comics | Suvro Ghosh';
	const description =
		'Comic adaptations of stories by Suvro Ghosh. Browse the covers and download complete PDF editions, with front and back covers included.';
	const canonicalUrl = `${siteUrl}/comics`;
	const cover = comicCatalog[0].frontCover;
	return {
		comics: comicCatalog,
		seo: {
			title,
			description,
			canonicalUrl,
			ogImageUrl: siteUrl + cover.src,
			ogImageAlt: cover.alt,
			ogImageWidth: cover.width,
			ogImageHeight: cover.height,
			schema: withSiteGraph([
				collectionPageSchema({ name: 'Comics', description, url: canonicalUrl }),
				itemListSchema({
					name: 'Comics by Suvro Ghosh',
					url: canonicalUrl,
					items: comicCatalog.map((comic) => ({
						name: comic.title,
						description: comic.description,
						url: siteUrl + comicPath(comic)
					}))
				})
			])
		}
	};
};
