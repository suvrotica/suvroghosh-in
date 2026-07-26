import type { TopicResource } from '$lib/topics/types';

export type SiteResourceDefinition = TopicResource & {
	topicTags: readonly string[];
};

export const sketchMuseumResource = {
	path: '/images/sketches',
	title: 'Sketch Museum',
	description:
		'Explore an atmospheric three-dimensional museum and an accessible collection of digital sketches by Suvro Ghosh.',
	contentType: 'Sketch collection',
	date: '2026-07-24',
	dateModified: '2026-07-24',
	category: 'Sketches',
	categorySlug: 'sketches',
	sectionLabel: 'Images',
	topicTags: ['sketch', 'draw', 'drawing']
} as const satisfies SiteResourceDefinition;

export const siteResourceDefinitions = [sketchMuseumResource] as const;
