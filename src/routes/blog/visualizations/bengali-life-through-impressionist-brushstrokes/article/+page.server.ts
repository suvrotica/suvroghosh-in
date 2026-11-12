import { redirect } from '@sveltejs/kit';
import { ARTICLE_PATH } from '$lib/visualizations/bengali-impressionism/studio-state';
import type { PageServerLoad } from './$types';

export const prerender = false;

export const load: PageServerLoad = ({ url }) => redirect(308, ARTICLE_PATH + url.search);
