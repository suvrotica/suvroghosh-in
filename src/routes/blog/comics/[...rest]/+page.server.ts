import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const prerender = false;

export const load: PageServerLoad = ({ params, url }) => {
	const suffix = params.rest ? `/${params.rest}` : '';
	redirect(308, `/blog/comic${suffix}${url.search}`);
};
