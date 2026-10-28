import { getPublishedPosts, type PublishedPost } from '$lib/server/content/posts';
import type { UmlBlogPostOption } from '$lib/visualizations/post-to-uml/types';

// Vite bundles these source modules for serverless deployments. They are lazy,
// server-only raw strings; no runtime source checkout or compiled component is returned.
const rawPostModules = import.meta.glob<string>('/src/lib/posts/*.md', {
	query: '?raw',
	import: 'default'
});

type PublishedUmlPost = Pick<
	PublishedPost,
	'slug' | 'title' | 'categoryLabel' | 'date' | 'description'
>;
type RawPostModules = Record<string, () => Promise<string>>;

/** Remove only the leading metadata block; preserve every body character, including CRLF. */
export function stripPostFrontmatter(rawFile: string): string {
	return rawFile.replace(
		/^\uFEFF?---[ \t]*(?:\r\n|\n|\r)[\s\S]*?(?:\r\n|\n|\r)---[ \t]*(?:(?:\r\n|\n|\r)|$)/,
		''
	);
}

/** The existing published registry, not a second front-matter parser, owns eligibility. */
export function createPublishedUmlPostLoader(
	getRegistry: () => readonly PublishedUmlPost[],
	rawModules: RawPostModules
) {
	const sourceLoaders = new Map<string, () => Promise<string>>();
	for (const [path, loader] of Object.entries(rawModules)) {
		const match = /^\/src\/lib\/posts\/([^/]+)\.md$/.exec(path);
		if (match) sourceLoaders.set(match[1], loader);
	}
	const eligiblePosts = () => getRegistry().filter((post) => sourceLoaders.has(post.slug));
	return {
		list(limit = 60): UmlBlogPostOption[] {
			const boundedLimit = Number.isFinite(limit)
				? Math.min(500, Math.max(0, Math.floor(limit)))
				: 60;
			return eligiblePosts()
				.sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug))
				.slice(0, boundedLimit)
				.map(({ slug, title, categoryLabel, date, description }) => ({
					slug,
					title,
					categoryLabel,
					date,
					description
				}));
		},
		async load(slug: string): Promise<{
			slug: string;
			title: string;
			categoryLabel: string;
			date: string;
			markdown: string;
		} | null> {
			// Exact registry membership prevents traversal and blocks draft/redirect sources,
			// including when the build-time glob contains those files.
			if (!slug || slug.length > 256) return null;
			const post = eligiblePosts().find((candidate) => candidate.slug === slug);
			const loader = sourceLoaders.get(slug);
			if (!post || !loader) return null;
			try {
				const raw = await loader();
				return {
					slug: post.slug,
					title: post.title,
					categoryLabel: post.categoryLabel,
					date: post.date,
					markdown: stripPostFrontmatter(raw)
				};
			} catch {
				// An unavailable source is not replaced with sample prose or metadata.
				return null;
			}
		}
	};
}

const publishedLoader = createPublishedUmlPostLoader(getPublishedPosts, rawPostModules);
export const listLoadableBlogPosts = publishedLoader.list;
export const loadPublishedBlogPostMarkdown = publishedLoader.load;
