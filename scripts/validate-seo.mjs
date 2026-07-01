import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const postsDir = path.join(root, 'src', 'lib', 'posts');
const requiredFields = ['title', 'description', 'date', 'category', 'tags'];
const errors = [];

function read(file) {
	return fs.readFileSync(file, 'utf8');
}

function parseFrontmatter(file) {
	const text = read(file);
	const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	if (!match) return {};

	const data = {};
	const lines = match[1].split(/\r?\n/);

	function parseValue(rawValue) {
		const value = rawValue.trim();
		if (value.startsWith('[') && value.endsWith(']')) {
			return value
				.slice(1, -1)
				.split(',')
				.map((item) => item.trim().replace(/^["']|["']$/g, ''))
				.filter(Boolean);
		}
		if (value === 'true' || value === 'false') {
			return value === 'true';
		}
		return value.replace(/^["']|["']$/g, '');
	}

	for (let i = 0; i < lines.length; i += 1) {
		const line = lines[i];
		const field = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
		if (!field) continue;

		const [, key, rawValue] = field;
		let value = rawValue.trim();

		if (!value && lines[i + 1]?.trim().startsWith('[')) {
			const arrayLines = [];
			i += 1;
			while (i < lines.length) {
				arrayLines.push(lines[i].trim());
				if (lines[i].trim().endsWith(']')) break;
				i += 1;
			}
			value = arrayLines.join(' ');
		} else if (value.startsWith('[') && !value.endsWith(']')) {
			const arrayLines = [value];
			while (i + 1 < lines.length) {
				i += 1;
				arrayLines.push(lines[i].trim());
				if (lines[i].trim().endsWith(']')) break;
			}
			value = arrayLines.join(' ');
		} else if (!value && lines[i + 1]?.trim().startsWith('- ')) {
			const items = [];
			while (i + 1 < lines.length && lines[i + 1].trim().startsWith('- ')) {
				i += 1;
				items.push(lines[i].trim().slice(2).trim().replace(/^["']|["']$/g, ''));
			}
			data[key] = items.filter(Boolean);
			continue;
		}

		data[key] = parseValue(value);
	}

	return data;
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

function assertAbsoluteUrl(label, value) {
	if (!/^https:\/\/www\.suvroghosh\.in(\/|$)/.test(value)) {
		errors.push(`${label} must be an absolute production URL: ${value}`);
	}
}

const postFiles = fs.readdirSync(postsDir).filter((file) => file.endsWith('.md'));
const publishedPosts = [];

for (const file of postFiles) {
	const fullPath = path.join(postsDir, file);
	const metadata = parseFrontmatter(fullPath);
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

	publishedPosts.push({
		file,
		slug: file.replace(/\.md$/, ''),
		metadata,
		url: `https://www.suvroghosh.in${postPath(metadata, file.replace(/\.md$/, ''))}`
	});
}

const sitemapSource = read(path.join(root, 'src', 'routes', 'sitemap.xml', '+server.ts'));
if (sitemapSource.includes('published === false')) {
	// Good: unpublished posts are explicitly excluded.
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
			seriesBaseTitle(post.metadata.title) === seriesBase &&
			/\b(?:part|pt)\s+\d+\b/i.test(title)
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

console.log(
	`SEO validation passed: ${publishedPosts.length} published posts checked, canonical URL patterns verified.`
);
