import {
	compareResources,
	extractResourceCopyText,
	isResourceSlug,
	parseResourceMetadata,
	resourceKindSegment,
	resourcePath,
	resourceRef,
	resourceSummary,
	type ResourceKind,
	type ResourceRecord,
	type ResourceRef,
	type ResourceSummary
} from '$lib/content/resources';

type ResourceMetadataModule = unknown;

const promptMetadataModules = import.meta.glob<ResourceMetadataModule>('/src/lib/prompts/*.md', {
	eager: true,
	import: 'metadata'
});
const listMetadataModules = import.meta.glob<ResourceMetadataModule>('/src/lib/lists/*.md', {
	eager: true,
	import: 'metadata'
});
const promptRawModules = import.meta.glob<string>('/src/lib/prompts/*.md', {
	eager: true,
	import: 'default',
	query: '?raw'
});
const listRawModules = import.meta.glob<string>('/src/lib/lists/*.md', {
	eager: true,
	import: 'default',
	query: '?raw'
});

function withoutMdsvexDerivedMetadata(rawMetadata: unknown) {
	if (!rawMetadata || typeof rawMetadata !== 'object' || Array.isArray(rawMetadata)) {
		return rawMetadata;
	}

	// rehypeCollectHeadings adds this derived field to mdsvex's compiled metadata.
	// The source validator still rejects an authored `headings` key, while the
	// runtime registry parses only the declared Field Kit frontmatter contract.
	const authoredMetadata = { ...(rawMetadata as Record<string, unknown>) };
	delete authoredMetadata.headings;
	return authoredMetadata;
}

function recordsFromModules(
	metadataModules: Record<string, unknown>,
	rawModules: Record<string, string>,
	expectedKind: ResourceKind
) {
	return Object.entries(metadataModules)
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([sourcePath, rawMetadata]): ResourceRecord => {
			const filename = sourcePath.split('/').pop() ?? sourcePath;
			const slug = filename.replace(/\.md$/, '');
			if (!isResourceSlug(slug) || filename !== `${slug}.md`) {
				throw new Error(`${sourcePath}: filename must use lowercase kebab case.`);
			}

			const rawMarkdown = rawModules[sourcePath];
			if (typeof rawMarkdown !== 'string') {
				throw new Error(`${sourcePath}: raw Markdown source could not be loaded.`);
			}

			const metadata = parseResourceMetadata(
				withoutMdsvexDerivedMetadata(rawMetadata),
				sourcePath,
				expectedKind
			);
			return {
				title: metadata.title,
				description: metadata.description,
				date: metadata.date,
				...(metadata.dateModified ? { dateModified: metadata.dateModified } : {}),
				kind: metadata.kind,
				tags: [...metadata.tags],
				published: metadata.published,
				...(metadata.featured === undefined ? {} : { featured: metadata.featured }),
				...(metadata.order === undefined ? {} : { order: metadata.order }),
				thumbnail: metadata.thumbnail,
				thumbnailAlt: metadata.thumbnailAlt,
				estimatedLength: metadata.estimatedLength,
				...(metadata.related ? { related: [...metadata.related] } : {}),
				language: metadata.language,
				slug,
				kindSegment: resourceKindSegment(expectedKind),
				path: resourcePath({ kind: expectedKind, slug }),
				ref: resourceRef({ kind: expectedKind, slug }),
				copyText: extractResourceCopyText(rawMarkdown)
			};
		});
}

const allResourceRecords: readonly ResourceRecord[] = [
	...recordsFromModules(promptMetadataModules, promptRawModules, 'prompt'),
	...recordsFromModules(listMetadataModules, listRawModules, 'list')
];

const resourcesByRef = new Map<ResourceRef, ResourceRecord>();
const resourcesByPath = new Map<string, ResourceRecord>();
const titles = new Map<string, string>();

for (const resource of allResourceRecords) {
	if (resourcesByRef.has(resource.ref)) {
		throw new Error(`Resource registry contains duplicate reference ${resource.ref}.`);
	}
	if (resourcesByPath.has(resource.path)) {
		throw new Error(`Resource registry contains duplicate canonical path ${resource.path}.`);
	}

	const normalizedTitle = resource.title.toLocaleLowerCase('en');
	const previousTitle = titles.get(normalizedTitle);
	if (previousTitle) {
		throw new Error(
			`Resource titles must be unique: ${previousTitle} and ${resource.ref} both use “${resource.title}”.`
		);
	}

	resourcesByRef.set(resource.ref, resource);
	resourcesByPath.set(resource.path, resource);
	titles.set(normalizedTitle, resource.ref);
}

for (const resource of allResourceRecords) {
	if (!resource.published) continue;

	const seen = new Set<ResourceRef>();
	for (const reference of resource.related ?? []) {
		if (reference === resource.ref) {
			throw new Error(`${resource.ref}: related resources must not reference themselves.`);
		}
		if (seen.has(reference)) {
			throw new Error(`${resource.ref}: duplicate related reference ${reference}.`);
		}
		seen.add(reference);

		const related = resourcesByRef.get(reference);
		if (!related) {
			throw new Error(`${resource.ref}: related reference ${reference} does not exist.`);
		}
		if (!related.published) {
			throw new Error(`${resource.ref}: related reference ${reference} is not published.`);
		}
	}
}

const publishedResources: readonly ResourceRecord[] = allResourceRecords
	.filter((resource) => resource.published)
	.sort((left, right) => {
		const kindDifference = Number(left.kind === 'list') - Number(right.kind === 'list');
		return kindDifference || compareResources(left, right);
	});

function publicRecord(resource: ResourceRecord): ResourceRecord {
	return {
		...resource,
		tags: [...resource.tags],
		...(resource.related ? { related: [...resource.related] } : {})
	};
}

export function getAllPublishedResources() {
	return publishedResources.map(publicRecord);
}

export function getPublishedResource(kind: ResourceKind, slug: string) {
	const resource = resourcesByRef.get(resourceRef({ kind, slug }));
	return resource?.published ? publicRecord(resource) : undefined;
}

export function getResourcesByKind(kind: ResourceKind) {
	return publishedResources
		.filter((resource) => resource.kind === kind)
		.map(publicRecord)
		.sort(compareResources);
}

function normalizedTags(resource: ResourceRecord) {
	return new Set(resource.tags.map((tag) => tag.trim().toLocaleLowerCase('en')));
}

export function getRelatedResources(resource: ResourceRecord, limit = 4): ResourceSummary[] {
	if (!Number.isInteger(limit) || limit <= 0) return [];

	const selected: ResourceRecord[] = [];
	const selectedRefs = new Set<ResourceRef>([resource.ref]);

	for (const reference of resource.related ?? []) {
		const related = resourcesByRef.get(reference);
		if (!related?.published || selectedRefs.has(related.ref)) continue;
		selected.push(related);
		selectedRefs.add(related.ref);
		if (selected.length >= limit) return selected.map(resourceSummary);
	}

	const sourceTags = normalizedTags(resource);
	const fallback = publishedResources
		.filter((candidate) => !selectedRefs.has(candidate.ref))
		.map((candidate) => {
			const sharedTagCount = [...normalizedTags(candidate)].filter((tag) =>
				sourceTags.has(tag)
			).length;
			return {
				candidate,
				score: sharedTagCount * 4 + Number(candidate.kind === resource.kind)
			};
		})
		.sort(
			(left, right) =>
				right.score - left.score ||
				(left.candidate.order ?? Number.MAX_SAFE_INTEGER) -
					(right.candidate.order ?? Number.MAX_SAFE_INTEGER) ||
				left.candidate.title.localeCompare(right.candidate.title, 'en', {
					sensitivity: 'base'
				}) ||
				left.candidate.path.localeCompare(right.candidate.path)
		);

	for (const { candidate } of fallback) {
		if (selected.length >= limit) break;
		selected.push(candidate);
		selectedRefs.add(candidate.ref);
	}

	return selected.map(resourceSummary);
}

export function newestPublishedResourceDate() {
	return publishedResources.reduce((latest, resource) => {
		const effectiveDate = resource.dateModified ?? resource.date;
		return effectiveDate > latest ? effectiveDate : latest;
	}, '1970-01-01');
}
