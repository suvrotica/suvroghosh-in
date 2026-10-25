import { describe, expect, it } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { comicCatalog, comicPath, getComicBySlug } from './comics';

describe('published comic editions', () => {
	it('resolves only unique catalogue slugs', () => {
		expect(new Set(comicCatalog.map((comic) => comic.slug)).size).toBe(comicCatalog.length);
		for (const comic of comicCatalog) {
			expect(comic.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
			expect(getComicBySlug(comic.slug)).toBe(comic);
			expect(comicPath(comic)).toBe(`/comics/${comic.slug}`);
		}
		for (const slug of [
			'unknown',
			'../the-colony-where-nobody-is-allowed-to-sleep',
			'the-colony-where-nobody-is-allowed-to-sleep/extra'
		])
			expect(getComicBySlug(slug)).toBeUndefined();
	});

	it('ships real PDFs, dimensioned covers and a published original story', async () => {
		for (const comic of comicCatalog) {
			const pdf = resolve('static', `.${comic.pdf.href}`);
			expect(statSync(pdf).size).toBe(comic.pdf.bytes);
			expect(readFileSync(pdf).subarray(0, 5).toString()).toBe('%PDF-');
			expect(comic.pageCount).toBe(comic.storyPageCount + 2);
			for (const cover of [comic.frontCover, comic.backCover]) {
				const metadata = await sharp(resolve('static', `.${cover.src}`)).metadata();
				expect([metadata.width, metadata.height]).toEqual([cover.width, cover.height]);
				expect(cover.alt.length).toBeGreaterThan(20);
			}
			const slug = comic.source.href.split('/').at(-1);
			const original = readFileSync(resolve('src/lib/posts', `${slug}.md`), 'utf8');
			expect(original).toContain('published: true');
			expect(original).toContain(`title: "${comic.source.title}"`);
		}
	});
});
