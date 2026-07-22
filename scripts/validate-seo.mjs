import fs from 'node:fs';
import path from 'node:path';
import { readPostFrontmatter } from './lib/post-metadata.mjs';

const root = process.cwd();
const postsDir = path.join(root, 'src', 'lib', 'posts');
const requiredFields = ['title', 'description', 'date', 'category', 'tags'];
const errors = [];
const descriptionWarnings = [];
const thumbnailAltWarnings = [];
const descriptionPolicyStart = '2026-07-23';
const descriptionMinLength = 70;
const descriptionMaxLength = 165;

function read(file) {
	return fs.readFileSync(file, 'utf8');
}

function slugifyCategory(category = 'uncategorized') {
	return category
		.toLowerCase()
		.trim()
		.replace(/&/g, 'and')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}

function postPath(metadata, slug) {
	return `/blog/${slugifyCategory(metadata.category)}/${encodeURIComponent(slug)}`;
}

function redirectedPostSlugs() {
	const postHelpers = read(path.join(root, 'src', 'lib', 'content', 'posts.ts'));
	const aliases = postHelpers.match(/export const postPathAliases[\s\S]*?=\s*\{([\s\S]*?)\};/);
	if (!aliases) {
		errors.push('Could not read postPathAliases from src/lib/content/posts.ts.');
		return new Set();
	}

	return new Set(
		Array.from(aliases[1].matchAll(/['"]([^'"]+)['"]\s*:/g)).map((match) =>
			match[1].split('/').slice(1).join('/')
		)
	);
}

function assertAbsoluteUrl(label, value) {
	if (!/^https:\/\/www\.suvroghosh\.in(\/|$)/.test(value)) {
		errors.push(`${label} must be an absolute production URL: ${value}`);
	}
}

const postFiles = fs.readdirSync(postsDir).filter((file) => file.endsWith('.md'));
const publishedPosts = [];
const redirectedSlugs = redirectedPostSlugs();

for (const file of postFiles) {
	const slug = file.replace(/\.md$/, '');
	if (redirectedSlugs.has(slug)) continue;

	const fullPath = path.join(postsDir, file);
	let metadata;
	try {
		metadata = readPostFrontmatter(fullPath);
	} catch (error) {
		errors.push(error instanceof Error ? error.message : `${file} has invalid frontmatter.`);
		continue;
	}
	const published = metadata.published !== false;
	if (!published) continue;

	const missing = requiredFields.filter((field) => {
		const value = metadata[field];
		return Array.isArray(value) ? value.length === 0 : !value;
	});

	if (missing.length > 0) {
		errors.push(`${file} is published but missing: ${missing.join(', ')}`);
	}

	if (metadata.date && Number.isNaN(Date.parse(metadata.date))) {
		errors.push(`${file} has an invalid date: ${metadata.date}`);
	}

	if (metadata.dateModified && Number.isNaN(Date.parse(metadata.dateModified))) {
		errors.push(`${file} has an invalid dateModified: ${metadata.dateModified}`);
	}

	if (typeof metadata.description === 'string') {
		const descriptionLength = metadata.description.trim().length;
		if (descriptionLength < descriptionMinLength || descriptionLength > descriptionMaxLength) {
			const isNewOrUpdated =
				metadata.date >= descriptionPolicyStart ||
				(metadata.dateModified && metadata.dateModified >= descriptionPolicyStart);
			const message =
				`${file} has a ${descriptionLength}-character description; ` +
				`keep descriptions between ${descriptionMinLength} and ${descriptionMaxLength} characters.`;

			if (isNewOrUpdated) errors.push(message);
			else descriptionWarnings.push(message);
		}
	}

	if (metadata.thumbnail && !metadata.thumbnailAlt) {
		const isNewOrUpdated =
			metadata.date >= descriptionPolicyStart ||
			(metadata.dateModified && metadata.dateModified >= descriptionPolicyStart);
		const message = `${file} has a thumbnail but no authored thumbnailAlt.`;
		if (isNewOrUpdated) errors.push(message);
		else thumbnailAltWarnings.push(message);
	}

	publishedPosts.push({
		file,
		slug,
		metadata,
		url: `https://www.suvroghosh.in${postPath(metadata, slug)}`
	});
}

const sitemapSource = read(path.join(root, 'src', 'routes', 'sitemap.xml', '+server.ts'));
if (
	sitemapSource.includes('getPublishedPosts') ||
	sitemapSource.includes('isIndexablePost') ||
	sitemapSource.includes('published === false')
) {
	// Good: unpublished and redirect-source posts are explicitly excluded.
} else {
	errors.push('sitemap.xml generator should explicitly exclude unpublished posts.');
}

if (sitemapSource.includes('.toLowerCase()')) {
	errors.push('sitemap.xml generator should not lowercase file slugs; that can create 404s.');
}

for (const page of [
	'https://www.suvroghosh.in/',
	'https://www.suvroghosh.in/blog',
	'https://www.suvroghosh.in/resume',
	'https://www.suvroghosh.in/contact'
]) {
	assertAbsoluteUrl('core sitemap page', page);
}

for (const post of publishedPosts) {
	assertAbsoluteUrl(post.file, post.url);
}

function normalizeIdentity(value) {
	return String(value || '')
		.toLowerCase()
		.trim()
		.replace(/&/g, 'and')
		.replace(/[^a-z0-9/._-]+/g, ' ')
		.replace(/\s+/g, ' ');
}

function seriesBaseTitle(title) {
	return normalizeIdentity(title)
		.replace(/(?:,?\s+part\s+\d+|,?\s+pt\s+\d+)$/i, '')
		.trim();
}

function isAllowedSharedThumbnail(posts) {
	if (posts.length < 2) return false;

	const seriesBase = seriesBaseTitle(posts[0].metadata.title);
	if (!seriesBase) return false;

	return posts.every((post) => {
		const title = normalizeIdentity(post.metadata.title);
		return (
			seriesBaseTitle(post.metadata.title) === seriesBase && /\b(?:part|pt)\s+\d+\b/i.test(title)
		);
	});
}

for (const field of ['title', 'description', 'thumbnail']) {
	const seen = new Map();

	for (const post of publishedPosts) {
		const value = post.metadata[field];
		if (!value) continue;

		const key = normalizeIdentity(value);
		const matches = seen.get(key) ?? [];
		matches.push(post.file);
		seen.set(key, matches);
	}

	for (const files of seen.values()) {
		if (files.length > 1) {
			const matchingPosts = publishedPosts.filter((post) => files.includes(post.file));
			if (field === 'thumbnail' && isAllowedSharedThumbnail(matchingPosts)) continue;
			errors.push(`published posts share the same ${field}: ${files.join(', ')}`);
		}
	}
}

const seoComponent = read(path.join(root, 'src', 'lib', 'components', 'seo', 'SEO.svelte'));
for (const required of [
	'<title>{title}</title>',
	'name="description"',
	'rel="canonical"',
	'og:title',
	'twitter:card'
]) {
	if (!seoComponent.includes(required)) {
		errors.push(`SEO component is missing expected marker: ${required}`);
	}
}

const seoHelpers = read(path.join(root, 'src', 'lib', 'components', 'seo', 'SEO.ts'));
for (const schemaName of [
	'websiteSchema',
	'personSchema',
	'blogPostingSchema',
	'breadcrumbSchema',
	'collectionPageSchema',
	'contactPageSchema',
	'profilePageSchema'
]) {
	if (!seoHelpers.includes(schemaName)) {
		errors.push(`SEO helpers are missing ${schemaName}.`);
	}
}

for (const jsonish of seoHelpers.matchAll(/return\s+(\{[\s\S]*?\n\});/g)) {
	try {
		JSON.stringify(jsonish[1]);
	} catch {
		errors.push('A JSON-LD helper return block could not be stringified.');
	}
}

if (errors.length > 0) {
	console.error(`SEO validation failed with ${errors.length} issue(s):`);
	for (const error of errors) console.error(`- ${error}`);
	process.exit(1);
}

if (descriptionWarnings.length > 0) {
	console.warn(
		`SEO warning: ${descriptionWarnings.length} legacy post description(s) fall outside ` +
			`${descriptionMinLength}-${descriptionMaxLength} characters. They are grandfathered, but new or ` +
			`updated posts dated ${descriptionPolicyStart} or later must meet the range.`
	);
}

if (thumbnailAltWarnings.length > 0) {
	console.warn(
		`SEO warning: ${thumbnailAltWarnings.length} legacy post thumbnail(s) lack authored alternative ` +
			`text. They are grandfathered, but new or updated posts dated ${descriptionPolicyStart} or later ` +
			`must provide thumbnailAlt.`
	);
}

console.log(
	`SEO validation passed: ${publishedPosts.length} published posts checked, canonical URL patterns verified.`
);
