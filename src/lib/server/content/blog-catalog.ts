import { createHash } from 'node:crypto';
import { categoryLabel, slugifyCategory } from '$lib/content/categories';
import { postPath, type BlogPostMetadata } from '$lib/content/posts';

export const BLOG_CATALOG_ORIGIN = 'https://www.suvroghosh.in';
export const BLOG_CATALOG_MAX_ITEMS = 2_000;
export const BLOG_CATALOG_MAX_BYTES = 2 * 1024 * 1024;

type CatalogSourcePost = Pick<
	BlogPostMetadata,
	'title' | 'description' | 'date' | 'dateModified' | 'category' | 'tags' | 'published'
> & { slug: string };

export type PublicBlogCatalogItem = {
	id: string;
	slug: string;
	canonicalUrl: string;
	title: string;
	description: string;
	publishedAt: string;
	modifiedAt?: string;
	category: { slug: string; label: string };
	tags: string[];
};

export type PublicBlogCatalog = {
	schemaVersion: 1;
	source: 'suvroghosh.in';
	canonicalOrigin: typeof BLOG_CATALOG_ORIGIN;
	generatedAt: string;
	revision: string;
	items: PublicBlogCatalogItem[];
};

function isCalendarDate(value: unknown): value is string {
	if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
	const parsed = new Date(`${value}T00:00:00.000Z`);
	return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function requireText(value: unknown, maximum: number, field: string): string {
	if (
		typeof value !== 'string' ||
		!value.trim() ||
		value !== value.trim() ||
		value.length > maximum ||
		Array.from(value).some(
			(character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127
		)
	) {
		throw new Error(
			`Blog catalog ${field} must be nonempty text of at most ${maximum} characters.`
		);
	}
	return value;
}

function sha256(value: string) {
	return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** A metadata projection, never a second article store or an editorial selection. */
export function createPublicBlogCatalog(
	posts: readonly CatalogSourcePost[],
	now = new Date()
): PublicBlogCatalog {
	if (!Number.isFinite(now.getTime())) throw new Error('Blog catalog export time is invalid.');
	if (posts.length > BLOG_CATALOG_MAX_ITEMS)
		throw new Error('Blog catalog source exceeds item limit.');
	const generatedAt = now.toISOString();
	const publicationCutoff = generatedAt.slice(0, 10);
	const items: PublicBlogCatalogItem[] = [];
	const seen = new Set<string>();
	for (const post of posts) {
		// The existing site registry uses published !== false. Export is deliberately stricter.
		if (post.published !== true || !isCalendarDate(post.date) || post.date > publicationCutoff) {
			continue;
		}
		if (typeof post.slug !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(post.slug)) {
			throw new Error('Blog catalog source slug is invalid.');
		}
		if (seen.has(post.slug)) throw new Error('Blog catalog source contains a duplicate slug.');
		seen.add(post.slug);
		const title = requireText(post.title, 240, 'title');
		const description = requireText(post.description, 1_200, 'description');
		const sourceCategory = requireText(post.category, 128, 'source category');
		const categorySlug = slugifyCategory(sourceCategory);
		if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(categorySlug) || categorySlug.length > 128) {
			throw new Error('Blog catalog category slug is invalid.');
		}
		if (!Array.isArray(post.tags) || post.tags.length > 20) {
			throw new Error('Blog catalog tags must be an array of at most 20 values.');
		}
		const tags = post.tags.map((tag) => requireText(tag, 80, 'tag'));
		if (
			post.dateModified !== undefined &&
			(!isCalendarDate(post.dateModified) ||
				post.dateModified < post.date ||
				post.dateModified > publicationCutoff)
		) {
			throw new Error('Blog catalog modification date is invalid.');
		}
		items.push({
			id: `suvroghosh.in:${post.slug}`,
			slug: post.slug,
			canonicalUrl: BLOG_CATALOG_ORIGIN + postPath({ category: sourceCategory, slug: post.slug }),
			title,
			description,
			publishedAt: post.date,
			...(post.dateModified === undefined ? {} : { modifiedAt: post.dateModified }),
			category: {
				slug: categorySlug,
				label: requireText(categoryLabel(categorySlug), 120, 'category label')
			},
			tags
		});
	}
	items.sort((a, b) => {
		if (a.publishedAt !== b.publishedAt) return a.publishedAt > b.publishedAt ? -1 : 1;
		return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
	});
	return {
		schemaVersion: 1,
		source: 'suvroghosh.in',
		canonicalOrigin: BLOG_CATALOG_ORIGIN,
		generatedAt,
		revision: sha256(JSON.stringify(items)),
		items
	};
}

export function serializePublicBlogCatalog(catalog: PublicBlogCatalog) {
	const body = `${JSON.stringify(catalog)}\n`;
	if (new TextEncoder().encode(body).byteLength > BLOG_CATALOG_MAX_BYTES) {
		throw new Error('Blog catalog exceeds byte limit.');
	}
	// generatedAt is intentionally excluded from revision, but included in this strong ETag.
	return { body, etag: `"${sha256(body)}"` };
}
