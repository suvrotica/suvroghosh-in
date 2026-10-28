import { describe, expect, it, vi } from 'vitest';
import {
	createPublishedUmlPostLoader,
	loadPublishedBlogPostMarkdown,
	listLoadableBlogPosts,
	stripPostFrontmatter
} from './posts';

vi.mock('$lib/server/content/posts', () => ({
	getPublishedPosts: () => [
		{
			slug: 'prompt-atlas',
			title: 'Prompt Atlas',
			categoryLabel: 'Visualizations',
			date: '2026-10-25',
			description: 'Inspect a prompt.'
		}
	]
}));

const metadata = (slug: string) => ({
	slug,
	title: `Title: ${slug}`,
	categoryLabel: 'Essays',
	date: '2026-10-28',
	description: 'Registry description.'
});

describe('server-bundled published article source', () => {
	it('loads a real bundled Markdown source without runtime filesystem access', async () => {
		expect(listLoadableBlogPosts().map((post) => post.slug)).toEqual(['prompt-atlas']);
		const post = await loadPublishedBlogPostMarkdown('prompt-atlas');
		expect(post?.title).toBe('Prompt Atlas');
		expect(post?.markdown).toContain('PromptAtlas');
		expect(post?.markdown.startsWith('---')).toBe(false);
	});

	it('never lists or loads raw files absent from the published registry', async () => {
		const draft = vi.fn(async () => 'private draft');
		const redirect = vi.fn(async () => 'redirect body');
		const loader = createPublishedUmlPostLoader(() => [metadata('published')], {
			'/src/lib/posts/published.md': async () => 'Public article',
			'/src/lib/posts/private-draft.md': draft,
			'/src/lib/posts/redirected.md': redirect
		});
		expect(loader.list().map((post) => post.slug)).toEqual(['published']);
		for (const slug of [
			'private-draft',
			'redirected',
			'../published',
			'published.md',
			'%2e%2e%2fpublished'
		]) {
			expect(await loader.load(slug)).toBeNull();
		}
		expect(draft).not.toHaveBeenCalled();
		expect(redirect).not.toHaveBeenCalled();
	});

	it('does not fall back to illustrative samples, descriptions, or source checkout files', async () => {
		const loader = createPublishedUmlPostLoader(
			() => [metadata('missing'), metadata('empty'), metadata('broken')],
			{
				'/src/lib/posts/empty.md': async () => '---\ntitle: Empty\n---\n',
				'/src/lib/posts/broken.md': async () => {
					throw new Error('Chunk unavailable');
				}
			}
		);
		expect(loader.list().some((post) => post.slug === 'missing')).toBe(false);
		expect(await loader.load('missing')).toBeNull();
		expect(await loader.load('broken')).toBeNull();
		expect((await loader.load('empty'))?.markdown).toBe('');
	});

	it('supports exact registered slugs including historical underscores', async () => {
		const loader = createPublishedUmlPostLoader(() => [metadata('Historical_post')], {
			'/src/lib/posts/Historical_post.md': async () => 'Original body'
		});
		expect((await loader.load('Historical_post'))?.markdown).toBe('Original body');
		expect(await loader.load('historical_post')).toBeNull();
	});

	it('removes only front matter and preserves CRLF, components, code, whitespace and article separators', () => {
		const body =
			'\r\n# Original title\r\n\r\n<script>const example = "inert source";</script>\r\n<Example />\r\n\r\n---\r\nText with {braces}.  \r\n';
		expect(
			stripPostFrontmatter(`\uFEFF---\r\ntitle: Original\r\npublished: true\r\n---\r\n${body}`)
		).toBe(body);
		expect(stripPostFrontmatter(body)).toBe(body);
		expect(stripPostFrontmatter('---\ntitle: Unclosed\nbody')).toBe('---\ntitle: Unclosed\nbody');
	});
});
