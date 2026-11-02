import type { GalleryItem, MusicTopic, Topic, VideoAvailability } from './types';

export const TOPICS: { id: 'all' | Topic; label: string }[] = [
	{ id: 'all', label: 'All' },
	{ id: 'music', label: 'Music' },
	{ id: 'films', label: 'Films' },
	{ id: 'audiobooks', label: 'Audiobooks' },
	{ id: 'documentaries', label: 'Documentaries' },
	{ id: 'maths', label: 'Maths' },
	{ id: 'science', label: 'Science' },
	{ id: 'technology', label: 'Technology' },
	{ id: 'food', label: 'Food' },
	{ id: 'talks', label: 'Talks' },
	{ id: 'other', label: 'Other' }
];
export const MUSIC_TOPICS: { id: 'all' | MusicTopic; label: string }[] = [
	{ id: 'all', label: 'All music' },
	{ id: 'bengali', label: 'Bengali' },
	{ id: 'hindi', label: 'Hindi' },
	{ id: 'english', label: 'English' },
	{ id: 'rabindrasangeet', label: 'Rabindrasangeet' }
];

export function eligibleQueue(item: GalleryItem, failed: ReadonlySet<string>): VideoAvailability[] {
	return item.videos.filter((video) => video.state === 'eligible' && !failed.has(video.id));
}

export function filterGallery(
	items: GalleryItem[],
	topic: 'all' | Topic,
	music: 'all' | MusicTopic,
	query: string,
	failed: ReadonlySet<string>
): GalleryItem[] {
	const needle = query.trim().toLocaleLowerCase();
	return items.filter((item) => {
		if (item.state !== 'eligible' || item.kind === 'mix' || !eligibleQueue(item, failed).length)
			return false;
		if (topic !== 'all' && !item.categories.includes(topic)) return false;
		if (topic === 'music' && music !== 'all' && !item.musicCategories.includes(music)) return false;
		return (
			!needle ||
			[item.title, item.channelTitle, ...item.categories, ...item.musicCategories].some((value) =>
				value.toLocaleLowerCase().includes(needle)
			)
		);
	});
}

export function formatDuration(seconds?: number): string {
	if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) return '';
	const total = Math.floor(seconds);
	const minutes = Math.floor(total / 60);
	return minutes >= 60
		? `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
		: `${minutes}:${String(total % 60).padStart(2, '0')}`;
}

export function contentFailure(code?: number): boolean {
	return code === 100 || code === 101 || code === 150;
}

export function playbackMessage(code?: number): string {
	if (contentFailure(code))
		return 'This video cannot play here. Open it on YouTube or choose another.';
	if (code === 153) return 'The player could not connect correctly. Open this video on YouTube.';
	if (code === 2) return 'This video link could not be loaded. Choose another video.';
	return 'Playback could not start. Try again or open this video on YouTube.';
}
