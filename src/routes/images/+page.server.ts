import type { PageServerLoad } from './$types';
import { mediaGallery, type MediaGalleryTab } from '$lib/generated/media-gallery';
import { sketchManifest } from '$lib/generated/sketch-manifest';
import { paginate, parsePageNumber } from '$lib/content/pagination';

const PAGE_SIZE = 24;
const galleryTabs: readonly { key: MediaGalleryTab; label: string; href: string }[] = [
	{ key: 'images', label: 'Images', href: '/images' },
	{ key: 'photos', label: 'Photos', href: '/images?tab=photos' },
	{ key: 'thumbnails', label: 'Thumbnails', href: '/images?tab=thumbnails' }
];
const validTabs = new Set<MediaGalleryTab>(galleryTabs.map((tab) => tab.key));

export const load: PageServerLoad = ({ url }) => {
	const requestedTab = url.searchParams.get('tab') as MediaGalleryTab | null;
	const activeTab = requestedTab && validTabs.has(requestedTab) ? requestedTab : 'images';
	const requestedPage = parsePageNumber(url.searchParams.get('page'));
	const paginated = paginate(mediaGallery[activeTab], requestedPage, PAGE_SIZE);
	const rangeStart = paginated.totalItems === 0 ? 0 : (paginated.page - 1) * PAGE_SIZE + 1;

	return {
		tabs: [
			...galleryTabs.map((tab) => ({
				...tab,
				count: mediaGallery[tab.key].length
			})),
			{
				key: 'sketches',
				label: 'Sketches',
				href: '/images/sketches',
				count: sketchManifest.length
			}
		],
		activeTab,
		assets: paginated.items,
		page: paginated.page,
		totalPages: paginated.totalPages,
		totalItems: paginated.totalItems,
		rangeStart,
		rangeEnd: rangeStart === 0 ? 0 : rangeStart + paginated.items.length - 1
	};
};
