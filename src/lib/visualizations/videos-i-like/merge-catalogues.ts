import type { Catalogue, CatalogueEntry, SupplementalCatalogue } from './types';

/** Merge editorial sources without changing either imported snapshot. */
export function mergeCatalogues(base: Catalogue, supplements: SupplementalCatalogue[]): Catalogue {
	const entries = new Map<string, CatalogueEntry>();
	for (const collection of [base, ...supplements]) {
		for (const incoming of collection.entries) {
			const existing = entries.get(incoming.key);
			if (!existing) {
				entries.set(incoming.key, {
					...incoming,
					categories: [...incoming.categories],
					musicCategories: [...incoming.musicCategories],
					sources: incoming.sources.map((source) => ({ ...source }))
				});
				continue;
			}
			if (
				existing.id !== incoming.id ||
				existing.kind !== incoming.kind ||
				existing.url !== incoming.url
			)
				throw new Error(`Conflicting catalogue identity: ${incoming.key}`);
			existing.categories = [...new Set([...existing.categories, ...incoming.categories])];
			existing.musicCategories = [
				...new Set([...existing.musicCategories, ...incoming.musicCategories])
			];
			for (const source of incoming.sources) {
				if (
					!existing.sources.some(
						(previous) =>
							previous.file === source.file &&
							previous.order === source.order &&
							previous.originalUrl === source.originalUrl &&
							previous.collection === source.collection &&
							previous.startSeconds === source.startSeconds &&
							previous.index === source.index
					)
				)
					existing.sources.push({ ...source });
			}
		}
	}
	return {
		...base,
		fileCount: base.fileCount + supplements.reduce((count, source) => count + source.fileCount, 0),
		referenceCount:
			base.referenceCount + supplements.reduce((count, source) => count + source.referenceCount, 0),
		entries: [...entries.values()]
	};
}
