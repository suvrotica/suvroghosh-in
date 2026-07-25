import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { gamesCatalog } from './catalog';

function frontmatterFor(slug: string): Record<string, unknown> {
	const filename = path.join(process.cwd(), 'src', 'lib', 'posts', `${slug}.md`);
	const source = fs.readFileSync(filename, 'utf8');
	const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source);
	if (!match) throw new Error(`${slug}.md is missing frontmatter`);
	return parse(match[1]) as Record<string, unknown>;
}

describe('games catalog integration', () => {
	it('has unique slugs and a matching published Games post for every card', () => {
		expect(new Set(gamesCatalog.map((game) => game.slug)).size).toBe(gamesCatalog.length);
		for (const game of gamesCatalog) {
			const metadata = frontmatterFor(game.slug);
			expect(metadata.published).toBe(true);
			expect(metadata.category).toBe('Games');
			expect(metadata.title).toBe(game.title);
			expect(metadata.description).toBe(game.description);
			expect(metadata.thumbnail).toBe(game.socialCover);
			expect(metadata.thumbnailAlt).toBe(game.coverAlt);
		}
	});

	it('includes every published Games post on the Games landing page', () => {
		const postDirectory = path.join(process.cwd(), 'src', 'lib', 'posts');
		const publishedGameSlugs = fs
			.readdirSync(postDirectory)
			.filter((filename) => filename.endsWith('.md'))
			.flatMap((filename) => {
				const slug = filename.replace(/\.md$/, '');
				const metadata = frontmatterFor(slug);
				return metadata.published === true && metadata.category === 'Games' ? [slug] : [];
			})
			.sort();
		expect(gamesCatalog.map((game) => game.slug).sort()).toEqual(publishedGameSlugs);
	});
});
