import { error } from '@sveltejs/kit';
import type { EntryGenerator, PageServerLoad } from './$types';
import { comicCatalog, comicPath, getComicBySlug } from '$lib/content/comics';
import { breadcrumbSchema, personId, siteUrl, withSiteGraph } from '$lib/components/seo/SEO';

export const prerender = true;
export const entries: EntryGenerator = () => comicCatalog.map(({ slug }) => ({ slug }));

export const load: PageServerLoad = ({ params }) => {
	const comic = getComicBySlug(params.slug);
	if (!comic) error(404, 'Comic not found');
	const canonicalUrl = siteUrl + comicPath(comic);
	return {
		comic,
		seo: {
			title: `${comic.title} — Comic | Suvro Ghosh`,
			description: comic.description,
			canonicalUrl,
			ogImageUrl: siteUrl + comic.frontCover.src,
			ogImageAlt: comic.frontCover.alt,
			ogImageWidth: comic.frontCover.width,
			ogImageHeight: comic.frontCover.height,
			keywords: ['comics', 'PDF comic', 'Suvro Ghosh', ...comic.genres],
			schema: withSiteGraph([
				{
					'@type': 'CreativeWork',
					'@id': canonicalUrl,
					url: canonicalUrl,
					name: comic.title,
					description: comic.description,
					datePublished: comic.published,
					inLanguage: 'en',
					genre: comic.genres,
					image: siteUrl + comic.frontCover.src,
					author: { '@id': personId },
					isBasedOn: {
						'@type': 'CreativeWork',
						name: comic.source.title,
						url: siteUrl + comic.source.href,
						author: { '@id': personId }
					},
					creditText:
						'Original story by Suvro Ghosh. Comic adaptation and AI-generated artwork produced with Codex.',
					encoding: {
						'@type': 'MediaObject',
						encodingFormat: 'application/pdf',
						contentUrl: siteUrl + comic.pdf.href,
						contentSize: `${comic.pdf.bytes} bytes`
					}
				},
				breadcrumbSchema([
					{ name: 'Home', url: siteUrl },
					{ name: 'Comics', url: `${siteUrl}/comics` },
					{ name: comic.title, url: canonicalUrl }
				])
			])
		}
	};
};
