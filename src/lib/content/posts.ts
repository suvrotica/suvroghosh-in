import { slugifyCategory } from './categories';

export type BlogPostMetadata = {
	title: string;
	description: string;
	date: string;
	dateModified?: string;
	category: string;
	tags: string[];
	published?: boolean;
	thumbnail?: string;
	thumbnailAlt?: string;
	color?: string;
	author?: string;
	readingTime?: string;
	status?: string;
	inPlainEnglish?: string;
	keyTerms?: string[];
	faq?: { question: string; answer: string }[];
};

export type BlogPostSummary = BlogPostMetadata & {
	slug: string;
	categorySlug?: string;
	categoryLabel?: string;
};

export const postPathAliases: Record<string, string> = {
	'artificial-intelligence/ai-meaningful-work-and-the-trust-collapse':
		'/blog/artificial-intelligence/ai-meaningful-work-trust-collapse',
	'career/intro': '/blog/career/the-new-mantra',
	'healthcare-it/arrow_uncertainty_medical_care_healthcare_it':
		'/blog/economics/kenneth-arrow-medical-care',
	'healthcare-it/confounding-factors':
		'/blog/healthcare-it/confounding-factors-healthcare-it-analytics',
	'healthcare-it/-a-read-this-first': '/blog/personal/schooling-in-calcutta',
	'career/-a-read-this-first': '/blog/personal/schooling-in-calcutta',
	'personal/-a-read-this-first': '/blog/personal/schooling-in-calcutta',
	'healthcare-it/hie-from-first-principles': '/blog/healthcare-it/hie-first-principles-openhie',
	'healthcare-it/latent-space-healthcare-data':
		'/blog/healthcare-it/latent-space-in-healthcare-data',
	'healthcare-it/the-trolley-problem-is-already-hiding-in-healthcare':
		'/blog/healthcare-it/trolley-problem-healthcare-it',
	'healthcare-it/how-va-healthcare-data-systems-work':
		'/blog/healthcare-it/va-healthcare-data-systems-mumps-to-sql',
	'personal-essay/trapezoid-for-my-mother': '/blog/personal-essay/a-trapezoid-in-low-light'
};

const redirectedPostSlugs = new Set(
	Object.keys(postPathAliases).map((sourcePath) => sourcePath.split('/').slice(1).join('/'))
);

export function isPublishedPost(
	post: Partial<BlogPostMetadata> | null | undefined
): post is Partial<BlogPostMetadata> {
	return post != null && post.published !== false;
}

export function redirectedPostPath(category: string, slug: string) {
	return postPathAliases[`${slugifyCategory(category)}/${slug}`];
}

export function isRedirectedPostSlug(slug: string | null | undefined) {
	return slug != null && redirectedPostSlugs.has(slug);
}

export function isIndexablePost(
	metadata: Partial<BlogPostMetadata> | null | undefined,
	slug: string | null | undefined
) {
	return isPublishedPost(metadata) && !isRedirectedPostSlug(slug);
}

export function validatePublishedPostMetadata(
	metadata: Partial<BlogPostMetadata> | null | undefined,
	source = 'post'
) {
	if (!isPublishedPost(metadata)) return;

	const missing = ['title', 'description', 'date', 'category'].filter((field) => {
		const value = metadata[field as keyof BlogPostMetadata];
		return typeof value !== 'string' || value.trim() === '';
	});

	if (!Array.isArray(metadata.tags) || metadata.tags.length === 0) {
		missing.push('tags');
	}

	if (missing.length > 0) {
		throw new Error(`${source} is published but missing required metadata: ${missing.join(', ')}`);
	}
}

export function postPath(post: { category: string; slug: string }) {
	return `/blog/${slugifyCategory(post.category)}/${encodeURIComponent(post.slug)}`;
}

export function tagSearchPath(tag: string) {
	return `/blog?search=${encodeURIComponent(tag)}`;
}
