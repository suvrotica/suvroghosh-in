import data from './catalogue.json';
import obsidian from './obsidian.json';
import { mergeCatalogues } from './merge-catalogues';
import type { Catalogue, SupplementalCatalogue } from './types';

/** Source links and memberships only. Live titles and availability come from the server. */
export const catalogue: Catalogue = mergeCatalogues(data as Catalogue, [
	obsidian as SupplementalCatalogue
]);
