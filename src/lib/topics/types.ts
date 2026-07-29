import type { TopicMetadata, TopicReadingLevel } from './schema';

export type TopicResourceKind =
	| 'Article'
	| 'Story'
	| 'Song'
	| 'Visualization'
	| 'Game'
	| 'Notebook'
	| 'Sketch collection';

export type TopicResource = {
	path: string;
	title: string;
	description: string;
	contentType: TopicResourceKind;
	date: string;
	dateModified?: string;
	category: string;
	categorySlug: string;
	sectionLabel?: string;
	readingTime?: string;
	thumbnail?: string;
	thumbnailAlt?: string;
	thumbnailWidth?: number;
	thumbnailHeight?: number;
};

export type ResolvedReadingPath = {
	description: string;
	items: TopicResource[];
};

export type TopicHeadquarters = Omit<
	TopicMetadata,
	| 'bestStartingArticle'
	| 'readingPaths'
	| 'relatedResources'
	| 'includePaths'
	| 'excludePaths'
	| 'headings'
> & {
	bestStartingArticle: TopicResource;
	readingPaths: Record<TopicReadingLevel, ResolvedReadingPath>;
	relatedResources: {
		visualizations: TopicResource[];
		games: TopicResource[];
		other: TopicResource[];
	};
	recentlyUpdated: TopicResource[];
	allMaterial: TopicResource[];
	resourceCount: number;
	effectiveDateModified: string;
};

export type TopicHeadquartersSummary = {
	slug: string;
	title: string;
	shortTitle: string;
	group: string;
	description: string;
	resourceCount: number;
	effectiveDateModified: string;
	bestStartingArticle: Pick<TopicResource, 'path' | 'title'>;
	relatedTopicSlugs: readonly string[];
};
