export const MIN_TOPIC_POSTS = 8;
export const MIN_TOPIC_CATEGORIES = 2;

export const PROMOTED_TOPIC_TAGS = {
	sketch: 'sketch',
	draw: 'sketch',
	drawing: 'sketch',
	music: 'songs',
	song: 'songs',
	songs: 'songs',
	'ai-songs': 'songs',
	'synthetic-music': 'songs',
	fhir: 'hl7-fhir',
	hl7: 'hl7-fhir',
	'health-level-seven': 'hl7-fhir',
	interoperability: 'hl7-fhir',
	'healthcare-interoperability': 'hl7-fhir',
	'semantic-interoperability': 'hl7-fhir',
	'hl7-version': 'hl7-fhir',
	'healthcare-ai': 'healthcare-ai',
	'clinical-ai': 'healthcare-ai',
	'ai-driven-healthcare': 'healthcare-ai',
	calcutta: 'calcutta',
	kolkata: 'calcutta',
	'south-calcutta': 'calcutta',
	'kolkata-civic-weather': 'calcutta',
	bipolar: 'bipolar-depression',
	'bipolar-depression': 'bipolar-depression',
	'bipolar-disorder': 'bipolar-depression',
	depression: 'bipolar-depression',
	depressive: 'bipolar-depression',
	'unipolar-depression': 'bipolar-depression',
	mathematics: 'interactive-mathematics',
	mathematical: 'interactive-mathematics',
	probability: 'interactive-mathematics',
	'monte-carlo': 'interactive-mathematics',
	'randomized-quasi-monte-carlo': 'interactive-mathematics',
	'coding-agents': 'codex-desktop',
	codex: 'codex-desktop',
	'codex-desktop': 'codex-desktop'
} as const;

export type TopicHeadquartersSlug = (typeof PROMOTED_TOPIC_TAGS)[keyof typeof PROMOTED_TOPIC_TAGS];

export const INITIAL_TOPIC_HEADQUARTERS_SLUGS = [
	'sketch',
	'songs',
	'hl7-fhir',
	'healthcare-ai',
	'calcutta',
	'bipolar-depression',
	'interactive-mathematics',
	'codex-desktop'
] as const satisfies readonly TopicHeadquartersSlug[];

const topicSlugAliases = new Map([
	['artificial-intelligence', 'ai'],
	['book', 'books'],
	['kolkata', 'calcutta'],
	['write', 'writing']
]);

const nonNavigationalTopicSlugs = new Set(['maybe', 'somebody', 'suvro-ghosh', 'suvroghosh']);

export function slugifyTopic(value: string) {
	return value
		.normalize('NFKC')
		.toLocaleLowerCase('en')
		.replace(/&/g, ' and ')
		.replace(/[’']/g, '')
		.replace(/[^\p{L}\p{N}]+/gu, '-')
		.replace(/^-|-$/g, '');
}

export function canonicalTopicSlug(value: string) {
	const slug = slugifyTopic(value);
	return topicSlugAliases.get(slug) ?? slug;
}

export function isNavigationalTopic(value: string) {
	const slug = canonicalTopicSlug(value);
	return Boolean(slug) && !nonNavigationalTopicSlugs.has(slug);
}

export function topicPath(value: string) {
	return `/blog/topics/${encodeURIComponent(canonicalTopicSlug(value))}`;
}

export function topicHeadquartersPath(slug: string) {
	return `/topics/${encodeURIComponent(slugifyTopic(slug))}`;
}

export function promotedTopicSlug(value: string): TopicHeadquartersSlug | undefined {
	return PROMOTED_TOPIC_TAGS[slugifyTopic(value) as keyof typeof PROMOTED_TOPIC_TAGS];
}

export function promotedTopicPath(value: string) {
	const slug = promotedTopicSlug(value);
	return slug ? topicHeadquartersPath(slug) : undefined;
}
