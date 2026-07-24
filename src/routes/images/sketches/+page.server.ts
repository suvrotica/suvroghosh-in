import type { PageServerLoad } from './$types';
import { mediaGallery } from '$lib/generated/media-gallery';
import { sketchManifest } from '$lib/generated/sketch-manifest';

export const load: PageServerLoad = ({ url }) => {
	const artworks = [...sketchManifest].sort(
		(left, right) =>
			Number(right.featured) - Number(left.featured) ||
			left.title.localeCompare(right.title, 'en', { numeric: true })
	);
	const requestedSlug = url.searchParams.get('art');
	const selectedSlug =
		requestedSlug && artworks.some((artwork) => artwork.slug === requestedSlug)
			? requestedSlug
			: null;

	return {
		tabs: [
			{
				key: 'images',
				label: 'Images',
				href: '/images',
				count: mediaGallery.images.length
			},
			{
				key: 'photos',
				label: 'Photos',
				href: '/images?tab=photos',
				count: mediaGallery.photos.length
			},
			{
				key: 'thumbnails',
				label: 'Thumbnails',
				href: '/images?tab=thumbnails',
				count: mediaGallery.thumbnails.length
			},
			{
				key: 'sketches',
				label: 'Sketches',
				href: '/images/sketches',
				count: artworks.length
			}
		],
		artworks,
		selectedSlug
	};
};
