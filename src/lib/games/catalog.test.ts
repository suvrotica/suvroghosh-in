import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import {
	CALCUTTA_FOOTPATH_SLUG,
	HEALTHCARE_IT_CROSSWORD_SLUG,
	KAGOJER_DANA_SLUG,
	LUDO_SAAP_LUDO_SLUG,
	gameBySlug,
	gamesCatalog
} from './catalog';

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
			for (const imagePath of [game.cover, game.socialCover]) {
				expect(imagePath.startsWith('/'), `${game.slug} uses a public image path`).toBe(true);
				expect(
					fs.existsSync(path.join(process.cwd(), 'static', imagePath.replace(/^\//, ''))),
					`${game.slug} references ${imagePath}`
				).toBe(true);
			}
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

	it('provides entry-specific card labels and metadata', () => {
		for (const game of gamesCatalog) {
			for (const field of ['kind', 'cardEyebrow', 'actionLabel', 'durationLabel'] as const) {
				expect(game[field], `${game.slug}.${field}`).not.toBe('');
			}
			expect(game.keywords.length, `${game.slug}.keywords`).toBeGreaterThan(0);
		}
	});

	it('assigns every catalog game an explicit experience instead of a catch-all renderer', () => {
		expect(Object.fromEntries(gamesCatalog.map((game) => [game.slug, game.experience]))).toEqual({
			[LUDO_SAAP_LUDO_SLUG]: 'period-board-games',
			[HEALTHCARE_IT_CROSSWORD_SLUG]: 'healthcare-it-crossword',
			[KAGOJER_DANA_SLUG]: 'kagojer-dana',
			[CALCUTTA_FOOTPATH_SLUG]: 'calcutta-footpath'
		});
	});

	it('keeps site navigation around the crossword without changing existing immersive games', () => {
		const crossword = gameBySlug(HEALTHCARE_IT_CROSSWORD_SLUG);
		expect(crossword).toMatchObject({
			slug: 'healthcare-it-crossword-systems-rounds',
			title: 'The Healthcare IT Crossword: Systems Rounds',
			shell: 'site'
		});

		const boardGame = gameBySlug(LUDO_SAAP_LUDO_SLUG);
		expect(boardGame).toMatchObject({
			slug: 'ludo-and-saap-ludo',
			experience: 'period-board-games',
			title: 'Ludo & Saap-Ludo',
			shell: 'site'
		});

		const existingGames = gamesCatalog.filter(
			(game) => ![HEALTHCARE_IT_CROSSWORD_SLUG, LUDO_SAAP_LUDO_SLUG].includes(game.slug)
		);
		expect(existingGames.every((game) => game.shell === 'immersive')).toBe(true);
	});
});
