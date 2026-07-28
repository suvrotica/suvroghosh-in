import type { PageServerLoad } from './$types';
import { getComicCatalog } from '$lib/server/comics/catalog';

export const prerender = true;

export const load: PageServerLoad = () => getComicCatalog();
