import fs from 'node:fs/promises';
import path from 'node:path';
import * as pagefind from 'pagefind';

const root = process.cwd();
const postsDir = path.join(root, 'src', 'lib', 'posts');
const staticDir = path.resolve(root, 'static');
const outputDir = path.resolve(staticDir, 'pagefind');

if (path.dirname(outputDir) !== staticDir) {
	throw new Error(`Refusing to write Pagefind files outside ${staticDir}`);
}

function parseValue(rawValue) {
	const value = rawValue.trim();
	if (value.startsWith('[') && value.endsWith(']')) {
		return value
			.slice(1, -1)
			.split(',')
			.map((item) => item.trim().replace(/^["']|["']$/g, ''))
			.filter(Boolean);
	}
	if (value === 'true' || value === 'false') return value === 'true';
	return value.replace(/^["']|["']$/g, '');
}

function splitPostSource(source) {
	const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n)?([\s\S]*)$/);
	if (!match) return { metadata: {}, body: source };

	const metadata = {};
	const lines = match[1].split(/\r?\n/);

	for (let index = 0; index < lines.length; index += 1) {
		const field = lines[index].match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
		if (!field) continue;

		const [, key, rawValue] = field;
		let value = rawValue.trim();

		if (!value && lines[index + 1]?.trim().startsWith('[')) {
			const arrayLines = [];
			index += 1;
			while (index < lines.length) {
				arrayLines.push(lines[index].trim());
				if (lines[index].trim().endsWith(']')) break;
				index += 1;
			}
			value = arrayLines.join(' ');
		} else if (value.startsWith('[') && !value.endsWith(']')) {
			const arrayLines = [value];
			while (index + 1 < lines.length) {
				index += 1;
				arrayLines.push(lines[index].trim());
				if (lines[index].trim().endsWith(']')) break;
			}
			value = arrayLines.join(' ');
		} else if (!value && lines[index + 1]?.trim().startsWith('- ')) {
			const items = [];
			while (index + 1 < lines.length && lines[index + 1].trim().startsWith('- ')) {
				index += 1;
				items.push(
					lines[index]
						.trim()
						.slice(2)
						.trim()
						.replace(/^["']|["']$/g, '')
				);
			}
			metadata[key] = items.filter(Boolean);
			continue;
		}

		metadata[key] = parseValue(value);
	}

	return { metadata, body: match[2] };
}

function slugify(value = 'uncategorized') {
	return String(value)
		.toLowerCase()
		.trim()
		.replace(/&/g, 'and')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}

function searchableText(markdown) {
	return markdown
		.replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
		.replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
		.replace(/^\s*(?:import|export)\s+.+$/gm, ' ')
		.replace(/```[^\n]*\n([\s\S]*?)```/g, ' $1 ')
		.replace(/~~~[^\n]*\n([\s\S]*?)~~~/g, ' $1 ')
		.replace(/<[A-Z][A-Za-z0-9_.:-]*(?:\s+[^<>]*)?\/>/g, ' ')
		.replace(/!\[([^\]]*)]\([^)]+\)/g, ' $1 ')
		.replace(/\[([^\]]+)]\([^)]+\)/g, ' $1 ')
		.replace(/<[^>]+>/g, ' ')
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&#39;|&apos;/g, "'")
		.replace(/[`*_>#~{}]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function stringArray(value) {
	if (Array.isArray(value))
		return value
			.map(String)
			.map((item) => item.trim())
			.filter(Boolean);
	return typeof value === 'string' && value.trim() ? [value.trim()] : [];
}

function languageCode(value) {
	const code = typeof value === 'string' ? value.trim().toLowerCase().slice(0, 2) : 'en';
	return /^[a-z]{2}$/.test(code) ? code : 'en';
}

async function redirectedSlugs() {
	const helpers = await fs.readFile(path.join(root, 'src', 'lib', 'content', 'posts.ts'), 'utf8');
	const aliases = helpers.match(/export const postPathAliases[\s\S]*?=\s*\{([\s\S]*?)\};/);
	if (!aliases) throw new Error('Could not read postPathAliases from src/lib/content/posts.ts');

	return new Set(
		Array.from(aliases[1].matchAll(/['"]([^'"]+)['"]\s*:/g)).map((match) =>
			match[1].split('/').slice(1).join('/')
		)
	);
}

async function directorySize(directory) {
	let bytes = 0;
	let files = 0;
	for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
		const entryPath = path.join(directory, entry.name);
		if (entry.isDirectory()) {
			const nested = await directorySize(entryPath);
			bytes += nested.bytes;
			files += nested.files;
		} else {
			bytes += (await fs.stat(entryPath)).size;
			files += 1;
		}
	}
	return { bytes, files };
}

const { errors: createErrors, index } = await pagefind.createIndex({
	forceLanguage: 'en',
	writePlayground: false,
	verbose: false
});

if (createErrors.length > 0 || !index) {
	throw new Error(`Pagefind index creation failed: ${createErrors.join('; ')}`);
}

try {
	const aliases = await redirectedSlugs();
	const filenames = (await fs.readdir(postsDir)).filter((file) => file.endsWith('.md')).sort();
	let indexed = 0;

	for (const filename of filenames) {
		const slug = filename.replace(/\.md$/, '');
		if (aliases.has(slug)) continue;

		const source = await fs.readFile(path.join(postsDir, filename), 'utf8');
		const { metadata, body } = splitPostSource(source);
		if (metadata.published === false) continue;

		const title = String(metadata.title ?? '').trim();
		const description = String(metadata.description ?? '').trim();
		const date = String(metadata.date ?? '').trim();
		const category = String(metadata.category ?? '').trim();
		const categorySlug = slugify(category);
		const tags = stringArray(metadata.tags);
		const year = /^\d{4}/.exec(date)?.[0] ?? '';
		const timestamp = Date.parse(date);

		if (!title || !description || !date || !category || tags.length === 0 || !year) {
			throw new Error(`${filename} is missing metadata required for the search index`);
		}

		const filters = {
			category: [categorySlug],
			year: [year],
			tag: tags,
			content_type: ['post']
		};
		const series = stringArray(metadata.series);
		if (series.length > 0) filters.series = series;

		const meta = {
			title,
			slug,
			description,
			category,
			category_slug: categorySlug,
			date,
			year,
			tags: tags.join(', ')
		};
		if (metadata.thumbnail) meta.image = String(metadata.thumbnail);
		if (metadata.thumbnailAlt) meta.image_alt = String(metadata.thumbnailAlt);

		const { errors } = await index.addCustomRecord({
			url: `/blog/${categorySlug}/${encodeURIComponent(slug)}`,
			content: searchableText(body),
			language: languageCode(metadata.language),
			meta,
			filters,
			sort: {
				date: Number.isNaN(timestamp) ? date : String(timestamp)
			}
		});

		if (errors.length > 0) {
			throw new Error(`${filename} could not be indexed: ${errors.join('; ')}`);
		}
		indexed += 1;
	}

	await fs.rm(outputDir, { recursive: true, force: true });
	const { errors: writeErrors } = await index.writeFiles({ outputPath: outputDir });
	if (writeErrors.length > 0) {
		throw new Error(`Pagefind output failed: ${writeErrors.join('; ')}`);
	}

	const size = await directorySize(outputDir);
	console.log(
		`Pagefind: indexed ${indexed} posts into ${size.files} files (${(size.bytes / 1024).toFixed(1)} KiB).`
	);
} finally {
	await index.deleteIndex();
	await pagefind.close();
}
