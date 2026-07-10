import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const activeDir = path.join(root, 'src', 'lib', 'posts');
const savedDir = path.join(root, 'src', 'lib', 'SavedPosts');

function parseFrontmatter(file) {
	const text = fs.readFileSync(file, 'utf8');
	const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	if (!match) return { metadata: {}, body: text };

	const metadata = {};
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
		if (value === 'true' || value === 'false') return value === 'true';
		return value.replace(/^["']|["']$/g, '');
	}

	for (let i = 0; i < lines.length; i += 1) {
		const field = lines[i].match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
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
				items.push(
					lines[i]
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

	return { metadata, body: text.slice(match[0].length) };
}

function slugifyCategory(category = 'uncategorized') {
	return category
		.toLowerCase()
		.trim()
		.replace(/&/g, 'and')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}

function words(value) {
	return new Set(
		(value || '')
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, ' ')
			.split(/\s+/)
			.filter((word) => word.length > 3)
	);
}

function jaccard(left, right) {
	let overlap = 0;
	for (const item of left) {
		if (right.has(item)) overlap += 1;
	}
	return overlap / Math.max(1, left.size + right.size - overlap);
}

function readPosts(dir) {
	return fs
		.readdirSync(dir)
		.filter((file) => file.endsWith('.md'))
		.map((file) => {
			const fullPath = path.join(dir, file);
			const { metadata, body } = parseFrontmatter(fullPath);
			return {
				file,
				slug: file.replace(/\.md$/, ''),
				title: metadata.title || '',
				description: metadata.description || '',
				category: metadata.category || '',
				categorySlug: slugifyCategory(metadata.category || ''),
				fingerprint: words(
					`${metadata.title || ''} ${metadata.description || ''} ${body.slice(0, 2500)}`
				)
			};
		});
}

const activePosts = readPosts(activeDir);
const savedPosts = readPosts(savedDir);
const redirectedDuplicateSlugs = new Set([
	'arrow_uncertainty_medical_care_healthcare_it',
	'confounding-factors-healthcare-it-analytics',
	'hie-first-principles-openhie',
	'latent-space-in-healthcare-data',
	'trolley-problem-healthcare-it',
	'va-healthcare-data-systems-mumps-to-sql'
]);

const missing = [];
let exact = 0;
let likelyCovered = 0;
let redirectedDuplicates = 0;

for (const saved of savedPosts) {
	if (activePosts.some((post) => post.slug === saved.slug)) {
		exact += 1;
		continue;
	}

	if (redirectedDuplicateSlugs.has(saved.slug)) {
		redirectedDuplicates += 1;
		continue;
	}

	let bestMatch = null;
	for (const active of activePosts) {
		const titleScore = jaccard(
			words(`${saved.title} ${saved.description}`),
			words(`${active.title} ${active.description}`)
		);
		const bodyScore = jaccard(saved.fingerprint, active.fingerprint);
		const score = titleScore * 0.75 + bodyScore * 0.25;
		if (!bestMatch || score > bestMatch.score) {
			bestMatch = { file: active.file, score };
		}
	}

	if (bestMatch?.score >= 0.42) {
		likelyCovered += 1;
		continue;
	}

	missing.push(saved);
}

const categories = new Map();
for (const post of missing) {
	const slug = post.categorySlug || 'uncategorized';
	if (!categories.has(slug)) {
		categories.set(slug, { category: post.category, count: 0, files: [] });
	}
	const entry = categories.get(slug);
	entry.count += 1;
	entry.files.push(post.file);
}

console.log(
	JSON.stringify(
		{
			active: activePosts.length,
			saved: savedPosts.length,
			exact,
			likelyCovered,
			redirectedDuplicates,
			missing: missing.length,
			categories: Array.from(categories.entries())
				.sort((left, right) => right[1].count - left[1].count)
				.map(([slug, entry]) => ({
					slug,
					category: entry.category,
					count: entry.count,
					sample: entry.files.slice(0, 8)
				}))
		},
		null,
		2
	)
);
