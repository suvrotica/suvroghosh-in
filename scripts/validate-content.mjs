import fs from 'node:fs';
import path from 'node:path';
import { readPostFrontmatter } from './lib/post-metadata.mjs';

const root = process.cwd();
const postsDir = path.join(root, 'src', 'lib', 'posts');
const requiredFields = ['title', 'description', 'date', 'category', 'tags', 'published'];
const stringFields = [
	'title',
	'description',
	'date',
	'dateModified',
	'category',
	'thumbnail',
	'thumbnailAlt',
	'color',
	'author',
	'readingTime',
	'status',
	'inPlainEnglish'
];
const allowedFields = new Set([...stringFields, 'tags', 'published', 'keyTerms', 'faq']);
const errors = [];
let publishedCount = 0;
let unpublishedCount = 0;
const categorySlugs = new Set();
const normalizedTags = new Set();

function slugifyCategory(category) {
	return category
		.toLowerCase()
		.trim()
		.replace(/&/g, 'and')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}

function isPlainObject(value) {
	return value != null && typeof value === 'object' && !Array.isArray(value);
}

function isCalendarDate(value) {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
	const parsed = new Date(`${value}T00:00:00Z`);
	return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function validateStringArray(file, field, value, { required = false } = {}) {
	if (!Array.isArray(value)) {
		errors.push(`${file}: ${field} must be an array of strings.`);
		return;
	}
	if (required && value.length === 0) errors.push(`${file}: ${field} must not be empty.`);

	const seen = new Set();
	for (const [index, item] of value.entries()) {
		if (typeof item !== 'string' || item.trim() === '') {
			errors.push(`${file}: ${field}[${index}] must be a non-empty string.`);
			continue;
		}
		if (item !== item.trim())
			errors.push(`${file}: ${field}[${index}] has surrounding whitespace.`);

		const normalized = item.trim().toLocaleLowerCase('en');
		if (seen.has(normalized)) {
			errors.push(`${file}: ${field} contains the duplicate value “${item.trim()}”.`);
		}
		seen.add(normalized);
		if (field === 'tags') normalizedTags.add(normalized);
	}
}

const postFiles = fs
	.readdirSync(postsDir)
	.filter((file) => file.endsWith('.md'))
	.sort();

for (const file of postFiles) {
	const slug = file.replace(/\.md$/, '');
	if (!/^[A-Za-z0-9_-]+$/.test(slug)) {
		errors.push(`${file}: filename must contain only letters, numbers, underscores, and hyphens.`);
	}

	let metadata;
	try {
		metadata = readPostFrontmatter(path.join(postsDir, file));
	} catch (error) {
		errors.push(error instanceof Error ? error.message : `${file}: could not parse frontmatter.`);
		continue;
	}

	for (const field of Object.keys(metadata)) {
		if (!allowedFields.has(field)) errors.push(`${file}: unknown frontmatter field “${field}”.`);
	}

	for (const field of requiredFields) {
		if (metadata[field] === undefined || metadata[field] === null || metadata[field] === '') {
			errors.push(`${file}: missing required frontmatter field “${field}”.`);
		}
	}

	for (const field of stringFields) {
		const value = metadata[field];
		if (value === undefined) continue;
		if (typeof value !== 'string' || value.trim() === '') {
			errors.push(`${file}: ${field} must be a non-empty string.`);
		} else if (value !== value.trim()) {
			errors.push(`${file}: ${field} has surrounding whitespace.`);
		}
	}

	if (typeof metadata.published !== 'boolean') {
		errors.push(`${file}: published must be true or false, without quotes.`);
	} else if (metadata.published) {
		publishedCount += 1;
	} else {
		unpublishedCount += 1;
	}

	validateStringArray(file, 'tags', metadata.tags, { required: true });
	if (metadata.keyTerms !== undefined) validateStringArray(file, 'keyTerms', metadata.keyTerms);

	if (typeof metadata.date === 'string' && !isCalendarDate(metadata.date)) {
		errors.push(`${file}: date must be a real calendar date in YYYY-MM-DD format.`);
	}
	if (metadata.dateModified !== undefined) {
		if (typeof metadata.dateModified === 'string' && !isCalendarDate(metadata.dateModified)) {
			errors.push(`${file}: dateModified must be a real calendar date in YYYY-MM-DD format.`);
		} else if (
			typeof metadata.date === 'string' &&
			typeof metadata.dateModified === 'string' &&
			metadata.dateModified < metadata.date
		) {
			errors.push(`${file}: dateModified must not be earlier than date.`);
		}
	}

	if (typeof metadata.category === 'string') {
		const categorySlug = slugifyCategory(metadata.category);
		if (!categorySlug) errors.push(`${file}: category must produce a usable URL slug.`);
		else categorySlugs.add(categorySlug);
	}

	if (metadata.thumbnail !== undefined) {
		if (
			typeof metadata.thumbnail === 'string' &&
			!/^\/(?:images|photos)\/.+\.(?:avif|gif|jpe?g|png|svg|webp)$/i.test(metadata.thumbnail)
		) {
			errors.push(`${file}: thumbnail must be a root-relative supported image path.`);
		}
	}

	if (metadata.faq !== undefined) {
		if (!Array.isArray(metadata.faq)) {
			errors.push(`${file}: faq must be an array.`);
		} else {
			for (const [index, item] of metadata.faq.entries()) {
				if (
					!isPlainObject(item) ||
					typeof item.question !== 'string' ||
					item.question.trim() === '' ||
					typeof item.answer !== 'string' ||
					item.answer.trim() === ''
				) {
					errors.push(`${file}: faq[${index}] must contain non-empty question and answer strings.`);
				}
			}
		}
	}
}

if (errors.length > 0) {
	console.error(`Content validation failed with ${errors.length} issue(s):`);
	for (const error of errors) console.error(`- ${error}`);
	process.exit(1);
}

console.log(
	`Content validation passed: ${postFiles.length} files checked (${publishedCount} published, ` +
		`${unpublishedCount} unpublished), covering ${categorySlugs.size} category slugs and ` +
		`${normalizedTags.size} normalized tags.`
);
