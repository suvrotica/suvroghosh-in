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

export function isPublishedPost(
	post: Partial<BlogPostMetadata> | null | undefined
): post is Partial<BlogPostMetadata> {
	return post != null && post.published !== false;
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
