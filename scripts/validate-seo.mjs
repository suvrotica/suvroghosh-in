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
	for (const line of match[1].split(/\r?\n/)) {
		const field = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
		if (!field) continue;

		const [, key, rawValue] = field;
		const value = rawValue.trim();
		if (value.startsWith('[') && value.endsWith(']')) {
			data[key] = value
				.slice(1, -1)
				.split(',')
				.map((item) => item.trim().replace(/^["']|["']$/g, ''))
				.filter(Boolean);
		} else if (value === 'true' || value === 'false') {
			data[key] = value === 'true';
		} else {
			data[key] = value.replace(/^["']|["']$/g, '');
		}
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
