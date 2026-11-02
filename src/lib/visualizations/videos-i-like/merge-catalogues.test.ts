import { describe, expect, it } from 'vitest';
import { mergeCatalogues } from './merge-catalogues';
import type { Catalogue, CatalogueEntry, SupplementalCatalogue } from './types';

const entry: CatalogueEntry = {
	key: 'video:QL4_4GAWvPs',
	kind: 'video',
	id: 'QL4_4GAWvPs',
	url: 'https://www.youtube.com/watch?v=QL4_4GAWvPs',
	categories: ['maths'],
	musicCategories: [],
	sources: [
		{
			file: 'drafts/LAvids.md',
			url: 'https://github.com/example/LAvids.md',
			originalUrl: 'https://youtu.be/QL4_4GAWvPs',
			order: 1
		}
	]
};
const base: Catalogue = {
	version: 1,
	repository: 'example',
	branch: 'main',
	commit: 'a'.repeat(40),
	fileCount: 1,
	referenceCount: 1,
	entries: [entry]
};
const local: SupplementalCatalogue = {
	version: 1,
	collection: 'Obsidian Videos',
	fileCount: 1,
	referenceCount: 1,
	entries: [
		{
			...entry,
			categories: ['science'],
			sources: [
				{
					file: 'obsidian:physics',
					label: 'Physics',
					collection: 'obsidian',
					originalUrl: entry.url,
					order: 1
				}
			]
		}
	]
};

describe('independent editorial imports', () => {
	it('deduplicates selections while keeping memberships and both public/private-origin provenance', () => {
		const before = JSON.stringify([base, local]);
		const result = mergeCatalogues(base, [local]);
		expect(result.entries).toHaveLength(1);
		expect(result.entries[0].categories).toEqual(['maths', 'science']);
		expect(result.entries[0].sources).toHaveLength(2);
		expect(result.entries[0].sources[1].url).toBeUndefined();
		expect(result.fileCount).toBe(2);
		expect(result.referenceCount).toBe(2);
		expect(JSON.stringify([base, local])).toBe(before);
	});

	it('does not repeat an identical occurrence when the same snapshot is merged twice', () => {
		expect(mergeCatalogues(base, [local, local]).entries[0].sources).toHaveLength(2);
	});

	it('refuses conflicting identities instead of silently associating the wrong video', () => {
		expect(() =>
			mergeCatalogues(base, [{ ...local, entries: [{ ...entry, id: 'different' }] }])
		).toThrow('Conflicting catalogue identity');
	});
});
