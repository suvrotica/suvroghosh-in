export type ResourceKind = 'prompt' | 'list';
export type ResourceKindSegment = 'prompts' | 'lists';
export type ResourceLanguage = 'en' | 'bn' | 'mixed';

export type ResourceRef = `prompts/${string}` | `lists/${string}`;
export type ResourcePath = `/resources/${ResourceKindSegment}/${string}`;

export interface ResourceMetadata {
	title: string;
	description: string;
	date: string;
	dateModified?: string;
	kind: ResourceKind;
	tags: string[];
	published: boolean;
	featured?: boolean;
	order?: number;
	thumbnail: string;
	thumbnailAlt: string;
	estimatedLength: string;
	related?: ResourceRef[];
	language: ResourceLanguage;
}

export interface ResourceRecord extends ResourceMetadata {
	slug: string;
	kindSegment: ResourceKindSegment;
	path: ResourcePath;
	ref: ResourceRef;
	copyText: string;
}

export type ResourceSummary = Omit<ResourceRecord, 'copyText' | 'related'>;

export type ResourceCardRecord = ResourceRecord & {
	thumbnailWidth: number;
	thumbnailHeight: number;
	relatedResources: ResourceSummary[];
};

const segmentByKind = {
	prompt: 'prompts',
	list: 'lists'
} as const satisfies Record<ResourceKind, ResourceKindSegment>;

const kindBySegment = {
	prompts: 'prompt',
	lists: 'list'
} as const satisfies Record<ResourceKindSegment, ResourceKind>;

const labelByKind = {
	prompt: 'Prompt',
	list: 'Word List'
} as const satisfies Record<ResourceKind, string>;

const metadataFields = new Set([
	'title',
	'description',
	'date',
	'dateModified',
	'kind',
	'tags',
	'published',
	'featured',
	'order',
	'thumbnail',
	'thumbnailAlt',
	'estimatedLength',
	'related',
	'language'
]);

const resourceSlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const resourceReferencePattern = /^(prompts|lists)\/([a-z0-9]+(?:-[a-z0-9]+)*)$/;
const copyStartMarker = '<!-- resource-copy:start -->';
const copyEndMarker = '<!-- resource-copy:end -->';

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requiredTrimmedString(
	value: unknown,
	field: string,
	source: string,
	minimumLength = 1,
	maximumLength = Number.POSITIVE_INFINITY
) {
	if (typeof value !== 'string' || value.trim() === '') {
		throw new Error(`${source}: ${field} must be a non-empty string.`);
	}
	if (value !== value.trim()) {
		throw new Error(`${source}: ${field} must not have surrounding whitespace.`);
	}
	if (value.length < minimumLength || value.length > maximumLength) {
		throw new Error(
			`${source}: ${field} must contain ${minimumLength}–${maximumLength} characters.`
		);
	}
	return value;
}

export function isCalendarDate(value: string) {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
	const parsed = new Date(`${value}T00:00:00Z`);
	return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function isResourceSlug(value: string) {
	return resourceSlugPattern.test(value);
}

export function isResourceKindSegment(value: string): value is ResourceKindSegment {
	return value === 'prompts' || value === 'lists';
}

export function resourceKindFromSegment(segment: ResourceKindSegment): ResourceKind {
	return kindBySegment[segment];
}

export function resourceKindSegment(kind: ResourceKind): ResourceKindSegment {
	return segmentByKind[kind];
}

export function resourceKindLabel(kind: ResourceKind) {
	return labelByKind[kind];
}

export function resourcePath(resource: { kind: ResourceKind; slug: string }): ResourcePath {
	return `/resources/${resourceKindSegment(resource.kind)}/${resource.slug}`;
}

export function resourceRef(resource: { kind: ResourceKind; slug: string }): ResourceRef {
	return `${resourceKindSegment(resource.kind)}/${resource.slug}`;
}

export function parseResourceRef(reference: string):
	| {
			kind: ResourceKind;
			kindSegment: ResourceKindSegment;
			slug: string;
	  }
	| undefined {
	const match = resourceReferencePattern.exec(reference);
	if (!match || !isResourceKindSegment(match[1])) return undefined;
	return {
		kindSegment: match[1],
		kind: resourceKindFromSegment(match[1]),
		slug: match[2]
	};
}

export function effectiveResourceDate(resource: Pick<ResourceMetadata, 'date' | 'dateModified'>) {
	return resource.dateModified ?? resource.date;
}

export function compareResources(
	left: Pick<ResourceRecord, 'featured' | 'order' | 'date' | 'dateModified' | 'title' | 'path'>,
	right: Pick<ResourceRecord, 'featured' | 'order' | 'date' | 'dateModified' | 'title' | 'path'>
) {
	const featuredDifference = Number(Boolean(right.featured)) - Number(Boolean(left.featured));
	if (featuredDifference) return featuredDifference;

	const orderDifference =
		(left.order ?? Number.MAX_SAFE_INTEGER) - (right.order ?? Number.MAX_SAFE_INTEGER);
	if (orderDifference) return orderDifference;

	const dateDifference = effectiveResourceDate(right).localeCompare(effectiveResourceDate(left));
	if (dateDifference) return dateDifference;

	return (
		left.title.localeCompare(right.title, 'en', { sensitivity: 'base' }) ||
		left.path.localeCompare(right.path)
	);
}

function markerMatches(source: string, marker: string) {
	const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	return [...source.matchAll(new RegExp(`^[\\t ]*${escaped}[\\t ]*$`, 'gm'))];
}

/**
 * Extract the exact author-designated Markdown payload. Newline normalization makes copy results
 * deterministic across operating systems; only blank lines around the region are removed.
 */
export function extractResourceCopyText(rawMarkdown: string) {
	const normalized = rawMarkdown.replace(/\r\n?/g, '\n');
	const starts = markerMatches(normalized, copyStartMarker);
	const ends = markerMatches(normalized, copyEndMarker);

	if (starts.length !== 1 || ends.length !== 1) {
		throw new Error(
			`Resource Markdown must contain exactly one ${copyStartMarker} and one ${copyEndMarker}.`
		);
	}

	const start = starts[0];
	const end = ends[0];
	if (start.index === undefined || end.index === undefined || start.index >= end.index) {
		throw new Error('Resource copy markers are reversed or nested.');
	}

	const startLineEnd = normalized.indexOf('\n', start.index + start[0].length);
	const payloadStart = startLineEnd === -1 ? start.index + start[0].length : startLineEnd + 1;
	const lines = normalized.slice(payloadStart, end.index).split('\n');
	while (lines.length > 0 && lines[0].trim() === '') lines.shift();
	while (lines.length > 0 && lines.at(-1)?.trim() === '') lines.pop();
	const copyText = lines.join('\n');

	if (copyText.trim().length < 40) {
		throw new Error('Resource copy region must contain at least 40 meaningful characters.');
	}

	return copyText;
}

function parseStringList(
	value: unknown,
	field: string,
	source: string,
	{ minimum = 0, maximum = Number.POSITIVE_INFINITY }: { minimum?: number; maximum?: number } = {}
) {
	if (!Array.isArray(value)) {
		throw new Error(`${source}: ${field} must be an array of strings.`);
	}
	if (value.length < minimum || value.length > maximum) {
		throw new Error(`${source}: ${field} must contain ${minimum}–${maximum} entries.`);
	}

	const seen = new Set<string>();
	return value.map((item, index) => {
		const parsed = requiredTrimmedString(item, `${field}[${index}]`, source);
		const normalized = parsed.toLocaleLowerCase('en');
		if (seen.has(normalized)) {
			throw new Error(`${source}: ${field} contains the duplicate value “${parsed}”.`);
		}
		seen.add(normalized);
		return parsed;
	});
}

export function parseResourceMetadata(
	value: unknown,
	source = 'resource',
	expectedKind?: ResourceKind
): ResourceMetadata {
	if (!isRecord(value)) {
		throw new Error(`${source}: frontmatter must be a key-value object.`);
	}

	for (const field of Object.keys(value)) {
		if (!metadataFields.has(field)) {
			throw new Error(`${source}: unknown frontmatter field “${field}”.`);
		}
	}

	const title = requiredTrimmedString(value.title, 'title', source, 3, 120);
	const description = requiredTrimmedString(value.description, 'description', source, 50, 180);
	const date = requiredTrimmedString(value.date, 'date', source);
	if (!isCalendarDate(date)) {
		throw new Error(`${source}: date must be a real calendar date in YYYY-MM-DD format.`);
	}

	let dateModified: string | undefined;
	if (value.dateModified !== undefined) {
		dateModified = requiredTrimmedString(value.dateModified, 'dateModified', source);
		if (!isCalendarDate(dateModified)) {
			throw new Error(`${source}: dateModified must be a real calendar date in YYYY-MM-DD format.`);
		}
		if (dateModified < date) {
			throw new Error(`${source}: dateModified must not be earlier than date.`);
		}
	}

	if (value.kind !== 'prompt' && value.kind !== 'list') {
		throw new Error(`${source}: kind must be exactly “prompt” or “list”.`);
	}
	const kind = value.kind;
	if (expectedKind && kind !== expectedKind) {
		throw new Error(`${source}: kind “${kind}” does not match its ${expectedKind} directory.`);
	}

	const tags = parseStringList(value.tags, 'tags', source, { minimum: 1, maximum: 8 });
	if (typeof value.published !== 'boolean') {
		throw new Error(`${source}: published must be true or false, without quotes.`);
	}
	if (value.featured !== undefined && typeof value.featured !== 'boolean') {
		throw new Error(`${source}: featured must be true or false, without quotes.`);
	}
	if (
		value.order !== undefined &&
		(!Number.isFinite(value.order) || !Number.isInteger(value.order) || (value.order as number) < 0)
	) {
		throw new Error(`${source}: order must be a finite nonnegative integer.`);
	}

	const thumbnail = requiredTrimmedString(value.thumbnail, 'thumbnail', source);
	if (!/^\/images\/resources\/[a-z0-9]+(?:-[a-z0-9]+)*\.webp$/.test(thumbnail)) {
		throw new Error(
			`${source}: thumbnail must be a local /images/resources/[lowercase-kebab].webp path.`
		);
	}
	const thumbnailAlt = requiredTrimmedString(value.thumbnailAlt, 'thumbnailAlt', source, 12, 180);
	if (/^(?:image|photo|thumbnail|graphic)$/i.test(thumbnailAlt)) {
		throw new Error(`${source}: thumbnailAlt must meaningfully describe the image.`);
	}
	const estimatedLength = requiredTrimmedString(
		value.estimatedLength,
		'estimatedLength',
		source,
		3,
		48
	);
	if (!/\d/.test(estimatedLength)) {
		throw new Error(`${source}: estimatedLength must include a useful numeric measure.`);
	}

	const related =
		value.related === undefined
			? []
			: parseStringList(value.related, 'related', source, { maximum: 12 }).map((reference) => {
					if (!parseResourceRef(reference)) {
						throw new Error(
							`${source}: related reference “${reference}” must use prompts/slug or lists/slug.`
						);
					}
					return reference as ResourceRef;
				});

	const language = value.language ?? 'en';
	if (language !== 'en' && language !== 'bn' && language !== 'mixed') {
		throw new Error(`${source}: language must be “en”, “bn”, or “mixed”.`);
	}

	return {
		title,
		description,
		date,
		...(dateModified ? { dateModified } : {}),
		kind,
		tags,
		published: value.published,
		...(value.featured === undefined ? {} : { featured: value.featured }),
		...(value.order === undefined ? {} : { order: value.order as number }),
		thumbnail,
		thumbnailAlt,
		estimatedLength,
		...(related.length > 0 ? { related } : {}),
		language
	};
}

export function resourceSummary(resource: ResourceRecord): ResourceSummary {
	return {
		title: resource.title,
		description: resource.description,
		date: resource.date,
		...(resource.dateModified ? { dateModified: resource.dateModified } : {}),
		kind: resource.kind,
		tags: [...resource.tags],
		published: resource.published,
		...(resource.featured === undefined ? {} : { featured: resource.featured }),
		...(resource.order === undefined ? {} : { order: resource.order }),
		thumbnail: resource.thumbnail,
		thumbnailAlt: resource.thumbnailAlt,
		estimatedLength: resource.estimatedLength,
		language: resource.language,
		slug: resource.slug,
		kindSegment: resource.kindSegment,
		path: resource.path,
		ref: resource.ref
	};
}
