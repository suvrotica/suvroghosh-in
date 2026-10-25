import { postPath } from '$lib/content/posts';
import { categoryTrail } from '$lib/content/categories';
import { comicCatalog, comicPath } from '$lib/content/comics';
import {
	getPublishedPosts,
	getPublishedArchiveMonths,
	getPublishedTopics
} from '$lib/server/content/posts';
import { getAllPublishedResources } from '$lib/server/content/resources';
import { getTopicHeadquartersSummaries } from '$lib/server/content/topic-headquarters';
import { gamesCatalog } from '$lib/games/catalog';
import { normalizeAnalyticsPath } from './policy';

const paths = new Set([
	'/',
	'/about',
	'/writing',
	'/comics',
	'/consulting',
	'/projects',
	'/start-here',
	'/resume',
	'/healthcare-it-gulf',
	'/contact',
	'/blog',
	'/blog/topics',
	'/blog/visualizations',
	'/blog/games',
	'/topics',
	'/resources',
	'/images',
	'/images/sketches',
	'/notes',
	'/privacy'
]);

for (const post of getPublishedPosts()) {
	paths.add(postPath(post));
	for (const category of categoryTrail(post.categorySlug)) paths.add(`/blog/${category}`);
}
for (const archive of getPublishedArchiveMonths()) {
	paths.add(`/blog/archive/${archive.year}`);
	paths.add(`/blog/archive/${archive.year}/${archive.month}`);
}
for (const topic of getPublishedTopics()) paths.add(`/blog/topics/${topic.slug}`);
for (const topic of getTopicHeadquartersSummaries()) paths.add(`/topics/${topic.slug}`);
for (const resource of getAllPublishedResources()) paths.add(resource.path);
for (const game of gamesCatalog) paths.add(`/blog/games/${game.slug}`);
for (const comic of comicCatalog) paths.add(comicPath(comic));

/** Only the public Notes shelf is measured; dynamic private/public note slugs are excluded. */
export function eligibleAnalyticsPath(value: unknown) {
	const pathname = normalizeAnalyticsPath(value);
	return pathname && paths.has(pathname) ? pathname : null;
}
