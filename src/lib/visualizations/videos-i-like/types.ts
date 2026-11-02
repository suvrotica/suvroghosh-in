export type Topic =
	| 'music'
	| 'films'
	| 'audiobooks'
	| 'documentaries'
	| 'maths'
	| 'science'
	| 'technology'
	| 'food'
	| 'talks'
	| 'other';
export type MusicTopic = 'bengali' | 'hindi' | 'english' | 'rabindrasangeet';
export type AvailabilityState = 'eligible' | 'unavailable' | 'unknown';

export interface SourceReference {
	file: string;
	/** Only public source pages have a URL; local notes have a safe label instead. */
	url?: string;
	label?: string;
	collection?: 'obsidian';
	originalUrl: string;
	order: number;
	startSeconds?: number;
	index?: number;
}

export interface CatalogueEntry {
	key: string;
	kind: 'video' | 'playlist' | 'mix';
	id: string;
	url: string;
	categories: Topic[];
	musicCategories: MusicTopic[];
	sources: SourceReference[];
}

export interface Catalogue {
	version: 1;
	repository: string;
	branch: string;
	commit: string;
	fileCount: number;
	referenceCount: number;
	entries: CatalogueEntry[];
}

export interface SupplementalCatalogue {
	version: 1;
	collection: string;
	fileCount: number;
	referenceCount: number;
	entries: CatalogueEntry[];
}

export interface VideoAvailability {
	id: string;
	state: AvailabilityState;
	title: string;
	channelTitle: string;
	thumbnail?: string;
	durationSeconds?: number;
	checkedAt: string | null;
	reason?: string;
}

export interface GalleryItem extends CatalogueEntry {
	state: AvailabilityState;
	title: string;
	channelTitle: string;
	thumbnail?: string;
	durationSeconds?: number;
	checkedAt: string | null;
	reason?: string;
	/** Checked members in source order; the browser queues only eligible members. */
	videos: VideoAvailability[];
	checkedCount: number;
	totalCount?: number;
	/** Next bounded prefix page to request; absent means no continuation. */
	nextPage?: number;
}

export interface GalleryResponse {
	items: GalleryItem[];
	checkedAt: string | null;
	expiresAt: string | null;
	configuration: 'ready' | 'missing-key';
	partial: boolean;
	/** Next server-defined group of playlist checks; not a provider token. */
	nextBatch?: number;
}
