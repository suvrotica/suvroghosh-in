import data from './catalogue.json';
import type { Catalogue } from './types';

/** Source links and memberships only. Live titles and availability come from the server. */
export const catalogue: Catalogue = data as Catalogue;
