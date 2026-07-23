import fs from 'node:fs';
import path from 'node:path';
import { readPostFrontmatter } from './lib/post-metadata.mjs';

const root = process.cwd();
const postsDir = path.join(root, 'src', 'lib', 'posts');
const notebooksDir = path.join(root, 'src', 'lib', 'notebooks');
const sectionsFile = path.join(root, 'src', 'lib', 'content', 'sections.json');
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
	'notebook',
	'status',
	'inPlainEnglish'
];
const allowedFields = new Set([
	...stringFields,
	'tags',
	'pinnedTags',
	'series',
	'published',
	'mediaReviewed',
	'keyTerms',
	'faq'
]);
const errors = [];
let taxonomy = { sections: {}, legacyCategoryToSection: {}, postSectionOverrides: {} };

try {
	taxonomy = JSON.parse(fs.readFileSync(sectionsFile, 'utf8'));
} catch (error) {
	errors.push(
		`sections.json could not be read: ${error instanceof Error ? error.message : String(error)}`
	);
}

const sectionSlugs = new Set(Object.keys(taxonomy.sections ?? {}));
if (sectionSlugs.size !== 6) {
	errors.push(
		`sections.json must define exactly six permanent sections; found ${sectionSlugs.size}.`
	);
}
for (const [section, label] of Object.entries(taxonomy.sections ?? {})) {
	if (slugifyCategory(section) !== section || typeof label !== 'string' || label.trim() === '') {
		errors.push(`sections.json: section “${section}” needs a canonical slug and non-empty label.`);
	}
}
const healthcareGeoPolicyStart = '2026-07-23';
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
	if (metadata.mediaReviewed !== undefined && typeof metadata.mediaReviewed !== 'boolean') {
		errors.push(`${file}: mediaReviewed must be true or false, without quotes.`);
	}

	validateStringArray(file, 'tags', metadata.tags, { required: true });
	if (metadata.pinnedTags !== undefined) {
		validateStringArray(file, 'pinnedTags', metadata.pinnedTags, { required: true });
		if (Array.isArray(metadata.pinnedTags) && metadata.pinnedTags.length > 10) {
			errors.push(`${file}: pinnedTags must not contain more than 10 entries.`);
		}
		if (Array.isArray(metadata.pinnedTags) && Array.isArray(metadata.tags)) {
			for (const pinnedTag of metadata.pinnedTags) {
				if (typeof pinnedTag === 'string' && !metadata.tags.includes(pinnedTag)) {
					errors.push(`${file}: pinned tag “${pinnedTag}” must also appear in tags.`);
				}
			}
		}
	}
	if (metadata.series !== undefined) validateStringArray(file, 'series', metadata.series);
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

		if (metadata.published === true) {
			const section =
				taxonomy.postSectionOverrides?.[slug] ?? taxonomy.legacyCategoryToSection?.[categorySlug];
			if (!section || !sectionSlugs.has(section)) {
				errors.push(
					`${file}: category “${metadata.category}” has no valid six-section taxonomy mapping.`
				);
			}
		}

		const requiresHealthcareAnswerLayer =
			metadata.published === true &&
			categorySlug === 'healthcare-it' &&
			typeof metadata.dateModified === 'string' &&
			metadata.dateModified >= healthcareGeoPolicyStart;
		if (requiresHealthcareAnswerLayer) {
			if (typeof metadata.inPlainEnglish !== 'string' || metadata.inPlainEnglish.trim() === '') {
				errors.push(`${file}: updated healthcare-IT posts require inPlainEnglish.`);
			}
			if (!Array.isArray(metadata.keyTerms) || metadata.keyTerms.length < 5) {
				errors.push(`${file}: updated healthcare-IT posts require at least five keyTerms.`);
			}
			if (!Array.isArray(metadata.faq) || metadata.faq.length < 3) {
				errors.push(`${file}: updated healthcare-IT posts require at least three FAQ entries.`);
			}
		}
	}

	if (metadata.thumbnail !== undefined) {
		if (
			typeof metadata.thumbnail === 'string' &&
			!/^\/(?:images|photos|thumbnail)\/.+\.(?:avif|gif|jpe?g|png|svg|webp)$/i.test(
				metadata.thumbnail
			)
		) {
			errors.push(`${file}: thumbnail must be a root-relative supported image path.`);
		}
	}

	if (typeof metadata.notebook === 'string') {
		if (!/^[A-Za-z0-9_-]+$/.test(metadata.notebook)) {
			errors.push(`${file}: notebook must be a filename-safe notebook slug.`);
		} else if (!fs.existsSync(path.join(notebooksDir, `${metadata.notebook}.ipynb`))) {
			errors.push(`${file}: notebook source “${metadata.notebook}.ipynb” does not exist.`);
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

for (const [category, section] of Object.entries(taxonomy.legacyCategoryToSection ?? {})) {
	if (slugifyCategory(category) !== category || !sectionSlugs.has(section)) {
		errors.push(
			`sections.json: category mapping “${category}” points to invalid section “${section}”.`
		);
	}
}

const postSlugs = new Set(postFiles.map((file) => file.replace(/\.md$/, '')));
for (const [slug, section] of Object.entries(taxonomy.postSectionOverrides ?? {})) {
	if (!postSlugs.has(slug)) {
		errors.push(`sections.json: override references unknown post slug “${slug}”.`);
	}
	if (!sectionSlugs.has(section)) {
		errors.push(`sections.json: override for “${slug}” points to invalid section “${section}”.`);
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
