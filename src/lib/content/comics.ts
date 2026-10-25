import type { Asset } from '$app/types';

/** Public comic editions. Add a record here to include it across the site's comic shelves. */
export type ComicCover = Readonly<{
	src: Asset;
	alt: string;
	width: number;
	height: number;
}>;

export type Comic = Readonly<{
	slug: string;
	title: string;
	description: string;
	published: string;
	genres: readonly string[];
	pageCount: number;
	storyPageCount: number;
	frontCover: ComicCover;
	backCover: ComicCover;
	pdf: Readonly<{ href: Asset; filename: string; bytes: number }>;
	source: Readonly<{ href: `/blog/${string}/${string}`; title: string }>;
}>;

export const comicCatalog = [
	{
		slug: 'the-colony-where-nobody-is-allowed-to-sleep',
		title: 'The Colony Where Nobody Is Allowed to Sleep',
		description:
			'On a distant planet, dreams bring back the comforts a colony has lost. Then the sleepers begin to change. Marcy tries to keep the children awake as the ground moves beneath them.',
		published: '2026-10-25',
		genres: ['Science fiction', 'Horror'],
		pageCount: 16,
		storyPageCount: 14,
		frontCover: {
			src: '/comics/the-colony-where-nobody-is-allowed-to-sleep/front-cover.webp',
			alt: 'Front cover: an exhausted Marcy at a kitchen table with a yellow floral mug and a peach, the off-world colony beyond the window.',
			width: 1024,
			height: 1536
		},
		backCover: {
			src: '/comics/the-colony-where-nobody-is-allowed-to-sleep/back-cover.webp',
			alt: 'Back cover: the story blurb above an empty kitchen table, yellow mug, peach and a fine pale thread.',
			width: 1024,
			height: 1536
		},
		pdf: {
			href: '/comics/the-colony-where-nobody-is-allowed-to-sleep/the-colony-where-nobody-is-allowed-to-sleep.pdf',
			filename: 'the-colony-where-nobody-is-allowed-to-sleep.pdf',
			bytes: 67662518
		},
		source: {
			href: '/blog/short-fiction/the-colony-where-nobody-is-allowed-to-sleep',
			title: 'The Colony Where Nobody Is Allowed to Sleep'
		}
	}
] as const satisfies readonly Comic[];

export function comicPath(comic: Pick<Comic, 'slug'>) {
	return `/comics/${comic.slug}` as const;
}

export function getComicBySlug(slug: string): Comic | undefined {
	return comicCatalog.find((comic) => comic.slug === slug);
}

export function formatComicFileSize(bytes: number) {
	return `${new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 }).format(bytes / 1_000_000)} MB`;
}
