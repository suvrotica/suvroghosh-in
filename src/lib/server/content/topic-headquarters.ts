import { postPath } from '$lib/content/posts';
import { siteResourceDefinitions } from '$lib/content/site-resources';
import {
	INITIAL_TOPIC_HEADQUARTERS_SLUGS,
	canonicalTopicSlug,
	promotedTopicSlug
} from '$lib/content/topics';
import { musicPostSlugs } from '$lib/generated/music-posts';
import { parseTopicMetadata, type TopicMetadata } from '$lib/topics/schema';
import type {
	ResolvedReadingPath,
	TopicHeadquarters,
	TopicHeadquartersSummary,
	TopicResource,
	TopicResourceKind
} from '$lib/topics/types';
import { getImageDimensions } from '$lib/server/image-metadata';
import { getPublishedPosts, type PublishedPost } from './posts';

export type TopicResourceRecord = TopicResource & {
	topicTags: readonly string[];
};

const musicPostSlugSet = new Set<string>(musicPostSlugs);

function contentTypeForPost(post: PublishedPost): TopicResourceKind {
	if (post.categorySlug === 'games') return 'Game';
	if (post.categorySlug === 'visualizations') return 'Visualization';
	if (post.notebook) return 'Notebook';
	if (post.categorySlug === 'short-fiction') return 'Story';
	if (post.categorySlug === 'ai-music-song' || musicPostSlugSet.has(post.slug)) return 'Song';
	return 'Article';
}

function resourceRecordForPost(post: PublishedPost): TopicResourceRecord {
	const topicTags = new Set(
		[...(post.tags ?? []), ...(post.series ?? []), ...post.derivedTopics]
			.map(canonicalTopicSlug)
			.filter(Boolean)
	);
	const thumbnailDimensions = post.thumbnail ? getImageDimensions(post.thumbnail) : undefined;

	return {
		path: postPath(post),
		title: post.title,
		description: post.description,
		contentType: contentTypeForPost(post),
		date: post.date,
		dateModified: post.dateModified,
		category: post.categoryLabel,
		categorySlug: post.categorySlug,
		sectionLabel: post.sectionLabel,
		readingTime: post.readingTime,
		thumbnail: post.thumbnail,
		thumbnailAlt: post.thumbnailAlt,
		thumbnailWidth: thumbnailDimensions?.width,
		thumbnailHeight: thumbnailDimensions?.height,
		topicTags: [...topicTags]
	};
}

const resourceRecords: readonly TopicResourceRecord[] = [
	...getPublishedPosts().map(resourceRecordForPost),
	...siteResourceDefinitions
];

const resourcesByPath = new Map<string, TopicResourceRecord>();
for (const resource of resourceRecords) {
	if (resourcesByPath.has(resource.path)) {
		throw new Error(
			`Topic resource registry contains the duplicate canonical path ${resource.path}`
		);
	}
	resourcesByPath.set(resource.path, resource);
}

function publicResource(resource: TopicResourceRecord): TopicResource {
	return {
		path: resource.path,
		title: resource.title,
		description: resource.description,
		contentType: resource.contentType,
		date: resource.date,
		dateModified: resource.dateModified,
		category: resource.category,
		categorySlug: resource.categorySlug,
		sectionLabel: resource.sectionLabel,
		readingTime: resource.readingTime,
		thumbnail: resource.thumbnail,
		thumbnailAlt: resource.thumbnailAlt,
		thumbnailWidth: resource.thumbnailWidth,
		thumbnailHeight: resource.thumbnailHeight
	};
}

function resourceFreshness(resource: TopicResource) {
	return resource.dateModified ?? resource.date;
}

export function sortTopicResourcesByFreshness(
	resources: readonly TopicResource[]
): TopicResource[] {
	return [...resources].sort(
		(left, right) =>
			resourceFreshness(right).localeCompare(resourceFreshness(left)) ||
			right.date.localeCompare(left.date) ||
			left.path.localeCompare(right.path)
	);
}

export function effectiveTopicDateModified(
	topicDateModified: string,
	resources: readonly TopicResource[]
) {
	return resources.reduce((latest, resource) => {
		const freshness = resourceFreshness(resource);
		return freshness > latest ? freshness : latest;
	}, topicDateModified);
}

export function resolveTopicMembership(
	topic: TopicMetadata,
	records: readonly TopicResourceRecord[] = resourceRecords,
	source = `${topic.slug}.md`
): TopicResourceRecord[] {
	const byPath = new Map(records.map((resource) => [resource.path, resource]));
	const sourceTags = new Set(topic.sourceTags);
	const sourceCategories = new Set(topic.sourceCategories);
	const members = new Map<string, TopicResourceRecord>();

	for (const resource of records) {
		if (
			sourceCategories.has(resource.categorySlug) ||
			resource.topicTags.some((tag) => sourceTags.has(tag))
		) {
			members.set(resource.path, resource);
		}
	}

	for (const [index, path] of topic.includePaths.entries()) {
		const resource = byPath.get(path);
		if (!resource) {
			throw new Error(
				`${source}: includePaths[${index}] references an unknown or unpublished resource: ${path}`
			);
		}
		members.set(path, resource);
	}

	for (const [index, path] of topic.excludePaths.entries()) {
		if (!byPath.has(path)) {
			throw new Error(
				`${source}: excludePaths[${index}] references an unknown or unpublished resource: ${path}`
			);
		}
		members.delete(path);
	}

	return [...members.values()];
}

function requireResource(path: string, source: string, field: string) {
	const resource = resourcesByPath.get(path);
	if (!resource) {
		throw new Error(
			`${source}: ${field} references an unknown or unpublished internal resource: ${path}`
		);
	}
	return resource;
}

function resolveCuratedPaths(paths: readonly string[], source: string, field: string) {
	return paths.map((path, index) =>
		publicResource(requireResource(path, source, `${field}[${index}]`))
	);
}

function resolveReadingPath(
	topic: TopicMetadata,
	level: keyof TopicMetadata['readingPaths'],
	source: string
): ResolvedReadingPath {
	const definition = topic.readingPaths[level];
	return {
		description: definition.description,
		items: resolveCuratedPaths(definition.items, source, `readingPaths.${level}.items`)
	};
}

type TopicMetadataModule = unknown;

const topicMetadataModules = import.meta.glob<TopicMetadataModule>(
	['/src/lib/topics/*.md', '!/src/lib/topics/README.md'],
	{
		eager: true,
		import: 'metadata'
	}
);

const parsedTopics = Object.entries(topicMetadataModules)
	.sort(([left], [right]) => left.localeCompare(right))
	.map(([sourcePath, rawMetadata]) => {
		const filename = sourcePath.split('/').pop() ?? sourcePath;
		const filenameSlug = filename.replace(/\.md$/, '');
		const metadata = parseTopicMetadata(rawMetadata, sourcePath);
		if (metadata.slug !== filenameSlug) {
			throw new Error(
				`${sourcePath}: slug "${metadata.slug}" must match the filename "${filenameSlug}.md"`
			);
		}

		const promotedSlug = promotedTopicSlug(metadata.primaryTag);
		if (promotedSlug !== metadata.slug) {
			throw new Error(
				`${sourcePath}: primaryTag "${metadata.primaryTag}" resolves to ${
					promotedSlug ? `"${promotedSlug}"` : 'no promoted Topic Headquarters'
				}, not "${metadata.slug}"`
			);
		}

		for (const tag of metadata.sourceTags) {
			const tagTopic = promotedTopicSlug(tag);
			if (tagTopic && tagTopic !== metadata.slug) {
				throw new Error(
					`${sourcePath}: sourceTags contains "${tag}", which is promoted to "${tagTopic}"`
				);
			}
		}

		return { sourcePath, filename, metadata };
	});

const metadataBySlug = new Map<string, (typeof parsedTopics)[number]>();
for (const topic of parsedTopics) {
	if (metadataBySlug.has(topic.metadata.slug)) {
		throw new Error(
			`${topic.sourcePath}: duplicate Topic Headquarters slug "${topic.metadata.slug}"`
		);
	}
	metadataBySlug.set(topic.metadata.slug, topic);
}

for (const requiredSlug of INITIAL_TOPIC_HEADQUARTERS_SLUGS) {
	if (!metadataBySlug.has(requiredSlug)) {
		throw new Error(`Missing required Topic Headquarters source: ${requiredSlug}.md`);
	}
}

for (const { sourcePath, metadata } of parsedTopics) {
	for (const [index, relatedSlug] of metadata.relatedTopics.entries()) {
		if (!metadataBySlug.has(relatedSlug)) {
			throw new Error(
				`${sourcePath}: relatedTopics[${index}] references an unknown topic: ${relatedSlug}`
			);
		}
	}
}

function resolveTopic(sourcePath: string, metadata: TopicMetadata): TopicHeadquarters {
	const membership = resolveTopicMembership(metadata, resourceRecords, sourcePath);
	if (membership.length === 0) {
		throw new Error(`${sourcePath}: Topic Headquarters has no published resources`);
	}

	const memberPaths = new Set(membership.map((resource) => resource.path));
	const excludedPaths = new Set(metadata.excludePaths);

	const assertCuratedMembership = (path: string, field: string) => {
		if (excludedPaths.has(path)) {
			throw new Error(`${sourcePath}: ${field} points to excluded resource ${path}`);
		}
		if (!memberPaths.has(path)) {
			throw new Error(
				`${sourcePath}: ${field} points to ${path}, but it is not a topic member; add it to includePaths`
			);
		}
	};

	assertCuratedMembership(metadata.bestStartingArticle, 'bestStartingArticle');
	for (const [level, readingPath] of Object.entries(metadata.readingPaths)) {
		for (const [index, path] of readingPath.items.entries()) {
			assertCuratedMembership(path, `readingPaths.${level}.items[${index}]`);
		}
	}
	for (const [kind, paths] of Object.entries(metadata.relatedResources)) {
		for (const [index, path] of paths.entries()) {
			assertCuratedMembership(path, `relatedResources.${kind}[${index}]`);
		}
	}
	for (const [index, entry] of metadata.glossary.entries()) {
		if (entry.relatedPath) {
			assertCuratedMembership(entry.relatedPath, `glossary[${index}].relatedPath`);
		}
	}

	const allMaterial = membership
		.map(publicResource)
		.sort(
			(left, right) =>
				right.date.localeCompare(left.date) ||
				resourceFreshness(right).localeCompare(resourceFreshness(left)) ||
				left.path.localeCompare(right.path)
		);

	return {
		title: metadata.title,
		shortTitle: metadata.shortTitle,
		slug: metadata.slug,
		group: metadata.group,
		description: metadata.description,
		date: metadata.date,
		dateModified: metadata.dateModified,
		primaryTag: metadata.primaryTag,
		sourceTags: metadata.sourceTags,
		sourceCategories: metadata.sourceCategories,
		startHereReason: metadata.startHereReason,
		glossary: metadata.glossary,
		faqs: metadata.faqs,
		contrarianView: metadata.contrarianView,
		relatedTopics: metadata.relatedTopics,
		bestStartingArticle: publicResource(
			requireResource(metadata.bestStartingArticle, sourcePath, 'bestStartingArticle')
		),
		readingPaths: {
			beginner: resolveReadingPath(metadata, 'beginner', sourcePath),
			intermediate: resolveReadingPath(metadata, 'intermediate', sourcePath),
			deep: resolveReadingPath(metadata, 'deep', sourcePath)
		},
		relatedResources: {
			visualizations: resolveCuratedPaths(
				metadata.relatedResources.visualizations,
				sourcePath,
				'relatedResources.visualizations'
			),
			games: resolveCuratedPaths(
				metadata.relatedResources.games,
				sourcePath,
				'relatedResources.games'
			),
			other: resolveCuratedPaths(
				metadata.relatedResources.other,
				sourcePath,
				'relatedResources.other'
			)
		},
		recentlyUpdated: sortTopicResourcesByFreshness(allMaterial).slice(0, 6),
		allMaterial,
		resourceCount: allMaterial.length,
		effectiveDateModified: effectiveTopicDateModified(metadata.dateModified, allMaterial)
	};
}

const resolvedTopics = parsedTopics.map(({ sourcePath, metadata }) =>
	resolveTopic(sourcePath, metadata)
);
const resolvedTopicsBySlug = new Map(resolvedTopics.map((topic) => [topic.slug, topic]));

export function getTopicHeadquarters() {
	return resolvedTopics.slice();
}

export function getTopicHeadquartersBySlug(slug: string) {
	return resolvedTopicsBySlug.get(slug);
}

export function getTopicHeadquartersSummaries(): TopicHeadquartersSummary[] {
	return resolvedTopics.map((topic) => ({
		slug: topic.slug,
		title: topic.title,
		shortTitle: topic.shortTitle,
		group: topic.group,
		description: topic.description,
		resourceCount: topic.resourceCount,
		effectiveDateModified: topic.effectiveDateModified,
		bestStartingArticle: {
			path: topic.bestStartingArticle.path,
			title: topic.bestStartingArticle.title
		}
	}));
}

export function getTopicResource(path: string) {
	const resource = resourcesByPath.get(path);
	return resource ? publicResource(resource) : undefined;
}

export function getTopicResourceRecords() {
	return resourceRecords.slice();
}
