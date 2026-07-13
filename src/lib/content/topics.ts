export const MIN_TOPIC_POSTS = 8;
export const MIN_TOPIC_CATEGORIES = 2;

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
