import type { PageServerLoad } from './$types';
import { mediaGallery, type MediaGalleryTab } from '$lib/generated/media-gallery';
import { paginate, parsePageNumber } from '$lib/content/pagination';

const PAGE_SIZE = 24;
const galleryTabs: readonly { key: MediaGalleryTab; label: string }[] = [
	{ key: 'images', label: 'Images' },
	{ key: 'photos', label: 'Photos' },
	{ key: 'thumbnails', label: 'Thumbnails' }
];
const validTabs = new Set<MediaGalleryTab>(galleryTabs.map((tab) => tab.key));

export const load: PageServerLoad = ({ url }) => {
	const requestedTab = url.searchParams.get('tab') as MediaGalleryTab | null;
	const activeTab = requestedTab && validTabs.has(requestedTab) ? requestedTab : 'images';
	const requestedPage = parsePageNumber(url.searchParams.get('page'));
	const paginated = paginate(mediaGallery[activeTab], requestedPage, PAGE_SIZE);
	const rangeStart = paginated.totalItems === 0 ? 0 : (paginated.page - 1) * PAGE_SIZE + 1;

	return {
		tabs: galleryTabs.map((tab) => ({
			...tab,
			count: mediaGallery[tab.key].length
		})),
		activeTab,
		assets: paginated.items,
		page: paginated.page,
		totalPages: paginated.totalPages,
		totalItems: paginated.totalItems,
		rangeStart,
		rangeEnd: rangeStart === 0 ? 0 : rangeStart + paginated.items.length - 1
	};
};
