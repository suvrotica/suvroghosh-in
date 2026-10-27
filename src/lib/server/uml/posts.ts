import fs from 'node:fs';
import path from 'node:path';
import { categoryLabel, slugifyCategory } from '$lib/content/categories';
import { CURATED_UML_SAMPLES } from '$lib/visualizations/post-to-uml/examples';
import type { UmlBlogPostOption } from '$lib/visualizations/post-to-uml/types';

const POSTS_DIR = path.join(process.cwd(), 'src', 'lib', 'posts');

interface ParsedRawPostFrontmatter {
	title: string;
	category: string;
	date: string;
	description: string;
	published: boolean;
	redirectTo?: string;
}

function parseRawFrontmatter(raw: string): ParsedRawPostFrontmatter | null {
	const match = raw.replace(/\r\n/g, '\n').match(/^---\n([\s\S]*?)\n---/);
	if (!match) return null;
	const block = match[1];

	const getField = (key: string): string => {
		const m = block.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
		if (!m) return '';
		return m[1].trim().replace(/^["']|["']$/g, '');
	};

	const publishedRaw = getField('published').toLowerCase();
	const published = publishedRaw === 'true';
	const redirectTo = getField('redirectTo');
	const title = getField('title');
	const category = getField('category') || 'Essays';
	const date = getField('date');
	const description = getField('description');

	if (!title || !date) return null;

	return {
		title,
		category,
		date,
		description,
		published,
		redirectTo: redirectTo || undefined
	};
}

export function stripFrontmatterAndSvelteTags(rawFile: string): string {
	const normalized = (rawFile ?? '').replace(/\r\n/g, '\n');
	const withoutFrontmatter = normalized.replace(/^---\n[\s\S]*?\n---\n*/, '');
	const withoutScripts = withoutFrontmatter
		.replace(/<script\b[\s\S]*?<\/script>/gi, '')
		.replace(/<style\b[\s\S]*?<\/style>/gi, '');

	const cleanedLines = withoutScripts.split('\n').filter((line) => {
		const t = line.trim();
		if (/^<[A-Z][A-Za-z0-9_]*\b[^>]*\/?>$/.test(t)) return false;
		if (/^<\/[A-Z][A-Za-z0-9_]*>$/.test(t)) return false;
		if (/^<p><small>Published\s+<time\b/i.test(t)) return false;
		return true;
	});

	return cleanedLines
		.join('\n')
		.replace(/<[A-Z][A-Za-z0-9_]*\b[^>]*\/>/g, '')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

let cachedCatalog: UmlBlogPostOption[] | null = null;

export function listLoadableBlogPosts(limit = 60): UmlBlogPostOption[] {
	if (!cachedCatalog) {
		const items: UmlBlogPostOption[] = [];
		try {
			if (fs.existsSync(POSTS_DIR)) {
				const files = fs.readdirSync(POSTS_DIR);
				for (const file of files) {
					if (!file.endsWith('.md')) continue;
					const slug = file.replace(/\.md$/, '');
					if (!slug) continue;
					const raw = fs.readFileSync(path.join(POSTS_DIR, file), 'utf-8');
					const fm = parseRawFrontmatter(raw);
					if (!fm || !fm.published || fm.redirectTo) continue;
					const catSlug = slugifyCategory(fm.category);
					items.push({
						slug,
						title: fm.title,
						categoryLabel: categoryLabel(catSlug),
						date: fm.date,
						description: fm.description
					});
				}
			}
		} catch {
			// Fallback to curated samples if filesystem access is restricted in serverless runtime
		}

		if (items.length === 0) {
			for (const sample of CURATED_UML_SAMPLES) {
				items.push({
					slug: sample.slug,
					title: sample.title,
					categoryLabel: sample.category,
					date: '2026-10-27',
					description: sample.summary
				});
			}
		}

		items.sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
		cachedCatalog = items;
	}
	return cachedCatalog.slice(0, limit);
}

export async function loadPublishedBlogPostMarkdown(slug: string): Promise<{
	slug: string;
	title: string;
	categoryLabel: string;
	date: string;
	markdown: string;
} | null> {
	if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
		return null;
	}

	try {
		const filePath = path.join(POSTS_DIR, `${slug}.md`);
		if (fs.existsSync(filePath)) {
			const raw = fs.readFileSync(filePath, 'utf-8');
			const fm = parseRawFrontmatter(raw);
			if (fm && fm.published && !fm.redirectTo) {
				const catSlug = slugifyCategory(fm.category);
				const markdown = stripFrontmatterAndSvelteTags(raw);
				return {
					slug,
					title: fm.title,
					categoryLabel: categoryLabel(catSlug),
					date: fm.date,
					markdown: markdown || fm.description
				};
			}
		}
	} catch {
		// Fall through to curated sample lookup
	}

	const fallback = CURATED_UML_SAMPLES.find((s) => s.slug === slug);
	if (fallback) {
		return {
			slug: fallback.slug,
			title: fallback.title,
			categoryLabel: fallback.category,
			date: '2026-10-27',
			markdown: fallback.markdown
		};
	}

	return null;
}
